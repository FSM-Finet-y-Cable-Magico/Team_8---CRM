import { PrismaClient } from '@prisma/client';
import { PrismaTaxIntentStore } from './prisma-tax-intent.store';
import { NewTaxIntent, TaxIntentRecord } from './tax-emission-intent.service';

const data: NewTaxIntent = { idEmpresa: 1, idFactura: 10, idPago: 20, ambiente: 'sandbox', businessKey: 'FAKE_IDENTITY', policyVersion: 'FAKE_RULE',
  tipoDte: 33, formato: 2, fingerprint: 'a'.repeat(64), folioEsperado: '126' };
const record: TaxIntentRecord = { ...data, idIntencion: 'FAKE_UUID', estado: 'PENDIENTE', intentos: 0, claimId: null, folio: null, ultimoError: null };
function setup() {
  const mock = {
    factura: { findUnique: jest.fn().mockResolvedValue({ contrato: { idEmpresa: 1, cliente: { idEmpresa: 1, idCliente: 30 } } }) },
    pago: { findUnique: jest.fn().mockResolvedValue({ idFactura: 10, idCliente: 30 }) },
    taxEmissionIntent: {
      upsert: jest.fn().mockResolvedValue(record), findUnique: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue(record),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async callback => callback(mock));
  return { store: new PrismaTaxIntentStore(mock as unknown as PrismaClient), mock };
}

describe('PrismaTaxIntentStore (mock queries, no database migration applied)', () => {
  it('checks financial ownership in a local Serializable transaction before preserving an intent', async () => {
    const { store, mock } = setup();
    await expect(store.prepare(data)).resolves.toEqual(record);
    expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(mock.taxEmissionIntent.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
  it.each([null, { contrato: { idEmpresa: 2, cliente: { idEmpresa: 1 } } }, { contrato: { idEmpresa: 1, cliente: { idEmpresa: 2 } } }])('rejects an invoice without matching company ownership', async invoice => {
    const { store, mock } = setup();
    mock.factura.findUnique.mockResolvedValue(invoice);
    await expect(store.prepare(data)).rejects.toThrow('TAX_INTENT_COMPANY_MISMATCH');
    expect(mock.taxEmissionIntent.upsert).not.toHaveBeenCalled();
  });
  it('rejects a payment attached to another invoice or customer', async () => {
    for (const payment of [null, { idFactura: 11, idCliente: 30 }, { idFactura: 10, idCliente: 31 }]) {
      const { store, mock } = setup();
      mock.pago.findUnique.mockResolvedValue(payment);
      await expect(store.prepare(data)).rejects.toThrow('TAX_INTENT_PAYMENT_MISMATCH');
      expect(mock.taxEmissionIntent.upsert).not.toHaveBeenCalled();
    }
  });
  it('retrieves an immutable existing row after a uniqueness race', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.upsert.mockRejectedValue({ code: 'P2002' });
    await expect(store.prepare(data)).resolves.toEqual(record);
    expect(mock.taxEmissionIntent.findUnique).toHaveBeenCalledWith({ where: { idEmpresa_ambiente_businessKey: { idEmpresa: 1, ambiente: 'sandbox', businessKey: 'FAKE_IDENTITY' } } });
  });
  it('does not swallow database errors or turn them into an external retry', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.upsert.mockRejectedValue({ code: 'P2034' });
    await expect(store.prepare(data)).rejects.toEqual({ code: 'P2034' });
    expect(mock.taxEmissionIntent.findUnique).not.toHaveBeenCalled();
  });
  it('claims work atomically for the company and refuses a lost claim', async () => {
    const { store, mock } = setup();
    expect(await store.claim(record, 'FAKE_CLAIM')).toBe(true);
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({ where: { idEmpresa: 1, ambiente: 'sandbox', estado: 'PENDIENTE', intentos: 0 }, data: { estado: 'EN_PROCESO', intentos: { increment: 1 } } });
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.claim(record, 'FAKE_OTHER_CLAIM')).toBe(false);
  });
  it('requires the same claim owner when persisting completion', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'GENERADO', folio: '126' })).rejects.toThrow('TAX_INTENT_COMPLETION_CONFLICT');
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0].where).toMatchObject({ idEmpresa: 1, estado: 'EN_PROCESO', claimId: 'FAKE_CLAIM' });
  });
  it('marks dispatch once using durable company, owner, fingerprint and null timestamp predicates', async () => {
    const { store, mock } = setup();
    expect(await store.beginDispatch(record, 'FAKE_CLAIM')).toBe(true);
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({
      where: { idEmpresa: 1, idIntencion: record.idIntencion, fingerprint: data.fingerprint, ambiente: 'sandbox',
        estado: 'EN_PROCESO', intentos: 1, claimId: 'FAKE_CLAIM', fechaEnvio: null },
      data: { fechaEnvio: expect.any(Date) },
    });
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.beginDispatch(record, 'FAKE_CLAIM')).toBe(false);
  });
  it('rejects resetting an intent or storing arbitrary remote error text', async () => {
    const { store, mock } = setup();
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'PENDIENTE' as never })).rejects.toThrow('TAX_INTENT_COMPLETION_INPUT_INVALID');
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'FALLIDO', ultimoError: 'FAKE_SECRET' })).rejects.toThrow('TAX_INTENT_COMPLETION_INPUT_INVALID');
    expect(mock.taxEmissionIntent.updateMany).not.toHaveBeenCalled();
  });
  it('quarantines stale work without releasing it for another dispatch', async () => {
    const { store, mock } = setup();
    await store.quarantineStale(1, new Date('2026-01-01T00:00:00Z'));
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({ where: { idEmpresa: 1, ambiente: 'sandbox', estado: 'EN_PROCESO' }, data: { estado: 'RESULTADO_INDETERMINADO', ultimoError: 'RECONCILIATION_REQUIRED' } });
  });
  it('keeps reads scoped to a company and fails closed on missing records', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.findFirst.mockResolvedValue(null);
    await expect(store.find(2, record.idIntencion)).rejects.toThrow('TAX_INTENT_NOT_FOUND');
    expect(mock.taxEmissionIntent.findFirst).toHaveBeenCalledWith({ where: { idEmpresa: 2, idIntencion: record.idIntencion } });
  });
});
