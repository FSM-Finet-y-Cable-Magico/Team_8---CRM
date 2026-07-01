import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { AttachEquipmentDto } from './dto/attach-equipment.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

const SERVICE_INCLUDE = {
  cliente: true,
  empresa: true,
  contrato: { include: { plan: true } },
  direccion: true,
  equipos: { orderBy: { idUnidad: 'desc' } },
  tickets: {
    orderBy: { fechaCreacion: 'desc' },
    take: 20,
  },
  ordenes: {
    orderBy: { fechaCreacion: 'desc' },
    take: 20,
  },
} satisfies Prisma.ServicioContratadoInclude;

type ServiceTechnicalDataDto = Pick<
  CreateServiceDto | UpdateServiceDto,
  'tecnologia' | 'velocidad' | 'macAddress' | 'puertoOlt' | 'ipAsignada' | 'observacionesTecnicas'
>;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listByCustomer(idCliente: number, currentUser: AuthUser) {
    await this.getCustomerOrThrow(idCliente, currentUser);

    return this.prisma.servicioContratado.findMany({
      where: { idCliente, ...this.serviceCompanyScope(currentUser) },
      orderBy: { fechaCreacion: 'desc' },
      include: SERVICE_INCLUDE,
    });
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

    return {
      ...service,
      auditoria: auditoria.map((row) => ({ ...row, idLog: row.idLog.toString() })),
    };
  }

  async create(dto: CreateServiceDto, currentUser: AuthUser) {
    const customer = await this.getCustomerOrThrow(dto.idCliente, currentUser);
    const idEmpresa = await this.resolveCompanyId(dto, customer, currentUser);
    await this.assertContract(dto.idContrato, dto.idCliente, idEmpresa);
    await this.assertAddress(dto.idDireccion, dto.idCliente);

    const created = await this.prisma.servicioContratado.create({
      data: {
        idCliente: dto.idCliente,
        idEmpresa,
        idContrato: dto.idContrato,
        idDireccion: dto.idDireccion,
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

    return created;
  }

  async update(idServicio: number, dto: UpdateServiceDto, currentUser: AuthUser) {
    const service = await this.getServiceOrThrow(idServicio, currentUser);
    const data: Prisma.ServicioContratadoUpdateInput = {
      tipoServicio: dto.tipoServicio,
      estadoOperativo: dto.estadoOperativo,
      observaciones: dto.observaciones === undefined ? undefined : dto.observaciones.trim() || null,
    };
    const technicalData = this.technicalData(dto);

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
      },
    });

    return this.detail(idServicio, currentUser);
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

  private async assertContract(idContrato: number | undefined, idCliente: number, idEmpresa: number | null) {
    if (!idContrato) {
      return;
    }

    const contract = await this.prisma.contrato.findUnique({ where: { idContrato } });

    if (!contract || contract.idCliente !== idCliente || contract.idEmpresa !== idEmpresa) {
      throw new BadRequestException('El contrato no corresponde al cliente y empresa seleccionados');
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

  private technicalData(dto: ServiceTechnicalDataDto) {
    const data = {
      tecnologia: dto.tecnologia?.trim() || undefined,
      velocidad: dto.velocidad?.trim() || undefined,
      macAddress: dto.macAddress?.trim().toUpperCase() || undefined,
      puertoOlt: dto.puertoOlt?.trim() || undefined,
      ipAsignada: dto.ipAsignada?.trim() || undefined,
      observacionesTecnicas: dto.observacionesTecnicas?.trim() || undefined,
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
}
