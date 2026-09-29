import { createHash } from 'crypto';
import { G3PresentationState, G3_WORK_ORDER_STATES, G3WorkOrderState } from './g3-integration.types';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(sortValue(value));
}

export function sha256Payload(value: unknown) {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function normalizeG3State(value: unknown): {
  known: boolean;
  original: string | null;
  state: G3PresentationState;
} {
  const original = typeof value === 'string' ? value.trim().toUpperCase() : null;
  const known = Boolean(original && G3_WORK_ORDER_STATES.includes(original as G3WorkOrderState));
  return {
    known,
    original,
    state: known ? original as G3WorkOrderState : 'EN_SEGUIMIENTO',
  };
}

export function hasTechnicalResult(payload: Record<string, unknown>) {
  const result = payload.resultado_tecnico ?? payload.resultado;
  if (typeof result === 'string') return result.trim().length > 0;
  if (Array.isArray(result)) return result.length > 0;
  return Boolean(result && typeof result === 'object' && Object.keys(result as object).length > 0);
}

export function externalWorkOrderId(payload: Record<string, unknown>) {
  const value = payload.id_ot;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export function externalWorkOrderCode(payload: Record<string, unknown>) {
  return typeof payload.codigo_ot === 'string' && payload.codigo_ot.trim()
    ? payload.codigo_ot.trim()
    : null;
}
