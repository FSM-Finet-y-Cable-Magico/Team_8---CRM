import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstallationActivationService } from './installation-activation.service';
import { G1ActivationService } from '../g1-integration/g1-activation.service';
import { G3ClosurePayload, G3ClosureSource } from './g3-integration.types';
import {
  externalWorkOrderId,
  sha256Payload,
} from './g3-integration.utils';

@Injectable()
export class G3ClosureProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activationService: InstallationActivationService,
    private readonly auditService: AuditService,
    @Optional() private readonly g1Activation?: G1ActivationService,
  ) {}

  async process(payload: G3ClosurePayload, source: G3ClosureSource, trackingHintId?: number) {
    const record = payload as Record<string, unknown>;
    this.assertContractPayload(record);
    const tracking = trackingHintId
      ? await this.prisma.integracionInstalacionG3.findUnique({ where: { idIntegracion: trackingHintId } })
      : await this.resolveTracking(record);
    if (!tracking) throw new NotFoundException('Tracking de instalacion no encontrado');
    this.validateCorrelations(tracking, record);

    const eventType = 'WORK_ORDER_COMPLETADA';
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

      const activation = await this.activationService.activate(
        tx,
        current,
        this.technicalResult(record),
      );

      const now = new Date();
      const updated = await tx.integracionInstalacionG3.update({
        where: { idIntegracion: current.idIntegracion },
        data: {
          idCliente: activation?.idCliente ?? current.idCliente,
          idServicio: activation?.idServicio ?? current.idServicio,
          idOtG3: externalWorkOrderId(record) ?? current.idOtG3,
          estadoIntegracion: 'COMPLETADA',
          estadoOtG3: 'COMPLETADA',
          estadoOriginalG3: null,
          fechaUltimaSincronizacion: now,
          ultimoErrorSanitizado: null,
          fechaCierreProcesado: now,
        },
      });
      const eventResult = {
        estado: 'COMPLETADA',
        estadoOriginalG3: null,
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
    }, {
      maxWait: 10_000,
      timeout: 20_000,
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
          estado: 'COMPLETADA',
          estadoOriginalG3: null,
        },
      });
      await this.auditStatus(tracking.idIntegracion, processed.result);
    }

    const activationResult = processed.result && typeof processed.result === 'object' && !Array.isArray(processed.result)
      ? processed.result as Record<string, unknown>
      : {};
    if (
      !processed.duplicate &&
      activationResult.activated === true &&
      typeof activationResult.idCliente === 'number' &&
      typeof activationResult.idServicio === 'number' &&
      this.g1Activation
    ) {
      try {
        await this.g1Activation.afterG3Completion(
          tracking,
          { idCliente: activationResult.idCliente, idServicio: activationResult.idServicio },
          record,
        );
      } catch {
        console.error('No se pudo registrar el tracking de activación G1 después del commit G8', {
          idIntegracionG3: tracking.idIntegracion,
          idEmpresa: tracking.idEmpresa,
        });
      }
    }

    return processed;
  }

  private async resolveTracking(payload: Record<string, unknown>) {
    const tracking = await this.prisma.integracionInstalacionG3.findUnique({
      where: { requestId: String(payload.request_id) },
    });
    if (!tracking) throw new NotFoundException('El request_id no corresponde a una instalacion conocida');
    return tracking;
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
    if (String(payload.id_ot) !== tracking.idOtG3) {
      throw new BadRequestException('La correlacion id_ot no corresponde al tracking');
    }
    if (payload.trace_id !== tracking.traceId) {
      throw new BadRequestException('La correlacion trace_id no corresponde al tracking');
    }
  }

  private assertContractPayload(payload: Record<string, unknown>) {
    const requiredStrings = ['request_id', 'trace_id'];
    for (const field of requiredStrings) {
      const value = payload[field];
      if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
        throw new BadRequestException(`El cierre requiere ${field} valido`);
      }
    }
    const requiredIds = ['id_ot', 'id_empresa', 'id_prospecto', 'id_contrato', 'id_plan'];
    for (const field of requiredIds) {
      const value = payload[field];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw new BadRequestException(`El cierre requiere ${field} valido`);
      }
    }
    if (!Array.isArray(payload.equipos_instalados) || !Array.isArray(payload.equipos_retirados)) {
      throw new BadRequestException('El cierre requiere equipos_instalados y equipos_retirados');
    }
    this.assertOptionalClosureFields(payload);
  }

  private assertOptionalClosureFields(payload: Record<string, unknown>) {
    const fechaCompletada = payload.fecha_completada;
    if (fechaCompletada !== undefined && fechaCompletada !== null
      && (typeof fechaCompletada !== 'string' || !fechaCompletada.trim() || !Number.isFinite(Date.parse(fechaCompletada)))) {
      throw new BadRequestException('El cierre contiene fecha_completada invalida');
    }
    const idTecnico = payload.id_tecnico;
    if (idTecnico !== undefined && idTecnico !== null
      && (typeof idTecnico !== 'number' || !Number.isSafeInteger(idTecnico) || idTecnico < 1)) {
      throw new BadRequestException('El cierre contiene id_tecnico invalido');
    }
    const potencia = payload.potencia_optica_dbm;
    if (potencia !== undefined && potencia !== null
      && (typeof potencia !== 'number' || !Number.isFinite(potencia))) {
      throw new BadRequestException('El cierre contiene potencia_optica_dbm invalida');
    }
    const resultadoLlamada = payload.resultado_llamada;
    if (resultadoLlamada !== undefined && resultadoLlamada !== null
      && (typeof resultadoLlamada !== 'string' || !resultadoLlamada.trim())) {
      throw new BadRequestException('El cierre contiene resultado_llamada invalido');
    }
    const resueltoRemotamente = payload.resuelto_remotamente;
    if (resueltoRemotamente !== undefined && resueltoRemotamente !== null
      && typeof resueltoRemotamente !== 'boolean') {
      throw new BadRequestException('El cierre contiene resuelto_remotamente invalido');
    }
    const materiales = payload.materiales;
    if (materiales !== undefined && materiales !== null && !Array.isArray(materiales)) {
      throw new BadRequestException('El cierre contiene materiales invalidos');
    }
  }

  private technicalResult(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {
      equipos_instalados: payload.equipos_instalados,
      equipos_retirados: payload.equipos_retirados,
    };
    for (const field of [
      'fecha_completada',
      'id_tecnico',
      'potencia_optica_dbm',
      'resultado_llamada',
      'resuelto_remotamente',
      'materiales',
    ]) {
      if (payload[field] !== undefined && payload[field] !== null) result[field] = payload[field];
    }
    return result;
  }

  private async auditStatus(idIntegracion: number, result: unknown) {
    await this.auditService.record({
      accion: 'ACTIVAR_SERVICIO_DESDE_G3',
      entidadAfectada: 'integracion_instalacion_g3',
      idEntidadAfectada: idIntegracion,
      valorNuevo: result as Prisma.InputJsonValue,
    });
  }
}
