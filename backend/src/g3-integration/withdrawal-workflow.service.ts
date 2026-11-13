import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { APPROVED_EXTENSIONS } from '../billing/invoice-balance';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { ACTIVE_AGREEMENT_STATES, hasOverdueCollectibleDebt, overdueDebtSummary } from '../common/overdue-debt';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { ensureFormerCustomerProspect } from '../common/returning-customer';
import { G1_INVENTORY_CLIENT, G1_RECEPTION_CLIENT, G1IntegrationError, G1InventoryClient, G1ReceptionClient } from '../g1-integration/g1-integration.types';
import { resolveCustomerLifecycleStatus } from '../common/customer-lifecycle';
import { assessWithdrawalClosure, paymentDuringWithdrawal } from './withdrawal-closure';
import { parseG1Reception } from './g1-reception-contract';
import { G3WithdrawalClosure } from './g3-withdrawal-closure-contract';
import {
  buildWithdrawalOrderPayload, G3_CANCELLABLE_STATES, interpretWithdrawalCancelReply, interpretWithdrawalOrderRead,
  interpretWithdrawalOrderReply, WithdrawalPayloadError,
} from './g3-withdrawal-contract';
import { sha256Payload } from './g3-integration.utils';
import { G3_WITHDRAWAL_CLIENT, G3WithdrawalClient } from './http-g3-withdrawal.client';
import { evaluateWithdrawalEligibility, WITHDRAWAL_MOTIVE_MOROSITY, WithdrawalFacts } from './withdrawal-eligibility';
import { postgresWithdrawalStorage, WITHDRAWAL_STORAGE, WithdrawalDispatch, WithdrawalStorage } from './withdrawal.storage';

type Db = Prisma.TransactionClient;
const CLOSED_REQUEST_STATES = ['CANCELADA', 'CERRADA'];
const SERVICE_INCLUDE = { contrato: true, cliente: true, empresa: true, direccion: true } satisfies Prisma.ServicioContratadoInclude;
type ServiceRow = Prisma.ServicioContratadoGetPayload<{ include: typeof SERVICE_INCLUDE }>;

/** Max automatic send attempts and backoff between them (minutes); afterwards it needs human review. */
export const WITHDRAWAL_DISPATCH_MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [0, 1, 5, 15, 60, 180];
/** An ENVIANDO claim older than this is considered abandoned (process crash) and can be re-sent idempotently. */
const STALE_SENDING_MS = 5 * 60_000;
/** Minimum interval between GETs of the same OT (rate limit for on-demand tracking). */
const ORDER_READ_MIN_INTERVAL_MS = 60_000;

/**
 * Withdrawal for morosity integrated with G3 (OT de BAJA) and G1 (recepción de equipos).
 * Phase 2: eligibility, atomic initiation (request + ticket + link + audit + dispatch snapshot), dispatch to G3
 * AFTER commit, tracking by GET and authorized cancellation. Remote dispatch is OFF by default
 * (G3_WITHDRAWAL_DISPATCH_ENABLED=true is required) and every remote call happens outside any transaction.
 */
@Injectable()
export class WithdrawalWorkflowService {
  private readonly storage: WithdrawalStorage;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
    @Inject(G3_WITHDRAWAL_CLIENT) private readonly g3: G3WithdrawalClient,
    @Optional() @Inject(WITHDRAWAL_STORAGE) storage?: WithdrawalStorage,
    @Optional() @Inject(G1_RECEPTION_CLIENT) private readonly g1?: G1ReceptionClient,
    @Optional() @Inject(G1_INVENTORY_CLIENT) private readonly g1Inventory?: Pick<G1InventoryClient, 'getEquipmentByService'>,
  ) {
    this.storage = storage ?? postgresWithdrawalStorage;
  }

  dispatchEnabled() {
    return (this.config.get<string>('G3_WITHDRAWAL_DISPATCH_ENABLED') ?? '').trim().toLowerCase() === 'true';
  }

  /** Read-only eligibility; the UI only shows it, initiate() decides again under lock. */
  async eligibility(idServicio: number, currentUser: AuthUser) {
    const db = this.prisma as unknown as Db;
    const service = await db.servicioContratado.findUnique({ where: { idServicio }, include: SERVICE_INCLUDE });
    if (!service?.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
    this.assertCompany(service.idEmpresa, currentUser);
    const facts = await this.loadFacts(db, service, currentUser);
    const result = evaluateWithdrawalEligibility(facts);
    const capabilities = await this.storage.capabilities(db);
    return {
      idServicio, motivo: WITHDRAWAL_MOTIVE_MOROSITY, eligible: result.eligible, checks: result.checks, firstFailure: result.firstFailure,
      habilitado: capabilities.ticketLink && capabilities.g3Dispatch, despachoG3Habilitado: this.dispatchEnabled(), capabilities,
      deuda: facts.debt, solicitudActiva: facts.activeRequest,
    };
  }

  /**
   * One transaction serialized on the service: re-validates, creates the request (MOROSIDAD), the CRM ticket
   * "Baja de servicio", its structured link with the previous notice, the audit trail and the exact G3 request
   * snapshot. Any failure rolls back everything. Never sets the service to Baja and never calls G3 inside.
   * Double click / retry: returns the same linked operation without a second ticket or snapshot.
   */
  async initiate(dto: { idServicio: number; idContrato?: number; observaciones: string; fechaSolicitada?: string }, currentUser: AuthUser) {
    const observaciones = dto.observaciones?.trim() ?? '';
    if (observaciones.length < 10) throw new BadRequestException('Describe la gestión de cobranza y el motivo del retiro (mínimo 10 caracteres)');
    const fechaSolicitada = parseDateOnly(dto.fechaSolicitada ?? todayDateOnly());
    if (!fechaSolicitada) throw new BadRequestException('La fecha solicitada no es valida');
    const authorized = await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } });
    if (!authorized?.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
    this.assertCompany(authorized.idEmpresa, currentUser);

    const result = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${dto.idServicio} FOR UPDATE`;
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: dto.idServicio }, include: SERVICE_INCLUDE });
      if (!service?.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
      this.assertCompany(service.idEmpresa, currentUser);
      if (dto.idContrato !== undefined && dto.idContrato !== service.idContrato) throw new BadRequestException('El contrato no corresponde al servicio y empresa');
      const facts = await this.loadFacts(tx, service, currentUser);
      if (facts.activeRequest) {
        const replay = await this.replay(tx, facts.activeRequest.idSolicitudRetiro, service);
        if (replay) return replay;
        throw new ConflictException({ code: 'WITHDRAWAL_REQUEST_ACTIVE', idSolicitudRetiro: facts.activeRequest.idSolicitudRetiro,
          message: 'Ya existe una solicitud de retiro activa para este servicio; revísala antes de continuar' });
      }
      const eligibility = evaluateWithdrawalEligibility(facts);
      if (!eligibility.eligible) {
        throw new BadRequestException({ code: 'WITHDRAWAL_NOT_ELIGIBLE', requisito: eligibility.firstFailure!.code, message: eligibility.firstFailure!.message });
      }
      const idContrato = service.idContrato!;
      const notice = facts.notice!;
      const request = await tx.servicioRetiroSolicitud.create({ data: {
        idEmpresa: service.idEmpresa, idCliente: service.idCliente, idServicio: service.idServicio, idContrato, motivo: WITHDRAWAL_MOTIVE_MOROSITY,
        fechaSolicitada, estado: 'REGISTRADA', estadoDespachoTecnico: 'PENDIENTE_ENVIO_G3', idUsuarioResponsable: currentUser.idUsuario, observaciones,
      } });
      await this.audit(tx, currentUser, 'CREAR_SOLICITUD_RETIRO_SERVICIO', 'solicitud_retiro_servicio', request.idSolicitudRetiro, {
        idEmpresa: request.idEmpresa, idCliente: request.idCliente, idServicio: request.idServicio, idContrato, idAviso: notice.idEvento,
        motivo: WITHDRAWAL_MOTIVE_MOROSITY, estado: request.estado, estadoDespachoTecnico: request.estadoDespachoTecnico,
      });
      const ticket = await this.tickets.createWithdrawalTicket(tx, {
        idEmpresa: request.idEmpresa, idCliente: request.idCliente, idServicio: request.idServicio, idContrato,
        idSolicitudRetiro: request.idSolicitudRetiro, idAviso: notice.idEvento, idUsuario: currentUser.idUsuario,
        descripcion: `Baja de servicio por morosidad: solicitud de retiro N° ${request.idSolicitudRetiro}. Retiro técnico pendiente; el servicio sigue suspendido.`,
      });
      if (await this.storage.findLinkByTicket(tx, ticket.idTicket)) throw new ConflictException('El ticket ya está vinculado a otra solicitud');
      await this.storage.insertLink(tx, {
        idSolicitudRetiro: request.idSolicitudRetiro, idTicket: ticket.idTicket, idAviso: notice.idEvento, idEmpresa: request.idEmpresa,
        idCliente: request.idCliente, idServicio: request.idServicio, idContrato, idUsuarioResponsable: currentUser.idUsuario,
      });
      let snapshot;
      try {
        snapshot = buildWithdrawalOrderPayload({
          idEmpresa: request.idEmpresa, idSolicitudRetiro: request.idSolicitudRetiro, idCliente: request.idCliente, idContrato,
          idServicio: request.idServicio, idTicket: ticket.idTicket, traceId: randomUUID(), rut: service.cliente?.rut ?? null,
          direccion: facts.address?.direccion ?? null, comuna: facts.address?.comuna ?? null, observaciones,
        });
      } catch (error) {
        if (error instanceof WithdrawalPayloadError) throw new BadRequestException({ code: 'WITHDRAWAL_G3_DATA_INVALID', requisito: error.code, message: error.message });
        throw error;
      }
      const dispatch = await this.storage.insertDispatch(tx, {
        idSolicitudRetiro: request.idSolicitudRetiro, idEmpresa: request.idEmpresa, requestId: snapshot.request_id, traceId: snapshot.trace_id,
        payloadSnapshot: snapshot, payloadHash: sha256Payload(snapshot),
      });
      await this.audit(tx, currentUser, 'VINCULAR_TICKET_SOLICITUD_RETIRO', 'solicitud_retiro_servicio', request.idSolicitudRetiro, {
        idTicket: ticket.idTicket, idAviso: notice.idEvento, requestId: snapshot.request_id, traceId: snapshot.trace_id, payloadHash: dispatch.payloadHash,
      });
      return { solicitud: request, ticket, despacho: this.publicDispatch(dispatch), repetido: false };
    });

    // After commit: the request exists even if G3 is down; dispatch is retried with the same snapshot.
    if (!result.repetido && this.dispatchEnabled()) {
      try {
        return { ...result, despacho: (await this.dispatch(result.solicitud.idSolicitudRetiro, currentUser)).despacho };
      } catch (error) {
        return { ...result, despachoPendiente: error instanceof Error ? error.message : 'Despacho pendiente' };
      }
    }
    return result;
  }

  /** Sends (or re-sends, idempotently) the persisted snapshot to G3. Only one process can hold the send. */
  async dispatch(idSolicitudRetiro: number, currentUser: AuthUser) {
    if (!this.dispatchEnabled()) {
      throw new ConflictException({ code: 'WITHDRAWAL_DISPATCH_DISABLED', message: 'El envío de retiros a G3 está deshabilitado en este ambiente; la solicitud queda registrada sin OT.' });
    }
    if (!this.g3.configured()) throw new ConflictException({ code: 'INTEGRACION_G3_NO_CONFIGURADA', message: 'La integración técnica con G3 no está configurada.' });
    const claimed = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      const request = await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      if (CLOSED_REQUEST_STATES.includes(request.estado)) throw new BadRequestException('La solicitud de retiro ya esta cerrada o cancelada');
      const dispatch = await this.storage.findDispatch(tx, idSolicitudRetiro, true);
      if (!dispatch) throw new ConflictException('La solicitud no tiene un despacho técnico preparado');
      if (sha256Payload(dispatch.payloadSnapshot) !== dispatch.payloadHash) {
        await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoDespacho: 'INCONSISTENTE', ultimoErrorCodigo: 'SNAPSHOT_ALTERADO', ultimoErrorStatus: null });
        return { send: false as const, dispatch: { ...dispatch, estadoDespacho: 'INCONSISTENTE' as const } };
      }
      if (dispatch.estadoDespacho === 'REINTENTABLE') {
        if (dispatch.intentos >= WITHDRAWAL_DISPATCH_MAX_ATTEMPTS) {
          throw new ConflictException({ code: 'WITHDRAWAL_DISPATCH_ATTEMPTS_EXHAUSTED', message: 'Se agotaron los reintentos automáticos; requiere revisión antes de volver a enviar.' });
        }
        const waitMs = BACKOFF_MINUTES[Math.min(dispatch.intentos, BACKOFF_MINUTES.length - 1)] * 60_000;
        if (dispatch.ultimoIntentoEn && Date.now() - new Date(dispatch.ultimoIntentoEn).getTime() < waitMs) {
          throw new ConflictException({ code: 'WITHDRAWAL_DISPATCH_RETRY_TOO_SOON', message: 'Espera antes de reintentar el envío a G3.' });
        }
      }
      // Payment before dispatch: no OT is requested for a debt that is no longer collectible.
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: request.idServicio } });
      const invoices = await this.overdueInvoices(tx, request.idEmpresa, request.idCliente, request.idContrato!);
      if (!hasOverdueCollectibleDebt(invoices) || service?.estadoOperativo !== 'Suspendido') {
        throw new ConflictException({ code: 'WITHDRAWAL_DEBT_REGULARIZED', accion: 'CANCELAR_SOLICITUD',
          message: 'La deuda ya no es exigible o el servicio no está suspendido: no se envió la orden de retiro. Cancela la solicitud.' });
      }
      const taken = await this.storage.claimDispatch(tx, idSolicitudRetiro, new Date(Date.now() - STALE_SENDING_MS));
      return taken ? { send: true as const, dispatch: taken } : { send: false as const, dispatch };
    });
    if (!claimed.send) return { despacho: this.publicDispatch(claimed.dispatch), enviado: false };

    const reply = await this.g3.createOrder(claimed.dispatch.payloadSnapshot as never);
    const outcome = interpretWithdrawalOrderReply(reply, { requestId: claimed.dispatch.requestId, traceId: claimed.dispatch.traceId });
    const stored = await this.prisma.$transaction(async tx => {
      if (outcome.kind === 'ACEPTADA') {
        await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoDespacho: 'ACEPTADA', idOtG3: outcome.idOt,
          estadoOt: outcome.estado && ['PENDIENTE', 'ASIGNADA', 'EN_CURSO'].includes(outcome.estado) ? outcome.estado : claimed.dispatch.estadoOt,
          ultimoErrorCodigo: null, ultimoErrorStatus: null });
        await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro }, data: { estado: 'EN_GESTION', estadoDespachoTecnico: 'ENVIADA_G3' } });
      } else {
        const state = outcome.kind === 'REINTENTABLE' ? 'REINTENTABLE' : outcome.kind === 'RECHAZADA' ? 'RECHAZADA' : 'INCONSISTENTE';
        await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoDespacho: state, ultimoErrorCodigo: outcome.code, ultimoErrorStatus: outcome.status });
        await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro }, data: { estadoDespachoTecnico: state === 'REINTENTABLE' ? 'ENVIO_G3_PENDIENTE' : 'REVISION_G3' } });
      }
      await this.audit(tx, currentUser, 'DESPACHAR_RETIRO_G3', 'solicitud_retiro_servicio', idSolicitudRetiro, {
        requestId: claimed.dispatch.requestId, intento: claimed.dispatch.intentos, resultado: outcome.kind,
        ...(outcome.kind === 'ACEPTADA' ? { idOtG3: outcome.idOt, duplicado: outcome.duplicado } : { codigo: outcome.code, status: outcome.status }),
      });
      return this.storage.findDispatch(tx, idSolicitudRetiro);
    });
    return { despacho: this.publicDispatch(stored!), enviado: true, resultado: outcome };
  }

  /** Authenticated GET of the OT (on demand, rate limited). COMPLETADA only means approved on G3's side. */
  async refreshOrder(idSolicitudRetiro: number, currentUser: AuthUser | null, force = false) {
    const dispatch = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      return this.storage.findDispatch(tx, idSolicitudRetiro);
    });
    if (!dispatch?.idOtG3 || !['ACEPTADA', 'CANCELACION_NO_APLICABLE', 'CANCELADA'].includes(dispatch.estadoDespacho)) {
      throw new ConflictException({ code: 'WITHDRAWAL_OT_NOT_AVAILABLE', message: 'La solicitud aún no tiene una OT aceptada por G3.' });
    }
    if (!force && dispatch.estadoOtLeidoEn && Date.now() - new Date(dispatch.estadoOtLeidoEn).getTime() < ORDER_READ_MIN_INTERVAL_MS) {
      return { despacho: this.publicDispatch(dispatch), consultado: false };
    }
    if (!this.g3.configured()) throw new ConflictException({ code: 'INTEGRACION_G3_NO_CONFIGURADA', message: 'La integración técnica con G3 no está configurada.' });
    const outcome = interpretWithdrawalOrderRead(await this.g3.readOrder(dispatch.idOtG3, dispatch.idEmpresa), { idOt: dispatch.idOtG3, idEmpresa: dispatch.idEmpresa });
    if (outcome.kind !== 'LEIDA') throw new ConflictException({ code: outcome.code, message: outcome.message });
    const stored = await this.prisma.$transaction(async tx => {
      const fresh = await this.storage.findDispatch(tx, idSolicitudRetiro, true);
      await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoOt: outcome.estado, estadoOtLeidoEn: new Date(),
        fechaCompletadaG3: outcome.fechaCompletada ? new Date(outcome.fechaCompletada) : null });
      if (fresh?.estadoOt !== outcome.estado) {
        await this.audit(tx, currentUser, 'ACTUALIZAR_ESTADO_OT_RETIRO_G3', 'solicitud_retiro_servicio', idSolicitudRetiro,
          { idOtG3: dispatch.idOtG3, estadoAnterior: fresh?.estadoOt ?? null, estadoNuevo: outcome.estado });
      }
      return this.storage.findDispatch(tx, idSolicitudRetiro);
    });
    return { despacho: this.publicDispatch(stored!), consultado: true };
  }

  /**
   * Cancels the withdrawal. If anything was ever sent, G3 is asked first (a timed-out attempt may have created
   * the OT there). G3 only cancels before PENDIENTE_APROBACION; a late 409 is reported, never hidden.
   * G8 never touches the NAP port: G3 manages it.
   */
  async cancel(idSolicitudRetiro: number, motivo: string, currentUser: AuthUser) {
    const reason = motivo?.trim() ?? '';
    if (reason.length < 5 || reason.length > 300) throw new BadRequestException('Indica el motivo de la cancelación (5 a 300 caracteres)');
    const current = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      const request = await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      const dispatch = await this.storage.findDispatch(tx, idSolicitudRetiro, true);
      if (request.estado === 'CANCELADA') return { request, dispatch, done: true as const };
      if (request.estado === 'CERRADA') throw new BadRequestException('La solicitud ya está cerrada');
      if (!dispatch) throw new ConflictException('La solicitud no tiene un despacho técnico preparado');
      if (dispatch.estadoDespacho === 'ENVIANDO') {
        throw new ConflictException({ code: 'WITHDRAWAL_DISPATCH_IN_FLIGHT', message: 'Hay un envío a G3 en curso; vuelve a intentar la cancelación en unos minutos.' });
      }
      if (dispatch.intentos === 0) {
        // Never sent: nothing exists in G3, cancel locally.
        await this.closeAsCancelled(tx, idSolicitudRetiro, reason, currentUser, { remoto: false });
        return { request, dispatch, done: true as const };
      }
      return { request, dispatch, done: false as const };
    });
    if (current.done) return { solicitud: await this.prisma.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } }), cancelada: true };
    if (!this.g3.configured()) throw new ConflictException({ code: 'INTEGRACION_G3_NO_CONFIGURADA', message: 'La integración técnica con G3 no está configurada.' });
    const dispatch = current.dispatch!;
    const outcome = interpretWithdrawalCancelReply(await this.g3.cancelOrder(dispatch.requestId, { motivo: reason }), dispatch.requestId);
    const neverCreated = outcome.kind === 'RECHAZADA' && outcome.status === 404 && dispatch.estadoDespacho !== 'ACEPTADA';
    if (outcome.kind === 'CANCELADA' || neverCreated) {
      return this.prisma.$transaction(async tx => {
        await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
        await this.closeAsCancelled(tx, idSolicitudRetiro, reason, currentUser, { remoto: true, idOtG3: dispatch.idOtG3, codigo: outcome.kind === 'CANCELADA' ? 'CANCELADA' : 'SOLICITUD_NO_ENCONTRADA' });
        return { solicitud: await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } }), cancelada: true };
      });
    }
    if (outcome.kind === 'NO_APLICABLE') {
      // Persist the late answer FIRST (committed), then report it: throwing inside the transaction would roll it back.
      await this.prisma.$transaction(async tx => {
        await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
        await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoDespacho: 'CANCELACION_NO_APLICABLE', ultimoErrorCodigo: outcome.code, ultimoErrorStatus: outcome.status });
        await this.audit(tx, currentUser, 'CANCELACION_RETIRO_NO_APLICABLE', 'solicitud_retiro_servicio', idSolicitudRetiro, { idOtG3: dispatch.idOtG3, codigo: outcome.code });
      });
      throw new ConflictException({ code: 'WITHDRAWAL_CANCEL_TOO_LATE', message: outcome.message });
    }
    throw new ConflictException({ code: outcome.code, message: outcome.message });
  }

  /**
   * BAJA closure notification from G3 (S2S, already authenticated and company-scoped by the guard).
   * Correlates it strictly with the persisted dispatch, snapshot and link, stores the evidence idempotently
   * and tries to corroborate approval by GET. It NEVER applies the withdrawal.
   */
  async receiveWithdrawalClosure(closure: G3WithdrawalClosure) {
    const stored = await this.prisma.$transaction(async tx => {
      const capabilities = await this.storage.capabilities(tx);
      if (!capabilities.g3Dispatch || !capabilities.ticketLink) {
        throw new ServiceUnavailableException({ code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE', message: 'G8 aún no puede registrar cierres de BAJA; reintentar más tarde.' });
      }
      const found = await this.storage.findDispatchByRequestId(tx, closure.requestId);
      if (!found) throw new NotFoundException({ code: 'WITHDRAWAL_REQUEST_UNKNOWN', message: 'G8 no reconoce la solicitud de retiro del cierre' });
      await this.requestForUpdate(tx, found.idSolicitudRetiro, null);
      const dispatch = (await this.storage.findDispatch(tx, found.idSolicitudRetiro, true))!;
      const link = await this.storage.findLinkByRequest(tx, dispatch.idSolicitudRetiro);
      const snapshot = dispatch.payloadSnapshot as Record<string, unknown>;
      const mismatch = [
        dispatch.idEmpresa !== closure.idEmpresa, dispatch.idSolicitudRetiro !== closure.idSolicitudRetiro,
        dispatch.traceId.toLowerCase() !== closure.traceId, dispatch.idOtG3 !== null && dispatch.idOtG3 !== closure.idOt,
        !link, link?.idServicio !== closure.idServicio, link?.idContrato !== closure.idContrato, link?.idCliente !== closure.idCliente,
        closure.idTicket !== null && link?.idTicket !== closure.idTicket,
        snapshot.id_servicio_externo !== closure.idServicio, snapshot.id_contrato_externo !== closure.idContrato,
        ['RECHAZADA', 'CANCELADA', 'PENDIENTE'].includes(dispatch.estadoDespacho),
      ].some(Boolean);
      if (mismatch) {
        throw new ConflictException({ code: 'G3_CIERRE_BAJA_NO_CORRESPONDE', message: 'El cierre de BAJA no corresponde a la solicitud, OT o servicio registrados; no se guardó.' });
      }
      if (dispatch.cierreHash) {
        if (dispatch.cierreHash !== closure.hash) {
          throw new ConflictException({ code: 'G3_CIERRE_BAJA_DISTINTO', message: 'G8 ya registró este cierre con un contenido distinto; se conserva la evidencia original.' });
        }
        return { duplicate: true, idSolicitudRetiro: dispatch.idSolicitudRetiro };
      }
      const learnedOt = dispatch.idOtG3 === null;
      const clave = 'baja:' + closure.idOt;
      await this.storage.updateDispatch(tx, dispatch.idSolicitudRetiro, {
        ...(learnedOt ? { idOtG3: closure.idOt, estadoDespacho: 'ACEPTADA' as const, ultimoErrorCodigo: null, ultimoErrorStatus: null } : {}),
        cierreClave: clave, cierreHash: closure.hash, cierreRecibidoEn: new Date(),
        equiposRetirados: closure.equiposRetirados, equiposFaltantes: closure.equiposFaltantes,
      });
      await this.audit(tx, null, 'RECIBIR_CIERRE_BAJA_G3', 'solicitud_retiro_servicio', dispatch.idSolicitudRetiro, {
        idOtG3: closure.idOt, requestId: closure.requestId, clave, retirados: closure.equiposRetirados.length,
        faltantes: closure.equiposFaltantes.length, otConocidaPorCierre: learnedOt, cierreHash: closure.hash,
      });
      return { duplicate: false, idSolicitudRetiro: dispatch.idSolicitudRetiro };
    });
    let estadoOt: string | null = null;
    try {
      estadoOt = (await this.refreshOrder(stored.idSolicitudRetiro, null)).despacho.estadoOt;
    } catch {
      // Best effort: approval is checked again before applying; G3 is not asked to retry for this.
    }
    return { received: true, processed: true, duplicate: stored.duplicate, aplicado: false, idSolicitudRetiro: stored.idSolicitudRetiro, estadoOt };
  }

  /** Reads the G1 reception for the request (after the BAJA closure) and stores it as an immutable version. */
  async syncReception(idSolicitudRetiro: number, currentUser: AuthUser | null) {
    const dispatch = await this.prisma.$transaction(async tx => {
      const capabilities = await this.storage.capabilities(tx);
      if (!capabilities.g1Reception) throw new ConflictException({ code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE', message: 'El almacenamiento de recepciones aún no está aplicado.' });
      await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      return this.storage.findDispatch(tx, idSolicitudRetiro);
    });
    if (!dispatch?.idOtG3 || !dispatch.cierreClave) {
      throw new ConflictException({ code: 'WITHDRAWAL_CLOSURE_NOT_RECEIVED', message: 'Aún no se recibe el cierre de BAJA de G3; inventario no puede informar la recepción.' });
    }
    if (!this.g1?.configured()) throw new ConflictException({ code: 'INTEGRACION_G1_NO_CONFIGURADA', message: 'La integración con inventario (G1) no está configurada.' });
    let data: unknown;
    try {
      data = (await this.g1.getReceptions(dispatch.idEmpresa, { requestId: dispatch.requestId, idOt: dispatch.idOtG3 })).data;
    } catch (error) {
      if (error instanceof G1IntegrationError && error.status === 404) {
        return { estado: 'PENDIENTE' as const, message: 'Inventario aún no registra la recepción; vuelve a consultar más tarde.' };
      }
      if (error instanceof G1IntegrationError && (error.status === 401 || error.status === 403)) {
        throw new ConflictException({ code: 'G1_ACCESO_RECHAZADO', message: 'Inventario rechazó la credencial o el alcance de empresa; requiere revisión de configuración.' });
      }
      throw new ServiceUnavailableException({ code: error instanceof G1IntegrationError ? error.code : 'G1_UNAVAILABLE', message: 'No fue posible consultar la recepción en inventario.' });
    }
    const parsed = parseG1Reception(data, { idEmpresa: dispatch.idEmpresa, idOtG3: dispatch.idOtG3, requestId: dispatch.requestId });
    if (!parsed.ok) throw new ConflictException({ code: parsed.code, message: parsed.message });
    const reception = parsed.reception;
    const version = await this.prisma.$transaction(async tx => {
      await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      const outcome = await this.storage.storeReceptionVersion(tx, idSolicitudRetiro, dispatch.idEmpresa, reception.claveEvento, reception.equipos.map(item => ({
        numeroSerie: item.numeroSerie, idOtG3: reception.idOtG3, resultado: item.resultado, estadoG1: item.estadoG1, fechaRecepcion: item.fechaRecepcion,
        idServicioExterno: item.idServicioExterno, detalle: item.detalle, claveEvento: reception.claveEvento, estadoRecepcion: reception.estadoRecepcion,
      })));
      if (outcome === 'NUEVA') {
        await this.audit(tx, currentUser, 'REGISTRAR_RECEPCION_G1_RETIRO', 'solicitud_retiro_servicio', idSolicitudRetiro, {
          idOtG3: reception.idOtG3, claveEvento: reception.claveEvento, estadoRecepcion: reception.estadoRecepcion,
          equipos: reception.equipos.map(item => ({ numeroSerie: item.numeroSerie, resultado: item.resultado })),
          claveAnterior: dispatch.recepcionClaveEvento,
        });
      }
      return outcome;
    });
    if (version === 'CONFLICTO') {
      throw new ConflictException({ code: 'G1_RECEPCION_DISTINTA', message: 'Inventario devolvió otro contenido para la misma clave de evento; se conserva la versión registrada.' });
    }
    return { estado: 'SINCRONIZADA' as const, version, claveEvento: reception.claveEvento, estadoRecepcion: reception.estadoRecepcion, equipos: reception.equipos.length };
  }

  /**
   * Automatic follow-up of ONE request (WithdrawalTrackingProcessor). Read-only towards G3/G1: a GET of the OT while it is
   * not final (respecting the read cache) and, once the BAJA closure is in, a GET of the G1 reception whose result is
   * stored as an immutable version. It never dispatches, cancels, finalizes nor writes to other systems. Idempotent.
   */
  async track(idSolicitudRetiro: number) {
    const dispatch = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      return this.storage.findDispatch(tx, idSolicitudRetiro);
    });
    if (!dispatch?.idOtG3 || dispatch.aplicadoEn) return { ordenConsultada: false, recepcion: 'NO_APLICA' as const };
    let ordenConsultada = false;
    if (!['COMPLETADA', 'CANCELADA'].includes(dispatch.estadoOt ?? '')) {
      ordenConsultada = (await this.refreshOrder(idSolicitudRetiro, null)).consultado;
    }
    if (!dispatch.cierreClave || !this.g1?.configured()) return { ordenConsultada, recepcion: 'NO_APLICA' as const };
    const reception = await this.syncReception(idSolicitudRetiro, null);
    return { ordenConsultada, recepcion: reception.estado };
  }

  trackableRequests(limit: number) {
    return this.prisma.$transaction(async tx => {
      const capabilities = await this.storage.capabilities(tx);
      if (!capabilities.g3Dispatch || !capabilities.ticketLink) return null;
      return this.storage.listTrackable(tx, limit);
    });
  }

  finalizeEnabled() {
    return (this.config.get<string>('WITHDRAWAL_FINALIZE_ENABLED') ?? '').trim().toLowerCase() === 'true';
  }

  /**
   * Effective withdrawal ("baja efectiva") for morosity. Disabled by default (WITHDRAWAL_FINALIZE_ENABLED).
   * Outside any transaction: a forced GET of the OT (G3 must report COMPLETADA) and a read of the devices G1
   * still associates with the service. Then, in ONE transaction under locks: debt and suspension are recomputed,
   * the evidence is reconciled, and only if everything holds: service -> Baja, contract -> Baja only without other
   * operational services, customer status recomputed with every service of both companies, request CERRADA,
   * evidence marked applied and audited. Any failure (write or audit) rolls the whole operation back.
   * Payments, invoices, signed documents, G1 inventory and G2/G3 records are never written. Idempotent.
   */
  async finalize(idSolicitudRetiro: number, currentUser: AuthUser) {
    if (!this.finalizeEnabled()) {
      throw new ConflictException({ code: 'WITHDRAWAL_FINALIZE_DISABLED', message: 'La baja efectiva por morosidad está deshabilitada en este ambiente; no se modificó nada.' });
    }
    const current = await this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      const request = await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      return { request, dispatch: await this.storage.findDispatch(tx, idSolicitudRetiro) };
    });
    if (current.request.estado === 'CERRADA' && current.dispatch?.aplicadoEn) {
      return { solicitud: current.request, aplicado: false, yaAplicado: true, idServicio: current.request.idServicio };
    }
    if (!current.dispatch?.idOtG3) throw new ConflictException({ code: 'WITHDRAWAL_CLOSURE_BLOCKED', message: 'No hay una OT de retiro aceptada por G3', motivos: [{ code: 'SIN_OT' }] });
    // Fresh approval from G3 (bypasses the read cache) and current G1 association of devices with the service.
    await this.refreshOrder(idSolicitudRetiro, currentUser, true);
    if (!this.g1Inventory) throw new ConflictException({ code: 'INTEGRACION_G1_NO_CONFIGURADA', message: 'No se puede verificar el inventario asociado al servicio; no se aplicó la baja.' });
    let activeEquipment: string[];
    try {
      activeEquipment = (await this.g1Inventory.getEquipmentByService(current.request.idServicio, current.request.idEmpresa)).data
        .map(unit => String(unit.numero_serie).trim().toUpperCase());
    } catch {
      throw new ConflictException({ code: 'G1_INVENTARIO_NO_DISPONIBLE', message: 'No fue posible verificar en inventario que el servicio no conserve equipos; no se aplicó la baja.' });
    }

    return this.prisma.$transaction(async tx => {
      await this.assertStorage(tx);
      const request = await this.requestForUpdate(tx, idSolicitudRetiro, currentUser);
      const dispatch = (await this.storage.findDispatch(tx, idSolicitudRetiro, true))!;
      const service = await tx.servicioContratado.findUnique({ where: { idServicio: request.idServicio }, include: { contrato: true } });
      if (!service?.idEmpresa) throw new NotFoundException('Servicio contratado no encontrado');
      if (request.estado === 'CERRADA' && service.estadoOperativo === 'Baja' && dispatch.aplicadoEn) {
        return { solicitud: request, aplicado: false, yaAplicado: true, idServicio: service.idServicio };
      }
      if (CLOSED_REQUEST_STATES.includes(request.estado)) throw new BadRequestException('La solicitud de retiro ya esta cerrada o cancelada');
      const link = await this.storage.findLinkByRequest(tx, idSolicitudRetiro);
      if (!link || link.idServicio !== service.idServicio) throw new ConflictException('La solicitud no tiene un ticket «Baja de servicio» vinculado; no se aplicó la baja');
      if (service.idCliente !== request.idCliente || service.idContrato !== request.idContrato || service.idEmpresa !== request.idEmpresa) {
        throw new ConflictException('Las relaciones del servicio cambiaron; vuelve a consultar');
      }
      if (service.estadoOperativo !== 'Suspendido') {
        throw new ConflictException({ code: 'WITHDRAWAL_SERVICE_STATE_CHANGED', message: `El servicio está ${service.estadoOperativo}; la baja por morosidad exige que siga suspendido.` });
      }
      // Debt recomputed right before applying: a payment after the physical withdrawal never applies the baja
      // automatically nor reactivates; it requires a commercial decision with the technical evidence.
      if (!hasOverdueCollectibleDebt(await this.overdueInvoices(tx, service.idEmpresa, service.idCliente, service.idContrato!))) {
        const action = paymentDuringWithdrawal('DESPUES_DEL_RETIRO', false);
        throw new ConflictException({ code: 'WITHDRAWAL_DEBT_REGULARIZED', accion: action.accion, message: action.message });
      }
      const assessment = assessWithdrawalClosure({
        evidence: { idOtG3: dispatch.idOtG3, estadoOt: dispatch.estadoOt, cierreClave: dispatch.cierreClave,
          equiposRetirados: dispatch.equiposRetirados, equiposFaltantes: dispatch.equiposFaltantes },
        idServicio: service.idServicio, receptions: await this.storage.findReceptions(tx, idSolicitudRetiro), activeEquipment,
      });
      if (assessment.outcome !== 'APLICAR_BAJA') {
        throw new ConflictException({ code: 'WITHDRAWAL_CLOSURE_BLOCKED', message: assessment.reasons.map(reason => reason.message).join('. '), motivos: assessment.reasons });
      }
      const updated = await tx.servicioContratado.update({ where: { idServicio: service.idServicio }, data: { estadoOperativo: 'Baja' } });
      let contratoDeBaja = false;
      if (service.idContrato) {
        await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${service.idContrato} FOR UPDATE`;
        const operational = await tx.servicioContratado.count({ where: { idContrato: service.idContrato, estadoOperativo: { not: 'Baja' } } });
        if (operational === 0) { await tx.contrato.update({ where: { idContrato: service.idContrato }, data: { estado: 'Baja' } }); contratoDeBaja = true; }
      }
      await tx.$queryRaw`SELECT id_cliente FROM cliente WHERE id_cliente = ${service.idCliente} FOR UPDATE`;
      const customer = await tx.cliente.findUnique({ where: { idCliente: service.idCliente }, include: { contratos: { select: { estado: true } }, servicios: { select: { estadoOperativo: true } } } });
      let estadoCliente = customer?.estado ?? null;
      if (customer) {
        const next = resolveCustomerLifecycleStatus({ currentStatus: customer.estado, contractStates: customer.contratos.map(c => c.estado), serviceStates: customer.servicios.map(s => s.estadoOperativo) });
        if (next !== customer.estado) await tx.cliente.update({ where: { idCliente: customer.idCliente }, data: { estado: next } });
        estadoCliente = next;
      }
      // FINET 13-11-2026: if this was the last operational relationship in the company, the person becomes visible as
      // excliente in that company's Prospects (derived view; identity, history, debt and other companies untouched).
      const retorno = await ensureFormerCustomerProspect(tx, this.auditService, { idCliente: service.idCliente, idEmpresa: service.idEmpresa, idUsuario: currentUser.idUsuario });
      const closed = await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro }, data: { estado: 'CERRADA', estadoDespachoTecnico: 'COMPLETADA_G3' } });
      await this.storage.markApplied(tx, idSolicitudRetiro);
      // FINET 13-11-2026: the «Baja de servicio» ticket is closed only here, inside this successful transaction.
      const ticketBaja = await this.tickets.closeWithdrawalTicket(tx, { idTicket: link.idTicket, idEmpresa: service.idEmpresa,
        idCliente: service.idCliente, idServicio: service.idServicio, idSolicitudRetiro, idOtG3: dispatch.idOtG3, idUsuario: currentUser.idUsuario });
      await this.audit(tx, currentUser, 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD', 'servicio_contratado', service.idServicio, {
        idSolicitudRetiro, idTicket: link.idTicket, idOtG3: dispatch.idOtG3, recepcionClaveEvento: dispatch.recepcionClaveEvento,
        estadoAnterior: service.estadoOperativo, estadoNuevo: updated.estadoOperativo, contratoDeBaja, estadoCliente,
        equiposRecibidos: dispatch.equiposRetirados.map(item => item.numeroSerie), ticketBaja: ticketBaja.action,
        retornoProspectos: retorno.action, ...('idProspecto' in retorno ? { idProspectoExcliente: retorno.idProspecto } : {}),
      });
      return { solicitud: closed, aplicado: true, yaAplicado: false, idServicio: service.idServicio, contratoDeBaja, estadoCliente, ticketBaja: ticketBaja.action,
        retornoProspectos: retorno.action, ...('idProspecto' in retorno ? { idProspectoExcliente: retorno.idProspecto } : {}) };
    });
  }

  // ----- helpers -----

  private async closeAsCancelled(tx: Db, idSolicitudRetiro: number, reason: string, currentUser: AuthUser, detail: Record<string, unknown>) {
    const before = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    await this.storage.updateDispatch(tx, idSolicitudRetiro, { estadoDespacho: 'CANCELADA', ...(detail.remoto ? { estadoOt: 'CANCELADA' } : {}) });
    await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro }, data: { estado: 'CANCELADA', estadoDespachoTecnico: 'CANCELADA',
      observaciones: `${before?.observaciones ?? ''}\nCancelación: ${reason}`.trim() } });
    await this.audit(tx, currentUser, 'CANCELAR_SOLICITUD_RETIRO', 'solicitud_retiro_servicio', idSolicitudRetiro,
      { estadoAnterior: before?.estado ?? null, motivo: reason, ...detail });
  }

  private async replay(tx: Db, idSolicitudRetiro: number, service: ServiceRow) {
    const link = await this.storage.findLinkByRequest(tx, idSolicitudRetiro);
    const dispatch = await this.storage.findDispatch(tx, idSolicitudRetiro);
    if (!link || !dispatch || link.idServicio !== service.idServicio || link.idEmpresa !== service.idEmpresa) return null;
    const solicitud = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    const ticket = await tx.ticket.findUnique({ where: { idTicket: link.idTicket } });
    return solicitud && ticket ? { solicitud, ticket, despacho: this.publicDispatch(dispatch), repetido: true } : null;
  }

  /** currentUser=null: S2S/system actor (G3 notification); company scope was already proven by correlation. */
  private async requestForUpdate(tx: Db, idSolicitudRetiro: number, currentUser: AuthUser | null) {
    const request = await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } });
    if (!request) throw new NotFoundException('Solicitud de retiro no encontrada');
    if (currentUser) this.assertCompany(request.idEmpresa, currentUser);
    if (request.motivo.toUpperCase() !== WITHDRAWAL_MOTIVE_MOROSITY) throw new BadRequestException('Esta operación aplica solo a retiros por morosidad');
    await tx.$queryRaw`SELECT id_servicio FROM servicio_contratado WHERE id_servicio = ${request.idServicio} FOR UPDATE`;
    return (await tx.servicioRetiroSolicitud.findUnique({ where: { idSolicitudRetiro } }))!;
  }

  private async loadFacts(db: Db, service: ServiceRow, currentUser: AuthUser): Promise<WithdrawalFacts> {
    const idEmpresa = service.idEmpresa!;
    const [activeRequest, invoices, notice] = await Promise.all([
      db.servicioRetiroSolicitud.findFirst({ where: { idEmpresa, idServicio: service.idServicio, estado: { notIn: CLOSED_REQUEST_STATES } } }),
      service.idContrato ? this.overdueInvoices(db, idEmpresa, service.idCliente, service.idContrato) : Promise.resolve([]),
      service.idContrato ? db.eventoGestionComercial.findFirst({ where: { idEmpresa, idCliente: service.idCliente, idServicio: service.idServicio,
        idContrato: service.idContrato, tipo: 'AVISO_PREVIO_RETIRO' }, orderBy: { idEvento: 'desc' } }) : Promise.resolve(null),
    ]);
    const address = service.direccion
      ? { direccion: service.direccion.direccionCompleta, comuna: service.direccion.comuna }
      : service.contrato ? { direccion: service.contrato.direccionInstalacion, comuna: service.contrato.comunaInstalacion } : null;
    return {
      service: { idServicio: service.idServicio, idCliente: service.idCliente, idEmpresa: service.idEmpresa, idContrato: service.idContrato,
        estadoOperativo: service.estadoOperativo,
        contrato: service.contrato ? { idContrato: service.contrato.idContrato, idCliente: service.contrato.idCliente, idEmpresa: service.contrato.idEmpresa } : null },
      companyAllowed: isAdministrator(currentUser.roles) || currentUser.idEmpresa === service.idEmpresa,
      activeRequest: activeRequest ? { idSolicitudRetiro: activeRequest.idSolicitudRetiro, estado: activeRequest.estado } : null,
      debt: overdueDebtSummary(invoices),
      notice: notice ? { idEvento: notice.idEvento, fecha: notice.fecha } : null,
      rut: service.cliente?.rut ?? null,
      address,
    };
  }

  overdueInvoices(db: Db, idEmpresa: number, idCliente: number, idContrato: number) {
    return db.factura.findMany({ where: { idContrato, contrato: { idEmpresa, idCliente } },
      include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS, conveniosPago: { where: { estado: { in: ACTIVE_AGREEMENT_STATES } } } } });
  }

  private async assertStorage(tx: Db) {
    const capabilities = await this.storage.capabilities(tx);
    if (!capabilities.ticketLink || !capabilities.g3Dispatch) {
      throw new ConflictException({ code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE',
        message: 'La baja por morosidad integrada requiere el almacenamiento privado g8_retiros aprobado y aplicado; no se modificó nada.' });
    }
    return capabilities;
  }

  publicDispatch(dispatch: WithdrawalDispatch) {
    return {
      requestId: dispatch.requestId, estadoDespacho: dispatch.estadoDespacho, intentos: dispatch.intentos, idOtG3: dispatch.idOtG3,
      estadoOt: dispatch.estadoOt, estadoOtLeidoEn: dispatch.estadoOtLeidoEn, ultimoErrorCodigo: dispatch.ultimoErrorCodigo,
      cancelable: dispatch.estadoOt === null || G3_CANCELLABLE_STATES.includes(dispatch.estadoOt as never),
      cierreRecibido: Boolean(dispatch.cierreClave), recepcionSincronizada: Boolean(dispatch.recepcionClaveEvento), aplicado: Boolean(dispatch.aplicadoEn),
    };
  }

  private audit(tx: Db, user: AuthUser | null, accion: string, entidadAfectada: string, idEntidadAfectada: number, valorNuevo: Record<string, unknown>) {
    return this.auditService.record({ idUsuario: user?.idUsuario ?? null, accion, entidadAfectada, idEntidadAfectada, valorNuevo: valorNuevo as Prisma.InputJsonValue }, tx);
  }

  private assertCompany(idEmpresa: number, currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles) && currentUser.idEmpresa !== idEmpresa) throw new ForbiddenException('El registro no pertenece a tu empresa');
  }
}

