import { WithdrawalG3Receipt } from './withdrawal.storage';

/**
 * Evaluación PURA de la evidencia de retiro técnico. No lee ni escribe nada: recibe lo que G8
 * ya almacenó de G3 (recibo) y lo que G1 informa de sus unidades (lectura), y decide si la baja
 * efectiva puede aplicarse. Todo lo que no esté demostrado bloquea; nunca se infiere una recepción.
 *
 * Literales de G3 (órdenes) y G1 (estados de equipo) tal como los publican sus repositorios.
 */
export const G3_OT_COMPLETED = 'COMPLETADA';
export const G1_STATE_INSTALLED = 'Instalado en cliente';
export const G1_STATE_IN_REVIEW = 'En revisión';
export const G1_STATE_WAREHOUSE = 'En bodega';
/** Estados de G1 que prueban que el equipo ya salió del domicilio. */
export const G1_RETRIEVED_STATES = [G1_STATE_IN_REVIEW, G1_STATE_WAREHOUSE, 'En préstamo externo', 'Dado de baja'];

export type InventoryUnit = { numeroSerie: string; estado: string };

export type ClosurePolicy = {
  /**
   * Retiro físico (equipo fuera del domicilio, «En revisión» en el taller) y recepción en bodega son
   * hechos distintos. Mientras los propietarios no ratifiquen cuál exige la baja comercial, el valor
   * por defecto es exigir solo el retiro físico; exigir bodega es una decisión explícita.
   */
  requireWarehouseReception: boolean;
};
export const DEFAULT_CLOSURE_POLICY: ClosurePolicy = { requireWarehouseReception: false };

export type ClosureBlockCode =
  | 'SIN_EVIDENCIA_TECNICA' | 'OT_SIN_ACEPTAR' | 'OT_CANCELADA' | 'CIERRE_PENDIENTE_APROBACION' | 'CIERRE_NO_APROBADO'
  | 'EQUIPOS_FALTANTES' | 'RETIRO_PARCIAL' | 'INVENTARIO_SIN_CONFIRMAR' | 'BODEGA_PENDIENTE';

export type ClosureBlock = { code: ClosureBlockCode; message: string };
export type ClosureAssessment = { outcome: 'APLICAR_BAJA' | 'BLOQUEADO'; reasons: ClosureBlock[] };

const block = (code: ClosureBlockCode, message: string): ClosureBlock => ({ code, message });
const norm = (serial: string) => serial.trim().toUpperCase();

export function assessWithdrawalClosure(input: {
  receipt: Pick<WithdrawalG3Receipt, 'idOtG3' | 'estadoOt' | 'cierreAprobado' | 'equiposRetirados' | 'equiposFaltantes'> | null;
  /** Unidades de G1 relacionadas con el servicio (aún asociadas a él) y las consultadas por serie. */
  inventory: InventoryUnit[];
  policy?: ClosurePolicy;
}): ClosureAssessment {
  const policy = input.policy ?? DEFAULT_CLOSURE_POLICY;
  const receipt = input.receipt;
  if (!receipt || receipt.idOtG3 == null) {
    return { outcome: 'BLOQUEADO', reasons: [block('SIN_EVIDENCIA_TECNICA', 'No hay una orden técnica de retiro aceptada con evidencia recibida')] };
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
  if (receipt.equiposFaltantes.length > 0) {
    reasons.push(block('EQUIPOS_FALTANTES', `Faltan ${receipt.equiposFaltantes.length} equipo(s) por recuperar; no se asume un retiro completo`));
  }

  const retired = new Set(receipt.equiposRetirados.map(item => norm(item.numeroSerie)));
  const bySerial = new Map(input.inventory.map(unit => [norm(unit.numeroSerie), unit]));
  const stillAtCustomer = input.inventory.filter(unit => unit.estado === G1_STATE_INSTALLED && !retired.has(norm(unit.numeroSerie)));
  if (stillAtCustomer.length > 0) {
    reasons.push(block('RETIRO_PARCIAL', `${stillAtCustomer.length} equipo(s) del servicio siguen instalados en el cliente`));
  }
  const unconfirmed = [...retired].filter(serial => {
    const unit = bySerial.get(serial);
    return !unit || !G1_RETRIEVED_STATES.includes(unit.estado);
  });
  if (unconfirmed.length > 0) {
    reasons.push(block('INVENTARIO_SIN_CONFIRMAR', `El inventario aún no confirma el retiro de ${unconfirmed.length} equipo(s) informado(s)`));
  } else if (policy.requireWarehouseReception) {
    const pending = [...retired].filter(serial => bySerial.get(serial)?.estado !== G1_STATE_WAREHOUSE);
    if (pending.length > 0) reasons.push(block('BODEGA_PENDIENTE', `${pending.length} equipo(s) aún no se reciben en bodega`));
  }
  return reasons.length ? { outcome: 'BLOQUEADO', reasons } : { outcome: 'APLICAR_BAJA', reasons: [] };
}
