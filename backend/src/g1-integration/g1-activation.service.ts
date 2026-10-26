import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IntegracionActivacionG1, IntegracionInstalacionG3, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { sha256Payload } from '../g3-integration/g3-integration.utils';
import { PrismaService } from '../prisma/prisma.service';
import { DurableG1Payload } from '../g3-integration/post-closure-work';
import {
  G1ActivationPayload,
  G1_INVENTORY_CLIENT,
  G1IntegrationError,
  G1InventoryClient,
} from './g1-integration.types';

type G8ActivationResult = {
  idCliente: number;
  idServicio: number;
};

@Injectable()
export class G1ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(G1_INVENTORY_CLIENT) private readonly client: G1InventoryClient,
  ) {}

  async afterG3Completion(
    tracking: IntegracionInstalacionG3,
    activation: G8ActivationResult,
    closure: Record<string, unknown>,
    persistedPayload?: DurableG1Payload,
  ) {
    const customer = persistedPayload ? null : await this.prisma.cliente.findUnique({ where: { idCliente: activation.idCliente } });

    const series = this.extractSeries(closure);
    const eventId = `g8-g1-activation-${tracking.requestId}`;
    const idOtG3 = this.workOrderId(closure, tracking);
    const basePayload = {
      event_id: eventId,
      trace_id: tracking.traceId,
      id_empresa: tracking.idEmpresa,
      id_ot: idOtG3,
      id_cliente: activation.idCliente,
      rut_cliente: customer?.rut ?? '',
      id_servicio: activation.idServicio,
      id_contrato: tracking.idContrato,
    };
    const payload = persistedPayload ?? { ...basePayload, equipos: series.map((numero_serie) => ({ numero_serie })) };
    if (payload.event_id !== eventId || payload.trace_id !== tracking.traceId || payload.id_empresa !== tracking.idEmpresa
      || payload.id_cliente !== activation.idCliente || payload.id_servicio !== activation.idServicio
      || payload.id_contrato !== tracking.idContrato || payload.id_ot !== idOtG3) throw new ConflictException('G1_PAYLOAD_CORRELATION_INVALID');
    await this.validateRelations(payload);
    const payloadSeries = payload.equipos.map(e => e.numero_serie);
    const missing = !payload.rut_cliente ? 'G1_RUT_REQUIRED' : idOtG3 === null ? 'G1_ID_OT_REQUIRED' : null;
    const state = missing ? 'ERROR_G1' : payloadSeries.length === 0 ? 'PENDIENTE_DATOS_EQUIPO_G1' : 'PENDIENTE_ENVIO';
    const record = await this.prisma.integracionActivacionG1.upsert({
      where: { eventId },
      create: {
        idEmpresa: tracking.idEmpresa,
        idCliente: activation.idCliente,
        idServicio: activation.idServicio,
        idContrato: tracking.idContrato,
        idOtG3: idOtG3 === null ? '' : String(idOtG3),
        numeroSerie: payloadSeries[0] ?? null,
        numerosSerie: payloadSeries,
        eventId,
        traceId: tracking.traceId,
        estadoIntegracion: state,
        payloadHash: sha256Payload(payload),
        payloadSnapshot: payload as Prisma.InputJsonValue,
        ultimoErrorSanitizado: missing,
      },
      update: {},
    });

    if (record.payloadHash !== sha256Payload(payload) || sha256Payload(record.payloadSnapshot) !== record.payloadHash
      || record.idEmpresa !== payload.id_empresa || record.idCliente !== payload.id_cliente
      || record.idServicio !== payload.id_servicio || record.idContrato !== payload.id_contrato
      || record.traceId !== payload.trace_id || record.idOtG3 !== (payload.id_ot === null ? '' : String(payload.id_ot))) {
      throw new ConflictException('G1_EXISTING_PAYLOAD_CONFLICT');
    }
    if (record.estadoIntegracion === 'COMPLETADA') return this.withOutcomeAudit(record, false);
    if (state !== 'PENDIENTE_ENVIO') {
      return this.withOutcomeAudit(record, false);
    }
    // Duplicate closures recover creation/initial send, not an automatic resend of an attempted event.
    if (persistedPayload && record.intentos > 0) return this.withOutcomeAudit(record, false);
    return this.dispatch(record.idIntegracion, false);
  }

  async retry(idIntegracion: number, currentUser: AuthUser) {
    await this.scopedRecord(idIntegracion, currentUser);
    return this.dispatch(idIntegracion, true);
  }

  async detail(idIntegracion: number, currentUser: AuthUser) {
    return this.scopedRecord(idIntegracion, currentUser);
  }

  private async dispatch(idIntegracion: number, retry: boolean) {
    const record = await this.prisma.integracionActivacionG1.findUnique({
      where: { idIntegracion },
    });
    if (!record) throw new NotFoundException('Tracking de activación G1 no encontrado.');
    if (record.estadoIntegracion === 'COMPLETADA') return this.withOutcomeAudit(record, retry);
    // Recheck after upsert: another worker may already have attempted this event.
    if (!retry && record.intentos > 0) return this.withOutcomeAudit(record, false);
    // Preserve the previous outcome's audit before a new attempt can replace it.
    if (record.intentos > 0 && record.estadoIntegracion !== 'ENVIANDO') {
      const previous = await this.withOutcomeAudit(record, retry);
      if (previous.auditPending) return previous;
    }
    const reject = async (code: string) => {
      await this.prisma.integracionActivacionG1.updateMany({
        where: { idIntegracion, estadoIntegracion: { notIn: ['COMPLETADA', 'ENVIANDO'] } },
        data: { estadoIntegracion: 'ERROR_G1', ultimoErrorSanitizado: code },
      });
      return this.prisma.integracionActivacionG1.findUniqueOrThrow({ where: { idIntegracion } });
    };
    if (this.positiveWorkOrderId(record.idOtG3) === null) return reject('G1_ID_OT_REQUIRED');
    const series = record.numerosSerie.length ? record.numerosSerie : record.numeroSerie ? [record.numeroSerie] : [];
    if (!series.length) return record;

    // Retries use the persisted event, never mutable customer data.
    if (!record.payloadSnapshot || typeof record.payloadSnapshot !== 'object' || Array.isArray(record.payloadSnapshot)) return reject('G1_PAYLOAD_SNAPSHOT_MISSING');
    const payload = record.payloadSnapshot as unknown as G1ActivationPayload;
    if (sha256Payload(payload) !== record.payloadHash || payload.event_id !== record.eventId
      || payload.trace_id !== record.traceId || payload.id_empresa !== record.idEmpresa
      || payload.id_cliente !== record.idCliente || payload.id_servicio !== record.idServicio
      || payload.id_contrato !== record.idContrato || payload.id_ot !== this.positiveWorkOrderId(record.idOtG3)
      || !Array.isArray(payload.equipos) || JSON.stringify(payload.equipos.map(e => e.numero_serie)) !== JSON.stringify(series)) {
      return reject('G1_PAYLOAD_SNAPSHOT_INCONSISTENT');
    }
    if (!payload.rut_cliente) return reject('G1_RUT_REQUIRED');
    await this.validateRelations(payload);
    const now = new Date();
    // A durable lease prevents two workers sending concurrently. Expired leases are recovered by explicit retry.
    const claimed = await this.prisma.integracionActivacionG1.updateMany({
      where: { idIntegracion, intentos: record.intentos, estadoIntegracion: { not: 'COMPLETADA' }, OR: [
        { estadoIntegracion: { not: 'ENVIANDO' } },
        { ultimoIntento: { lt: new Date(now.getTime() - 300_000) } },
      ] },
      data: { intentos: { increment: 1 }, ultimoIntento: now, estadoIntegracion: 'ENVIANDO', ultimoErrorSanitizado: null },
    });
    if (!claimed.count) return this.prisma.integracionActivacionG1.findUniqueOrThrow({ where: { idIntegracion } });
    const attemptNumber = record.intentos + 1;

    try {
      const result = await this.client.sendActivation(payload);
      const responseIssue = this.activationResponseIssue(result.data, payload);
      if (responseIssue) {
        const state = ['G1_EQUIPMENT_ASSOCIATION_PENDING', 'G1_EQUIPMENT_ASSOCIATION_UNCONFIRMED'].includes(responseIssue)
          ? 'PENDIENTE_SINCRONIZACION_G1'
          : 'ERROR_G1';
        const updated = await this.saveOutcome(idIntegracion, now, {
            estadoIntegracion: state,
            respuestaEstadoG1: result.data as Prisma.InputJsonValue,
            fechaCompletado: null,
            ultimoErrorSanitizado: responseIssue,
        });
        if (updated.intentos === attemptNumber) console.warn('Integración G1 aceptada sin asociación funcional confirmada',
          this.logContext(record, result.status, result.durationMs, state));
        return this.withOutcomeAudit(updated, retry, result.status, attemptNumber);
      }
      const updated = await this.saveOutcome(idIntegracion, now, {
          estadoIntegracion: 'COMPLETADA',
          respuestaEstadoG1: result.data as Prisma.InputJsonValue,
          fechaCompletado: new Date(),
          ultimoErrorSanitizado: null,
      });
      if (updated.intentos === attemptNumber) console.info('Integración G1 completada', this.logContext(record, result.status, result.durationMs, 'COMPLETADA'));
      return this.withOutcomeAudit(updated, retry, result.status, attemptNumber);
    } catch (error) {
      const integrationError = error instanceof G1IntegrationError
        ? error
        : new G1IntegrationError('G1_UNAVAILABLE', null, true, 'No fue posible conectar con G1.');
      const state = integrationError.retryable ? 'PENDIENTE_SINCRONIZACION_G1' : 'ERROR_G1';
      const updated = await this.saveOutcome(idIntegracion, now, { estadoIntegracion: state, ultimoErrorSanitizado: integrationError.code });
      if (updated.intentos === attemptNumber) console.warn('Integración G1 pendiente', this.logContext(record, integrationError.status, null, state));
      return this.withOutcomeAudit(updated, retry, integrationError.status, attemptNumber);
    }
  }

  private async saveOutcome(idIntegracion: number, attempt: Date, data: Prisma.IntegracionActivacionG1UpdateManyMutationInput) {
    await this.prisma.integracionActivacionG1.updateMany({
      where: { idIntegracion, estadoIntegracion: 'ENVIANDO', ultimoIntento: attempt }, data,
    });
    return this.prisma.integracionActivacionG1.findUniqueOrThrow({ where: { idIntegracion } });
  }

  private async validateRelations(payload: DurableG1Payload) {
    const [contract, service] = await Promise.all([
      this.prisma.contrato.findUnique({ where: { idContrato: payload.id_contrato }, select: { idEmpresa: true, idCliente: true } }),
      this.prisma.servicioContratado.findUnique({ where: { idServicio: payload.id_servicio }, select: { idEmpresa: true, idContrato: true, idCliente: true } }),
    ]);
    if (!contract || !service || contract.idEmpresa !== payload.id_empresa || service.idEmpresa !== payload.id_empresa
      || contract.idCliente !== payload.id_cliente || service.idCliente !== payload.id_cliente || service.idContrato !== payload.id_contrato) {
      throw new ConflictException('G1_RELATIONSHIP_INCONSISTENT');
    }
  }

  private async withOutcomeAudit(record: IntegracionActivacionG1, retry: boolean, statusHttp: number | null = null, outcomeAttempt?: number) {
    if (['ENVIANDO', 'PENDIENTE_ENVIO'].includes(record.estadoIntegracion)) return { ...record, auditPending: true };
    try {
      // Audit persistence + duplicate detection share a row lock; the confirmed G1 state is already committed.
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id_integracion FROM integracion_activacion_g1 WHERE id_integracion = ${record.idIntegracion} FOR UPDATE`;
        record = await tx.integracionActivacionG1.findUniqueOrThrow({ where: { idIntegracion: record.idIntegracion } });
        // The row may belong to a newer attempt. Its HTTP status cannot be reconstructed from this worker's response.
        if (outcomeAttempt !== undefined && record.intentos !== outcomeAttempt) statusHttp = null;
        if (['ENVIANDO', 'PENDIENTE_ENVIO'].includes(record.estadoIntegracion)) throw new Error('G1_OUTCOME_PENDING');
        const actions = record.estadoIntegracion === 'COMPLETADA'
          ? [record.intentos > 1 ? 'REINTENTAR_ACTIVACION_G1' : 'ENVIAR_ACTIVACION_G1', 'ACTIVACION_G1_COMPLETADA']
          : [record.intentos > 1 ? 'REINTENTAR_ACTIVACION_G1' : 'ACTIVACION_G1_PENDIENTE'];
        for (const accion of actions) {
          const existing = await tx.logAuditoria.findFirst({ where: {
            accion, entidadAfectada: 'integracion_activacion_g1', idEntidadAfectada: record.idIntegracion,
            valorNuevo: { path: ['intento'], equals: record.intentos },
          }, select: { idLog: true } });
          if (!existing) await this.audit.record({ accion, entidadAfectada: 'integracion_activacion_g1', idEntidadAfectada: record.idIntegracion,
            valorNuevo: { ...this.auditContext(record), intento: record.intentos, statusHttp, resultado: record.estadoIntegracion, codigo: record.ultimoErrorSanitizado },
          }, tx);
        }
      });
      return { ...record, auditPending: false };
    } catch {
      // The durable outcome remains authoritative and allows audit-only recovery without another POST.
      return { ...record, auditPending: true };
    }
  }

  private activationResponseIssue(data: Record<string, unknown>, payload: G1ActivationPayload) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'G1_ACTIVATION_RESPONSE_INVALID';
    if (data.event_id !== undefined && data.event_id !== payload.event_id) return 'G1_EVENT_ID_MISMATCH';
    if (data.id_servicio !== undefined && data.id_servicio !== payload.id_servicio) return 'G1_SERVICE_ID_MISMATCH';
    if (data.equipos_asociados === undefined) return 'G1_EQUIPMENT_ASSOCIATION_UNCONFIRMED';
    if (!Number.isSafeInteger(data.equipos_asociados) || Number(data.equipos_asociados) < 0) {
      return 'G1_EQUIPMENT_ASSOCIATION_RESPONSE_INVALID';
    }
    // G1 can accept the activation before technical closure; zero remains pending, never a definitive failure.
    if (data.equipos_asociados === 0 && payload.equipos.length > 0) return 'G1_EQUIPMENT_ASSOCIATION_PENDING';
    if (data.equipos_asociados !== payload.equipos.length) return 'G1_EQUIPMENT_ASSOCIATION_INCOMPLETE';
    return null;
  }

  private extractSeries(closure: Record<string, unknown>) {
    const result = closure.resultado_tecnico ?? closure.resultado;
    const resultRecord = result && typeof result === 'object' && !Array.isArray(result)
      ? result as Record<string, unknown>
      : {};
    const candidates = [
      closure.equipos_instalados,
      resultRecord.equipos_instalados,
      resultRecord.equipos,
    ];
    const series: string[] = [];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue;
      for (const item of candidate) {
        if (!item || typeof item !== 'object') continue;
        const source = item as Record<string, unknown>;
        const value = source.numero_serie ?? source.numeroSerie ?? source.serial;
        if (typeof value === 'string' && value.trim()) series.push(value.trim());
      }
    }
    return [...new Set(series)];
  }

  private workOrderId(closure: Record<string, unknown>, tracking: IntegracionInstalacionG3) {
    return this.positiveWorkOrderId(closure.id_ot ?? tracking.idOtG3);
  }

  private positiveWorkOrderId(raw: unknown): number | null {
    if (typeof raw !== 'number' && !(typeof raw === 'string' && /^[1-9]\d*$/.test(raw))) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
  }

  private async scopedRecord(idIntegracion: number, currentUser: AuthUser) {
    const record = await this.prisma.integracionActivacionG1.findUnique({ where: { idIntegracion } });
    if (!record) throw new NotFoundException('Tracking de activación G1 no encontrado.');
    if (!isAdministrator(currentUser.roles) && record.idEmpresa !== currentUser.idEmpresa) {
      throw new ForbiddenException('No tienes acceso a esta activación.');
    }
    return record;
  }

  private auditContext(record: {
    eventId: string; traceId: string; idEmpresa: number; idCliente: number; idServicio: number; idContrato: number; idOtG3: string;
  }) {
    return {
      eventId: record.eventId,
      traceId: record.traceId,
      idEmpresa: record.idEmpresa,
      idCliente: record.idCliente,
      idServicio: record.idServicio,
      idContrato: record.idContrato,
      idOt: record.idOtG3,
    };
  }

  private logContext(record: Parameters<G1ActivationService['auditContext']>[0], statusHttp: number | null, durationMs: number | null, result: string) {
    return { ...this.auditContext(record), statusHttp, durationMs, result };
  }

}

