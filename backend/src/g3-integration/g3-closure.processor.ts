import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstallationActivationService } from './installation-activation.service';
import { G3ClosurePayload, G3ClosureSource } from './g3-integration.types';
import {
  externalWorkOrderCode,
  externalWorkOrderId,
  hasTechnicalResult,
  normalizeG3State,
  sha256Payload,
} from './g3-integration.utils';

@Injectable()
export class G3ClosureProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activationService: InstallationActivationService,
    private readonly auditService: AuditService,
  ) {}

  async process(payload: G3ClosurePayload, source: G3ClosureSource, trackingHintId?: number) {
    const record = payload as Record<string, unknown>;
    const tracking = trackingHintId
      ? await this.prisma.integracionInstalacionG3.findUnique({ where: { idIntegracion: trackingHintId } })
      : await this.resolveTracking(record);
    if (!tracking) throw new NotFoundException('Tracking de instalacion no encontrado');
    this.validateCorrelations(tracking, record);

    const normalized = normalizeG3State(payload.estado);
    const eventType = this.eventType(normalized.original, normalized.known);
    const payloadHash = sha256Payload(record);
    const existing = await this.prisma.integracionEventoEntrante.findUnique({
      where: { idIntegracion_eventType: { idIntegracion: tracking.idIntegracion, eventType } },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException('El cierre G3 ya fue recibido con un payload diferente');
      }
      return { duplicate: true, result: existing.result, tracking };
    }

    if (normalized.state === 'COMPLETADA') {
      if (typeof payload.tipo === 'string' && this.normalizeText(payload.tipo) !== 'INSTALACION') {
        throw new BadRequestException('El cierre no corresponde a una orden de instalacion');
      }
      if (!hasTechnicalResult(record)) {
        throw new BadRequestException('El cierre COMPLETADA no contiene un resultado tecnico valido');
      }
    }

    const processed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id_integracion FROM integracion_instalacion_g3 WHERE id_integracion = ${tracking.idIntegracion} FOR UPDATE`;
      const currentEvent = await tx.integracionEventoEntrante.findUnique({
        where: { idIntegracion_eventType: { idIntegracion: tracking.idIntegracion, eventType } },
      });
      if (currentEvent) {
        if (currentEvent.payloadHash !== payloadHash) {
          throw new ConflictException('El cierre G3 ya fue recibido con un payload diferente');
        }
        return { duplicate: true, result: currentEvent.result };
      }

      const current = await tx.integracionInstalacionG3.findUnique({ where: { idIntegracion: tracking.idIntegracion } });
      if (!current) throw new NotFoundException('Tracking de instalacion no encontrado');

      let activation: Awaited<ReturnType<InstallationActivationService['activate']>> | null = null;
      if (normalized.state === 'COMPLETADA') {
        activation = await this.activationService.activate(
          tx,
          current,
          record.resultado_tecnico ?? record.resultado,
        );
      }

      const now = new Date();
      const updated = await tx.integracionInstalacionG3.update({
        where: { idIntegracion: current.idIntegracion },
        data: {
          idCliente: activation?.idCliente ?? current.idCliente,
          idServicio: activation?.idServicio ?? current.idServicio,
          idOtG3: externalWorkOrderId(record) ?? current.idOtG3,
          codigoOtG3: externalWorkOrderCode(record) ?? current.codigoOtG3,
          estadoIntegracion: normalized.state === 'COMPLETADA' ? 'COMPLETADA' : 'EN_SEGUIMIENTO',
          estadoOtG3: normalized.state,
          estadoOriginalG3: normalized.known ? null : normalized.original,
          fechaUltimaSincronizacion: now,
          ultimoErrorSanitizado: normalized.known ? null : 'Estado G3 no reconocido; requiere seguimiento.',
          fechaCierreProcesado: normalized.state === 'COMPLETADA' ? now : current.fechaCierreProcesado,
        },
      });
      const eventResult = {
        estado: normalized.state,
        estadoOriginalG3: normalized.known ? null : normalized.original,
        activated: Boolean(activation),
        idCliente: activation?.idCliente ?? null,
        idServicio: activation?.idServicio ?? null,
      };
      await tx.integracionEventoEntrante.create({
        data: {
          idIntegracion: current.idIntegracion,
          source,
          eventType,
          externalReference: current.requestId,
          payloadHash,
          result: eventResult,
        },
      });
      return { duplicate: false, result: eventResult, tracking: updated };
    });

    if (!processed.duplicate) {
      await this.auditService.record({
        accion: source === 'WEBHOOK' ? 'RECIBIR_CIERRE_G3' : 'RECONCILIAR_CIERRE_G3',
        entidadAfectada: 'integracion_instalacion_g3',
        idEntidadAfectada: tracking.idIntegracion,
        valorNuevo: {
          requestId: tracking.requestId,
          traceId: tracking.traceId,
          idEmpresa: tracking.idEmpresa,
          idOtG3: externalWorkOrderId(record) ?? tracking.idOtG3,
          estado: normalized.state,
          estadoOriginalG3: normalized.known ? null : normalized.original,
        },
      });
      await this.auditStatus(tracking.idIntegracion, normalized.state, normalized.known, processed.result);
    }

    return processed;
  }

  private async resolveTracking(payload: Record<string, unknown>) {
    if (typeof payload.request_id === 'string' && payload.request_id.trim()) {
      const tracking = await this.prisma.integracionInstalacionG3.findUnique({
        where: { requestId: payload.request_id.trim() },
      });
      if (!tracking) throw new NotFoundException('El request_id no corresponde a una instalacion conocida');
      return tracking;
    }

    const idOtG3 = externalWorkOrderId(payload);
    const codigoOtG3 = externalWorkOrderCode(payload);
    if (!idOtG3 && !codigoOtG3) {
      throw new BadRequestException('El cierre requiere request_id, id_ot o codigo_ot para correlacion');
    }
    const idEmpresa = typeof payload.id_empresa === 'number' ? payload.id_empresa : undefined;
    const candidates = await this.prisma.integracionInstalacionG3.findMany({
      where: {
        ...(idEmpresa ? { idEmpresa } : {}),
        OR: [
          ...(idOtG3 ? [{ idOtG3 }] : []),
          ...(codigoOtG3 ? [{ codigoOtG3 }] : []),
        ],
      },
      take: 2,
    });
    if (candidates.length === 0) throw new NotFoundException('No existe tracking para la orden G3');
    if (candidates.length > 1) throw new ConflictException('La referencia G3 es ambigua');
    return candidates[0];
  }

  private validateCorrelations(
    tracking: Awaited<ReturnType<G3ClosureProcessor['resolveTracking']>>,
    payload: Record<string, unknown>,
  ) {
    const checks: Array<[string, number | null]> = [
      ['id_empresa', tracking.idEmpresa],
      ['id_prospecto', tracking.idProspecto],
      ['id_contrato', tracking.idContrato],
      ['id_plan', tracking.idPlan],
    ];
    for (const [field, expected] of checks) {
      const received = payload[field];
      if (received !== undefined && received !== null && Number(received) !== expected) {
        throw new BadRequestException(`La correlacion ${field} no corresponde al tracking`);
      }
    }
    const receivedTrace = payload.trace_id;
    if (typeof receivedTrace === 'string' && receivedTrace !== tracking.traceId) {
      throw new BadRequestException('La correlacion trace_id no corresponde al tracking');
    }
  }

  private eventType(original: string | null, known: boolean) {
    const suffix = known ? original ?? 'SIN_ESTADO' : `DESCONOCIDO_${sha256Payload(original).slice(0, 10)}`;
    return `WORK_ORDER_${suffix}`.slice(0, 50);
  }

  private normalizeText(value: string) {
    return value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private async auditStatus(idIntegracion: number, state: string, known: boolean, result: unknown) {
    const action = !known
      ? 'ESTADO_G3_DESCONOCIDO'
      : state === 'COMPLETADA'
        ? 'ACTIVAR_SERVICIO_DESDE_G3'
        : state === 'CANCELADA'
          ? 'CANCELAR_INSTALACION_G3'
          : state === 'PENDIENTE_CLIENTE_AUSENTE'
            ? 'CLIENTE_AUSENTE_G3'
            : null;
    if (!action) return;
    await this.auditService.record({
      accion: action,
      entidadAfectada: 'integracion_instalacion_g3',
      idEntidadAfectada: idIntegracion,
      valorNuevo: result as Prisma.InputJsonValue,
    });
  }
}
