import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IntegracionInstalacionG3, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { sha256Payload } from '../g3-integration/g3-integration.utils';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {
    const customer = await this.prisma.cliente.findUnique({ where: { idCliente: activation.idCliente } });
    if (!customer?.rut) return;

    const series = this.extractSeries(closure);
    const eventId = `g8-g1-activation-${tracking.requestId}`;
    const idOtG3 = this.workOrderId(closure, tracking);
    const basePayload = {
      event_id: eventId,
      trace_id: tracking.traceId,
      id_empresa: tracking.idEmpresa,
      id_ot: idOtG3,
      id_cliente: activation.idCliente,
      rut_cliente: customer.rut,
      id_servicio: activation.idServicio,
      id_contrato: tracking.idContrato,
    };
    const state = series.length > 1
      ? 'PENDIENTE_RATIFICACION_G1_EVENT_ID'
      : series.length === 0
        ? 'PENDIENTE_DATOS_EQUIPO_G1'
        : 'PENDIENTE_ENVIO';
    const payload: G1ActivationPayload = { ...basePayload, equipos: series.slice(0, 1).map((numero_serie) => ({ numero_serie })) };
    const record = await this.prisma.integracionActivacionG1.upsert({
      where: { eventId },
      create: {
        idEmpresa: tracking.idEmpresa,
        idCliente: activation.idCliente,
        idServicio: activation.idServicio,
        idContrato: tracking.idContrato,
        idOtG3: String(idOtG3),
        numeroSerie: series.length === 1 ? series[0] : null,
        eventId,
        traceId: tracking.traceId,
        estadoIntegracion: state,
        payloadHash: sha256Payload(payload),
      },
      update: {},
    });

    if (record.estadoIntegracion === 'COMPLETADA') return record;
    if (state !== 'PENDIENTE_ENVIO') {
      await this.auditPending(record.idIntegracion, state, payload);
      return record;
    }
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
      include: { cliente: { select: { rut: true } } },
    });
    if (!record) throw new NotFoundException('Tracking de activación G1 no encontrado.');
    if (!record.numeroSerie) return record;

    const payload: G1ActivationPayload = {
      event_id: record.eventId,
      trace_id: record.traceId,
      id_empresa: record.idEmpresa,
      id_ot: record.idOtG3,
      id_cliente: record.idCliente,
      rut_cliente: record.cliente.rut ?? '',
      id_servicio: record.idServicio,
      id_contrato: record.idContrato,
      equipos: [{ numero_serie: record.numeroSerie }],
    };
    const now = new Date();
    await this.prisma.integracionActivacionG1.update({
      where: { idIntegracion },
      data: { intentos: { increment: 1 }, ultimoIntento: now, estadoIntegracion: 'ENVIANDO', ultimoErrorSanitizado: null },
    });

    try {
      const result = await this.client.sendActivation(payload);
      const updated = await this.prisma.integracionActivacionG1.update({
        where: { idIntegracion },
        data: {
          estadoIntegracion: 'COMPLETADA',
          respuestaEstadoG1: result.data as Prisma.InputJsonValue,
          fechaCompletado: new Date(),
          ultimoErrorSanitizado: null,
        },
      });
      console.info('Integración G1 completada', this.logContext(record, result.status, result.durationMs, 'COMPLETADA'));
      await this.audit.record({
        accion: retry ? 'REINTENTAR_ACTIVACION_G1' : 'ENVIAR_ACTIVACION_G1',
        entidadAfectada: 'integracion_activacion_g1',
        idEntidadAfectada: idIntegracion,
        valorNuevo: { ...this.auditContext(record), statusHttp: result.status, resultado: 'COMPLETADA' },
      });
      await this.audit.record({
        accion: 'ACTIVACION_G1_COMPLETADA',
        entidadAfectada: 'integracion_activacion_g1',
        idEntidadAfectada: idIntegracion,
        valorNuevo: this.auditContext(record),
      });
      return updated;
    } catch (error) {
      const integrationError = error instanceof G1IntegrationError
        ? error
        : new G1IntegrationError('G1_UNAVAILABLE', null, true, 'No fue posible conectar con G1.');
      const state = integrationError.retryable ? 'PENDIENTE_SINCRONIZACION_G1' : 'ERROR_G1';
      const updated = await this.prisma.integracionActivacionG1.update({
        where: { idIntegracion },
        data: { estadoIntegracion: state, ultimoErrorSanitizado: integrationError.message },
      });
      console.warn('Integración G1 pendiente', this.logContext(record, integrationError.status, null, state));
      await this.audit.record({
        accion: retry ? 'REINTENTAR_ACTIVACION_G1' : 'ACTIVACION_G1_PENDIENTE',
        entidadAfectada: 'integracion_activacion_g1',
        idEntidadAfectada: idIntegracion,
        valorNuevo: { ...this.auditContext(record), statusHttp: integrationError.status, resultado: state, codigo: integrationError.code },
      });
      return updated;
    }
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
    const raw = closure.id_ot ?? tracking.idOtG3 ?? tracking.codigoOtG3 ?? `tracking-${tracking.idIntegracion}`;
    return typeof raw === 'number' || typeof raw === 'string' ? raw : String(raw);
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

  private auditPending(idIntegracion: number, state: string, payload: G1ActivationPayload) {
    return this.audit.record({
      accion: 'ACTIVACION_G1_PENDIENTE',
      entidadAfectada: 'integracion_activacion_g1',
      idEntidadAfectada: idIntegracion,
      valorNuevo: {
        eventId: payload.event_id,
        traceId: payload.trace_id,
        idEmpresa: payload.id_empresa,
        idCliente: payload.id_cliente,
        idServicio: payload.id_servicio,
        idContrato: payload.id_contrato,
        idOt: payload.id_ot,
        resultado: state,
      },
    });
  }
}

