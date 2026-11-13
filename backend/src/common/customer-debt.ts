import { Prisma } from '@prisma/client';
import { APPROVED_EXTENSIONS, invoiceBalance } from '../billing/invoice-balance';
import { rutLookupVariants } from '../rut/rut.util';

/**
 * Situación financiera efectiva de una persona frente a UNA empresa.
 * Se calcula siempre desde facturas y pagos con la misma regla del Libro de Control;
 * nunca se persiste ni se escribe a mano (no existe un booleano `tieneDeuda`).
 *
 * - CON_DEUDA: algún documento tiene saldo exigible positivo.
 * - INDETERMINADA: falta empresa o identidad, o algún documento abierto no tiene monto;
 *   un dato histórico faltante no prueba regularización.
 * - SIN_DEUDA: ningún documento de la empresa tiene saldo exigible.
 */
export type DebtPosition = 'SIN_DEUDA' | 'CON_DEUDA' | 'INDETERMINADA';

export type DebtIdentity = {
  idEmpresa: number | null;
  idCliente?: number | null;
  /** Solo veta alias del mismo RUT; nunca autoriza asociar un cliente ni expone deuda ajena. */
  rut?: string | null;
};

type DebtReader = Pick<Prisma.TransactionClient, 'factura'>;

export async function customerDebtPosition(db: DebtReader, identity: DebtIdentity): Promise<DebtPosition> {
  const variants = identity.rut ? rutLookupVariants(identity.rut) : [];
  if (!Number.isInteger(identity.idEmpresa) || Number(identity.idEmpresa) < 1 || (!identity.idCliente && !variants.length)) {
    return 'INDETERMINADA';
  }
  const identities: Prisma.ContratoWhereInput[] = [
    ...(identity.idCliente ? [{ idCliente: identity.idCliente }] : []),
    ...(variants.length ? [{ cliente: { rut: { in: variants, mode: 'insensitive' as const } } },
      { prospecto: { rut: { in: variants, mode: 'insensitive' as const } } }] : []),
  ];
  const invoices = await db.factura.findMany({
    where: { contrato: { idEmpresa: identity.idEmpresa, OR: identities } },
    include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS },
  });
  const balances = invoices.map(invoice => invoiceBalance(invoice));
  if (balances.some(balance => balance.saldoExigible !== null && balance.saldoExigible > 0)) return 'CON_DEUDA';
  // Missing historical amounts cannot be treated as proof of regularization.
  if (balances.some(balance => balance.saldoExigible === null)) return 'INDETERMINADA';
  return 'SIN_DEUDA';
}
