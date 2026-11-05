import { Prisma } from '@prisma/client';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';

export const CLOSED_INVOICE_STATES = ['Pagada', 'Anulada'];
export const APPROVED_EXTENSIONS = { where: { estado: 'APROBADA' }, orderBy: [{ nuevaFecha: 'desc' }, { idProrroga: 'desc' }] } satisfies Prisma.Factura$prorrogasPagoArgs;

export type BalanceInvoice = {
  monto: Prisma.Decimal | number | null;
  estado: string;
  fechaLimitePago: Date;
  pagos: Array<{ monto: Prisma.Decimal | number }>;
  prorrogasPago?: Array<{ nuevaFecha: Date; estado?: string }>;
};

/** Financial balance and collectible balance are distinct for cancelled/closed documents. */
export function invoiceBalance(invoice: BalanceInvoice, today = parseDateOnly(todayDateOnly())!) {
  const paid = invoice.pagos.reduce((sum, p) => sum.plus(p.monto), new Prisma.Decimal(0));
  const amount = invoice.monto === null ? null : new Prisma.Decimal(invoice.monto);
  const saldo = amount === null ? null : Prisma.Decimal.max(0, amount.minus(paid)).toNumber();
  const saldoFavor = amount === null ? null : Prisma.Decimal.max(0, paid.minus(amount)).toNumber();
  const closed = CLOSED_INVOICE_STATES.includes(invoice.estado);
  const effective = (invoice.prorrogasPago ?? [])
    .filter(p => p.estado === undefined || p.estado === 'APROBADA')
    .reduce((latest, p) => p.nuevaFecha > latest ? p.nuevaFecha : latest, invoice.fechaLimitePago);
  const days = !closed && saldo !== null && saldo > 0
    ? Math.max(0, Math.floor((today.getTime() - effective.getTime()) / 86_400_000)) : 0;
  return {
    monto: amount?.toNumber() ?? null, pagado: paid.toNumber(), saldo, saldoFavor,
    saldoExigible: closed ? 0 : saldo,
    fechaVencimientoEfectiva: effective.toISOString().slice(0, 10), diasAtraso: days,
    estadoCalculado: closed ? invoice.estado : amount === null ? 'Sin monto' : saldo === 0 ? 'Pagada' : days > 0 ? 'Vencida' : paid.gt(0) ? 'Parcial' : 'Pendiente',
    aceptaPagos: !closed && saldo !== null && saldo > 0,
  };
}
