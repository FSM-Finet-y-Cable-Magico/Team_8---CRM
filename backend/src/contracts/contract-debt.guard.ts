import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { customerDebtPosition } from '../common/customer-debt';
import { PrismaService } from '../prisma/prisma.service';

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
  // La posición de deuda es la misma que muestra la proyección de excliente: una sola regla.
  const position = await customerDebtPosition(tx, { idEmpresa: context.idEmpresa, idCliente: context.idCliente, rut: context.rut });
  if (position === 'CON_DEUDA') throw new ContractDebtException(context, 'DEUDA_PENDIENTE');
  if (position === 'INDETERMINADA') throw new ContractDebtException(context, 'REVISION_FINANCIERA');
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
