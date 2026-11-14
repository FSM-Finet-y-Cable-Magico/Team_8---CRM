import { ACTIVE_AGREEMENT_STATES } from '../common/overdue-debt';
import { BalanceInvoice, invoiceBalance } from './invoice-balance';

/**
 * Commercial suspension for non-payment (CU-30): AUTOMATIC eligibility, MANUAL execution (FINET 13-11-2026).
 * One pure rule shared by the read-only eligibility endpoint (button and modal of the Libro de Control) and by
 * BillingService.suspendContract(), which evaluates it again inside its Serializable transaction right before writing.
 * It reuses invoiceBalance() (real balance, closed documents, effective due date with APPROVED extensions) and the
 * active-agreement states of overdueDebtSummary(). There is no cron: nothing is suspended without human confirmation.
 *
 * A contract is eligible when at least one invoice has a collectible balance (> 0), is overdue on its effective due
 * date by at least `cutDays` days (BILLING_CUT_DAYS) and is NOT covered by an active agreement (APROBADO/ACTIVO).
 * Future, paid, cancelled, covered, extended (still within the approved date) or amount-less invoices never enable it.
 */
export const SUSPENSION_REASON = 'NO PAGO';
/** Contract states the existing suspension already accepted ('Suspendido' completes a partial suspension). */
export const SUSPENDABLE_CONTRACT_STATES = ['Activo', 'Moroso', 'Suspendido'];

export type SuspensionInvoice = BalanceInvoice & { idFactura: number; conveniosPago?: Array<{ estado: string }> | null };
export type SuspensionService = { idServicio: number; idEmpresa: number | null; estadoOperativo: string; tipoServicio?: string | null };
export type SuspensionFacts = {
  contrato: { idContrato: number; idEmpresa: number | null; idCliente: number | null; estado: string };
  cliente: { idCliente: number } | null;
  facturas: SuspensionInvoice[];
  servicios: SuspensionService[];
  cutDays: number;
};

export type SuspensionBlockCode =
  | 'CONTRATO_INCONSISTENTE' | 'ESTADO_CONTRATO' | 'YA_SUSPENDIDO' | 'SIN_DEUDA_VENCIDA' | 'DEUDA_CUBIERTA_POR_CONVENIO'
  | 'BAJO_UMBRAL_CORTE' | 'SIN_SERVICIOS_ACTIVOS';
export type SuspensionBlock = { code: SuspensionBlockCode; message: string };

export function evaluateSuspension(facts: SuspensionFacts, today?: Date) {
  const { contrato, cutDays } = facts;
  const qualifying: Array<{ idFactura: number; saldoExigible: number; diasAtraso: number; fechaVencimientoEfectiva: string }> = [];
  let overdue = 0; let covered = 0; let belowThreshold = 0; let maxDays = 0;
  for (const invoice of facts.facturas) {
    const balance = today ? invoiceBalance(invoice, today) : invoiceBalance(invoice);
    if (balance.saldoExigible === null || !(balance.saldoExigible > 0) || balance.diasAtraso <= 0) continue;
    overdue += 1;
    if ((invoice.conveniosPago ?? []).some(agreement => ACTIVE_AGREEMENT_STATES.includes(agreement.estado))) { covered += 1; continue; }
    if (balance.diasAtraso < cutDays) { belowThreshold += 1; maxDays = Math.max(maxDays, balance.diasAtraso); continue; }
    maxDays = Math.max(maxDays, balance.diasAtraso);
    qualifying.push({ idFactura: invoice.idFactura, saldoExigible: balance.saldoExigible, diasAtraso: balance.diasAtraso, fechaVencimientoEfectiva: balance.fechaVencimientoEfectiva });
  }
  // Only services of THIS contract and company: other contracts and companies of a shared customer are never touched.
  const affected = facts.servicios.filter(service => service.idEmpresa === contrato.idEmpresa && service.estadoOperativo === 'Activo');
  const deuda = {
    facturasVencidas: overdue, cubiertasPorConvenio: covered, bajoUmbral: belowThreshold, facturasSobreUmbral: qualifying.length,
    totalExigibleSobreUmbral: qualifying.reduce((sum, item) => sum + item.saldoExigible, 0), maxDiasAtraso: maxDays,
  };
  const result = (block: SuspensionBlock | null, yaSuspendido = false) => ({
    elegible: block === null, yaSuspendido, motivo: block, umbralDias: cutDays, motivoSuspension: SUSPENSION_REASON,
    facturas: qualifying, deuda, serviciosAfectados: affected.map(service => ({ idServicio: service.idServicio, tipoServicio: service.tipoServicio ?? null })),
  });

  if (!contrato.idEmpresa || !facts.cliente || facts.cliente.idCliente !== contrato.idCliente) {
    return result({ code: 'CONTRATO_INCONSISTENTE', message: 'Cliente y contrato no corresponden' });
  }
  if (!SUSPENDABLE_CONTRACT_STATES.includes(contrato.estado)) {
    return result({ code: 'ESTADO_CONTRATO', message: 'El estado del contrato no permite suspensión comercial' });
  }
  if (contrato.estado === 'Suspendido' && affected.length === 0) {
    return result({ code: 'YA_SUSPENDIDO', message: 'El contrato y sus servicios ya están suspendidos' }, true);
  }
  if (!qualifying.length) {
    if (belowThreshold > 0) return result({ code: 'BAJO_UMBRAL_CORTE', message: `No existen facturas con saldo que cumplan los días de corte (${cutDays} días de atraso)` });
    if (covered > 0) return result({ code: 'DEUDA_CUBIERTA_POR_CONVENIO', message: 'La deuda vencida está cubierta por un convenio de pago activo; no corresponde suspender' });
    return result({ code: 'SIN_DEUDA_VENCIDA', message: 'No existen facturas con saldo que cumplan los días de corte' });
  }
  if (affected.length === 0) {
    return result({ code: 'SIN_SERVICIOS_ACTIVOS', message: 'El contrato no tiene servicios activos en esta empresa que suspender' });
  }
  return result(null);
}
export type SuspensionEvaluation = ReturnType<typeof evaluateSuspension>;
