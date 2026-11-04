// Integration identifiers belong to the transport contract, not to UI copy.
export function userFacingMessage(value: unknown, fallback = 'No se pudo completar la operación. Inténtalo nuevamente.') {
  const message = Array.isArray(value) ? value.filter(item => typeof item === 'string').join(', ') : value;
  if (typeof message !== 'string' || !message.trim()) return fallback;
  if (/(?:\bG[1238]\b|\bgrupo\s*[1238]\b|(?:^|_)G[1238](?:_|$)|LEGACY_LOCAL|BLOQUEADO_CONTRATO|ratificaci[oó]n|\bpayload\b|\bprisma\b|\bCU-\d+)/i.test(message)) return fallback;
  return message;
}

export function userFacingApiError(message: unknown, path = '', status?: number) {
  const raw = Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : '';
  if (/OT asociada no consta completada|orden.*pendiente.*cerrar.*ticket/i.test(raw)) {
    return 'La orden técnica asociada está pendiente. Podrás resolver o cerrar el ticket cuando esté completada.';
  }
  const fallback = /\/tickets\b/.test(path) ? 'No se pudo actualizar el ticket. Inténtalo nuevamente.'
    : /\/service-withdrawals\b/.test(path) ? 'No se pudo registrar la gestión de retiro. Inténtalo nuevamente.'
    : /\/integrations\/g3\b/.test(path) ? 'La gestión de instalaciones no está disponible en este momento. Inténtalo más tarde.'
    : /\/integrations\/g1\b/.test(path) ? 'No se pudo consultar el inventario. Inténtalo nuevamente más tarde.'
    : /\/integrations\/g2\b/.test(path) ? 'El servicio de atención al cliente no está disponible en este momento.'
    : 'No se pudo completar la operación. Inténtalo nuevamente.';
  if (status === 403) return userFacingMessage(message, 'No tienes permisos para realizar esta acción.');
  if (status != null && status >= 500) return fallback;
  if (/Network Error|Failed to fetch|ECONN|timeout|Request failed with status code/i.test(raw)) return 'No se pudo conectar con el servicio. Inténtalo nuevamente.';
  return userFacingMessage(message, fallback);
}
