import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstallationActivationService } from './installation-activation.service';
import { G1ActivationService } from '../g1-integration/g1-activation.service';
import { G3ClosurePayload, G3ClosureSource } from './g3-integration.types';
import { closureResult, PostClosureWork, publicClosureResult, validatePostClosure } from './post-closure-work';
import {
  externalWorkOrderId,
  installationSnapshot,
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
      await this.recoverPostClosure(tracking.idIntegracion);
      return { duplicate: true, result: publicClosureResult(existing.result), tracking };
    }
    installationSnapshot(tracking);

    const processed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id_integracion FROM integracion_instalacion_g3 WHERE id_integracion = ${tracking.idIntegracion} FOR UPDATE`;
      const current = await tx.integracionInstalacionG3.findUnique({ where: { idIntegracion: tracking.idIntegracion } });
      if (!current) throw new NotFoundException('Tracking de instalacion no encontrado');
      this.validateCorrelations(current, record);
      const currentEvent = await tx.integracionEventoEntrante.findUnique({
        where: { idIntegracion_eventType: { idIntegracion: tracking.idIntegracion, eventType } },
      });
      if (currentEvent) {
        if (currentEvent.payloadHash !== payloadHash) {
          throw new ConflictException('El cierre G3 ya fue recibido con un payload diferente');
        }
        return { duplicate: true, result: currentEvent.result };
      }

      if (current.fechaCierreProcesado || current.estadoIntegracion === 'COMPLETADA') {
        throw new ConflictException('La instalacion ya fue completada y requiere revision de su evidencia historica');
      }
      const requestSnapshot = installationSnapshot(current);

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
      const series = [...new Set((record.equipos_instalados as Array<Record<string, unknown>>)
        .map(item => item?.numero_serie ?? item?.numeroSerie ?? item?.serial)
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map(value => value.trim()))];
      const descriptor: PostClosureWork['descriptor'] = {
        idIntegracion: current.idIntegracion, requestId: current.requestId, closureHash: payloadHash, source,
        idProspecto: requestSnapshot.id_prospecto, idPlan: current.idPlan,
        payload: {
          event_id: `g8-g1-activation-${current.requestId}`, trace_id: current.traceId,
          id_empresa: current.idEmpresa, id_ot: Number(record.id_ot),
          id_cliente: updated.idCliente!, id_servicio: updated.idServicio!, id_contrato: current.idContrato,
          rut_cliente: requestSnapshot.persona.rut, equipos: series.map(numero_serie => ({ numero_serie })),
        },
      };
      const postClosure: PostClosureWork = {
        version: 1, descriptor, descriptorHash: sha256Payload(descriptor), audit: 'PENDIENTE',
        g1: { state: 'PENDIENTE_CREACION' },
      };
      await tx.integracionEventoEntrante.create({
        data: {
          idIntegracion: current.idIntegracion,
          source,
          eventType,
          externalReference: current.requestId,
          payloadHash,
          result: { ...eventResult, postClosure } as unknown as Prisma.InputJsonValue,
        },
      });
      return { duplicate: false, result: eventResult, tracking: updated };
    }, {
      maxWait: 10_000,
      timeout: 20_000,
    });

    await this.recoverPostClosure(tracking.idIntegracion);
    // Preserve the webhook response contract; recovery details are available only on local reconcile.
    return { ...processed, result: publicClosureResult(processed.result) };
  }

  /** Called by identical webhooks or the already company-authorized reconcile path. No initial activation. */
  async recoverPostClosure(idIntegracion: number) {
    const initial = await this.postClosureContext(this.prisma, idIntegracion);
    if (!initial.work) return { duplicate: true, tracking: initial.tracking,
      result: publicClosureResult(initial.event?.result), postClosure: { state: 'REQUIERE_EVIDENCIA_HISTORICA' } };

    // Each independent task commits its own progress. A failed audit must not prevent creation of G1 tracking.
    try {
      await this.lockedPostClosure(idIntegracion, async (tx, context) => {
        if (!context.work || context.work.audit === 'COMPLETADA') return;
        await this.auditService.record({
          accion: context.work.descriptor.source === 'WEBHOOK' ? 'RECIBIR_CIERRE_G3' : 'RECONCILIAR_CIERRE_G3',
          entidadAfectada: 'integracion_instalacion_g3', idEntidadAfectada: idIntegracion,
          valorNuevo: { requestId: context.tracking.requestId, traceId: context.tracking.traceId,
            idEmpresa: context.tracking.idEmpresa, idOtG3: context.tracking.idOtG3, estado: 'COMPLETADA', estadoOriginalG3: null },
        }, tx);
        await this.auditService.record({ accion: 'ACTIVAR_SERVICIO_DESDE_G3', entidadAfectada: 'integracion_instalacion_g3',
          idEntidadAfectada: idIntegracion, valorNuevo: publicClosureResult(context.event!.result) as Prisma.InputJsonValue }, tx);
        context.work.audit = 'COMPLETADA';
        await this.savePostClosure(tx, context);
      });
    } catch { /* Durable audit=PENDIENTE; retry does not repeat the commercial activation. */ }

    if (initial.work.g1.state !== 'COMPLETADA' || initial.work.g1.auditPending) {
      let outcome: PostClosureWork['g1'] = { state: 'PENDIENTE_CREACION' };
      try {
        if (this.g1Activation) {
          const payload = initial.work.descriptor.payload;
          const record = await this.g1Activation.afterG3Completion(initial.tracking,
            { idCliente: payload.id_cliente, idServicio: payload.id_servicio },
            { id_ot: payload.id_ot, equipos_instalados: payload.equipos }, payload);
          outcome = { state: record.estadoIntegracion, idIntegracion: record.idIntegracion,
            auditPending: !('auditPending' in record) || record.auditPending !== false };
        }
      } catch (error) {
        outcome = { state: error instanceof ConflictException ? 'ERROR_REQUIERE_REVISION' : 'PENDIENTE_CREACION' };
      }
      try {
        await this.lockedPostClosure(idIntegracion, async (tx, context) => {
          if (!context.work) return;
          // A delayed worker cannot demote a confirmed outcome/progress marker.
          if (context.work.g1.state === 'COMPLETADA' && (outcome.state !== 'COMPLETADA' || !context.work.g1.auditPending)) return;
          context.work.g1 = outcome;
          await this.savePostClosure(tx, context);
        });
      } catch { /* G1's own durable record is recovered by its deterministic eventId. */ }
    }
    const latest = await this.postClosureContext(this.prisma, idIntegracion);
    return { duplicate: true, tracking: latest.tracking, result: publicClosureResult(latest.event?.result),
      postClosure: { audit: latest.work?.audit, g1: latest.work?.g1 } };
  }

  private async postClosureContext(tx: Prisma.TransactionClient, idIntegracion: number) {
    const tracking = await tx.integracionInstalacionG3.findUnique({ where: { idIntegracion } });
    if (!tracking) throw new NotFoundException('Tracking de instalacion no encontrado');
    const event = await tx.integracionEventoEntrante.findUnique({ where: { idIntegracion_eventType: { idIntegracion, eventType: 'WORK_ORDER_COMPLETADA' } } });
    const work = event ? validatePostClosure(event.result, event.payloadHash, tracking) : null;
    return { tracking, event, work };
  }

  private lockedPostClosure(id: number, work: (tx: Prisma.TransactionClient, context: Awaited<ReturnType<G3ClosureProcessor['postClosureContext']>>) => Promise<void>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id_integracion FROM integracion_instalacion_g3 WHERE id_integracion = ${id} FOR UPDATE`;
      await work(tx, await this.postClosureContext(tx, id));
    });
  }

  private savePostClosure(tx: Prisma.TransactionClient, context: Awaited<ReturnType<G3ClosureProcessor['postClosureContext']>>) {
    return tx.integracionEventoEntrante.update({ where: { idEvento: context.event!.idEvento },
      data: { result: { ...closureResult(context.event!.result), postClosure: context.work } as unknown as Prisma.InputJsonValue } });
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
    if (payload.request_id !== tracking.requestId) {
      throw new BadRequestException('La correlacion request_id no corresponde al tracking');
    }
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

}
