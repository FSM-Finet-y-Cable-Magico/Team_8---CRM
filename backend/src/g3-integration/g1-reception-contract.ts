import { G1_RECEIVED_STATES } from './withdrawal-closure';

/**
 * Evento PROPUESTO de G1 (inventario) que confirma la recepción física de equipos retirados. NO RATIFICADO.
 * Solo valida: no hay endpoint ni escritura. Una vez aprobado, G8 guardaría cada confirmación válida en
 * g8_retiros.recepcion_g1 (clave idempotente única); un evento repetido no genera una segunda recepción.
 */
export const G1_RECEPTION_CONTRACT_STATUS = 'PROPUESTO_NO_RATIFICADO' as const;
export const G1_RECEPTION_RESULTS = ['RECIBIDO', 'RECIBIDO_CON_DANO', 'NO_RECIBIDO'] as const;

export type G1ReceptionEvent = {
  clave_evento: string; id_empresa: number; id_ot_g3: number; request_id: string;
  equipos: Array<{ numero_serie: string; resultado: (typeof G1_RECEPTION_RESULTS)[number]; estado_g1: string; fecha_recepcion: string | null }>;
};

const FIELDS = ['clave_evento', 'id_empresa', 'id_ot_g3', 'request_id', 'equipos'];

export function parseG1ReceptionEvent(input: unknown, expected: { idEmpresa: number; idOtG3: number; requestId: string }): G1ReceptionEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('G1_RECEPTION_EVENT_INVALID');
  const event = input as Record<string, unknown>;
  if (Object.keys(event).some(key => !FIELDS.includes(key))) throw new Error('G1_RECEPTION_EVENT_UNKNOWN_FIELD');
  if (event.id_empresa !== expected.idEmpresa || event.id_ot_g3 !== expected.idOtG3 || event.request_id !== expected.requestId) {
    throw new Error('G1_RECEPTION_EVENT_REFERENCE_MISMATCH');
  }
  if (typeof event.clave_evento !== 'string' || !/^\S{8,100}$/.test(event.clave_evento)) throw new Error('G1_RECEPTION_EVENT_KEY_INVALID');
  if (!Array.isArray(event.equipos) || event.equipos.length === 0 || event.equipos.length > 200) throw new Error('G1_RECEPTION_EVENT_EQUIPMENT_INVALID');
  const equipos = event.equipos.map(item => {
    const row = item as Record<string, unknown>;
    if (typeof row.numero_serie !== 'string' || !row.numero_serie.trim() || row.numero_serie.length > 80) throw new Error('G1_RECEPTION_EVENT_EQUIPMENT_INVALID');
    if (!G1_RECEPTION_RESULTS.includes(row.resultado as never)) throw new Error('G1_RECEPTION_EVENT_RESULT_INVALID');
    const received = row.resultado !== 'NO_RECIBIDO';
    if (typeof row.estado_g1 !== 'string' || (received && !G1_RECEIVED_STATES.includes(row.estado_g1))) throw new Error('G1_RECEPTION_EVENT_STATE_INVALID');
    const date = row.fecha_recepcion ?? null;
    if (received ? (typeof date !== 'string' || Number.isNaN(Date.parse(date))) : date !== null) throw new Error('G1_RECEPTION_EVENT_DATE_INVALID');
    return { numero_serie: row.numero_serie.trim().toUpperCase(), resultado: row.resultado as G1ReceptionEvent['equipos'][number]['resultado'], estado_g1: row.estado_g1, fecha_recepcion: date as string | null };
  });
  if (new Set(equipos.map(item => item.numero_serie)).size !== equipos.length) throw new Error('G1_RECEPTION_EVENT_DUPLICATED_SERIAL');
  return { clave_evento: event.clave_evento, id_empresa: expected.idEmpresa, id_ot_g3: expected.idOtG3, request_id: expected.requestId, equipos };
}

/** Solo los equipos efectivamente recibidos cuentan como confirmación para la baja efectiva. */
export function receptionConfirmations(event: G1ReceptionEvent) {
  return event.equipos.filter(item => item.resultado !== 'NO_RECIBIDO')
    .map(item => ({ numeroSerie: item.numero_serie, idOtG3: event.id_ot_g3, estadoG1: item.estado_g1 }));
}
