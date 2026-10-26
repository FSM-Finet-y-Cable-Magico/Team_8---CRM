import { ConflictException } from '@nestjs/common';
import { IntegracionInstalacionG3 } from '@prisma/client';
import { sha256Payload } from './g3-integration.utils';

export type DurableG1Payload = {
  event_id: string; trace_id: string; id_empresa: number; id_ot: number | null;
  id_cliente: number; rut_cliente: string; id_servicio: number; id_contrato: number;
  equipos: Array<{ numero_serie: string }>;
};
export type PostClosureWork = {
  version: 1;
  descriptor: { idIntegracion: number; requestId: string; idProspecto: number; idPlan: number; closureHash: string; source: string; payload: DurableG1Payload };
  descriptorHash: string;
  audit: 'PENDIENTE' | 'COMPLETADA';
  g1: { state: string; idIntegracion?: number; auditPending?: boolean };
};

export function closureResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function publicClosureResult(value: unknown) {
  const result = closureResult(value);
  // The durable descriptor contains the minimum G1 identity; never return it over the G3 API.
  const { postClosure: _work, ...publicResult } = result;
  return publicResult;
}

export function validatePostClosure(value: unknown, eventHash: string, tracking: IntegracionInstalacionG3): PostClosureWork | null {
  const result = closureResult(value);
  if (!result.postClosure) return null;
  const work = result.postClosure as PostClosureWork;
  const descriptor = work.descriptor;
  const payload = descriptor?.payload;
  if (work.version !== 1 || !descriptor || sha256Payload(descriptor) !== work.descriptorHash
    || descriptor.closureHash !== eventHash || descriptor.idIntegracion !== tracking.idIntegracion
    || descriptor.requestId !== tracking.requestId || !payload
    || descriptor.idProspecto !== tracking.idProspecto || descriptor.idPlan !== tracking.idPlan
    || payload.event_id !== `g8-g1-activation-${tracking.requestId}` || payload.trace_id !== tracking.traceId
    || payload.id_empresa !== tracking.idEmpresa || payload.id_contrato !== tracking.idContrato
    || payload.id_cliente !== tracking.idCliente || payload.id_servicio !== tracking.idServicio
    || result.idCliente !== payload.id_cliente || result.idServicio !== payload.id_servicio
    || !tracking.fechaCierreProcesado || tracking.estadoIntegracion !== 'COMPLETADA' || tracking.estadoOtG3 !== 'COMPLETADA'
    || String(payload.id_ot) !== tracking.idOtG3 || !Array.isArray(payload.equipos)
    || result.activated !== true || !['WEBHOOK', 'RECONCILIACION'].includes(descriptor.source)
    || ![payload.id_empresa, payload.id_cliente, payload.id_servicio, payload.id_contrato, payload.id_ot].every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    || typeof payload.rut_cliente !== 'string'
    || payload.equipos.some(item => !item || typeof item.numero_serie !== 'string' || !item.numero_serie.trim())
    || !['PENDIENTE', 'COMPLETADA'].includes(work.audit) || !work.g1) {
    throw new ConflictException('POST_CLOSURE_EVIDENCE_INCONSISTENT');
  }
  return work;
}
