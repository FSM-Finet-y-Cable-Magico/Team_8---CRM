import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObservationDto } from './dto/create-observation.dto';

@Injectable()
export class ObservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(tipoEntidad: string, idEntidad: number, currentUser: AuthUser) {
    const context = await this.resolveEntityContext(tipoEntidad, idEntidad, currentUser);

    return this.prisma.observacionOperativa.findMany({
      where: {
        tipoEntidad,
        idEntidad,
        ...(context.idEmpresa ? { idEmpresa: context.idEmpresa } : {}),
      },
      include: { usuario: { select: { idUsuario: true, nombreCompleto: true, email: true } } },
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
    });
  }

  async create(dto: CreateObservationDto, currentUser: AuthUser) {
    const context = await this.resolveEntityContext(dto.tipoEntidad, dto.idEntidad, currentUser);
    if (!dto.observacion.trim()) throw new BadRequestException('Escribe una observación');
    if (dto.idCliente !== undefined && dto.idCliente !== context.idCliente) throw new BadRequestException('La observación no corresponde al cliente');
    if (dto.idEmpresa !== undefined && dto.idEmpresa !== context.idEmpresa) throw new BadRequestException('La observación no corresponde a la empresa');
    const idEmpresa = context.idEmpresa;
    const idCliente = context.idCliente;

    this.assertCompanyAccess(idEmpresa, currentUser);

    const created = await this.prisma.observacionOperativa.create({
      data: {
        tipoEntidad: dto.tipoEntidad,
        idEntidad: dto.idEntidad,
        idCliente,
        idEmpresa,
        idUsuario: currentUser.idUsuario,
        observacion: dto.observacion.trim(),
        visibilidad: dto.visibilidad ?? 'Interna',
        fechaCreacion: new Date(),
      },
      include: { usuario: { select: { idUsuario: true, nombreCompleto: true, email: true } } },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_OBSERVACION_OPERATIVA',
      entidadAfectada: 'observacion_operativa',
      idEntidadAfectada: created.idObservacion,
      valorNuevo: {
        tipoEntidad: created.tipoEntidad,
        idEntidad: created.idEntidad,
        idCliente: created.idCliente,
        idEmpresa: created.idEmpresa,
      },
    });

    return created;
  }

  private async resolveEntityContext(tipoEntidad: string, idEntidad: number, currentUser: AuthUser) {
    switch (tipoEntidad) {
      case 'Cliente': {
        const cliente = await this.prisma.cliente.findUnique({
          where: { idCliente: idEntidad },
          include: { contratos: { select: { idEmpresa: true } } },
        });

        if (!cliente) {
          throw new NotFoundException('Cliente no encontrado');
        }

        const canAccess = isAdministrator(currentUser.roles) ||
          cliente.idEmpresa === currentUser.idEmpresa ||
          cliente.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa);

        if (!canAccess) {
          throw new BadRequestException('El cliente no pertenece a tu empresa');
        }

        return { idCliente: cliente.idCliente, idEmpresa: isAdministrator(currentUser.roles) ? cliente.idEmpresa ?? cliente.contratos[0]?.idEmpresa ?? null : currentUser.idEmpresa };
      }
      case 'Servicio': {
        const servicio = await this.prisma.servicioContratado.findUnique({ where: { idServicio: idEntidad } });

        if (!servicio) {
          throw new NotFoundException('Servicio no encontrado');
        }

        this.assertCompanyAccess(servicio.idEmpresa, currentUser);
        return { idCliente: servicio.idCliente, idEmpresa: servicio.idEmpresa };
      }
      case 'Contrato': {
        const contrato = await this.prisma.contrato.findUnique({ where: { idContrato: idEntidad } });

        if (!contrato) {
          throw new NotFoundException('Contrato no encontrado');
        }

        this.assertCompanyAccess(contrato.idEmpresa, currentUser);
        return { idCliente: contrato.idCliente, idEmpresa: contrato.idEmpresa };
      }
      case 'Solicitud': {
        const solicitud = await this.prisma.solicitudCliente.findUnique({ where: { idSolicitud: idEntidad } });

        if (!solicitud) {
          throw new NotFoundException('Solicitud no encontrada');
        }

        this.assertCompanyAccess(solicitud.idEmpresa, currentUser);
        return { idCliente: solicitud.idCliente, idEmpresa: solicitud.idEmpresa };
      }
      case 'Ticket': {
        const ticket = await this.prisma.ticket.findUnique({ where: { idTicket: idEntidad } });

        if (!ticket) {
          throw new NotFoundException('Ticket no encontrado');
        }

        this.assertCompanyAccess(ticket.idEmpresa, currentUser);
        return { idCliente: ticket.idCliente, idEmpresa: ticket.idEmpresa };
      }
      case 'OrdenTrabajo': {
        const order = await this.prisma.ordenTrabajo.findUnique({ where: { idOt: idEntidad } });

        if (!order) {
          throw new NotFoundException('Orden de trabajo no encontrada');
        }

        this.assertCompanyAccess(order.idEmpresa, currentUser);
        return { idCliente: order.idCliente, idEmpresa: order.idEmpresa };
      }
      case 'Equipo': {
        const unit = await this.prisma.unidadEquipo.findUnique({ where: { idUnidad: idEntidad } });

        if (!unit) {
          throw new NotFoundException('Equipo no encontrado');
        }

        this.assertCompanyAccess(unit.idEmpresa, currentUser);
        return { idCliente: unit.idClienteInstalado, idEmpresa: unit.idEmpresa };
      }
      default:
        throw new BadRequestException('Tipo de entidad no soportado para observaciones');
    }
  }

  private assertCompanyAccess(idEmpresa: number | null | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }
}
