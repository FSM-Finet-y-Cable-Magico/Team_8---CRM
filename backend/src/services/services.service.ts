import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { resolveCustomerLifecycleStatus } from '../common/customer-lifecycle';
import { addYearsToDateOnly, parseDateOnly, todayDateOnly } from '../common/date-rules';
import {
  buildInstallOrderObservations,
  parseInstallOrderObservations,
} from '../common/install-order-metadata';
import { isAdministrator } from '../common/roles';
import { serviceTypeFromPlan } from '../common/service-type';
import { generateWorkOrderCode } from '../common/work-order-code';
import { PrismaService } from '../prisma/prisma.service';
import { AttachEquipmentDto } from './dto/attach-equipment.dto';
import { CreateServiceInstallOrderDto } from './dto/create-service-install-order.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { DeactivateServiceDto } from './dto/deactivate-service.dto';
import { ServiceInstallAvailabilityDto } from './dto/service-install-availability.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

const SERVICE_INCLUDE = {
  cliente: true,
  empresa: true,
  contrato: { include: { plan: true } },
  direccion: true,
  zonaPago: true,
  equipos: { orderBy: { idUnidad: 'desc' } },
  tickets: {
    orderBy: { fechaCreacion: 'desc' },
    take: 20,
  },
  ordenes: {
    orderBy: { fechaCreacion: 'desc' },
    take: 20,
  },
  solicitudes: {
    orderBy: { fechaCreacion: 'desc' },
    take: 20,
  },
} satisfies Prisma.ServicioContratadoInclude;

const CLOSED_INSTALL_ORDER_STATES = ['Completada', 'Cancelada'];
const ALTERNATIVE_VISIT_TIMES = ['09:00', '11:00', '14:00', '16:00', '18:00'];

type ServiceTechnicalDataDto = Pick<
  CreateServiceDto | UpdateServiceDto,
  | 'tecnologia'
  | 'velocidad'
  | 'macAddress'
  | 'puertoOlt'
  | 'ipAsignada'
  | 'observacionesTecnicas'
  | 'cajaNap'
  | 'numeroPoste'
  | 'caracteristicasComerciales'
>;
type ServiceWithRelations = Prisma.ServicioContratadoGetPayload<{ include: typeof SERVICE_INCLUDE }>;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listByCustomer(idCliente: number, currentUser: AuthUser) {
    await this.getCustomerOrThrow(idCliente, currentUser);

    const services = await this.prisma.servicioContratado.findMany({
      where: { idCliente, ...this.serviceCompanyScope(currentUser) },
      orderBy: { fechaCreacion: 'desc' },
      include: SERVICE_INCLUDE,
    });

    return this.withInstallationContext(services);
  }

  async detail(idServicio: number, currentUser: AuthUser) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);
    const auditoria = await this.prisma.logAuditoria.findMany({
      where: {
        OR: [
          { entidadAfectada: 'servicio_contratado', idEntidadAfectada: idServicio },
          { valorNuevo: { path: ['idServicio'], equals: idServicio } },
        ],
      },
      orderBy: { fechaHora: 'desc' },
      take: 40,
    });

    const [enrichedService] = await this.withInstallationContext([service]);

    return {
      ...enrichedService,
      auditoria: auditoria.map((row) => ({ ...row, idLog: row.idLog.toString() })),
    };
  }

  async create(dto: CreateServiceDto, currentUser: AuthUser) {
    const customer = await this.getCustomerOrThrow(dto.idCliente, currentUser);
    const idEmpresa = await this.resolveCompanyId(dto, customer, currentUser);
    const contract = await this.assertContract(dto.idContrato, dto.idCliente, idEmpresa);
    const idDireccion = dto.idDireccion ?? await this.resolvePrimaryAddressId(dto.idCliente);
    await this.assertAddress(idDireccion, dto.idCliente);
    await this.assertPaymentZone(dto.idZonaPago, idEmpresa);

    const created = await this.prisma.servicioContratado.create({
      data: {
        idCliente: dto.idCliente,
        idEmpresa,
        idContrato: contract.idContrato,
        idDireccion,
        idZonaPago: dto.idZonaPago,
        tipoServicio: dto.tipoServicio,
        estadoOperativo: dto.estadoOperativo,
        observaciones: dto.observaciones?.trim() || null,
        datosTecnicos: this.technicalData(dto),
      },
      include: SERVICE_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_SERVICIO_CONTRATADO',
      entidadAfectada: 'servicio_contratado',
      idEntidadAfectada: created.idServicio,
      valorNuevo: {
        idServicio: created.idServicio,
        idCliente: dto.idCliente,
        idEmpresa,
        tipoServicio: dto.tipoServicio,
        estadoOperativo: dto.estadoOperativo,
      },
    });

    await this.reconcileCustomerStatus(created.idCliente);

    return created;
  }

  async ensureInstallationServiceForContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.prisma.contrato.findUnique({
      where: { idContrato },
      include: {
        plan: true,
        cliente: true,
      },
    });

    if (!contract || !contract.idCliente || !contract.cliente) {
      throw new NotFoundException('Contrato o cliente no encontrado');
    }

    const idEmpresa = contract.idEmpresa ?? contract.cliente.idEmpresa;

    if (!this.canAccessCompany(idEmpresa, currentUser)) {
      throw new BadRequestException('El contrato no pertenece a tu empresa');
    }

    if (!['Firmado', 'Activo', 'Suspendido', 'Moroso'].includes(contract.estado)) {
      throw new BadRequestException('Debes confirmar la firma del contrato antes de preparar la instalación');
    }

    const existing = await this.prisma.servicioContratado.findFirst({
      where: {
        idContrato,
        estadoOperativo: { not: 'Baja' },
      },
      orderBy: { fechaCreacion: 'desc' },
      include: SERVICE_INCLUDE,
    });

    if (existing) {
      return existing;
    }

    const tipoServicio = serviceTypeFromPlan(contract.plan?.tipoPlan);

    if (!tipoServicio) {
      throw new BadRequestException('El tipo del plan no permite determinar el servicio a instalar');
    }

    const idDireccion = await this.resolvePrimaryAddressId(contract.idCliente);

    if (!idDireccion) {
      throw new BadRequestException('El cliente no tiene una dirección registrada para preparar la instalación');
    }

    const created = await this.prisma.servicioContratado.create({
      data: {
        idCliente: contract.idCliente,
        idEmpresa,
        idContrato,
        idDireccion,
        idZonaPago: contract.idZonaPago,
        tipoServicio,
        estadoOperativo: 'Pendiente Instalacion',
      },
      include: SERVICE_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_SERVICIO_DESDE_CONTRATO_FIRMADO',
      entidadAfectada: 'servicio_contratado',
      idEntidadAfectada: created.idServicio,
      valorNuevo: {
        idCliente: created.idCliente,
        idContrato,
        idEmpresa,
        idDireccion,
        idZonaPago: created.idZonaPago,
        tipoServicio,
        estadoOperativo: created.estadoOperativo,
      },
    });

    await this.reconcileCustomerStatus(created.idCliente);

    return created;
  }

  async update(idServicio: number, dto: UpdateServiceDto, currentUser: AuthUser) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);
    const data: Prisma.ServicioContratadoUncheckedUpdateInput = {
      tipoServicio: dto.tipoServicio,
      estadoOperativo: dto.estadoOperativo,
      observaciones: dto.observaciones === undefined ? undefined : dto.observaciones.trim() || null,
      idZonaPago: dto.idZonaPago,
    };
    const technicalData = this.technicalData(dto);

    if (dto.idZonaPago !== undefined) {
      await this.assertPaymentZone(dto.idZonaPago, service.idEmpresa);
    }

    if (technicalData) {
      data.datosTecnicos = this.mergeTechnicalData(service.datosTecnicos, technicalData);
    }

    const updated = await this.prisma.servicioContratado.update({
      where: { idServicio },
      data,
      include: SERVICE_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_SERVICIO_CONTRATADO',
      entidadAfectada: 'servicio_contratado',
      idEntidadAfectada: idServicio,
      valorAnterior: {
        tipoServicio: service.tipoServicio,
        estadoOperativo: service.estadoOperativo,
        observaciones: service.observaciones,
        datosTecnicos: service.datosTecnicos,
      },
      valorNuevo: {
        tipoServicio: updated.tipoServicio,
        estadoOperativo: updated.estadoOperativo,
        observaciones: updated.observaciones,
        datosTecnicos: updated.datosTecnicos,
      },
    });

    return updated;
  }

  async deactivate(idServicio: number, dto: DeactivateServiceDto, currentUser: AuthUser) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);

    if (service.estadoOperativo === 'Baja') {
      return service;
    }

    const observation = dto.observacion?.trim() || null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const deactivatedService = await tx.servicioContratado.update({
        where: { idServicio },
        data: {
          estadoOperativo: 'Baja',
          observaciones: observation ?? service.observaciones,
        },
        include: SERVICE_INCLUDE,
      });

      if (service.idContrato) {
        const operationalServices = await tx.servicioContratado.count({
          where: {
            idContrato: service.idContrato,
            estadoOperativo: { not: 'Baja' },
          },
        });

        if (operationalServices === 0) {
          await tx.contrato.update({
            where: { idContrato: service.idContrato },
            data: { estado: 'Baja' },
          });
        }
      }

      return deactivatedService;
    });

    await this.reconcileCustomerStatus(updated.idCliente);
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'DAR_BAJA_SERVICIO',
      entidadAfectada: 'servicio_contratado',
      idEntidadAfectada: idServicio,
      valorAnterior: {
        estadoOperativo: service.estadoOperativo,
        observaciones: service.observaciones,
      },
      valorNuevo: {
        estadoOperativo: updated.estadoOperativo,
        observacion: observation,
        idContrato: updated.idContrato,
      },
    });

    return updated;
  }

  async attachEquipment(idServicio: number, dto: AttachEquipmentDto, currentUser: AuthUser) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);

    if (!dto.idUnidad && !dto.numeroSerie?.trim()) {
      throw new BadRequestException('Debes indicar ID de equipo o numero de serie');
    }

    const unit = dto.idUnidad
      ? await this.prisma.unidadEquipo.findUnique({ where: { idUnidad: dto.idUnidad } })
      : await this.prisma.unidadEquipo.findUnique({ where: { numeroSerie: dto.numeroSerie?.trim() ?? '' } });

    if (!unit) {
      throw new NotFoundException('Equipo no encontrado');
    }

    if (unit.idEmpresa && service.idEmpresa && unit.idEmpresa !== service.idEmpresa) {
      throw new BadRequestException('El equipo no pertenece a la empresa del servicio');
    }

    if (['Bloqueado', 'Baja Definitiva'].includes(unit.estado)) {
      throw new BadRequestException('Un equipo bloqueado o dado de baja no puede reasignarse');
    }

    const technicalNotes = [
      unit.diagnosticoTecnico,
      dto.macAddress || dto.puertoOlt || dto.observaciones
        ? `Servicio ${idServicio} - MAC: ${dto.macAddress ?? '-'}; Puerto OLT: ${dto.puertoOlt ?? '-'}; ${dto.observaciones ?? ''}`.trim()
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const updated = await this.prisma.unidadEquipo.update({
      where: { idUnidad: unit.idUnidad },
      data: {
        idServicio,
        idClienteInstalado: service.idCliente,
        idEmpresa: service.idEmpresa ?? unit.idEmpresa,
        modelo: dto.modelo?.trim() || unit.modelo,
        estado: 'Instalado',
        diagnosticoTecnico: technicalNotes || unit.diagnosticoTecnico,
        modalidadAsignacion: dto.modalidadAsignacion ?? unit.modalidadAsignacion ?? 'Propiedad empresa',
        valorArriendoMensual: dto.modalidadAsignacion && dto.modalidadAsignacion !== 'Arriendo'
          ? null
          : dto.valorArriendoMensual,
        fechaInicioAsignacion: dto.fechaInicioAsignacion ? new Date(dto.fechaInicioAsignacion) : unit.fechaInicioAsignacion,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ASOCIAR_EQUIPO_SERVICIO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: updated.idUnidad,
      valorAnterior: {
        idServicio: unit.idServicio,
        estado: unit.estado,
        idClienteInstalado: unit.idClienteInstalado,
      },
      valorNuevo: {
        idServicio,
        idCliente: service.idCliente,
        numeroSerie: updated.numeroSerie,
        modalidadAsignacion: updated.modalidadAsignacion,
        valorArriendoMensual: updated.valorArriendoMensual ? Number(updated.valorArriendoMensual) : null,
      },
    });

    return this.detail(idServicio, currentUser);
  }

  async installAvailability(
    idServicio: number,
    dto: ServiceInstallAvailabilityDto,
    currentUser: AuthUser,
  ) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);

    await this.validateServiceInstallOrderPreconditions(service);
    this.validateInstallSchedule(dto.fechaProgramada, dto.horaVisita);

    return this.buildInstallAvailability(service.idEmpresa, dto.fechaProgramada, dto.horaVisita);
  }

  async createInstallOrder(
    idServicio: number,
    dto: CreateServiceInstallOrderDto,
    currentUser: AuthUser,
  ) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);
    const scheduledDate = this.validateInstallSchedule(dto.fechaProgramada, dto.horaVisita);

    await this.validateServiceInstallOrderPreconditions(service);

    if (!service.idEmpresa) {
      throw new BadRequestException('El servicio no tiene empresa asociada');
    }

    const direccion = await this.resolveServiceAddress(service);

    if (!direccion) {
      throw new BadRequestException('El servicio no tiene direccion registrada para coordinar la instalacion');
    }

    const availability = await this.buildInstallAvailability(service.idEmpresa, dto.fechaProgramada, dto.horaVisita);
    const technician = availability.tecnicosDisponibles.find((item) => item.idTecnico === dto.idTecnico);

    if (!technician) {
      throw new BadRequestException('El tecnico seleccionado no esta disponible para ese horario');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.ordenTrabajo.create({
        data: {
          idEmpresa: service.idEmpresa,
          idCliente: service.idCliente,
          idTecnico: dto.idTecnico,
          idDireccion: direccion.idDireccion,
          idServicio: service.idServicio,
          tipoOt: 'Instalacion',
          prioridad: dto.prioridad ?? 'Media',
          estado: 'Pendiente',
          fechaCreacion: new Date(),
          fechaProgramada: scheduledDate,
          observaciones: buildInstallOrderObservations({
            tipoConexion: dto.tipoConexion,
            horaVisita: dto.horaVisita,
            observacionesAgenda: dto.observaciones,
          }),
          resueltoRemotamente: false,
        },
      });
      const orden = await tx.ordenTrabajo.update({
        where: { idOt: createdOrder.idOt },
        data: { codigoSeguimiento: generateWorkOrderCode(createdOrder.tipoOt, createdOrder.idOt) },
      });
      const updatedService = await tx.servicioContratado.update({
        where: { idServicio: service.idServicio },
        data: { estadoOperativo: 'Instalacion Programada' },
        include: SERVICE_INCLUDE,
      });

      await tx.historialOt.create({
        data: {
          idOt: orden.idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: 'Sin orden',
          estadoNuevo: 'Pendiente',
          observaciones: orden.observaciones,
          fechaHora: new Date(),
        },
      });

      return {
        orden: {
          ...orden,
          tipoConexion: dto.tipoConexion,
          horaVisita: dto.horaVisita,
          observacionesAgenda: dto.observaciones?.trim() || null,
          tecnico: technician,
        },
        servicio: updatedService,
      };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_ORDEN_INSTALACION_SERVICIO',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: result.orden.idOt,
      valorNuevo: {
        idCliente: service.idCliente,
        idServicio: service.idServicio,
        fechaProgramada: dto.fechaProgramada,
        horaVisita: dto.horaVisita,
        tipoConexion: dto.tipoConexion,
        idTecnico: dto.idTecnico,
        tecnico: technician.nombreCompleto,
        prioridad: dto.prioridad ?? 'Media',
        codigoSeguimiento: result.orden.codigoSeguimiento,
      },
    });

    return result;
  }

  private async getServiceOrThrow(idServicio: number, currentUser: AuthUser) {
    const service = await this.prisma.servicioContratado.findUnique({
      where: { idServicio },
      include: SERVICE_INCLUDE,
    });

    if (!service) {
      throw new NotFoundException('Servicio contratado no encontrado');
    }

    if (!this.canAccessCompany(service.idEmpresa, currentUser)) {
      throw new BadRequestException('El servicio no pertenece a tu empresa');
    }

    return service;
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const canAccess = isAdministrator(currentUser.roles) ||
      customer.idEmpresa === currentUser.idEmpresa ||
      customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa);

    if (!canAccess) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return customer;
  }

  private async resolveCompanyId(
    dto: CreateServiceDto,
    customer: { idEmpresa: number | null },
    currentUser: AuthUser,
  ) {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return currentUser.idEmpresa;
    }

    if (dto.idEmpresa) {
      return dto.idEmpresa;
    }

    if (dto.idContrato) {
      const contract = await this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } });
      return contract?.idEmpresa ?? customer.idEmpresa;
    }

    if (!customer.idEmpresa) {
      throw new BadRequestException('Debe indicar empresa del servicio');
    }

    return customer.idEmpresa;
  }

  private async assertContract(idContrato: number, idCliente: number, idEmpresa: number | null) {
    const contract = await this.prisma.contrato.findUnique({ where: { idContrato } });

    if (!contract || contract.idCliente !== idCliente || contract.idEmpresa !== idEmpresa) {
      throw new BadRequestException('El contrato no corresponde al cliente y empresa seleccionados');
    }

    if (!['Firmado', 'Activo', 'Suspendido', 'Moroso'].includes(contract.estado)) {
      throw new BadRequestException('Debes confirmar la firma del contrato antes de crear un servicio');
    }

    return contract;
  }

  private async resolvePrimaryAddressId(idCliente: number) {
    const address = await this.prisma.direccionServicio.findFirst({
      where: { idCliente },
      orderBy: [{ esPrincipal: 'desc' }, { idDireccion: 'asc' }],
      select: { idDireccion: true },
    });

    return address?.idDireccion;
  }

  private async reconcileCustomerStatus(idCliente: number) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        contratos: { select: { estado: true } },
        servicios: { select: { estadoOperativo: true } },
      },
    });

    if (!customer) {
      return;
    }

    const nextStatus = resolveCustomerLifecycleStatus({
      currentStatus: customer.estado,
      contractStates: customer.contratos.map((contract) => contract.estado),
      serviceStates: customer.servicios.map((service) => service.estadoOperativo),
    });

    if (nextStatus !== customer.estado) {
      await this.prisma.cliente.update({ where: { idCliente }, data: { estado: nextStatus } });
    }
  }

  private async assertAddress(idDireccion: number | undefined, idCliente: number) {
    if (!idDireccion) {
      return;
    }

    const address = await this.prisma.direccionServicio.findUnique({ where: { idDireccion } });

    if (!address || address.idCliente !== idCliente) {
      throw new BadRequestException('La direccion no corresponde al cliente seleccionado');
    }
  }

  private serviceCompanyScope(currentUser: AuthUser): Prisma.ServicioContratadoWhereInput {
    if (isAdministrator(currentUser.roles)) {
      return {};
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return { idEmpresa: currentUser.idEmpresa };
  }

  private canAccessCompany(idEmpresa: number | null, currentUser: AuthUser) {
    return isAdministrator(currentUser.roles) || idEmpresa === currentUser.idEmpresa;
  }

  private async withInstallationContext(services: ServiceWithRelations[]) {
    const completedInstallationByService = new Map<number, ServiceWithRelations['ordenes'][number]>();

    for (const service of services) {
      const installation = service.ordenes
        .filter((order) =>
          this.normalizeStatus(order.tipoOt) === 'instalacion' &&
          this.normalizeStatus(order.estado) === 'completada',
        )
        .sort((left, right) => {
          const leftDate = left.fechaCompletada?.getTime() ?? left.fechaCreacion?.getTime() ?? 0;
          const rightDate = right.fechaCompletada?.getTime() ?? right.fechaCreacion?.getTime() ?? 0;
          return rightDate - leftDate;
        })[0];

      if (installation) {
        completedInstallationByService.set(service.idServicio, installation);
      }
    }

    const technicianIds = [...new Set(
      [...completedInstallationByService.values()]
        .map((order) => order.idTecnico)
        .filter((id): id is number => id !== null),
    )];
    const technicians = technicianIds.length
      ? await this.prisma.usuario.findMany({
        where: { idUsuario: { in: technicianIds } },
        select: { idUsuario: true, nombreCompleto: true },
      })
      : [];
    const technicianById = new Map(technicians.map((technician) => [technician.idUsuario, technician]));

    return services.map((service) => {
      const installation = completedInstallationByService.get(service.idServicio);

      return {
        ...service,
        instalacion: installation
          ? {
            idOt: installation.idOt,
            codigoSeguimiento: installation.codigoSeguimiento,
            fechaCompletada: installation.fechaCompletada,
            idTecnico: installation.idTecnico,
            tecnico: installation.idTecnico ? technicianById.get(installation.idTecnico) ?? null : null,
          }
          : null,
      };
    });
  }

  private technicalData(dto: ServiceTechnicalDataDto) {
    const data = {
      tecnologia: dto.tecnologia?.trim() || undefined,
      velocidad: dto.velocidad?.trim() || undefined,
      macAddress: dto.macAddress?.trim().toUpperCase() || undefined,
      puertoOlt: dto.puertoOlt?.trim() || undefined,
      ipAsignada: dto.ipAsignada?.trim() || undefined,
      observacionesTecnicas: dto.observacionesTecnicas?.trim() || undefined,
      cajaNap: dto.cajaNap?.trim() || undefined,
      numeroPoste: dto.numeroPoste?.trim() || undefined,
      caracteristicasComerciales: dto.caracteristicasComerciales?.trim() || undefined,
    };
    const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

    return Object.keys(clean).length ? clean : undefined;
  }

  private mergeTechnicalData(
    current: Prisma.JsonValue | null,
    next: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const currentObject =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};

    return { ...currentObject, ...next } as Prisma.InputJsonObject;
  }

  private async assertPaymentZone(idZonaPago: number | undefined, idEmpresa: number | null) {
    if (!idZonaPago) {
      return;
    }

    const zone = await this.prisma.zonaPago.findUnique({ where: { idZonaPago } });

    if (!zone || zone.activo === false) {
      throw new BadRequestException('Zona de pago inexistente o inactiva');
    }

    if (zone.idEmpresa && idEmpresa && zone.idEmpresa !== idEmpresa) {
      throw new BadRequestException('La zona de pago no pertenece a la empresa del servicio');
    }
  }

  private async validateServiceInstallOrderPreconditions(service: ServiceWithRelations) {
    if (!service.idEmpresa) {
      throw new BadRequestException('El servicio no tiene empresa asociada');
    }

    const normalizedStatus = this.normalizeStatus(service.estadoOperativo);
    const canSchedule =
      normalizedStatus === 'pendiente' ||
      (normalizedStatus.includes('pendiente') && normalizedStatus.includes('instalacion'));

    if (!canSchedule) {
      throw new BadRequestException('Solo un servicio pendiente de instalacion puede generar una orden de instalacion');
    }

    if (!service.contrato || !['Firmado', 'Activo', 'Suspendido', 'Moroso'].includes(service.contrato.estado)) {
      throw new BadRequestException('El contrato asociado no esta vigente para generar la instalacion');
    }

    const existingOrder = await this.prisma.ordenTrabajo.findFirst({
      where: {
        idServicio: service.idServicio,
        tipoOt: 'Instalacion',
        estado: { notIn: CLOSED_INSTALL_ORDER_STATES },
      },
    });

    if (existingOrder) {
      throw new BadRequestException('El servicio ya tiene una orden de instalacion pendiente');
    }
  }

  private validateInstallSchedule(dateValue: string, timeValue: string) {
    const scheduledDate = parseDateOnly(dateValue);
    const today = todayDateOnly();
    const latestScheduledDate = addYearsToDateOnly(today, 1);

    if (!scheduledDate) {
      throw new BadRequestException('La fecha programada no es una fecha calendario valida');
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
      throw new BadRequestException('La hora de visita no tiene un formato valido');
    }

    if (dateValue < today) {
      throw new BadRequestException('La fecha programada no puede ser anterior a hoy');
    }

    if (dateValue > latestScheduledDate) {
      throw new BadRequestException('La fecha programada no puede superar un ano desde hoy');
    }

    if (dateValue === today && timeValue <= this.currentChileTime()) {
      throw new BadRequestException('La fecha y hora de visita deben ser posteriores a la hora actual');
    }

    return scheduledDate;
  }

  private async buildInstallAvailability(
    idEmpresa: number | null,
    requestedDate: string,
    requestedTime: string,
  ) {
    if (!idEmpresa) {
      throw new BadRequestException('El servicio no tiene empresa asociada');
    }

    const technicians = await this.prisma.usuario.findMany({
      where: {
        idEmpresa,
        activo: true,
        usuarioRoles: {
          some: {
            rol: {
              nombreRol: { in: ['Terreno', 'TECNICO_TERRENO'] },
            },
          },
        },
      },
      orderBy: { nombreCompleto: 'asc' },
      select: {
        idUsuario: true,
        nombreCompleto: true,
        email: true,
      },
    });
    const technicianIds = technicians.map((technician) => technician.idUsuario);

    if (!technicianIds.length) {
      return {
        fechaProgramada: requestedDate,
        horaVisita: requestedTime,
        tecnicosDisponibles: [],
        alternativas: [],
        mensaje: 'No existen tecnicos en terreno activos para la empresa seleccionada',
      };
    }

    const latestScheduledDate = addYearsToDateOnly(todayDateOnly(), 1);
    const proposedAlternativeDate = this.addDaysToDateOnly(requestedDate, 14);
    const lastAlternativeDate = proposedAlternativeDate > latestScheduledDate
      ? latestScheduledDate
      : proposedAlternativeDate;
    const orders = await this.prisma.ordenTrabajo.findMany({
      where: {
        idEmpresa,
        idTecnico: { in: technicianIds },
        tipoOt: 'Instalacion',
        estado: { notIn: CLOSED_INSTALL_ORDER_STATES },
        fechaProgramada: {
          gte: parseDateOnly(requestedDate) ?? undefined,
          lte: parseDateOnly(lastAlternativeDate) ?? undefined,
        },
      },
      select: {
        idTecnico: true,
        fechaProgramada: true,
        observaciones: true,
      },
    });
    const busySlots = new Set<string>();

    for (const order of orders) {
      if (!order.idTecnico || !order.fechaProgramada) {
        continue;
      }

      const date = order.fechaProgramada.toISOString().slice(0, 10);
      const time = parseInstallOrderObservations(order.observaciones).horaVisita;
      busySlots.add(`${order.idTecnico}|${date}|${time ?? '*'}`);
    }

    const availableAt = (date: string, time: string) => technicians
      .filter(
        (technician) =>
          !busySlots.has(`${technician.idUsuario}|${date}|${time}`) &&
          !busySlots.has(`${technician.idUsuario}|${date}|*`),
      )
      .map((technician) => ({
        idTecnico: technician.idUsuario,
        nombreCompleto: technician.nombreCompleto,
        email: technician.email,
      }));
    const availableTechnicians = availableAt(requestedDate, requestedTime);
    const alternatives: Array<{
      fechaProgramada: string;
      horaVisita: string;
      tecnicosDisponibles: ReturnType<typeof availableAt>;
    }> = [];

    if (!availableTechnicians.length) {
      const visitTimes = [...new Set([requestedTime, ...ALTERNATIVE_VISIT_TIMES])];

      for (let dayOffset = 0; dayOffset <= 14 && alternatives.length < 5; dayOffset += 1) {
        const date = this.addDaysToDateOnly(requestedDate, dayOffset);

        if (date > latestScheduledDate) {
          break;
        }

        for (const time of visitTimes) {
          if (date === requestedDate && time === requestedTime) {
            continue;
          }

          if (date === todayDateOnly() && time <= this.currentChileTime()) {
            continue;
          }

          const available = availableAt(date, time);

          if (available.length) {
            alternatives.push({
              fechaProgramada: date,
              horaVisita: time,
              tecnicosDisponibles: available,
            });
          }

          if (alternatives.length >= 5) {
            break;
          }
        }
      }
    }

    return {
      fechaProgramada: requestedDate,
      horaVisita: requestedTime,
      tecnicosDisponibles: availableTechnicians,
      alternativas: alternatives,
      mensaje: availableTechnicians.length
        ? `${availableTechnicians.length} tecnico(s) disponible(s) para la visita`
        : 'No existen tecnicos disponibles en el horario solicitado. Selecciona una alternativa',
    };
  }

  private async resolveServiceAddress(service: ServiceWithRelations) {
    if (service.idDireccion) {
      const address = await this.prisma.direccionServicio.findUnique({
        where: { idDireccion: service.idDireccion },
      });

      if (address) {
        return address;
      }
    }

    const principalAddress = await this.prisma.direccionServicio.findFirst({
      where: { idCliente: service.idCliente, esPrincipal: true },
      orderBy: { idDireccion: 'asc' },
    });

    if (principalAddress) {
      return principalAddress;
    }

    return this.prisma.direccionServicio.findFirst({
      where: { idCliente: service.idCliente },
      orderBy: { idDireccion: 'asc' },
    });
  }

  private addDaysToDateOnly(value: string, days: number) {
    const date = parseDateOnly(value);

    if (!date) {
      throw new BadRequestException('La fecha programada no es valida');
    }

    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private currentChileTime(reference = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(reference);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.hour}:${values.minute}`;
  }

  private normalizeStatus(value?: string | null) {
    return (value ?? '')
      .trim()
      .toLocaleLowerCase('es-CL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
