import { G1_ACCEPTED_RESULTS } from './g1-reception-contract';

/**
 * PURE evaluation of the technical withdrawal evidence (rewritten from PR #81 for the real contracts).
 * It reads nothing and writes nothing; whatever is not demonstrated blocks, a reception is never inferred.
 *
 * Policy ratified by FINET (12-11/13-11-2026):
 *   1. G3 approved the closure: proven by an authenticated GET of the same OT and company reporting
 *      COMPLETADA (the BAJA webhook carries no estado_ot / cierre_aprobado, and alone is not enough).
 *   2. The BAJA closure evidence (key baja:{id_ot}) was received and correlated by G8.
 *   3. G1 reception for the same company / OT / request is COMPLETA and EVERY serial retired by G3 is
 *      RECIBIDO or RECIBIDO_CON_DANO for the same service; no extra, foreign or duplicated serials.
 *   4. G1 reports no device still associated (active) with the service.
 * No second warehouse confirmation is required. Missing devices block: the unrecovered-equipment
 * exception remains disabled.
 */
export const UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED = false;

export type ClosureBlockCode =
  | 'SIN_OT' | 'OT_CANCELADA' | 'CIERRE_NO_CONFIRMADO' | 'SIN_CIERRE_TECNICO' | 'SIN_EQUIPOS_RETIRADOS' | 'EQUIPOS_FALTANTES'
  | 'SERIE_DUPLICADA' | 'RECEPCION_G1_PENDIENTE' | 'RECEPCION_G1_INCOMPLETA' | 'RECEPCION_G1_INCONSISTENTE'
  | 'EQUIPO_NO_RECIBIDO' | 'SERIE_AJENA' | 'RETIRO_PARCIAL';
export type ClosureBlock = { code: ClosureBlockCode; message: string };
export type ClosureAssessment = { outcome: 'APLICAR_BAJA' | 'BLOQUEADO'; reasons: ClosureBlock[] };

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

export function assessWithdrawalClosure(input: {
  evidence: ClosureEvidence;
  idServicio: number;
  receptions: ReceptionRow[];
  /** Serials G1 still associates (active) with the service, read right before applying. */
  activeEquipment: string[];
}): ClosureAssessment {
  const { evidence } = input;
  if (evidence.idOtG3 == null) return { outcome: 'BLOQUEADO', reasons: [block('SIN_OT', 'No hay una OT de retiro aceptada por G3')] };
  const reasons: ClosureBlock[] = [];
  if (evidence.estadoOt === 'CANCELADA') reasons.push(block('OT_CANCELADA', 'La OT de retiro fue cancelada en G3'));
  else if (evidence.estadoOt !== 'COMPLETADA') {
    reasons.push(block('CIERRE_NO_CONFIRMADO', `G3 no confirma el cierre aprobado (estado consultado: ${evidence.estadoOt ?? 'sin consultar'})`));
  }
  if (evidence.cierreClave !== `baja:${evidence.idOtG3}`) reasons.push(block('SIN_CIERRE_TECNICO', 'No se recibió el aviso de cierre de la OT de BAJA'));

  const retired = evidence.equiposRetirados.map(item => norm(item.numeroSerie));
  const missing = evidence.equiposFaltantes.map(item => norm(item.numeroSerie));
  if (evidence.cierreClave && retired.length === 0) reasons.push(block('SIN_EQUIPOS_RETIRADOS', 'El cierre no declara equipos retirados'));
  if (missing.length > 0 && !UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED) {
    reasons.push(block('EQUIPOS_FALTANTES', `El técnico declaró ${missing.length} equipo(s) no recuperado(s); no se asume un retiro completo`));
  }
  if (new Set(retired).size !== retired.length) reasons.push(block('SERIE_DUPLICADA', 'El cierre declara series duplicadas'));

  if (!input.receptions.length) {
    reasons.push(block('RECEPCION_G1_PENDIENTE', 'Inventario aún no informa la recepción de los equipos retirados'));
  } else {
    if (input.receptions.some(row => row.estadoRecepcion !== 'COMPLETA')) {
      reasons.push(block('RECEPCION_G1_INCOMPLETA', `Inventario informa la recepción como ${input.receptions[0].estadoRecepcion}`));
    }
    const bySerial = new Map(input.receptions.map(row => [norm(row.numeroSerie), row]));
    const wrong = input.receptions.filter(row => row.idOtG3 !== evidence.idOtG3 || row.idServicioExterno !== input.idServicio);
    if (wrong.length) reasons.push(block('RECEPCION_G1_INCONSISTENTE', `${wrong.length} recepción(es) no corresponden a esta OT o servicio`));
    const notReceived = retired.filter(serial => bySerial.has(serial) && !G1_ACCEPTED_RESULTS.includes(bySerial.get(serial)!.resultado));
    if (notReceived.length) reasons.push(block('EQUIPO_NO_RECIBIDO', `${notReceived.length} equipo(s) retirado(s) figuran como no recibidos`));
    const pending = retired.filter(serial => !bySerial.has(serial));
    if (pending.length) reasons.push(block('RECEPCION_G1_PENDIENTE', `Inventario no informa ${pending.length} equipo(s) retirado(s)`));
    const foreign = [...bySerial.keys()].filter(serial => !retired.includes(serial));
    if (foreign.length) reasons.push(block('SERIE_AJENA', `Inventario informa ${foreign.length} serie(s) que el cierre técnico no declara`));
  }
  if (input.activeEquipment.length > 0) {
    reasons.push(block('RETIRO_PARCIAL', `${input.activeEquipment.length} equipo(s) siguen asociados al servicio en inventario`));
  }
  return reasons.length ? { outcome: 'BLOQUEADO', reasons } : { outcome: 'APLICAR_BAJA', reasons: [] };
}

/** Stage of the withdrawal when the customer pays (policy FINET 12-11-2026, from PR #81). */
export type WithdrawalStage = 'ANTES_DEL_DESPACHO' | 'EN_EJECUCION' | 'DESPUES_DEL_RETIRO';
export function paymentDuringWithdrawal(stage: WithdrawalStage, stillOverdue: boolean) {
  if (stillOverdue) return { accion: 'CONTINUAR' as const, message: 'La deuda exigible vencida se mantiene; el retiro sigue su curso.' };
  if (stage === 'ANTES_DEL_DESPACHO') return { accion: 'CANCELAR_SOLICITUD' as const, message: 'La deuda se regularizó antes del despacho: corresponde cancelar la solicitud de retiro.' };
  if (stage === 'EN_EJECUCION') return { accion: 'COORDINAR_CANCELACION_CON_G3' as const, message: 'La deuda se regularizó con la orden en ejecución: cancela el retiro (G3 lo permite hasta EN_CURSO) antes de cerrar la solicitud.' };
  return { accion: 'DECISION_COMERCIAL_REQUERIDA' as const, message: 'La deuda se regularizó después del retiro físico: no se aplica la baja ni se reactiva automáticamente; se requiere una decisión comercial con la evidencia técnica.' };
}
