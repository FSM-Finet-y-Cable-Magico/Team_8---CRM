import { G1_ACCEPTED_RESULTS } from './g1-reception-contract';

/**
 * PURE evaluation of the technical withdrawal evidence. It reads nothing and writes nothing.
 *
 * Policy FINET 13-11-2026 (Documento 2, §2.4) - the COMMERCIAL baja depends on G3's approval, not on the warehouse:
 *   BLOCKING (identity, approval and consistency):
 *     1. G3 approved the closure: an authenticated GET of the same OT and company reports COMPLETADA (the technician's
 *        close is PENDIENTE_APROBACION; the head technician's approval is COMPLETADA). CANCELADA or any other state blocks.
 *     2. The BAJA closure evidence (key baja:{id_ot}) was received and correlated by G8 (request, trace, company,
 *        customer, contract, service and ticket were checked when it was stored). A raw webhook alone never applies.
 *     3. The declared serials are consistent: no duplicates and no serial declared both retired and missing.
 *   INFORMATIVE (recorded in the audit, never blocking): missing / unrecovered devices, zero devices recovered, and
 *   anything G1 reports (reception pending, partial, inconsistent, foreign serials, devices still associated, or G1 not
 *   available). G8 never infers a reception and never writes, releases or dissociates inventory: G1's logistics continue
 *   independently.
 */
export type ClosureBlockCode = 'SIN_OT' | 'OT_CANCELADA' | 'CIERRE_NO_CONFIRMADO' | 'SIN_CIERRE_TECNICO' | 'SERIE_DUPLICADA' | 'SERIE_RETIRADA_Y_FALTANTE';
export type ClosureNoticeCode =
  | 'EQUIPOS_FALTANTES' | 'SIN_EQUIPOS_RETIRADOS' | 'RECEPCION_G1_PENDIENTE' | 'RECEPCION_G1_INCOMPLETA' | 'RECEPCION_G1_INCONSISTENTE'
  | 'EQUIPO_NO_RECIBIDO' | 'SERIE_AJENA' | 'EQUIPOS_ASOCIADOS_EN_INVENTARIO' | 'INVENTARIO_NO_CONSULTADO';
export type ClosureBlock = { code: ClosureBlockCode; message: string };
export type ClosureNotice = { code: ClosureNoticeCode; message: string };
export type ClosureAssessment = { outcome: 'APLICAR_BAJA' | 'BLOQUEADO'; reasons: ClosureBlock[]; avisos: ClosureNotice[] };

export type ClosureEvidence = {
  idOtG3: number | null;
  estadoOt: string | null;
  cierreClave: string | null;
  equiposRetirados: Array<{ numeroSerie: string }>;
  equiposFaltantes: Array<{ numeroSerie: string }>;
};
export type ReceptionRow = { numeroSerie: string; idOtG3: number; resultado: string; idServicioExterno: number | null; estadoRecepcion: string };

const norm = (serial: string) => serial.trim().toUpperCase();
const block = (code: ClosureBlockCode, message: string): ClosureBlock => ({ code, message });
const notice = (code: ClosureNoticeCode, message: string): ClosureNotice => ({ code, message });

export function assessWithdrawalClosure(input: {
  evidence: ClosureEvidence;
  idServicio: number;
  /** G1 reception rows stored for the request (informative). */
  receptions: ReceptionRow[];
  /** Serials G1 still associates with the service, read right before applying; null when G1 could not be read. */
  activeEquipment: string[] | null;
}): ClosureAssessment {
  const { evidence } = input;
  if (evidence.idOtG3 == null) return { outcome: 'BLOQUEADO', reasons: [block('SIN_OT', 'No hay una OT de retiro aceptada por G3')], avisos: [] };
  const reasons: ClosureBlock[] = [];
  const avisos: ClosureNotice[] = [];
  if (evidence.estadoOt === 'CANCELADA') reasons.push(block('OT_CANCELADA', 'La OT de retiro fue cancelada en G3'));
  else if (evidence.estadoOt !== 'COMPLETADA') {
    reasons.push(block('CIERRE_NO_CONFIRMADO', `G3 no confirma el cierre aprobado por el jefe técnico (estado consultado: ${evidence.estadoOt ?? 'sin consultar'})`));
  }
  if (evidence.cierreClave !== `baja:${evidence.idOtG3}`) reasons.push(block('SIN_CIERRE_TECNICO', 'No se recibió el aviso de cierre de la OT de BAJA'));

  const retired = evidence.equiposRetirados.map(item => norm(item.numeroSerie));
  const missing = evidence.equiposFaltantes.map(item => norm(item.numeroSerie));
  if (new Set(retired).size !== retired.length || new Set(missing).size !== missing.length) reasons.push(block('SERIE_DUPLICADA', 'El cierre declara series duplicadas'));
  if (retired.some(serial => missing.includes(serial))) reasons.push(block('SERIE_RETIRADA_Y_FALTANTE', 'El cierre declara una misma serie como retirada y como faltante'));

  if (evidence.cierreClave && retired.length === 0) avisos.push(notice('SIN_EQUIPOS_RETIRADOS', 'El cierre aprobado no declara equipos recuperados'));
  if (missing.length > 0) avisos.push(notice('EQUIPOS_FALTANTES', `El técnico declaró ${missing.length} equipo(s) no recuperado(s); queda registrado, no bloquea la baja`));
  if (!input.receptions.length) {
    if (retired.length) avisos.push(notice('RECEPCION_G1_PENDIENTE', 'Inventario aún no informa la recepción de los equipos retirados'));
  } else {
    if (input.receptions.some(row => row.estadoRecepcion !== 'COMPLETA')) {
      avisos.push(notice('RECEPCION_G1_INCOMPLETA', `Inventario informa la recepción como ${input.receptions[0].estadoRecepcion}`));
    }
    const bySerial = new Map(input.receptions.map(row => [norm(row.numeroSerie), row]));
    const wrong = input.receptions.filter(row => row.idOtG3 !== evidence.idOtG3 || row.idServicioExterno !== input.idServicio);
    if (wrong.length) avisos.push(notice('RECEPCION_G1_INCONSISTENTE', `${wrong.length} recepción(es) no corresponden a esta OT o servicio`));
    const notReceived = retired.filter(serial => bySerial.has(serial) && !G1_ACCEPTED_RESULTS.includes(bySerial.get(serial)!.resultado));
    if (notReceived.length) avisos.push(notice('EQUIPO_NO_RECIBIDO', `${notReceived.length} equipo(s) retirado(s) figuran como no recibidos`));
    const pending = retired.filter(serial => !bySerial.has(serial));
    if (pending.length) avisos.push(notice('RECEPCION_G1_PENDIENTE', `Inventario no informa ${pending.length} equipo(s) retirado(s)`));
    const foreign = [...bySerial.keys()].filter(serial => !retired.includes(serial));
    if (foreign.length) avisos.push(notice('SERIE_AJENA', `Inventario informa ${foreign.length} serie(s) que el cierre técnico no declara`));
  }
  if (input.activeEquipment === null) avisos.push(notice('INVENTARIO_NO_CONSULTADO', 'No fue posible consultar el inventario asociado al servicio'));
  else if (input.activeEquipment.length > 0) {
    avisos.push(notice('EQUIPOS_ASOCIADOS_EN_INVENTARIO', `${input.activeEquipment.length} equipo(s) siguen asociados al servicio en inventario`));
  }
  return reasons.length ? { outcome: 'BLOQUEADO', reasons, avisos } : { outcome: 'APLICAR_BAJA', reasons: [], avisos };
}

/** Stage of the withdrawal when the customer pays (policy FINET 12-11-2026, from PR #81). */
export type WithdrawalStage = 'ANTES_DEL_DESPACHO' | 'EN_EJECUCION' | 'DESPUES_DEL_RETIRO';
export function paymentDuringWithdrawal(stage: WithdrawalStage, stillOverdue: boolean) {
  if (stillOverdue) return { accion: 'CONTINUAR' as const, message: 'La deuda exigible vencida se mantiene; el retiro sigue su curso.' };
  if (stage === 'ANTES_DEL_DESPACHO') return { accion: 'CANCELAR_SOLICITUD' as const, message: 'La deuda se regularizó antes del despacho: corresponde cancelar la solicitud de retiro.' };
  if (stage === 'EN_EJECUCION') return { accion: 'COORDINAR_CANCELACION_CON_G3' as const, message: 'La deuda se regularizó con la orden en ejecución: cancela el retiro (G3 lo permite hasta EN_CURSO) antes de cerrar la solicitud.' };
  return { accion: 'DECISION_COMERCIAL_REQUERIDA' as const, message: 'La deuda se regularizó después del retiro físico: no se aplica la baja ni se reactiva automáticamente; se requiere una decisión comercial con la evidencia técnica.' };
}
