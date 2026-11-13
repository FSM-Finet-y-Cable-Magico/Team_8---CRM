/**
 * G1 reception of devices retired by a G3 BAJA OT.
 * Contract: respuesta-g1-a-g8-recepcion-equipos (12-11-2026), GET /api/integraciones/recepciones
 * ?id_empresa=N&request_id=... [&id_ot=N], X-API-KEY, envelope { success, data } (unwrapped by the client):
 *   data = { clave_evento, id_empresa, id_ot_g3, request_id, tipo_ot, estado_recepcion, equipos[] }
 *   equipo = { numero_serie, resultado, estado_g1, fecha_recepcion, id_servicio_externo, detalle }
 * clave_evento = g1-recepcion-{id_empresa}-{id_ot}-{id_cierre}; it changes when G3 corrects the closure.
 * FINET ratified that this G1 transition after G3's approved closure is sufficient evidence (no second
 * warehouse scan); it does NOT remove the reconciliation of serials, company, OT and service.
 * Fail closed: unknown fields, other company/OT/request, malformed values -> invalid, never success.
 */
export const G1_RECEPTION_STATES = ['COMPLETA', 'PARCIAL', 'NO_RECIBIDA', 'SIN_EQUIPOS_RETIRADOS'] as const;
export const G1_DEVICE_RESULTS = ['RECIBIDO', 'RECIBIDO_CON_DANO', 'NO_RECIBIDO'] as const;
export const G1_ACCEPTED_RESULTS = ['RECIBIDO', 'RECIBIDO_CON_DANO'];

export type G1ReceptionDevice = {
  numeroSerie: string; resultado: (typeof G1_DEVICE_RESULTS)[number]; estadoG1: string; fechaRecepcion: Date | null;
  idServicioExterno: number | null; detalle: string | null;
};
export type G1Reception = {
  claveEvento: string; idEmpresa: number; idOtG3: number; requestId: string;
  estadoRecepcion: (typeof G1_RECEPTION_STATES)[number]; equipos: G1ReceptionDevice[];
};
export type G1ReceptionParse = { ok: true; reception: G1Reception } | { ok: false; code: string; message: string };

const ROOT_FIELDS = new Set(['clave_evento', 'id_empresa', 'id_ot_g3', 'request_id', 'tipo_ot', 'estado_recepcion', 'equipos']);
const DEVICE_FIELDS = new Set(['numero_serie', 'resultado', 'estado_g1', 'fecha_recepcion', 'id_servicio_externo', 'detalle']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const fail = (code: string, message: string): G1ReceptionParse => ({ ok: false, code, message });

export function parseG1Reception(data: unknown, expected: { idEmpresa: number; idOtG3: number; requestId: string }): G1ReceptionParse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('G1_RESPUESTA_INVALIDA', 'G1 no devolvió un objeto de recepción');
  const root = data as Record<string, unknown>;
  const unknown = Object.keys(root).filter(key => !ROOT_FIELDS.has(key));
  if (unknown.length) return fail('G1_CAMPOS_FUERA_DE_CONTRATO', `G1 devolvió campos fuera de contrato: ${unknown.join(', ')}`);
  if (root.id_empresa !== expected.idEmpresa) return fail('G1_EMPRESA_AJENA', 'La recepción corresponde a otra empresa');
  if (root.id_ot_g3 !== expected.idOtG3) return fail('G1_OT_AJENA', 'La recepción corresponde a otra OT');
  if (root.request_id !== expected.requestId) return fail('G1_SOLICITUD_AJENA', 'La recepción corresponde a otra solicitud');
  if (root.tipo_ot !== 'BAJA') return fail('G1_TIPO_OT_INVALIDO', 'La recepción no corresponde a una OT de BAJA');
  const claveEvento = root.clave_evento;
  const keyPrefix = `g1-recepcion-${expected.idEmpresa}-${expected.idOtG3}-`;
  if (typeof claveEvento !== 'string' || claveEvento.length > 150 || !claveEvento.startsWith(keyPrefix) || !/^[A-Za-z0-9_-]+$/.test(claveEvento.slice(keyPrefix.length))) {
    return fail('G1_CLAVE_EVENTO_INVALIDA', 'La clave_evento no corresponde a la empresa y OT');
  }
  if (!G1_RECEPTION_STATES.includes(root.estado_recepcion as never)) return fail('G1_ESTADO_RECEPCION_INVALIDO', 'Estado de recepción desconocido');
  if (!Array.isArray(root.equipos) || root.equipos.length > 1000) return fail('G1_EQUIPOS_INVALIDOS', 'La lista de equipos es inválida');
  const equipos: G1ReceptionDevice[] = [];
  const seen = new Set<string>();
  for (const raw of root.equipos) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('G1_EQUIPOS_INVALIDOS', 'Un equipo de la recepción es inválido');
    const item = raw as Record<string, unknown>;
    const extra = Object.keys(item).filter(key => !DEVICE_FIELDS.has(key));
    if (extra.length) return fail('G1_CAMPOS_FUERA_DE_CONTRATO', `Equipo con campos fuera de contrato: ${extra.join(', ')}`);
    const serie = typeof item.numero_serie === 'string' ? item.numero_serie.trim().toUpperCase() : '';
    if (!serie || serie.length > 100) return fail('G1_EQUIPOS_INVALIDOS', 'Equipo sin número de serie');
    if (seen.has(serie)) return fail('G1_SERIE_DUPLICADA', `Serie duplicada en la recepción: ${serie}`);
    seen.add(serie);
    if (!G1_DEVICE_RESULTS.includes(item.resultado as never)) return fail('G1_RESULTADO_INVALIDO', `Resultado desconocido para ${serie}`);
    if (typeof item.estado_g1 !== 'string' || !item.estado_g1.trim() || item.estado_g1.length > 60) return fail('G1_EQUIPOS_INVALIDOS', `estado_g1 inválido para ${serie}`);
    if (item.fecha_recepcion !== null && item.fecha_recepcion !== undefined && (typeof item.fecha_recepcion !== 'string' || !ISO.test(item.fecha_recepcion) || Number.isNaN(Date.parse(item.fecha_recepcion)))) {
      return fail('G1_EQUIPOS_INVALIDOS', `fecha_recepcion inválida para ${serie}`);
    }
    if (item.id_servicio_externo !== null && item.id_servicio_externo !== undefined && !positiveId(item.id_servicio_externo)) {
      return fail('G1_EQUIPOS_INVALIDOS', `id_servicio_externo inválido para ${serie}`);
    }
    if (item.detalle !== null && item.detalle !== undefined && (typeof item.detalle !== 'string' || item.detalle.length > 1000)) {
      return fail('G1_EQUIPOS_INVALIDOS', `detalle inválido para ${serie}`);
    }
    equipos.push({
      numeroSerie: serie, resultado: item.resultado as G1ReceptionDevice['resultado'], estadoG1: item.estado_g1,
      fechaRecepcion: typeof item.fecha_recepcion === 'string' ? new Date(item.fecha_recepcion) : null,
      idServicioExterno: positiveId(item.id_servicio_externo) ? item.id_servicio_externo : null,
      detalle: typeof item.detalle === 'string' ? item.detalle : null,
    });
  }
  return { ok: true, reception: { claveEvento, idEmpresa: expected.idEmpresa, idOtG3: expected.idOtG3, requestId: expected.requestId,
    estadoRecepcion: root.estado_recepcion as G1Reception['estadoRecepcion'], equipos } };
}
