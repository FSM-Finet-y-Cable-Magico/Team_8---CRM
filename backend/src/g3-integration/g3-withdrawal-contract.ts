import { validateRut } from '../rut/rut.util';

/**
 * Wire contract of the BAJA (withdrawal for morosity) OT with G3.
 * Verified against Team-3-FSM main @ 8a8e5dd0b82e25001bddad8b98602bcb90181505:
 *  - POST /api/integraciones/ordenes-baja (SolicitudBajaDto, BajasService.crear)
 *  - POST /api/integraciones/ordenes-baja/:request_id/cancelacion (CancelarBajaDto)
 *  - GET  /api/integraciones/ordenes/:id?id_empresa=N (IntegracionesService.orden)
 * Every response is enveloped as { success, data }; errors carry { codigo, message }.
 * G3 hashes the WHOLE request body (trace_id included) for idempotency, so a retry must resend
 * the exact persisted snapshot: same request_id and same content -> 200 duplicado; any change -> 409.
 */
export const G3_WITHDRAWAL_TYPE = 'BAJA';
export const G3_WITHDRAWAL_MOTIVE = 'MOROSIDAD';
/**
 * Causes G8 sends in `motivo` (FINET 13-11-2026). G3's S2S endpoint receives `motivo` but today handles the request as
 * morosity: VOLUNTARIA is only dispatched once G3 ratifies it (G3_WITHDRAWAL_VOLUNTARY_ENABLED=true in G8). G8 never
 * sends a voluntary termination disguised as MOROSIDAD. tipo_ot stays BAJA and G3's states are unchanged.
 */
export const G3_WITHDRAWAL_MOTIVES = ['MOROSIDAD', 'VOLUNTARIA'] as const;
export type G3WithdrawalMotive = (typeof G3_WITHDRAWAL_MOTIVES)[number];
export const G3_OT_STATES = ['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE', 'PENDIENTE_APROBACION', 'COMPLETADA', 'CANCELADA'] as const;
export type G3OtState = (typeof G3_OT_STATES)[number];
/** G3 ESTADOS_CANCELABLES: from PENDIENTE_APROBACION on, the devices already left the customer's home. */
export const G3_CANCELLABLE_STATES: readonly G3OtState[] = ['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE'];

const REQUEST_ID = /^g8-retiro-(\d+)-(\d+)$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 2147483647;

export function withdrawalRequestId(idEmpresa: number, idSolicitudRetiro: number) {
  if (!positiveId(idEmpresa) || !positiveId(idSolicitudRetiro)) throw new Error('WITHDRAWAL_REQUEST_ID_INVALID');
  return `g8-retiro-${idEmpresa}-${idSolicitudRetiro}`;
}

export function parseWithdrawalRequestId(requestId: unknown) {
  const match = typeof requestId === 'string' ? REQUEST_ID.exec(requestId) : null;
  return match ? { idEmpresa: Number(match[1]), idSolicitudRetiro: Number(match[2]) } : null;
}

export type G3WithdrawalOrderPayload = {
  request_id: string; trace_id: string; tipo_ot: typeof G3_WITHDRAWAL_TYPE; motivo: G3WithdrawalMotive;
  id_empresa: number; id_cliente_externo: number; id_contrato_externo: number; id_servicio_externo: number;
  id_solicitud_retiro_externa: number; id_ticket_externo: number;
  rut_cliente: string; direccion_retiro: string; comuna_retiro: string; observaciones?: string;
};

export class WithdrawalPayloadError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Builds and validates the snapshot that is persisted once and resent verbatim on every retry. */
export function buildWithdrawalOrderPayload(input: {
  idEmpresa: number; idSolicitudRetiro: number; idCliente: number; idContrato: number; idServicio: number; idTicket: number;
  traceId: string; rut: string | null; direccion: string | null; comuna: string | null; observaciones?: string | null;
  motivo?: G3WithdrawalMotive;
}): G3WithdrawalOrderPayload {
  const motivo = input.motivo ?? G3_WITHDRAWAL_MOTIVE;
  if (!G3_WITHDRAWAL_MOTIVES.includes(motivo)) throw new WithdrawalPayloadError('MOTIVO_INVALIDO', 'Motivo de retiro no soportado');
  for (const [field, value] of Object.entries({ idEmpresa: input.idEmpresa, idSolicitudRetiro: input.idSolicitudRetiro, idCliente: input.idCliente,
    idContrato: input.idContrato, idServicio: input.idServicio, idTicket: input.idTicket })) {
    if (!positiveId(value)) throw new WithdrawalPayloadError('ID_INVALIDO', `${field} debe ser un entero positivo`);
  }
  if (!UUID_V4.test(input.traceId)) throw new WithdrawalPayloadError('TRACE_ID_INVALIDO', 'trace_id debe ser un UUID v4');
  const rut = input.rut ? validateRut(input.rut) : null;
  if (!rut?.valid || !rut.normalized) throw new WithdrawalPayloadError('RUT_INVALIDO', 'El RUT del cliente no es válido');
  const direccion = input.direccion?.trim() ?? '';
  const comuna = input.comuna?.trim() ?? '';
  if (!direccion || direccion.length > 200) throw new WithdrawalPayloadError('DIRECCION_INVALIDA', 'La dirección de retiro es obligatoria (máximo 200 caracteres)');
  if (!comuna || comuna.length > 80) throw new WithdrawalPayloadError('COMUNA_INVALIDA', 'La comuna de retiro es obligatoria (máximo 80 caracteres)');
  const observaciones = input.observaciones?.trim();
  if (observaciones && observaciones.length > 1000) throw new WithdrawalPayloadError('OBSERVACIONES_INVALIDAS', 'Observaciones demasiado largas');
  return {
    request_id: withdrawalRequestId(input.idEmpresa, input.idSolicitudRetiro),
    trace_id: input.traceId.toLowerCase(),
    tipo_ot: G3_WITHDRAWAL_TYPE,
    motivo,
    id_empresa: input.idEmpresa,
    id_cliente_externo: input.idCliente,
    id_contrato_externo: input.idContrato,
    id_servicio_externo: input.idServicio,
    id_solicitud_retiro_externa: input.idSolicitudRetiro,
    id_ticket_externo: input.idTicket,
    // G3 requires ^\d{7,8}-[\dK]$ with a valid check digit.
    rut_cliente: rut.normalized,
    direccion_retiro: direccion,
    comuna_retiro: comuna,
    ...(observaciones ? { observaciones } : {}),
  };
}

export type G3HttpReply = { status: number | null; body: unknown };

export type DispatchOutcome =
  | { kind: 'ACEPTADA'; idOt: number; estado: string | null; duplicado: boolean }
  /** Business rejection: never retried automatically; needs commercial/technical review. */
  | { kind: 'RECHAZADA'; status: number; code: string; message: string }
  /** Timeout, network or 5xx/429: retry later with the SAME snapshot. */
  | { kind: 'REINTENTABLE'; status: number | null; code: string; message: string }
  /** 2xx whose correlation does not match: treated as an integration incident, not as success. */
  | { kind: 'INCONSISTENTE'; status: number; code: string; message: string };

type Envelope = { success?: unknown; data?: unknown; codigo?: unknown; message?: unknown };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function errorCode(body: unknown, fallback: string) {
  const envelope = record(body) as Envelope | null;
  const nested = record(envelope?.message);
  const code = envelope?.codigo ?? nested?.codigo;
  return typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code) ? code : fallback;
}

function transient(reply: G3HttpReply): DispatchOutcome | null {
  if (reply.status === null) return { kind: 'REINTENTABLE', status: null, code: 'G3_NO_DISPONIBLE', message: 'No hubo respuesta de G3 (red o tiempo de espera)' };
  if (reply.status === 408 || reply.status === 429 || reply.status >= 500) {
    return { kind: 'REINTENTABLE', status: reply.status, code: errorCode(reply.body, `G3_HTTP_${reply.status}`), message: 'G3 no pudo procesar la solicitud en este momento' };
  }
  return null;
}

const REJECTION_MESSAGES: Record<string, string> = {
  REQUEST_ID_CON_OTRO_CONTENIDO: 'G3 ya recibió esta solicitud con un contenido distinto; requiere revisión, no se reintenta',
  OT_BAJA_ACTIVA: 'G3 informa otra orden de retiro activa para el cliente; requiere revisión',
  CLIENTE_NO_ENCONTRADO: 'G3 no encontró al cliente por su RUT en la empresa',
  DIRECCION_INVALIDA: 'G3 rechazó la dirección o la comuna del retiro',
  EMPRESA_NO_CORRESPONDE: 'La credencial S2S no tiene acceso a la empresa',
  REQUEST_ID_INCONSISTENTE: 'La clave de la solicitud no corresponde a la empresa',
};

export function interpretWithdrawalOrderReply(reply: G3HttpReply, expected: { requestId: string; traceId: string }): DispatchOutcome {
  const retry = transient(reply);
  if (retry) return retry;
  const status = reply.status!;
  if (status !== 200 && status !== 201) {
    const code = errorCode(reply.body, status === 401 ? 'G3_AUTENTICACION' : `G3_HTTP_${status}`);
    return { kind: 'RECHAZADA', status, code, message: REJECTION_MESSAGES[code] ?? 'G3 rechazó la solicitud de retiro' };
  }
  const envelope = record(reply.body) as Envelope | null;
  const data = record(envelope?.data);
  const bad = (code: string, message: string): DispatchOutcome => ({ kind: 'INCONSISTENTE', status, code, message });
  if (envelope?.success !== true || !data) return bad('G3_RESPUESTA_INVALIDA', 'G3 respondió sin la envoltura { success, data }');
  if (data.request_id !== expected.requestId) return bad('G3_CORRELACION_INVALIDA', 'G3 respondió con otro request_id');
  if (!positiveId(data.id_ot)) return bad('G3_OT_NO_INFORMADA', 'G3 no informó un id de OT válido');
  // A 200 replay may omit trace_id and dates; when present they must match.
  if (data.trace_id !== undefined && data.trace_id !== null && String(data.trace_id).toLowerCase() !== expected.traceId.toLowerCase()) {
    return bad('G3_CORRELACION_INVALIDA', 'G3 respondió con otro trace_id');
  }
  if (data.tipo_ot !== undefined && data.tipo_ot !== G3_WITHDRAWAL_TYPE) return bad('G3_TIPO_OT_INVALIDO', 'La OT informada no es de BAJA');
  if (status === 200 && data.duplicado !== true) return bad('G3_RESPUESTA_INVALIDA', 'Un 200 de G3 debe ser una repetición (duplicado=true)');
  const estado = typeof data.estado === 'string' ? data.estado : null;
  return { kind: 'ACEPTADA', idOt: data.id_ot as number, estado, duplicado: status === 200 };
}

export type CancelOutcome =
  | { kind: 'CANCELADA'; idOt: number | null; duplicado: boolean }
  | { kind: 'NO_APLICABLE'; status: number; code: string; message: string }
  | { kind: 'RECHAZADA'; status: number; code: string; message: string }
  | { kind: 'REINTENTABLE'; status: number | null; code: string; message: string };

export function interpretWithdrawalCancelReply(reply: G3HttpReply, requestId: string): CancelOutcome {
  const retry = transient(reply);
  if (retry) return retry as CancelOutcome;
  const status = reply.status!;
  if (status === 409) {
    return { kind: 'NO_APLICABLE', status, code: errorCode(reply.body, 'CANCELACION_NO_APLICABLE'),
      message: 'G3 ya no permite cancelar: el técnico cerró el retiro. Corresponde una regularización comercial, no una cancelación.' };
  }
  if (status !== 200 && status !== 201) {
    return { kind: 'RECHAZADA', status, code: errorCode(reply.body, `G3_HTTP_${status}`), message: 'G3 rechazó la cancelación del retiro' };
  }
  const data = record((record(reply.body) as Envelope | null)?.data);
  if ((record(reply.body) as Envelope | null)?.success !== true || !data || data.request_id !== requestId || data.estado !== 'CANCELADA') {
    return { kind: 'RECHAZADA', status, code: 'G3_RESPUESTA_INVALIDA', message: 'G3 respondió una cancelación que no corresponde a la solicitud' };
  }
  return { kind: 'CANCELADA', idOt: positiveId(data.id_ot) ? data.id_ot : null, duplicado: data.duplicado === true };
}

export type OrderReadOutcome =
  | { kind: 'LEIDA'; estado: G3OtState; fechaCompletada: string | null }
  | { kind: 'NO_DISPONIBLE'; status: number | null; code: string; message: string }
  | { kind: 'INCONSISTENTE'; status: number; code: string; message: string };

/**
 * GET of a BAJA OT. `origen_integracion` only describes installation requests, so it is null for a
 * BAJA: correlation is the persisted id_ot + id_empresa + tipo BAJA (the request_id/trace_id/customer/contract/service/
 * ticket were correlated when the OT was accepted and when the BAJA closure was stored). FINET 13-11-2026: if G3 does
 * include any of those identifiers in the GET, each one present must match too (stricter, never a contract change).
 */
export type OrderReadExpectation = {
  idOt: number; idEmpresa: number;
  requestId?: string; traceId?: string; idServicio?: number; idContrato?: number; idCliente?: number; idTicket?: number;
};
export function interpretWithdrawalOrderRead(reply: G3HttpReply, expected: OrderReadExpectation): OrderReadOutcome {
  if (reply.status === null || reply.status === 408 || reply.status === 429 || (reply.status ?? 0) >= 500 || reply.status === 404) {
    return { kind: 'NO_DISPONIBLE', status: reply.status, code: errorCode(reply.body, reply.status ? `G3_HTTP_${reply.status}` : 'G3_NO_DISPONIBLE'), message: 'No fue posible consultar la OT en G3' };
  }
  const status = reply.status;
  const envelope = record(reply.body) as Envelope | null;
  const data = record(envelope?.data);
  const bad = (code: string, message: string): OrderReadOutcome => ({ kind: 'INCONSISTENTE', status, code, message });
  if (status !== 200) return bad(errorCode(reply.body, `G3_HTTP_${status}`), 'G3 rechazó la consulta de la OT');
  if (envelope?.success !== true || !data) return bad('G3_RESPUESTA_INVALIDA', 'G3 respondió sin la envoltura { success, data }');
  if (data.id_ot !== expected.idOt || data.id_empresa !== expected.idEmpresa) return bad('G3_CORRELACION_INVALIDA', 'La OT consultada no corresponde a la solicitud');
  if (data.tipo_ot !== G3_WITHDRAWAL_TYPE) return bad('G3_TIPO_OT_INVALIDO', 'La OT consultada no es de BAJA');
  const optional: Array<[string, unknown]> = [
    ['request_id', expected.requestId], ['trace_id', expected.traceId?.toLowerCase()], ['id_servicio_externo', expected.idServicio],
    ['id_contrato_externo', expected.idContrato], ['id_cliente_externo', expected.idCliente], ['id_ticket_externo', expected.idTicket],
  ];
  for (const [field, value] of optional) {
    const reported = data[field];
    if (value === undefined || reported === undefined || reported === null) continue;
    const normalized = field === 'trace_id' && typeof reported === 'string' ? reported.toLowerCase() : reported;
    if (normalized !== value) return bad('G3_CORRELACION_INVALIDA', `La OT consultada informa otro ${field}; no corresponde a la solicitud`);
  }
  if (data.origen_integracion !== undefined && data.origen_integracion !== null) {
    return bad('G3_CORRELACION_INVALIDA', 'La OT consultada declara un origen de instalación');
  }
  if (!G3_OT_STATES.includes(data.estado as G3OtState)) return bad('G3_ESTADO_DESCONOCIDO', 'G3 informó un estado de OT desconocido');
  const fecha = typeof data.fecha_completada === 'string' ? data.fecha_completada : null;
  return { kind: 'LEIDA', estado: data.estado as G3OtState, fechaCompletada: fecha };
}
