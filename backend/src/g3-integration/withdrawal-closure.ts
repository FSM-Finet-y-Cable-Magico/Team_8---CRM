import { WithdrawalG3Receipt } from './withdrawal.storage';

/**
 * Evaluación PURA de la evidencia de retiro técnico. No lee ni escribe nada: recibe lo que G8 ya almacenó
 * de G3 (recibo de la OT), de G1 (confirmaciones de recepción) y la lectura del inventario, y decide si la
 * baja efectiva puede aplicarse. Todo lo que no esté demostrado bloquea; nunca se infiere una recepción.
 *
 * Política ratificada por FINET (12-11-2026) para un retiro ordinario completo:
 *   1. G3 aprobó el cierre técnico (OT COMPLETADA y aprobada).
 *   2. G1 confirmó la recepción física de CADA equipo retirado, correlacionada con la misma OT.
 *   3. G8 validó la relación exacta con el servicio y la solicitud (lo hace el servicio, bajo bloqueo).
 * Un equipo retirado del domicilio NO equivale a recibido. Un equipo recibido puede quedar «En revisión»:
 * no tiene que estar disponible.
 */
export const G3_OT_COMPLETED = 'COMPLETADA';
export const G1_STATE_INSTALLED = 'Instalado en cliente';
/** Estados de G1 compatibles con un equipo ya recibido en taller o bodega. */
export const G1_RECEIVED_STATES = ['En revisión', 'En bodega', 'En préstamo externo', 'Dado de baja'];

/**
 * Excepción comercial por equipos no recuperados: diseñada y probada, PENDIENTE DE APROBACIÓN.
 * Mientras sea `false`, el servicio no entrega excepciones a la evaluación y los faltantes bloquean siempre.
 */
export const UNRECOVERED_EQUIPMENT_EXCEPTION_ENABLED = false;

export type InventoryUnit = { numeroSerie: string; estado: string };
/** Confirmación de recepción emitida por G1 (evento o consulta autorizada), ya validada y almacenada por G8. */
export type ReceptionConfirmation = { numeroSerie: string; idOtG3: number; estadoG1: string };
/** Decisión comercial explícita sobre un equipo no recuperado. No lo marca recuperado ni genera cargos. */
export type UnrecoveredException = { numeroSerie: string; decision: 'AUTORIZADA'; idUsuarioAutoriza: number; motivo: string };

export type ClosureBlockCode =
  | 'SIN_EVIDENCIA_TECNICA' | 'OT_SIN_ACEPTAR' | 'OT_CANCELADA' | 'CIERRE_PENDIENTE_APROBACION' | 'CIERRE_NO_APROBADO'
  | 'EQUIPOS_FALTANTES' | 'RETIRO_PARCIAL' | 'RECEPCION_G1_PENDIENTE' | 'RECEPCION_G1_INCONSISTENTE';

export type ClosureBlock = { code: ClosureBlockCode; message: string };
export type ClosureAssessment = { outcome: 'APLICAR_BAJA' | 'BLOQUEADO'; reasons: ClosureBlock[]; excepcionesAplicadas: string[] };

const block = (code: ClosureBlockCode, message: string): ClosureBlock => ({ code, message });
const norm = (serial: string) => serial.trim().toUpperCase();

export function assessWithdrawalClosure(input: {
  receipt: Pick<WithdrawalG3Receipt, 'idOtG3' | 'estadoOt' | 'cierreAprobado' | 'equiposRetirados' | 'equiposFaltantes'> | null;
  /** Unidades de G1 aún asociadas al servicio (lectura). */
  inventory: InventoryUnit[];
  /** Recepciones confirmadas por G1. */
  receptions?: ReceptionConfirmation[];
  /** Excepciones autorizadas; solo se consideran si la excepción está habilitada. */
  exceptions?: UnrecoveredException[];
  exceptionsEnabled?: boolean;
}): ClosureAssessment {
  const receipt = input.receipt;
  if (!receipt || receipt.idOtG3 == null) {
    return { outcome: 'BLOQUEADO', reasons: [block('SIN_EVIDENCIA_TECNICA', 'No hay una orden técnica de retiro aceptada con evidencia recibida')], excepcionesAplicadas: [] };
  }
  const reasons: ClosureBlock[] = [];
  const state = receipt.estadoOt ?? '';
  if (state === 'CANCELADA') reasons.push(block('OT_CANCELADA', 'La orden técnica de retiro fue cancelada'));
  else if (state === 'PENDIENTE_APROBACION') reasons.push(block('CIERRE_PENDIENTE_APROBACION', 'El cierre técnico espera aprobación; aún no es definitivo'));
  else if (['PENDIENTE', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_CLIENTE_AUSENTE'].includes(state)) {
    reasons.push(block('OT_SIN_ACEPTAR', 'La orden técnica de retiro aún no termina (o su cierre fue rechazado y volvió al técnico)'));
  } else if (state !== G3_OT_COMPLETED || !receipt.cierreAprobado) {
    reasons.push(block('CIERRE_NO_APROBADO', 'El cierre técnico no está aprobado'));
  }

  const exceptionsEnabled = input.exceptionsEnabled === true;
  const excepted = new Set(exceptionsEnabled ? (input.exceptions ?? []).filter(item => item.decision === 'AUTORIZADA' && item.motivo.trim() && item.idUsuarioAutoriza > 0).map(item => norm(item.numeroSerie)) : []);
  const missing = receipt.equiposFaltantes.map(item => norm(item.numeroSerie));
  const unresolvedMissing = missing.filter(serial => !excepted.has(serial));
  if (unresolvedMissing.length > 0) {
    reasons.push(block('EQUIPOS_FALTANTES', `Faltan ${unresolvedMissing.length} equipo(s) por recuperar sin una excepción comercial autorizada; no se asume un retiro completo`));
  }

  const retired = new Set(receipt.equiposRetirados.map(item => norm(item.numeroSerie)));
  const stillAtCustomer = input.inventory.filter(unit => unit.estado === G1_STATE_INSTALLED
    && !retired.has(norm(unit.numeroSerie)) && !excepted.has(norm(unit.numeroSerie)));
  if (stillAtCustomer.length > 0) {
    reasons.push(block('RETIRO_PARCIAL', `${stillAtCustomer.length} equipo(s) del servicio siguen instalados en el cliente`));
  }

  const confirmations = new Map((input.receptions ?? []).map(item => [norm(item.numeroSerie), item]));
  const pending: string[] = []; const inconsistent: string[] = [];
  for (const serial of retired) {
    const confirmation = confirmations.get(serial);
    if (!confirmation) { pending.push(serial); continue; }
    if (confirmation.idOtG3 !== receipt.idOtG3 || !G1_RECEIVED_STATES.includes(confirmation.estadoG1)) inconsistent.push(serial);
  }
  if (inconsistent.length > 0) {
    reasons.push(block('RECEPCION_G1_INCONSISTENTE', `La recepción informada por inventario no corresponde a esta orden o a un estado de recepción para ${inconsistent.length} equipo(s)`));
  }
  if (pending.length > 0) {
    reasons.push(block('RECEPCION_G1_PENDIENTE', `Inventario aún no confirma la recepción física de ${pending.length} equipo(s) retirado(s)`));
  }
  if (reasons.length) return { outcome: 'BLOQUEADO', reasons, excepcionesAplicadas: [] };
  return { outcome: 'APLICAR_BAJA', reasons: [], excepcionesAplicadas: missing.filter(serial => excepted.has(serial)) };
}

/** Etapa del retiro cuando el cliente regulariza su deuda. */
export type WithdrawalStage = 'ANTES_DEL_DESPACHO' | 'EN_EJECUCION' | 'DESPUES_DEL_RETIRO';
export type PaymentDuringWithdrawal = {
  accion: 'CONTINUAR' | 'CANCELAR_SOLICITUD' | 'COORDINAR_CANCELACION_CON_G3' | 'DECISION_COMERCIAL_REQUERIDA';
  message: string;
};

/**
 * Tratamiento del pago durante el retiro (política FINET 12-11-2026). Pura: indica qué corresponde,
 * nunca cambia estados de OT ajenas ni reactiva servicios. El pago no borra deuda histórica ni comprobantes:
 * la exigibilidad se recalcula desde facturas y pagos reales.
 */
export function paymentDuringWithdrawal(stage: WithdrawalStage, stillOverdue: boolean): PaymentDuringWithdrawal {
  if (stillOverdue) return { accion: 'CONTINUAR', message: 'La deuda exigible vencida se mantiene; el retiro sigue su curso.' };
  if (stage === 'ANTES_DEL_DESPACHO') {
    return { accion: 'CANCELAR_SOLICITUD', message: 'La deuda se regularizó antes del despacho: corresponde cancelar la solicitud de retiro; la reactivación sigue el procedimiento de pago vigente.' };
  }
  if (stage === 'EN_EJECUCION') {
    return { accion: 'COORDINAR_CANCELACION_CON_G3', message: 'La deuda se regularizó con la orden en ejecución: solicita a G3 la cancelación y espera su confirmación antes de cerrar la solicitud.' };
  }
  return { accion: 'DECISION_COMERCIAL_REQUERIDA', message: 'La deuda se regularizó después del retiro físico: no se reactiva automáticamente; se requiere una decisión comercial autorizada con la evidencia técnica.' };
}
