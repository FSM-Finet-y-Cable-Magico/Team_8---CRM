// Sanitized G1 reception with the shape declared in respuesta-g1-a-g8-recepcion-equipos (12-11-2026).
export const g1Reception = (over: Record<string, unknown> = {}, devices?: unknown[]) => ({
  clave_evento: 'g1-recepcion-1-930-501', id_empresa: 1, id_ot_g3: 930, request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', estado_recepcion: 'COMPLETA',
  equipos: devices ?? [{ numero_serie: 'QA-ONT-RET-1', resultado: 'RECIBIDO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-13T15:00:00.000Z', id_servicio_externo: 61, detalle: null }],
  ...over,
});

/**
 * Exact JSON G1 main 2131b7f5 serializes from IntegracionesService.consultarRecepciones for the scenarios of its own
 * spec ("baja por morosidad (recepción de equipos)"): OT 990, request g8-retiro-1-15, asignación del servicio 245.
 * clave_evento ends in integracion_cierre.id_cierre; fecha_recepcion is the closure's fechaProceso (Date -> ISO).
 */
export const g1RealReceptionComplete = {
  clave_evento: 'g1-recepcion-1-990-12', id_empresa: 1, id_ot_g3: 990, request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', estado_recepcion: 'COMPLETA',
  equipos: [{ numero_serie: 'ONT-123456', resultado: 'RECIBIDO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-12T15:00:03.512Z', id_servicio_externo: 245, detalle: null }],
};
/** Damaged ONT (estado_fisico DAÑADO) plus a device declared in equipos_faltantes that G1 never had: estado_g1 null. */
export const g1RealReceptionPartial = {
  clave_evento: 'g1-recepcion-1-990-13', id_empresa: 1, id_ot_g3: 990, request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', estado_recepcion: 'PARCIAL',
  equipos: [
    { numero_serie: 'ONT-123456', resultado: 'RECIBIDO_CON_DANO', estado_g1: 'En revisión', fecha_recepcion: '2026-11-12T15:00:03.512Z', id_servicio_externo: 245, detalle: null },
    { numero_serie: 'RTR-999', resultado: 'NO_RECIBIDO', estado_g1: null, fecha_recepcion: null, id_servicio_externo: null, detalle: 'Equipo no recuperado: Cliente no lo entregó' },
  ],
};
/** A retirement G1 recorded as a discrepancy (real code TRANSICION_INVALIDA; unit known to G1): NO_RECIBIDO with "codigo: detalle". */
export const g1RealReceptionDiscrepancy = {
  clave_evento: 'g1-recepcion-1-990-14', id_empresa: 1, id_ot_g3: 990, request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', estado_recepcion: 'NO_RECIBIDA',
  equipos: [{ numero_serie: 'ONT-123456', resultado: 'NO_RECIBIDO', estado_g1: 'Instalado en cliente', fecha_recepcion: null, id_servicio_externo: null,
    detalle: 'TRANSICION_INVALIDA: La unidad está en estado [Instalado en cliente] y la acción requiere origen en: Asignado a técnico, Instalado en cliente. Revisar manualmente.' }],
};
