// Sanitized G1 reception with the shape declared in respuesta-g1-a-g8-recepcion-equipos (12-11-2026).
export const g1Reception = (over: Record<string, unknown> = {}, devices?: unknown[]) => ({
  clave_evento: 'g1-recepcion-1-930-501', id_empresa: 1, id_ot_g3: 930, request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', estado_recepcion: 'COMPLETA',
  equipos: devices ?? [{ numero_serie: 'QA-ONT-RET-1', resultado: 'RECIBIDO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-13T15:00:00.000Z', id_servicio_externo: 61, detalle: null }],
  ...over,
});
