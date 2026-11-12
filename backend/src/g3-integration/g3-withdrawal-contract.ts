/**
 * Contrato S2S PROPUESTO entre G8 y G3 para el retiro técnico (OT tipo BAJA). NO RATIFICADO.
 *
 * Este módulo solo construye y valida mensajes: no hay cliente HTTP, endpoint ni despacho activo.
 * G3 hoy acepta `tipo_ot = 'BAJA'` únicamente desde su propia interfaz (ADMIN/JEFE_TECNICO) y su aviso de
 * cierre no transporta servicio, solicitud ni ticket. Hasta que G3 publique y ratifique un endpoint
 * equivalente, `G3_WITHDRAWAL_CONTRACT_STATUS` permanece en PROPUESTO y la solicitud queda
 * `estadoDespachoTecnico = 'BLOQUEADO_CONTRATO_G3'`. Especificación: docs/qa-libro-control/baja-morosidad-contrato-g3-g1.md
 */
export const G3_WITHDRAWAL_CONTRACT_STATUS = 'PROPUESTO_NO_RATIFICADO' as const;

/** Estados de OT publicados por G3 (fsm/backend/src/ordenes). */
export const G3_OT_STATES = ['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE', 'PENDIENTE_APROBACION', 'COMPLETADA', 'CANCELADA'] as const;
/** Diagnósticos de equipo retirado: lista fija de G1, transportada por G3. */
export const G1_WITHDRAWAL_DIAGNOSES = ['No enciende', 'Se reinicia continuamente', 'Sin señal óptica', 'Copla o puerto dañado',
  'Falla de configuración', 'Daño físico visible', 'Causa desconocida', 'Otro'] as const;

export type WithdrawalSnapshot = {
  idEmpresa: number; idCliente: number; idContrato: number; idServicio: number; idSolicitudRetiro: number; idTicket: number;
  rutCliente: string; direccionRetiro: string; comunaRetiro?: string | null; observaciones?: string | null; traceId: string;
};

export type G3WithdrawalRequest = {
  request_id: string; trace_id: string; tipo_ot: 'BAJA'; motivo: 'MOROSIDAD';
  id_empresa: number; id_cliente_externo: number; id_contrato_externo: number; id_servicio_externo: number;
  id_solicitud_retiro_externa: number; id_ticket_externo: number;
  rut_cliente: string; direccion_retiro: string; comuna_retiro: string | null; observaciones: string | null;
};

const positiveInt = (value: unknown) => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Clave idempotente determinista: el mismo retiro siempre produce la misma clave (reintentos sin duplicar OT). */
export function withdrawalRequestId(idEmpresa: number, idSolicitudRetiro: number) {
  return `g8-retiro-${idEmpresa}-${idSolicitudRetiro}`;
}

export function buildG3WithdrawalRequest(snapshot: WithdrawalSnapshot): G3WithdrawalRequest {
  const ids = [snapshot.idEmpresa, snapshot.idCliente, snapshot.idContrato, snapshot.idServicio, snapshot.idSolicitudRetiro, snapshot.idTicket];
  if (!ids.every(positiveInt)) throw new Error('G3_WITHDRAWAL_INVALID_REFERENCES');
  if (!UUID_V4.test(snapshot.traceId)) throw new Error('G3_WITHDRAWAL_INVALID_TRACE');
  const rut = snapshot.rutCliente.trim(); const address = snapshot.direccionRetiro.trim();
  if (!/^\d{7,8}-[\dkK]$/.test(rut)) throw new Error('G3_WITHDRAWAL_INVALID_RUT');
  if (!address) throw new Error('G3_WITHDRAWAL_ADDRESS_REQUIRED');
  return {
    request_id: withdrawalRequestId(snapshot.idEmpresa, snapshot.idSolicitudRetiro), trace_id: snapshot.traceId,
    tipo_ot: 'BAJA', motivo: 'MOROSIDAD',
    id_empresa: snapshot.idEmpresa, id_cliente_externo: snapshot.idCliente, id_contrato_externo: snapshot.idContrato,
    id_servicio_externo: snapshot.idServicio, id_solicitud_retiro_externa: snapshot.idSolicitudRetiro, id_ticket_externo: snapshot.idTicket,
    rut_cliente: rut.toUpperCase(), direccion_retiro: address.slice(0, 200), comuna_retiro: snapshot.comunaRetiro?.trim() || null,
    observaciones: snapshot.observaciones?.trim().slice(0, 1000) || null,
  };
}

export type G3WithdrawalEvent = {
  clave_idempotencia: string; request_id: string; id_ot: number; id_empresa: number; id_solicitud_retiro_externa: number;
  estado_ot: (typeof G3_OT_STATES)[number]; cierre_aprobado: boolean; fecha_completada: string | null;
  equipos_retirados: Array<{ numero_serie: string; diagnostico: string | null }>;
  equipos_faltantes: Array<{ numero_serie: string; motivo: string | null }>;
};

const EVENT_FIELDS = ['clave_idempotencia', 'request_id', 'id_ot', 'id_empresa', 'id_solicitud_retiro_externa', 'estado_ot',
  'cierre_aprobado', 'fecha_completada', 'equipos_retirados', 'equipos_faltantes'];

/**
 * Valida un evento de G3 sobre una OT de retiro ANTES de almacenarlo como evidencia. Rechaza campos fuera de
 * contrato, referencias cruzadas, aprobaciones incoherentes y series duplicadas. Un evento válido no aplica
 * la baja por sí mismo: queda como recibo y la baja efectiva lo evalúa con el inventario de G1.
 */
export function parseG3WithdrawalEvent(input: unknown, expected: { idEmpresa: number; idSolicitudRetiro: number }): G3WithdrawalEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('G3_WITHDRAWAL_EVENT_INVALID');
  const event = input as Record<string, unknown>;
  if (Object.keys(event).some(key => !EVENT_FIELDS.includes(key))) throw new Error('G3_WITHDRAWAL_EVENT_UNKNOWN_FIELD');
  if (!positiveInt(event.id_ot) || event.id_empresa !== expected.idEmpresa || event.id_solicitud_retiro_externa !== expected.idSolicitudRetiro) {
    throw new Error('G3_WITHDRAWAL_EVENT_REFERENCE_MISMATCH');
  }
  if (event.request_id !== withdrawalRequestId(expected.idEmpresa, expected.idSolicitudRetiro)) throw new Error('G3_WITHDRAWAL_EVENT_REFERENCE_MISMATCH');
  if (!G3_OT_STATES.includes(event.estado_ot as never)) throw new Error('G3_WITHDRAWAL_EVENT_STATE_INVALID');
  if (typeof event.cierre_aprobado !== 'boolean' || (event.cierre_aprobado && event.estado_ot !== 'COMPLETADA')) throw new Error('G3_WITHDRAWAL_EVENT_APPROVAL_INVALID');
  const date = event.fecha_completada;
  if (date !== null && (typeof date !== 'string' || Number.isNaN(Date.parse(date)))) throw new Error('G3_WITHDRAWAL_EVENT_DATE_INVALID');
  if (typeof event.clave_idempotencia !== 'string' || event.clave_idempotencia !== `${event.id_ot}:${date ?? 'sin-cierre'}`) {
    throw new Error('G3_WITHDRAWAL_EVENT_KEY_INVALID');
  }
  const list = (value: unknown) => Array.isArray(value) && value.length <= 200 ? value : null;
  const retired = list(event.equipos_retirados); const missing = list(event.equipos_faltantes);
  if (!retired || !missing) throw new Error('G3_WITHDRAWAL_EVENT_EQUIPMENT_INVALID');
  const serial = (item: unknown) => {
    const value = (item as { numero_serie?: unknown })?.numero_serie;
    if (typeof value !== 'string' || !value.trim() || value.length > 80) throw new Error('G3_WITHDRAWAL_EVENT_EQUIPMENT_INVALID');
    return value.trim().toUpperCase();
  };
  const equiposRetirados = retired.map(item => {
    const diagnostico = (item as { diagnostico?: unknown }).diagnostico ?? null;
    if (diagnostico !== null && !G1_WITHDRAWAL_DIAGNOSES.includes(diagnostico as never)) throw new Error('G3_WITHDRAWAL_EVENT_DIAGNOSIS_INVALID');
    return { numero_serie: serial(item), diagnostico: diagnostico as string | null };
  });
  const equiposFaltantes = missing.map(item => ({ numero_serie: serial(item), motivo: typeof (item as { motivo?: unknown }).motivo === 'string' ? String((item as { motivo: string }).motivo).slice(0, 200) : null }));
  const all = [...equiposRetirados, ...equiposFaltantes].map(item => item.numero_serie);
  if (new Set(all).size !== all.length) throw new Error('G3_WITHDRAWAL_EVENT_DUPLICATED_SERIAL');
  return {
    clave_idempotencia: event.clave_idempotencia, request_id: event.request_id as string, id_ot: event.id_ot as number, id_empresa: expected.idEmpresa,
    id_solicitud_retiro_externa: expected.idSolicitudRetiro, estado_ot: event.estado_ot as G3WithdrawalEvent['estado_ot'],
    cierre_aprobado: event.cierre_aprobado, fecha_completada: date as string | null, equipos_retirados: equiposRetirados, equipos_faltantes: equiposFaltantes,
  };
}
