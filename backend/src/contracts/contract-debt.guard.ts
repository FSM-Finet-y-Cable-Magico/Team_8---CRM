import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { APPROVED_EXTENSIONS, invoiceBalance } from '../billing/invoice-balance';
import { PrismaService } from '../prisma/prisma.service';
import { rutLookupVariants } from '../rut/rut.util';

type DebtContext = {
  idEmpresa: number | null;
  idCliente?: number | null;
  rut?: string | null;
  idContrato?: number;
  idProspecto?: number;
  idUsuario: number;
};

export class ContractDebtException extends BadRequestException {
  readonly context: Omit<DebtContext, 'rut'>;
  constructor(context: DebtContext, readonly reason: 'DEUDA_PENDIENTE' | 'REVISION_FINANCIERA') {
    super({ code: reason === 'DEUDA_PENDIENTE' ? 'CONTRACT_CUSTOMER_DEBT' : 'CONTRACT_FINANCIAL_REVIEW',
      message: reason === 'DEUDA_PENDIENTE'
        ? 'Existe deuda pendiente en esta empresa. Regulariza el saldo antes de contratar o confirmar la firma.'
        : 'Se requiere revision financiera en esta empresa antes de contratar o confirmar la firma.' });
    const { idEmpresa, idCliente, idContrato, idProspecto, idUsuario } = context;
    this.context = { idEmpresa, idCliente, idContrato, idProspecto, idUsuario };
  }
}

/** Same collectible balance as Libro de Control. RUT lookup only vetoes aliases;
 * it never authorizes a customer association, changes identity or exposes debt. */
export async function assertNoContractDebt(tx: Prisma.TransactionClient, context: DebtContext) {
  const variants = context.rut ? rutLookupVariants(context.rut) : [];
  if (!Number.isInteger(context.idEmpresa) || Number(context.idEmpresa) < 1 || (!context.idCliente && !variants.length)) {
    throw new ContractDebtException(context, 'REVISION_FINANCIERA');
  }
  const identities: Prisma.ContratoWhereInput[] = [
    ...(context.idCliente ? [{ idCliente: context.idCliente }] : []),
    ...(variants.length ? [{ cliente: { rut: { in: variants, mode: 'insensitive' as const } } },
      { prospecto: { rut: { in: variants, mode: 'insensitive' as const } } }] : []),
  ];
  const invoices = await tx.factura.findMany({
    where: { contrato: { idEmpresa: context.idEmpresa, OR: identities } },
    include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS },
  });
  const balances = invoices.map(invoice => invoiceBalance(invoice));
  if (balances.some(balance => balance.saldoExigible !== null && balance.saldoExigible > 0)) {
    throw new ContractDebtException(context, 'DEUDA_PENDIENTE');
  }
  // Missing historical amounts cannot be treated as proof of regularization.
  if (balances.some(balance => balance.saldoExigible === null)) {
    throw new ContractDebtException(context, 'REVISION_FINANCIERA');
  }
}

/** Called only after rollback. A refusal needs its own committed audit; recording
 * it inside the rejected business transaction would also roll it back. */
export async function auditContractDebtRejection(prisma: PrismaService, audit: AuditService, error: unknown): Promise<never> {
  if (error instanceof ContractDebtException) {
    const { idEmpresa, idCliente, idContrato, idProspecto, idUsuario } = error.context;
    await prisma.$transaction(tx => audit.record({
      idUsuario, accion: 'BLOQUEAR_CONTRATACION_POR_DEUDA', entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato ?? null,
      valorNuevo: { idEmpresa, idCliente: idCliente ?? null, idProspecto: idProspecto ?? null, motivo: error.reason },
    }, tx));
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034'
    || error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)))) {
    throw new ConflictException('La informacion financiera o contractual cambio; vuelve a consultar antes de continuar');
  }
  throw error;
}
