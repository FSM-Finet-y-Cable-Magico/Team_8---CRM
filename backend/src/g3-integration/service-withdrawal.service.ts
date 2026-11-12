import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { resolveCustomerLifecycleStatus } from '../common/customer-lifecycle';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { ensureReturningProspect } from '../common/returning-customer';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateServiceWithdrawalDto, InitiateServiceWithdrawalDto, UpdateServiceWithdrawalDto } from './g3-integration.dto';
import { APPROVED_EXTENSIONS } from '../billing/invoice-balance';
import { ACTIVE_AGREEMENT_STATES, hasOverdueCollectibleDebt, overdueDebtSummary } from '../common/overdue-debt';
import { evaluateWithdrawalEligibility, WITHDRAWAL_MOTIVE_MOROSITY, WithdrawalFacts } from './withdrawal-eligibility';
import { assessWithdrawalClosure, paymentDuringWithdrawal, UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED, WithdrawalStage } from './withdrawal-closure';
import { postgresWithdrawalStorage, WITHDRAWAL_STORAGE, WithdrawalStorage } from './withdrawal.storage';

const CLOSED_REQUEST_STATES = ['CANCELADA', 'CERRADA'];
const SERVICE_FACT_INCLUDE = { contrato: { include: { plan: true } }, cliente: true, empresa: true } satisfies Prisma.ServicioContratadoInclude;
type Db = Prisma.TransactionClient;

@Injectable()
export class ServiceWithdrawalService {
  private readonly storage: WithdrawalStorage;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly tickets?: TicketsService,
    @Optional() @Inject(WITHDRAWAL_STORAGE) storage?: WithdrawalStorage,
  ) {
    this.storage = storage ?? postgresWithdrawalStorage;
  }

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
        idEmpresa: service.idEmpresa, idServicio: service.idServicio, estado: { notIn: CLOSED_REQUEST_STATES },
      } });
      if (active) {
        if (active.idCliente === service.idCliente && active.idContrato === idContrato && active.motivo === motivo
          && active.fechaSolicitada.getTime() === fechaSolicitada.getTime() && active.observaciones === observaciones) return active;
        throw new ConflictException('Ya existe una solicitud de retiro activa para este servicio; revisala antes de continuar');
      }
      if (service.estadoOperativo === 'Baja') throw new BadRequestException('El servicio ya esta de baja');
      let idAviso: number | null = null;
      if (motivo.toUpperCase() === WITHDRAWAL_MOTIVE_MOROSITY) {
        if (service.estadoOperativo !== 'Suspendido' || !idContrato || !observaciones) {
          throw new BadRequestException('El retiro por morosidad requiere servicio suspendido, contrato y observaciones');
        }
        const invoices = await this.overdueInvoices(tx, service.idEmpresa, service.idCliente, idContrato);
        // Misma regla que la elegibilidad del Libro de Control: vencida, exigible y sin convenio activo.
        if (!hasOverdueCollectibleDebt(invoices)) {
          throw new BadRequestException('El retiro por morosidad requiere deuda exigible vencida');
        }
        const notice = await this.latestNotice(tx, service.idEmpresa, service.idCliente, service.idServicio, idContrato);
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
    await this.auditCreated(tx, created, idAviso, motivo, currentUser);
    return created;
    });
  }

  /**
   * Consulta (sin escrituras) de los requisitos para iniciar la baja por morosidad de un servicio.
   * Precarga lo que el CRM ya sabe; la interfaz muestra el resultado, pero quien decide es el backend
   * al ejecutar `initiate`, con los mismos criterios y bajo bloqueo.
   */
  async eligibility(idServicio: number, currentUser: AuthUser) {
    const db = this.prisma as unknown as Db;
    const service = await db.servicioContratado.findUnique({ where: { idServicio }, include: SERVICE_FACT_INCLUDE });
    if (!service) throw new NotFoundException('Servicio contratado no encontrado');
    if (!service.idEmpresa) throw new BadRequestException('El servicio no tiene empresa asociada');
    this.assertCompany(service.idEmpresa, currentUser);
    const facts = await this.loadFacts(db, service, currentUser);
    const result = evaluateWithdrawalEligibility(facts);
    const capabilities = await this.storage.capabilities(db);
    return {
      idServicio,
      motivo: WITHDRAWAL_MOTIVE_MOROSITY,
      eligible: result.eligible,
      checks: result.checks,
      firstFailure: result.firstFailure,
      // La baja guiada solo opera con el vínculo estructurado solicitud↔aviso↔ticket aplicado.
      habilitado: capabilities.ticketLink,
      capabilities,
      contexto: {
        empresa: service.empresa ? { idEmpresa: service.empresa.idEmpresa, nombre: service.empresa.nombre } : { idEmpresa: service.idEmpresa, nombre: null },
        cliente: { idCliente: service.idCliente, nombre: service.cliente?.nombreCompleto ?? null, rut: service.cliente?.rut ?? null },
        contrato: service.contrato ? { idContrato: service.contrato.idContrato, estado: service.contrato.estado, plan: service.contrato.plan?.nombreComercial ?? null } : null,
        servicio: { idServicio: service.idServicio, tipo: service.tipoServicio, estado: service.estadoOperativo },
        deuda: facts.debt,
        aviso: facts.notice ? { idEvento: facts.notice.idEvento, fecha: facts.notice.fecha ?? null } : null,
        solicitudActiva: facts.activeRequest,
        responsable: { idUsuario: currentUser.idUsuario, nombre: currentUser.nombreCompleto },
      },
    };
  }

  /**
   * «Iniciar baja y retiro» desde el Libro de Control. En UNA transacción, serializada sobre el servicio:
   * revalida todos los requisitos, crea la solicitud (motivo MOROSIDAD), el ticket CRM «Baja de servicio» y
   * su vínculo estructurado con el aviso previo, y audita. Cualquier fallo revierte las tres cosas.
   * Nunca cambia el servicio a Baja, nunca crea una OT ni contacta a G3.
   * Doble clic o reintento: devuelve la misma operación ya vinculada, sin otro ticket.
   */
  async initiate(dto: InitiateServiceWithdrawalDto, currentUser: AuthUser) {
    const tickets = this.requireTickets();
    const observaciones = dto.observaciones.trim();
    if (observaciones.length < 10) throw new BadRequestException('Describe la gestión de cobranza y el motivo del retiro (mínimo 10 caracteres)');
    const fechaSolicitada = dto.fechaSolicitada ? parseDateOnly(dto.fechaSolicitada) : parseDateOnly(todayDateOnly());
    if (!fechaSolicitada) throw new BadRequestException('La fecha solicitada no es valida');
    const authorized = await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } });
    if (!authorized) throw new NotFoundException('Servicio contratado no encontrado');
    if (!authorized.idEmpresa) throw new BadRequestException('El servicio no tiene empresa asociada');
    this.assertCompany(authorized.idEmpresa, currentUser);
    return this.prisma.$transaction(async tx => {
      await this.assertLinkStorage(tx);
      await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${dto.idServicio} FOR UPDATE`;
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: dto.idServicio }, include: SERVICE_FACT_INCLUDE });
      if (!service || !service.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
      this.assertCompany(service.idEmpresa, currentUser);
      if (dto.idContrato !== undefined && dto.idContrato !== service.idContrato) {
        throw new BadRequestException('El contrato no corresponde al servicio y empresa');
      }
      const facts = await this.loadFacts(tx, service, currentUser);
      if (facts.activeRequest) {
        const replay = await this.replayLinked(tx, facts.activeRequest.idSolicitudRetiro, service);
        if (replay) return replay;
        throw new ConflictException({
          code: 'WITHDRAWAL_REQUEST_ACTIVE',
          message: 'Ya existe una solicitud de retiro activa para este servicio; revísala antes de continuar',
          idSolicitudRetiro: facts.activeRequest.idSolicitudRetiro,
        });
      }
      const result = evaluateWithdrawalEligibility(facts);
      if (!result.eligible) {
        const failure = result.firstFailure!;
        throw new BadRequestException({ code: 'WITHDRAWAL_NOT_ELIGIBLE', requisito: failure.code, message: failure.message });
      }
      const idContrato = service.idContrato!;
      const notice = facts.notice!;
      const request = await tx.servicioRetiroSolicitud.create({ data: {
        idEmpresa: service.idEmpresa, idCliente: service.idCliente, idServicio: service.idServicio, idContrato,
        motivo: WITHDRAWAL_MOTIVE_MOROSITY, fechaSolicitada, estado: 'REGISTRADA', estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3',
        idUsuarioResponsable: currentUser.idUsuario, observaciones,
      } });
      await this.auditCreated(tx, request, notice.idEvento, WITHDRAWAL_MOTIVE_MOROSITY, currentUser);
      return this.createLinkedTicket(tx, tickets, request, notice.idEvento, currentUser);
    });
  }

  /**
   * Vincula un ticket «Baja de servicio» a una solicitud por morosidad ya registrada (por ejemplo, desde
   * Clientes antes de existir el vínculo). Revalida los requisitos actuales: una deuda regularizada o un aviso
   * ausente impiden crear el ticket. Idempotente: si ya tiene ticket, lo devuelve.
   */
  async openTicket(idSolicitudRetiro: number, currentUser: AuthUser) {
    const tickets = this.requireTickets();
    const current = await this.prisma.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!current) throw new NotFoundException('Solicitud de retiro no encontrada');
    this.assertCompany(current.idEmpresa, currentUser);
    return this.prisma.$transaction(async tx => {
      await this.assertLinkStorage(tx);
      await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${current.idServicio} FOR UPDATE`;
      const request = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
      if (!request || request.idEmpresa !== current.idEmpresa || request.idServicio !== current.idServicio) {
        throw new ConflictException('La solicitud cambio; vuelve a consultar');
      }
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: request.idServicio }, include: SERVICE_FACT_INCLUDE });
      if (!service || !service.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
      const replay = await this.replayLinked(tx, idSolicitudRetiro, service);
      if (replay) return replay;
      if (CLOSED_REQUEST_STATES.includes(request.estado)) throw new BadRequestException('La solicitud de retiro ya esta cerrada o cancelada');
      if (request.motivo.toUpperCase() !== WITHDRAWAL_MOTIVE_MOROSITY) {
        throw new BadRequestException('El ticket «Baja de servicio» de este flujo corresponde a solicitudes por morosidad');
      }
      if (request.idCliente !== service.idCliente || request.idEmpresa !== service.idEmpresa || request.idContrato !== service.idContrato) {
        throw new ConflictException('Las relaciones de la solicitud y el servicio no coinciden; no se creó el ticket');
      }
      const facts = await this.loadFacts(tx, service, currentUser);
      const result = evaluateWithdrawalEligibility({ ...facts, activeRequest: null });
      if (!result.eligible) {
        const failure = result.firstFailure!;
        throw new BadRequestException({ code: 'WITHDRAWAL_NOT_ELIGIBLE', requisito: failure.code, message: failure.message });
      }
      return this.createLinkedTicket(tx, tickets, request, facts.notice!.idEvento, currentUser);
    });
  }

  /**
   * Baja efectiva por morosidad. Operación distinta y posterior al ticket: solo aplica con evidencia técnica
   * ya recibida (OT de retiro aprobada en G3, equipos confirmados por el inventario de G1). Mientras ese contrato
   * no esté ratificado y su almacenamiento no exista, responde bloqueada y no modifica nada.
   * Al aplicar: servicio Baja, contrato Baja solo si no le quedan servicios operativos, cliente recalculado,
   * solicitud CERRADA y retorno a Prospectos; deudas, facturas, pagos e inventario no se tocan.
   */
  async finalize(idSolicitudRetiro: number, currentUser: AuthUser) {
    const current = await this.prisma.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!current) throw new NotFoundException('Solicitud de retiro no encontrada');
    this.assertCompany(current.idEmpresa, currentUser);
    return this.prisma.$transaction(async tx => {
      const capabilities = await this.storage.capabilities(tx);
      if (!capabilities.g3Closure || !capabilities.ticketLink) {
        throw new ConflictException({
          code: 'WITHDRAWAL_CLOSURE_NOT_AVAILABLE',
          message: 'La baja efectiva requiere la evidencia del retiro técnico confirmado, y esa integración aún no está habilitada. El servicio no se modificó.',
        });
      }
      await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${current.idServicio} FOR UPDATE`;
      const request = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
      if (!request || request.idEmpresa !== current.idEmpresa || request.idServicio !== current.idServicio) {
        throw new ConflictException('La solicitud cambio; vuelve a consultar');
      }
      const receipt = await this.storage.findReceipt(tx, idSolicitudRetiro);
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: request.idServicio }, include: { contrato: true } });
      if (!service || !service.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
      // Operación repetida: si ya se aplicó, devuelve el resultado sin escribir de nuevo.
      if (request.estado === 'CERRADA' && service.estadoOperativo === 'Baja' && receipt?.aplicadoEn) {
        return { solicitud: request, aplicado: false, yaAplicado: true, idServicio: service.idServicio };
      }
      if (CLOSED_REQUEST_STATES.includes(request.estado)) throw new BadRequestException('La solicitud de retiro ya esta cerrada o cancelada');
      if (request.motivo.toUpperCase() !== WITHDRAWAL_MOTIVE_MOROSITY) throw new BadRequestException('Esta operación aplica solo a retiros por morosidad');
      const link = await this.storage.findLinkByRequest(tx, idSolicitudRetiro);
      if (!link) throw new ConflictException('La solicitud no tiene un ticket «Baja de servicio» vinculado; no se aplicó la baja');
      if (service.idCliente !== request.idCliente || service.idContrato !== request.idContrato || service.idEmpresa !== request.idEmpresa) {
        throw new ConflictException('Las relaciones del servicio cambiaron; vuelve a consultar');
      }
      if (service.estadoOperativo !== 'Suspendido') {
        // Cambio concurrente (p. ej. pago y reactivación): no se da de baja un servicio que ya no está suspendido.
        throw new ConflictException({ code: 'WITHDRAWAL_SERVICE_STATE_CHANGED', message: `El servicio está ${service.estadoOperativo}; la baja por morosidad exige que siga suspendido. Revisa la solicitud.` });
      }
      // Pago durante el retiro: se recalcula la deuda real. Si ya no es exigible y vencida, nunca se aplica la baja
      // automáticamente: se informa la acción que corresponde según la etapa (no se tocan OT ajenas ni se reactiva).
      const stage: WithdrawalStage = !receipt || receipt.idOtG3 == null ? 'ANTES_DEL_DESPACHO'
        : receipt.estadoOt === 'COMPLETADA' && receipt.cierreAprobado ? 'DESPUES_DEL_RETIRO' : 'EN_EJECUCION';
      const stillOverdue = service.idContrato ? hasOverdueCollectibleDebt(await this.overdueInvoices(tx, service.idEmpresa, service.idCliente, service.idContrato)) : false;
      const paymentAction = paymentDuringWithdrawal(stage, stillOverdue);
      if (paymentAction.accion !== 'CONTINUAR') {
        throw new ConflictException({ code: 'WITHDRAWAL_DEBT_REGULARIZED', etapa: stage, accion: paymentAction.accion, message: paymentAction.message });
      }
      const retired = receipt?.equiposRetirados.map(item => item.numeroSerie) ?? [];
      const inventory = await tx.unidadEquipo.findMany({
        where: { OR: [{ idServicio: service.idServicio }, ...(retired.length ? [{ numeroSerie: { in: retired } }] : [])] },
        select: { numeroSerie: true, estado: true },
      });
      const receptions = await this.storage.findReceptions(tx, idSolicitudRetiro);
      // La excepción por equipos no recuperados está diseñada pero NO habilitada: no se entregan excepciones.
      const assessment = assessWithdrawalClosure({ receipt, inventory, receptions, exceptions: [], exceptionsEnabled: UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED });
      if (assessment.outcome !== 'APLICAR_BAJA') {
        throw new ConflictException({ code: 'WITHDRAWAL_CLOSURE_BLOCKED', message: assessment.reasons.map(reason => reason.message).join('. '), motivos: assessment.reasons });
      }
      const updated = await tx.servicioContratado.update({ where: { idServicio: service.idServicio }, data: { estadoOperativo: 'Baja' } });
      let contractClosed = false;
      if (service.idContrato) {
        await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${service.idContrato} FOR UPDATE`;
        const operational = await tx.servicioContratado.count({ where: { idContrato: service.idContrato, estadoOperativo: { not: 'Baja' } } });
        if (operational === 0) { await tx.contrato.update({ where: { idContrato: service.idContrato }, data: { estado: 'Baja' } }); contractClosed = true; }
      }
      await this.reconcileCustomer(tx, service.idCliente);
      const closed = await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro }, data: { estado: 'CERRADA' } });
      await this.storage.markReceiptApplied(tx, idSolicitudRetiro);
      await this.auditService.record({
        idUsuario: currentUser.idUsuario, accion: 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD', entidadAfectada: 'servicio_contratado', idEntidadAfectada: service.idServicio,
        valorAnterior: { estadoOperativo: service.estadoOperativo, estadoSolicitud: request.estado },
        valorNuevo: { estadoOperativo: updated.estadoOperativo, estadoSolicitud: closed.estado, idSolicitudRetiro, idTicket: link.idTicket, idOtG3: receipt?.idOtG3 ?? null, contratoDeBaja: contractClosed },
      }, tx);
      const returning = await ensureReturningProspect(tx, this.auditService, { idCliente: service.idCliente, idEmpresa: service.idEmpresa, idUsuario: currentUser.idUsuario });
      return { solicitud: closed, aplicado: true, yaAplicado: false, idServicio: service.idServicio, contratoDeBaja: contractClosed, retornoProspectos: returning };
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
    if (CLOSED_REQUEST_STATES.includes(fresh.estado)) {
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

  private requireTickets() {
    if (!this.tickets) throw new Error('TICKETS_SERVICE_UNAVAILABLE');
    return this.tickets;
  }

  private async assertLinkStorage(tx: Db) {
    const capabilities = await this.storage.capabilities(tx);
    if (!capabilities.ticketLink) {
      throw new ConflictException({
        code: 'WITHDRAWAL_LINK_STORAGE_PENDING',
        message: 'La baja guiada aún no está habilitada: falta aprobar y aplicar el registro que vincula solicitud, aviso y ticket. No se registró nada.',
      });
    }
  }

  /** Devuelve la operación ya vinculada (doble clic, reintento), verificando que sus relaciones sigan coherentes. */
  private async replayLinked(tx: Db, idSolicitudRetiro: number, service: { idServicio: number; idCliente: number; idEmpresa: number | null; idContrato: number | null }) {
    const link = await this.storage.findLinkByRequest(tx, idSolicitudRetiro);
    if (!link) return null;
    const [request, ticket] = await Promise.all([
      tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } }),
      tx.ticket.findUnique({ where: { idTicket: link.idTicket } }),
    ]);
    if (!request || !ticket || ticket.idEmpresa !== link.idEmpresa || ticket.idCliente !== link.idCliente || ticket.idServicio !== link.idServicio
      || link.idServicio !== service.idServicio || link.idCliente !== service.idCliente || link.idEmpresa !== service.idEmpresa
      || request.idServicio !== link.idServicio) {
      throw new ConflictException({ code: 'WITHDRAWAL_LINK_INCONSISTENT', message: 'El vínculo de la solicitud con su ticket es inconsistente; requiere revisión. No se creó nada.' });
    }
    return { solicitud: request, ticket, idAviso: link.idAviso, repetido: true };
  }

  private async createLinkedTicket(
    tx: Db, tickets: TicketsService,
    request: { idSolicitudRetiro: number; idEmpresa: number; idCliente: number; idServicio: number; idContrato: number | null },
    idAviso: number, currentUser: AuthUser,
  ) {
    if (!request.idContrato) throw new BadRequestException('El servicio requiere un contrato vinculado al mismo cliente y empresa');
    const ticket = await tickets.createWithdrawalTicket(tx, {
      idEmpresa: request.idEmpresa, idCliente: request.idCliente, idServicio: request.idServicio, idContrato: request.idContrato,
      idSolicitudRetiro: request.idSolicitudRetiro, idAviso, idUsuario: currentUser.idUsuario,
      descripcion: `Baja de servicio por morosidad: solicitud de retiro N° ${request.idSolicitudRetiro}. Retiro técnico pendiente; el servicio sigue suspendido.`,
    });
    const existingForTicket = await this.storage.findLinkByTicket(tx, ticket.idTicket);
    if (existingForTicket) throw new ConflictException('El ticket ya está vinculado a otra solicitud');
    const link = await this.storage.insertLink(tx, {
      idSolicitudRetiro: request.idSolicitudRetiro, idTicket: ticket.idTicket, idAviso,
      idEmpresa: request.idEmpresa, idCliente: request.idCliente, idServicio: request.idServicio, idContrato: request.idContrato,
      idUsuarioResponsable: currentUser.idUsuario,
    });
    await this.auditService.record({
      idUsuario: currentUser.idUsuario, accion: 'VINCULAR_TICKET_SOLICITUD_RETIRO', entidadAfectada: 'solicitud_retiro_servicio',
      idEntidadAfectada: request.idSolicitudRetiro,
      valorNuevo: { idSolicitudRetiro: request.idSolicitudRetiro, idTicket: ticket.idTicket, idAviso, idEmpresa: request.idEmpresa, idServicio: request.idServicio, idContrato: request.idContrato },
    }, tx);
    const solicitud = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro: request.idSolicitudRetiro } });
    return { solicitud: solicitud ?? request, ticket, idAviso: link.idAviso, repetido: false };
  }

  private async loadFacts(db: Db, service: {
    idServicio: number; idCliente: number; idEmpresa: number | null; idContrato: number | null; estadoOperativo: string;
    contrato: { idContrato: number; idCliente: number | null; idEmpresa: number | null } | null;
  }, currentUser: AuthUser): Promise<WithdrawalFacts> {
    const idEmpresa = service.idEmpresa!;
    const [activeRequest, invoices, notice] = await Promise.all([
      db.servicioRetiroSolicitud.findFirst({ where: { idEmpresa, idServicio: service.idServicio, estado: { notIn: CLOSED_REQUEST_STATES } } }),
      service.idContrato ? this.overdueInvoices(db, idEmpresa, service.idCliente, service.idContrato) : Promise.resolve([]),
      service.idContrato ? this.latestNotice(db, idEmpresa, service.idCliente, service.idServicio, service.idContrato) : Promise.resolve(null),
    ]);
    return {
      service: { idServicio: service.idServicio, idCliente: service.idCliente, idEmpresa: service.idEmpresa, idContrato: service.idContrato,
        estadoOperativo: service.estadoOperativo,
        contrato: service.contrato ? { idContrato: service.contrato.idContrato, idCliente: service.contrato.idCliente, idEmpresa: service.contrato.idEmpresa } : null },
      companyAllowed: isAdministrator(currentUser.roles) || currentUser.idEmpresa === service.idEmpresa,
      activeRequest: activeRequest ? { idSolicitudRetiro: activeRequest.idSolicitudRetiro, estado: activeRequest.estado } : null,
      debt: overdueDebtSummary(invoices),
      notice: notice ? { idEvento: notice.idEvento, fecha: notice.fecha ?? null } : null,
    };
  }

  private overdueInvoices(db: Db, idEmpresa: number, idCliente: number, idContrato: number) {
    return db.factura.findMany({ where: { idContrato, contrato: { idEmpresa, idCliente } },
      include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS, conveniosPago: { where: { estado: { in: ACTIVE_AGREEMENT_STATES } } } } });
  }

  private latestNotice(db: Db, idEmpresa: number, idCliente: number, idServicio: number, idContrato: number) {
    return db.eventoGestionComercial.findFirst({ where: {
      idEmpresa, idCliente, idServicio, idContrato, tipo: 'AVISO_PREVIO_RETIRO',
    }, orderBy: { idEvento: 'desc' } });
  }

  private auditCreated(tx: Db, created: { idSolicitudRetiro: number; idEmpresa: number; idCliente: number; idServicio: number; idContrato: number | null; estado: string; estadoDespachoTecnico: string },
    idAviso: number | null, motivo: string, currentUser: AuthUser) {
    return this.auditService.record({
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
  }

  private async reconcileCustomer(tx: Db, idCliente: number) {
    await tx.$queryRaw`SELECT id_cliente FROM cliente WHERE id_cliente = ${idCliente} FOR UPDATE`;
    const customer = await tx.cliente.findUnique({ where: { idCliente }, include: { contratos: { select: { estado: true } }, servicios: { select: { estadoOperativo: true } } } });
    if (!customer) return;
    const next = resolveCustomerLifecycleStatus({ currentStatus: customer.estado, contractStates: customer.contratos.map(c => c.estado), serviceStates: customer.servicios.map(s => s.estadoOperativo) });
    if (next !== customer.estado) await tx.cliente.update({ where: { idCliente }, data: { estado: next } });
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
