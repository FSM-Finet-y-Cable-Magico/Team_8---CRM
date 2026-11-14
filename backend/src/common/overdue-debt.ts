import { BalanceInvoice, invoiceBalance } from '../billing/invoice-balance';

/** Mismos estados que usa el Libro de Control para «Convenio activo». */
export const ACTIVE_AGREEMENT_STATES = ['APROBADO', 'ACTIVO'];

export type DebtInvoice = BalanceInvoice & { conveniosPago?: Array<{ estado: string }> | null };

/**
 * Deuda exigible y vencida de un contrato, con la fecha vigente (prórrogas aprobadas)
 * y el saldo real de `invoiceBalance`. Un convenio activo no borra la deuda, pero la
 * saca del camino de la baja por morosidad: el cliente tiene un acuerdo de pago vigente.
 */
export function overdueDebtSummary(invoices: DebtInvoice[]) {
  let overdue = 0; let uncovered = 0; let total = 0; let maxDays = 0;
  for (const invoice of invoices) {
    const balance = invoiceBalance(invoice);
    if (!(balance.saldoExigible !== null && balance.saldoExigible > 0 && balance.diasAtraso > 0)) continue;
    overdue += 1;
    if ((invoice.conveniosPago ?? []).some(agreement => ACTIVE_AGREEMENT_STATES.includes(agreement.estado))) continue;
    uncovered += 1; total += balance.saldoExigible; maxDays = Math.max(maxDays, balance.diasAtraso);
  }
  return { overdueCount: overdue, uncoveredCount: uncovered, coveredByAgreementCount: overdue - uncovered, totalExigible: total, maxDiasAtraso: maxDays };
}
export type OverdueDebtSummary = ReturnType<typeof overdueDebtSummary>;

/** True cuando existe al menos un documento vencido, exigible y sin convenio activo. */
export function hasOverdueCollectibleDebt(invoices: DebtInvoice[]) {
  return overdueDebtSummary(invoices).uncoveredCount > 0;
}
