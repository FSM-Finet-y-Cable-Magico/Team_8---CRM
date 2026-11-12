import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceWithdrawalDto, UpdateServiceWithdrawalDto } from './g3-integration.dto';
import { APPROVED_EXTENSIONS, invoiceBalance } from '../billing/invoice-balance';

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
    const authorized = await this.prisma.servicioContratado.findUnique({
      where: { idServicio: dto.idServicio },
    });
    if (!authorized) throw new NotFoundException('Servicio contratado no encontrado');
    if (!authorized.idEmpresa) throw new BadRequestException('El servicio no tiene empresa asociada');
    this.assertCompany(authorized.idEmpresa, currentUser);
    const fechaSolicitada = parseDateOnly(dto.fechaSolicitada);
    if (!fechaSolicitada) throw new BadRequestException('La fecha solicitada no es valida');
    return this.prisma.$transaction(async tx => {
      // Serialize active requests on their existing parent; no new schema/key.
      await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${dto.idServicio} FOR UPDATE`;
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: dto.idServicio }, include: { contrato: true } });
      if (!service) throw new NotFoundException('Servicio contratado no encontrado');
      if (!service.idEmpresa) throw new BadRequestException('El servicio no tiene empresa asociada');
      this.assertCompany(service.idEmpresa, currentUser);
      const idContrato = dto.idContrato ?? service.idContrato;
      if (idContrato !== service.idContrato || (idContrato && (!service.contrato
        || service.contrato.idContrato !== idContrato || service.contrato.idEmpresa !== service.idEmpresa || service.contrato.idCliente !== service.idCliente))) {
        throw new BadRequestException('El contrato no corresponde al servicio y empresa');
      }
      const motivo = dto.motivo.trim();
      const observaciones = dto.observaciones?.trim() || null;
      const active = await tx.servicioRetiroSolicitud.findFirst({ where: {
        idEmpresa: service.idEmpresa, idServicio: service.idServicio, estado: { notIn: ['CANCELADA', 'CERRADA'] },
      } });
      if (active) {
        if (active.idCliente === service.idCliente && active.idContrato === idContrato && active.motivo === motivo
          && active.fechaSolicitada.getTime() === fechaSolicitada.getTime() && active.observaciones === observaciones) return active;
        throw new ConflictException('Ya existe una solicitud de retiro activa para este servicio; revisala antes de continuar');
      }
      if (service.estadoOperativo === 'Baja') throw new BadRequestException('El servicio ya esta de baja');
      let idAviso: number | null = null;
      if (motivo.toUpperCase() === 'MOROSIDAD') {
        if (service.estadoOperativo !== 'Suspendido' || !idContrato || !observaciones) {
          throw new BadRequestException('El retiro por morosidad requiere servicio suspendido, contrato y observaciones');
        }
        const invoices = await tx.factura.findMany({ where: { idContrato, contrato: { idEmpresa: service.idEmpresa, idCliente: service.idCliente } },
          include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS } });
        if (!invoices.some(invoice => { const balance = invoiceBalance(invoice); return Number(balance.saldoExigible) > 0 && balance.diasAtraso > 0; })) {
          throw new BadRequestException('El retiro por morosidad requiere deuda exigible vencida');
        }
        const notice = await tx.eventoGestionComercial.findFirst({ where: {
          idEmpresa: service.idEmpresa, idCliente: service.idCliente, idServicio: service.idServicio,
          idContrato, tipo: 'AVISO_PREVIO_RETIRO',
        }, orderBy: { idEvento: 'desc' } });
        if (!notice) throw new BadRequestException('Registra el aviso previo de retiro en el Libro de Control');
        idAviso = notice.idEvento;
      }
      const created = await tx.servicioRetiroSolicitud.create({
      data: {
        idEmpresa: service.idEmpresa,
        idCliente: service.idCliente,
        idServicio: service.idServicio,
        idContrato,
        motivo,
        fechaSolicitada,
        estado: 'REGISTRADA',
        estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3',
        idUsuarioResponsable: currentUser.idUsuario,
        observaciones,
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
        idAviso,
        motivo,
      },
    }, tx);
    return created;
    });
  }

  async update(idSolicitudRetiro: number, dto: UpdateServiceWithdrawalDto, currentUser: AuthUser) {
    const current = await this.prisma.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!current) throw new NotFoundException('Solicitud de retiro no encontrada');
    this.assertCompany(current.idEmpresa, currentUser);
    return this.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${current.idServicio} FOR UPDATE`;
    const fresh = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!fresh || fresh.idEmpresa !== current.idEmpresa || fresh.idServicio !== current.idServicio) {
      throw new ConflictException('La solicitud cambio; vuelve a consultar');
    }
    this.assertCompany(fresh.idEmpresa, currentUser);
    // No technical withdrawal callback is ratified. A manual status is not evidence.
    if (dto.estado === 'CERRADA') throw new BadRequestException('El cierre requiere evidencia tecnica de retiro autorizada; aun no esta habilitado');
    if (['CANCELADA', 'CERRADA'].includes(fresh.estado)) {
      if (dto.estado === fresh.estado && (dto.observaciones === undefined || (dto.observaciones.trim() || null) === fresh.observaciones)) return fresh;
      throw new BadRequestException('La solicitud de retiro ya esta cerrada');
    }
    const updated = await tx.servicioRetiroSolicitud.update({
      where: { idSolicitudRetiro },
      data: {
        estado: dto.estado,
        observaciones: dto.observaciones === undefined ? fresh.observaciones : dto.observaciones.trim() || null,
      },
    });
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_SOLICITUD_RETIRO_SERVICIO',
      entidadAfectada: 'solicitud_retiro_servicio',
      idEntidadAfectada: idSolicitudRetiro,
      valorAnterior: { estado: fresh.estado },
      valorNuevo: { estado: updated.estado, estadoDespachoTecnico: updated.estadoDespachoTecnico },
    }, tx);
    return updated;
    });
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
