import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceWithdrawalDto, UpdateServiceWithdrawalDto } from './g3-integration.dto';

@Injectable()
export class ServiceWithdrawalService {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const idEmpresa = this.scope(currentUser, scope);
    return this.prisma.servicioRetiroSolicitud.findMany({
      where: idEmpresa ? { idEmpresa } : {},
      include: {
        cliente: { select: { idCliente: true, nombreCompleto: true, rut: true } },
        servicio: { select: { idServicio: true, tipoServicio: true, estadoOperativo: true } },
        contrato: { select: { idContrato: true, estado: true } },
        responsable: { select: { idUsuario: true, nombreCompleto: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  async create(dto: CreateServiceWithdrawalDto, currentUser: AuthUser) {
    if (!dto.motivo.trim()) throw new BadRequestException('El motivo de retiro es obligatorio');
    const service = await this.prisma.servicioContratado.findUnique({
      where: { idServicio: dto.idServicio },
      include: { contrato: true },
    });
    if (!service) throw new NotFoundException('Servicio contratado no encontrado');
    if (!service.idEmpresa) throw new BadRequestException('El servicio no tiene empresa asociada');
    this.assertCompany(service.idEmpresa, currentUser);
    const idContrato = dto.idContrato ?? service.idContrato;
    if (dto.idContrato && dto.idContrato !== service.idContrato) {
      const contract = await this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } });
      if (!contract || contract.idCliente !== service.idCliente || contract.idEmpresa !== service.idEmpresa) {
        throw new BadRequestException('El contrato no corresponde al servicio y empresa');
      }
    }
    const fechaSolicitada = parseDateOnly(dto.fechaSolicitada);
    if (!fechaSolicitada) throw new BadRequestException('La fecha solicitada no es valida');
    const created = await this.prisma.servicioRetiroSolicitud.create({
      data: {
        idEmpresa: service.idEmpresa,
        idCliente: service.idCliente,
        idServicio: service.idServicio,
        idContrato,
        motivo: dto.motivo.trim(),
        fechaSolicitada,
        estado: 'REGISTRADA',
        estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3',
        idUsuarioResponsable: currentUser.idUsuario,
        observaciones: dto.observaciones?.trim() || null,
      },
    });
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_SOLICITUD_RETIRO_SERVICIO',
      entidadAfectada: 'solicitud_retiro_servicio',
      idEntidadAfectada: created.idSolicitudRetiro,
      valorNuevo: {
        idEmpresa: created.idEmpresa,
        idCliente: created.idCliente,
        idServicio: created.idServicio,
        idContrato: created.idContrato,
        estado: created.estado,
        estadoDespachoTecnico: created.estadoDespachoTecnico,
      },
    });
    return created;
  }

  async update(idSolicitudRetiro: number, dto: UpdateServiceWithdrawalDto, currentUser: AuthUser) {
    const current = await this.prisma.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!current) throw new NotFoundException('Solicitud de retiro no encontrada');
    this.assertCompany(current.idEmpresa, currentUser);
    if (['CANCELADA', 'CERRADA'].includes(current.estado)) {
      throw new BadRequestException('La solicitud de retiro ya esta cerrada');
    }
    const updated = await this.prisma.servicioRetiroSolicitud.update({
      where: { idSolicitudRetiro },
      data: {
        estado: dto.estado,
        observaciones: dto.observaciones === undefined ? current.observaciones : dto.observaciones.trim() || null,
      },
    });
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_SOLICITUD_RETIRO_SERVICIO',
      entidadAfectada: 'solicitud_retiro_servicio',
      idEntidadAfectada: idSolicitudRetiro,
      valorAnterior: { estado: current.estado },
      valorNuevo: { estado: updated.estado, estadoDespachoTecnico: updated.estadoDespachoTecnico },
    });
    return updated;
  }

  private scope(currentUser: AuthUser, scope: string) {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) throw new ForbiddenException('El usuario no tiene empresa asociada');
      return currentUser.idEmpresa;
    }
    if (!scope || scope === 'consolidado') return null;
    const idEmpresa = Number(scope);
    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) throw new BadRequestException('Vista de empresa invalida');
    return idEmpresa;
  }

  private assertCompany(idEmpresa: number, currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles) && currentUser.idEmpresa !== idEmpresa) {
      throw new ForbiddenException('El registro no pertenece a tu empresa');
    }
  }
}
