import { Prisma, PrismaClient } from '@prisma/client';
import { matchesIssuedFolio } from './facturacion-cl-document-builder';
import { NewTaxIntent, TaxIntentCompletion, TaxIntentRecord, TaxIntentStore } from './tax-emission-intent.service';

/** Durable, company-scoped persistence for the post-commit payment pipeline. */
export class PrismaTaxIntentStore implements TaxIntentStore {
  constructor(private readonly prisma: PrismaClient) {}

  async prepare(data: NewTaxIntent): Promise<TaxIntentRecord> {
    try {
      return await this.prisma.$transaction(async tx => {
        const invoice = await tx.factura.findUnique({ where: { idFactura: data.idFactura },
          select: { contrato: { select: { idEmpresa: true, cliente: { select: { idCliente: true, idEmpresa: true } } } } } });
        if (invoice?.contrato?.idEmpresa !== data.idEmpresa || invoice.contrato.cliente?.idEmpresa !== data.idEmpresa) {
          throw new Error('TAX_INTENT_COMPANY_MISMATCH');
        }
        if (data.idPago !== null) {
          const payment = await tx.pago.findUnique({ where: { idPago: data.idPago }, select: { idFactura: true, idCliente: true } });
          if (payment?.idFactura !== data.idFactura || payment.idCliente !== invoice.contrato.cliente.idCliente) {
            throw new Error('TAX_INTENT_PAYMENT_MISMATCH');
          }
        }
        // No update on replay: preserve fingerprint, state and original fiscal identity.
        return tx.taxEmissionIntent.upsert({
          where: { idEmpresa_ambiente_businessKey: { idEmpresa: data.idEmpresa, ambiente: data.ambiente, businessKey: data.businessKey } },
          create: data, update: {},
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // A racing prepare may hit UNIQUE; retrieve immutable data, never overwrite.
      // Serialization conflicts are surfaced to the caller; there is no send here.
      if ((error as { code?: string })?.code === 'P2002') {
        const existing = await this.prisma.taxEmissionIntent.findUnique({
          where: { idEmpresa_ambiente_businessKey: { idEmpresa: data.idEmpresa, ambiente: data.ambiente, businessKey: data.businessKey } },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async claim(record: TaxIntentRecord, claimId: string) {
    const result = await this.prisma.taxEmissionIntent.updateMany({
      where: { idEmpresa: record.idEmpresa, idIntencion: record.idIntencion, fingerprint: record.fingerprint,
        ambiente: 'sandbox', fechaEnvio: null, OR: [
          { estado: 'PENDIENTE', intentos: 0 },
          { estado: 'FALLIDO', ultimoError: 'CONFIRMED_NOT_SENT' },
        ] },
      data: { estado: 'EN_PROCESO', claimId, fechaInicio: new Date(), intentos: { increment: 1 } },
    });
    return result.count === 1;
  }

  async beginDispatch(record: TaxIntentRecord, claimId: string) {
    const updated = await this.prisma.taxEmissionIntent.updateMany({
      where: { idEmpresa: record.idEmpresa, idIntencion: record.idIntencion, fingerprint: record.fingerprint,
        ambiente: 'sandbox', estado: 'EN_PROCESO', intentos: { gte: 1 }, claimId, fechaEnvio: null },
      data: { fechaEnvio: new Date() },
    });
    return updated.count === 1;
  }

  async finish(record: TaxIntentRecord, claimId: string, result: TaxIntentCompletion) {
    if (!['GENERADO', 'FALLIDO', 'RESULTADO_INDETERMINADO'].includes(result.estado) ||
        (result.estado === 'GENERADO' && (!result.folio || !matchesIssuedFolio(record.folioEsperado, result.folio, record.tipoDte))) ||
        (result.ultimoError !== undefined && !['CONFIRMED_NOT_SENT', 'RECONCILIATION_REQUIRED'].includes(result.ultimoError))) {
      throw new Error('TAX_INTENT_COMPLETION_INPUT_INVALID');
    }
    const updated = await this.prisma.taxEmissionIntent.updateMany({
      where: { idEmpresa: record.idEmpresa, idIntencion: record.idIntencion, estado: 'EN_PROCESO', claimId },
      data: { estado: result.estado, folio: result.folio ?? null, ultimoError: result.ultimoError ?? null },
    });
    if (updated.count !== 1) throw new Error('TAX_INTENT_COMPLETION_CONFLICT');
  }

  async find(idEmpresa: number, idIntencion: string): Promise<TaxIntentRecord> {
    const record = await this.prisma.taxEmissionIntent.findFirst({ where: { idEmpresa, idIntencion } });
    if (!record) throw new Error('TAX_INTENT_NOT_FOUND');
    return record;
  }

  /** Mark stale work for investigation only; never release it for another send. */
  async quarantineStale(idEmpresa: number, startedBefore: Date) {
    if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1 || !Number.isFinite(startedBefore.getTime()) || startedBefore >= new Date()) {
      throw new Error('TAX_INTENT_RECOVERY_INPUT_INVALID');
    }
    return this.prisma.taxEmissionIntent.updateMany({
      where: { idEmpresa, ambiente: 'sandbox', estado: 'EN_PROCESO', fechaInicio: { lt: startedBefore } },
      data: { estado: 'RESULTADO_INDETERMINADO', ultimoError: 'RECONCILIATION_REQUIRED' },
    });
  }
}
