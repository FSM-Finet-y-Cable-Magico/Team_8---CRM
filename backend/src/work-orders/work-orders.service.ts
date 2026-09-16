import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import {
  parseInstallOrderObservations,
  preserveInstallOrderMetadata,
} from '../common/install-order-metadata';
import { isAdministrator } from '../common/roles';
import { serviceTypeFromPlan } from '../common/service-type';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';
import { CompleteRepairOrderDto } from './dto/complete-repair-order.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const orders = await this.prisma.ordenTrabajo.findMany({
      where: this.companyScope(currentUser, scope),
      orderBy: { fechaCreacion: 'desc' },
      take: 150,
    });
    const customerIds = [...new Set(orders.map((order) => order.idCliente).filter((id): id is number => id !== null))];
    const prospectIds = [...new Set(orders.map((order) => order.idProspecto).filter((id): id is number => id !== null))];
    const technicianIds = [...new Set(orders.map((order) => order.idTecnico).filter((id): id is number => id !== null))];
    const ticketIds = [...new Set(orders.map((order) => order.idTicket).filter((id): id is number => id !== null))];
    const [prospects, customers, technicians, tickets] = await Promise.all([
      customerIds.length || prospectIds.length
        ? this.prisma.prospecto.findMany({
          where: {
            OR: [
              ...(prospectIds.length ? [{ idProspecto: { in: prospectIds } }] : []),
              ...(customerIds.length ? [{ idCliente: { in: customerIds } }] : []),
            ],
          },
          orderBy: { fechaCreacion: 'desc' },
          select: {
            idProspecto: true,
            idCliente: true,
            idEmpresa: true,
            rut: true,
            nombreCompleto: true,
            fechaCreacion: true,
            fechaConversion: true,
            tiempoConversionDias: true,
            estadoPipeline: true,
          },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.cliente.findMany({
            where: { idCliente: { in: customerIds } },
            select: {
              idCliente: true,
              rut: true,
              nombreCompleto: true,
            },
          })
        : Promise.resolve([]),
      technicianIds.length
        ? this.prisma.usuario.findMany({
            where: { idUsuario: { in: technicianIds } },
            select: {
              idUsuario: true,
              nombreCompleto: true,
              email: true,
            },
          })
        : Promise.resolve([]),
      ticketIds.length
        ? this.prisma.ticket.findMany({
            where: { idTicket: { in: ticketIds } },
            select: {
              idTicket: true,
              idCliente: true,
              idServicio: true,
              idCategoria: true,
              codigoSeguimiento: true,
              prioridad: true,
              estado: true,
              descripcion: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const prospectByCustomerCompany = new Map<string, (typeof prospects)[number]>();
    const prospectById = new Map(prospects.map((prospect) => [prospect.idProspecto, prospect]));
    const customerById = new Map(customers.map((customer) => [customer.idCliente, customer]));
    const technicianById = new Map(technicians.map((technician) => [technician.idUsuario, technician]));
    const ticketById = new Map(tickets.map((ticket) => [ticket.idTicket, ticket]));

    for (const prospect of prospects) {
      const key = `${prospect.idCliente}:${prospect.idEmpresa}`;

      if (!prospectByCustomerCompany.has(key)) {
        prospectByCustomerCompany.set(key, prospect);
      }
    }

    return orders.map((order) => {
      const metadata = parseInstallOrderObservations(order.observaciones);
      const horaVisita = metadata.horaVisita ?? this.extractVisitTime(order.observaciones);

      return {
        ...order,
        tipoConexion: metadata.tipoConexion,
        horaVisita,
        observacionesAgenda: metadata.observacionesAgenda,
        observacionesCierre: metadata.observacionesCierre,
        tecnico: order.idTecnico ? technicianById.get(order.idTecnico) ?? null : null,
        cliente: order.idCliente ? customerById.get(order.idCliente) ?? null : null,
        prospecto: (order.idProspecto ? prospectById.get(order.idProspecto) : null)
          ?? prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`)
          ?? null,
        ticket: order.idTicket ? ticketById.get(order.idTicket) ?? null : null,
      };
    });
  }

  async completeInstallation(idOt: number, dto: CompleteInstallOrderDto, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt !== 'Instalacion') {
      throw new BadRequestException('La orden no corresponde a instalacion');
    }

    if (order.estado === 'Completada') {
      throw new BadRequestException('La orden de instalacion ya se encuentra completada');
    }

    if (!order.idCliente && !order.idProspecto) {
      throw new BadRequestException('La orden no tiene prospecto ni cliente asociado');
    }

    const installationService = order.idServicio
      ? await this.prisma.servicioContratado.findUnique({
        where: { idServicio: order.idServicio },
        select: {
          idServicio: true,
          idCliente: true,
          idEmpresa: true,
          idContrato: true,
          datosTecnicos: true,
        },
      })
      : null;

    if (order.idServicio && !installationService) {
      throw new BadRequestException('El servicio asociado a la orden de instalacion no existe');
    }

    if (
      installationService &&
      (installationService.idCliente !== order.idCliente || installationService.idEmpresa !== order.idEmpresa)
    ) {
      throw new BadRequestException('El servicio asociado no corresponde al cliente y empresa de la orden');
    }

    const prospect = order.idProspecto
      ? await this.prisma.prospecto.findUnique({ where: { idProspecto: order.idProspecto } })
      : await this.prisma.prospecto.findFirst({
        where: { idCliente: order.idCliente, idEmpresa: order.idEmpresa },
        orderBy: { fechaCreacion: 'desc' },
      });

    if (!prospect && !order.idServicio) {
      throw new BadRequestException('No existe un prospecto o servicio asociado para completar la instalacion');
    }

    if (prospect && !prospect.fechaCreacion) {
      throw new BadRequestException('No se puede completar la instalacion: falta la fecha de creacion del prospecto');
    }

    const conversionDate = new Date();

    if (prospect?.fechaCreacion && prospect.fechaCreacion.getTime() > conversionDate.getTime()) {
      throw new BadRequestException('No se puede completar la instalacion: la fecha de creacion del prospecto es futura');
    }

    const activationContract = !order.idCliente && prospect
      ? await this.prisma.contrato.findFirst({
        where: {
          idProspecto: prospect.idProspecto,
          idEmpresa: order.idEmpresa,
          estado: { in: ['Firmado', 'Activo'] },
        },
        include: { plan: true },
        orderBy: { idContrato: 'desc' },
      })
      : null;

    if (!order.idCliente && !activationContract) {
      throw new BadRequestException('El prospecto no tiene un contrato firmado para activar la instalacion');
    }

    const activationServiceType = activationContract
      ? serviceTypeFromPlan(activationContract.plan?.tipoPlan)
      : null;

    if (activationContract && !activationServiceType) {
      throw new BadRequestException('El plan contratado no permite determinar el tipo de servicio');
    }

    const activationAddress = activationContract
      ? activationContract.direccionInstalacion?.trim() || prospect?.direccion?.trim()
      : null;

    if (activationContract && !activationAddress) {
      throw new BadRequestException('El contrato no tiene una direccion de instalacion registrada');
    }

    const equipment = await this.resolveInstallationEquipment(
      dto,
      order,
      installationService,
      Boolean(activationContract),
    );

    const conversionDays = prospect?.fechaCreacion
      ? Math.max(
          0,
          Math.ceil((conversionDate.getTime() - prospect.fechaCreacion.getTime()) / (1000 * 60 * 60 * 24)),
        )
      : null;
    const completionObservations = preserveInstallOrderMetadata(order.observaciones, dto.observaciones);

    const result = await this.prisma.$transaction(async (tx) => {
      let cliente;
      let updatedService = null;
      let idDireccion = order.idDireccion;

      if (!order.idCliente && prospect && activationContract && activationServiceType && activationAddress) {
        cliente = await tx.cliente.create({
          data: {
            idEmpresa: order.idEmpresa,
            rut: prospect.rut,
            nombreCompleto: prospect.nombreCompleto?.trim() || `Cliente prospecto ${prospect.idProspecto}`,
            email: prospect.email,
            telefono: prospect.telefono,
            estado: 'Activo',
            origenContacto: prospect.origenContacto,
          },
        });
        const direccion = await tx.direccionServicio.create({
          data: {
            idCliente: cliente.idCliente,
            direccionCompleta: activationAddress,
            comuna: activationContract.comunaInstalacion?.trim() || 'Por confirmar',
            ciudad: activationContract.ciudadInstalacion?.trim() || 'Por confirmar',
            esPrincipal: true,
          },
        });
        idDireccion = direccion.idDireccion;
        updatedService = await tx.servicioContratado.create({
          data: {
            idCliente: cliente.idCliente,
            idEmpresa: order.idEmpresa,
            idContrato: activationContract.idContrato,
            idDireccion,
            idZonaPago: activationContract.idZonaPago,
            tipoServicio: activationServiceType,
            estadoOperativo: 'Activo',
            datosTecnicos: this.mergeInstallationTechnicalData(null, dto),
          },
        });
        await tx.contrato.update({
          where: { idContrato: activationContract.idContrato },
          data: { idCliente: cliente.idCliente, estado: 'Activo' },
        });
      } else {
        cliente = await tx.cliente.update({
          where: { idCliente: order.idCliente ?? 0 },
          data: { estado: 'Activo' },
        });

        if (installationService?.idContrato) {
          await tx.contrato.update({
            where: { idContrato: installationService.idContrato },
            data: { estado: 'Activo' },
          });
        } else {
          await tx.contrato.updateMany({
            where: {
              idCliente: cliente.idCliente,
              idEmpresa: order.idEmpresa,
              estado: { not: 'Activo' },
            },
            data: { estado: 'Activo' },
          });
        }

        if (installationService) {
          updatedService = await tx.servicioContratado.update({
            where: { idServicio: installationService.idServicio },
            data: {
              estadoOperativo: 'Activo',
              datosTecnicos: this.mergeInstallationTechnicalData(installationService.datosTecnicos, dto),
            },
          });
        } else {
          await tx.servicioContratado.updateMany({
            where: {
              idCliente: cliente.idCliente,
              idEmpresa: order.idEmpresa,
              estadoOperativo: { not: 'Baja' },
            },
            data: { estadoOperativo: 'Activo' },
          });
        }
      }

      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: {
          idCliente: cliente.idCliente,
          idDireccion,
          idServicio: updatedService?.idServicio ?? order.idServicio,
          estado: 'Completada',
          fechaCompletada: new Date(),
          potenciaOpticaDbm: dto.potenciaOpticaDbm,
          observaciones: completionObservations,
        },
      });

      const updatedEquipment = equipment && updatedService
        ? await tx.unidadEquipo.update({
          where: { idUnidad: equipment.idUnidad },
          data: {
            idServicio: updatedService.idServicio,
            idClienteInstalado: cliente.idCliente,
            estado: 'Instalado',
            modelo: dto.modelo?.trim() || equipment.modelo,
            modalidadAsignacion: dto.modalidadAsignacion ?? equipment.modalidadAsignacion ?? 'Propiedad empresa',
            valorArriendoMensual: dto.modalidadAsignacion && dto.modalidadAsignacion !== 'Arriendo'
              ? null
              : dto.valorArriendoMensual ?? equipment.valorArriendoMensual,
            fechaInicioAsignacion: new Date(),
            diagnosticoTecnico: this.appendInstallationEquipmentNotes(equipment.diagnosticoTecnico, dto),
          },
        })
        : null;

      if (updatedEquipment) {
        await tx.historialEstadoEquipo.create({
          data: {
            idUnidad: updatedEquipment.idUnidad,
            idUsuario: currentUser.idUsuario,
            estadoAnterior: equipment?.estado,
            estadoNuevo: 'Instalado',
            motivo: 'Instalacion OT ' + (updatedOrder.codigoSeguimiento ?? updatedOrder.idOt),
            fechaHora: new Date(),
          },
        });
      }

      const updatedProspect = prospect
        ? await tx.prospecto.update({
            where: { idProspecto: prospect.idProspecto },
            data: {
              idCliente: cliente.idCliente,
              estadoPipeline: 'Servicio Activo',
              motivoPerdida: null,
              fechaConversion: conversionDate,
              tiempoConversionDias: conversionDays,
            },
          })
        : null;

      await tx.historialOt.create({
        data: {
          idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: order.estado,
          estadoNuevo: 'Completada',
          observaciones: completionObservations,
          fechaHora: new Date(),
        },
      });

      return {
        order: updatedOrder,
        cliente,
        prospect: updatedProspect,
        servicio: updatedService,
        equipo: updatedEquipment,
      };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTIVAR_CLIENTE_INSTALACION',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: idOt,
      valorAnterior: { estado: order.estado },
      valorNuevo: {
        estadoOrden: 'Completada',
        idCliente: result.cliente.idCliente,
        estadoCliente: 'Activo',
        potenciaOpticaDbm: dto.potenciaOpticaDbm,
        fechaCreacionProspecto: prospect?.fechaCreacion?.toISOString() ?? null,
        fechaConversion: prospect ? conversionDate.toISOString() : null,
        tiempoConversionDias: conversionDays,
        idServicio: result.servicio?.idServicio ?? order.idServicio,
        idContrato: installationService?.idContrato ?? activationContract?.idContrato ?? null,
        idEquipo: result.equipo?.idUnidad ?? null,
        tecnicoCierre: currentUser.idUsuario,
      },
    });

    return result;
  }

  async cancelInstallation(idOt: number, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt !== 'Instalacion') {
      throw new BadRequestException('La orden no corresponde a una instalación');
    }

    if (['Completada', 'Cancelada'].includes(order.estado)) {
      throw new BadRequestException('La agenda ya se encuentra cerrada');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: { estado: 'Cancelada' },
      });

      if (order.idServicio) {
        await tx.servicioContratado.update({
          where: { idServicio: order.idServicio },
          data: { estadoOperativo: 'Pendiente Instalacion' },
        });
      }

      await tx.historialOt.create({
        data: {
          idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: order.estado,
          estadoNuevo: 'Cancelada',
          observaciones: 'Agenda de instalación cancelada',
          fechaHora: new Date(),
        },
      });

      return updatedOrder;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CANCELAR_AGENDA_INSTALACION',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: idOt,
      valorAnterior: { estado: order.estado },
      valorNuevo: { estado: result.estado },
    });

    return result;
  }

  async completeRepair(idOt: number, dto: CompleteRepairOrderDto, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt === 'Instalacion') {
      throw new BadRequestException('La orden de instalacion debe cerrarse desde el flujo de instalacion');
    }

    if (!order.idTicket) {
      throw new BadRequestException('La orden no tiene ticket asociado');
    }

    if (order.estado === 'Completada') {
      throw new BadRequestException('La orden de trabajo ya se encuentra completada');
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket: order.idTicket } });

    if (!ticket) {
      throw new BadRequestException('El ticket asociado a la orden no existe');
    }

    const completionNotes = dto.observaciones.trim();
    const completionObservations = `${order.observaciones ?? ''}\n\nCierre tecnico:\n${completionNotes}`.trim();
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: {
          estado: 'Completada',
          fechaCompletada: new Date(),
          potenciaOpticaDbm: dto.potenciaOpticaDbm,
          observaciones: completionObservations,
        },
      });

      const updatedTicket = await tx.ticket.update({
        where: { idTicket: order.idTicket ?? 0 },
        data: {
          estado: 'Resuelto',
          fechaCierre: new Date(),
          descripcion: `${ticket.descripcion ?? ''}\n\nCierre desde OT #${idOt}:\n${completionNotes}`.trim(),
        },
      });

      if (order.idCliente && dto.estadoFinalServicio) {
        await tx.cliente.update({
          where: { idCliente: order.idCliente },
          data: { estado: dto.estadoFinalServicio },
        });
      }

      await tx.historialOt.create({
        data: {
          idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: order.estado,
          estadoNuevo: 'Completada',
          observaciones: completionObservations,
          fechaHora: new Date(),
        },
      });

      return { order: updatedOrder, ticket: updatedTicket };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CERRAR_OT_TICKET',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: idOt,
      valorAnterior: {
        estadoOrden: order.estado,
        estadoTicket: ticket.estado,
      },
      valorNuevo: {
        estadoOrden: result.order.estado,
        estadoTicket: result.ticket.estado,
        idTicket: order.idTicket,
        idCliente: order.idCliente,
        estadoFinalServicio: dto.estadoFinalServicio,
      },
    });

    return result;
  }

  private async getOrderOrThrow(idOt: number, currentUser: AuthUser) {
    const order = await this.prisma.ordenTrabajo.findUnique({ where: { idOt } });

    if (!order) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    if (!isAdministrator(currentUser.roles) && order.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('La orden no pertenece a tu empresa');
    }

    return order;
  }

  private async resolveInstallationEquipment(
    dto: CompleteInstallOrderDto,
    order: { idEmpresa: number | null; idServicio: number | null },
    installationService: { idServicio: number; idCliente: number; idEmpresa: number | null } | null,
    allowPendingService = false,
  ) {
    const serial = dto.numeroSerie?.trim();

    if (!dto.idUnidad && !serial) {
      return null;
    }

    if (!installationService && !allowPendingService) {
      throw new BadRequestException('La instalación debe tener un servicio asociado para registrar equipo');
    }

    const equipment = dto.idUnidad
      ? await this.prisma.unidadEquipo.findUnique({ where: { idUnidad: dto.idUnidad } })
      : await this.prisma.unidadEquipo.findUnique({ where: { numeroSerie: serial ?? '' } });

    if (!equipment) {
      throw new NotFoundException('El equipo indicado no existe en inventario');
    }

    if (dto.idUnidad && serial && equipment.numeroSerie !== serial) {
      throw new BadRequestException('El número de serie no corresponde al equipo seleccionado');
    }

    if (equipment.idEmpresa && order.idEmpresa && equipment.idEmpresa !== order.idEmpresa) {
      throw new BadRequestException('El equipo no pertenece a la empresa de la orden');
    }

    if (['Bloqueado', 'Baja Definitiva'].includes(equipment.estado)) {
      throw new BadRequestException('Un equipo bloqueado o dado de baja no puede instalarse');
    }

    if (
      equipment.idServicio
      && equipment.idServicio !== installationService?.idServicio
      && equipment.estado === 'Instalado'
    ) {
      throw new BadRequestException('El equipo ya se encuentra instalado en otro servicio');
    }

    return equipment;
  }

  private mergeInstallationTechnicalData(current: Prisma.JsonValue | null, dto: CompleteInstallOrderDto) {
    const currentObject = current && typeof current === 'object' && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {};
    const values = {
      potenciaOpticaDbm: dto.potenciaOpticaDbm ?? undefined,
      macAddress: dto.macAddress?.trim().toUpperCase() || undefined,
      puertoOlt: dto.puertoOlt?.trim() || undefined,
    };
    const next = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

    return { ...currentObject, ...next } as Prisma.InputJsonObject;
  }

  private appendInstallationEquipmentNotes(current: string | null, dto: CompleteInstallOrderDto) {
    const details = [
      dto.macAddress?.trim() ? 'MAC: ' + dto.macAddress.trim().toUpperCase() : null,
      dto.puertoOlt?.trim() ? 'Puerto OLT: ' + dto.puertoOlt.trim() : null,
    ].filter(Boolean).join('; ');

    return details ? [current, 'Instalacion OT - ' + details].filter(Boolean).join('\n') : current;
  }

  private extractVisitTime(observaciones?: string | null) {
    return observaciones?.match(/^HoraVisita=(\d{2}:\d{2})$/m)?.[1] ?? null;
  }

  private companyScope(currentUser: AuthUser, scope: string) {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }
}
