type WorkOrderCompletionDecision = {
  allowed: boolean;
  reason: 'ALLOWED' | 'ALREADY_COMPLETED' | 'TERMINAL_INCOMPATIBLE' | 'KNOWN_NOT_CLOSABLE' | 'UNKNOWN_STATE';
};

const CLOSABLE_STATES = new Set(['pendiente', 'asignada', 'en curso', 'en progreso', 'programada']);
const COMPLETED_STATES = new Set(['completada', 'cerrada']);
const TERMINAL_INCOMPATIBLE_STATES = new Set(['cancelada']);
const KNOWN_NOT_CLOSABLE_STATES = new Set(['pendiente cliente ausente']);

export function normalizeWorkOrderState(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('es-CL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

export function workOrderCompletionDecision(state?: string | null): WorkOrderCompletionDecision {
  const normalized = normalizeWorkOrderState(state);

  if (CLOSABLE_STATES.has(normalized)) {
    return { allowed: true, reason: 'ALLOWED' };
  }

  if (COMPLETED_STATES.has(normalized)) {
    return { allowed: false, reason: 'ALREADY_COMPLETED' };
  }

  if (TERMINAL_INCOMPATIBLE_STATES.has(normalized)) {
    return { allowed: false, reason: 'TERMINAL_INCOMPATIBLE' };
  }

  if (KNOWN_NOT_CLOSABLE_STATES.has(normalized)) {
    return { allowed: false, reason: 'KNOWN_NOT_CLOSABLE' };
  }

  return { allowed: false, reason: 'UNKNOWN_STATE' };
}
