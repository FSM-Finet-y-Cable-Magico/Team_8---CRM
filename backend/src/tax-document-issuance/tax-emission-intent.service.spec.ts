import { NewTaxIntent, TaxDispatchResult, TaxEmissionIntentService, TaxIntentInput, TaxIntentRecord, TaxIntentState, TaxIntentStore } from './tax-emission-intent.service';

/** Unit double only: not a durable production implementation. */
class MemoryStore implements TaxIntentStore {
  records = new Map<string, TaxIntentRecord>();
  events: string[] = [];
  async prepare(data: NewTaxIntent) {
    const key = `${data.idEmpresa}:${data.ambiente}:${data.businessKey}`;
    let record = this.records.get(key);
    if (!record) {
      record = { ...data, idIntencion: `FAKE-${this.records.size}`, estado: 'PENDIENTE', intentos: 0, claimId: null, folio: null, ultimoError: null };
      this.records.set(key, record);
    }
    this.events.push('PREPARED');
    return { ...record };
  }
  async claim(record: TaxIntentRecord, claimId: string) {
    const current = [...this.records.values()].find(item => item.idIntencion === record.idIntencion)!;
    if (current.estado !== 'PENDIENTE' || current.intentos !== 0) return false;
    Object.assign(current, { estado: 'EN_PROCESO', intentos: 1, claimId });
    this.events.push('CLAIM_COMMITTED');
    return true;
  }
  async finish(record: TaxIntentRecord, claimId: string, result: { estado: TaxIntentState; folio?: string; ultimoError?: string }) {
    const current = [...this.records.values()].find(item => item.idIntencion === record.idIntencion)!;
    if (current.estado !== 'EN_PROCESO' || current.claimId !== claimId) throw new Error('FAKE_CONFLICT');
    Object.assign(current, result);
  }
  async beginDispatch() { return false; } // Unused by the fake dispatcher.
  async find(idEmpresa: number, idIntencion: string) {
    const current = [...this.records.values()].find(item => item.idIntencion === idIntencion && item.idEmpresa === idEmpresa);
    if (!current) throw new Error('NOT_FOUND');
    return { ...current };
  }
}
const input = (): TaxIntentInput => ({ idEmpresa: 1, idFactura: 10, idPago: 20, businessKey: 'FAKE_APPROVED_IDENTITY', policyVersion: 'FAKE_RULE', ambiente: 'sandbox',
  document: { bytes: Buffer.from('FICTIONAL_NOT_VALID_DTE'), formato: 2, tipoDte: 33, folio: '126' } });
const success: TaxDispatchResult = { state: 'GENERADO', folio: '126', tipoDte: 33 };
function setup(dispatch = jest.fn<Promise<TaxDispatchResult>, [unknown]>().mockResolvedValue(success), canIssue = true) {
  const store = new MemoryStore();
  const service = new TaxEmissionIntentService(store, { canIssue: () => canIssue, dispatch });
  return { store, service, dispatch };
}

describe('TaxEmissionIntentService (fake dispatcher, no real emission)', () => {
  it('persists and commits an atomic claim before dispatch', async () => {
    const { service, store, dispatch } = setup();
    dispatch.mockImplementation(async () => {
      expect(store.events).toEqual(['PREPARED', 'CLAIM_COMMITTED']);
      expect([...store.records.values()][0]).toMatchObject({ estado: 'EN_PROCESO', intentos: 1 });
      return success;
    });
    expect(await service.execute(input())).toMatchObject({ estado: 'GENERADO', folio: '126' });
  });
  it('does not dispatch while readiness is blocked', async () => {
    const { service, dispatch } = setup(undefined, false);
    expect(await service.execute(input())).toMatchObject({ estado: 'PENDIENTE', intentos: 0 });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('allows one send for repeated and concurrent requests with the same identity', async () => {
    const { service, dispatch, store } = setup();
    await Promise.all([service.execute(input()), service.execute(input()), service.execute(input())]);
    await service.execute(input());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(store.records.size).toBe(1);
  });
  it('rejects changed content, document type, policy and payment without overwriting', async () => {
    const { service, dispatch } = setup();
    await service.prepare(input());
    for (const modified of [
      { ...input(), idPago: 21 }, { ...input(), policyVersion: 'FAKE_OTHER_RULE' },
      { ...input(), document: { ...input().document, bytes: Buffer.from('CHANGED') } },
      { ...input(), document: { ...input().document, tipoDte: 34 as const } },
    ]) await expect(service.execute(modified)).rejects.toThrow('TAX_INTENT_CONTENT_CONFLICT');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not store full payload or recipient data in the intent', async () => {
    const { service, store } = setup();
    await service.prepare(input());
    const saved = JSON.stringify([...store.records.values()]);
    expect(saved).not.toContain('FICTIONAL_NOT_VALID_DTE');
    expect([...store.records.values()][0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('isolates identical logical keys by company', async () => {
    const { service, store, dispatch } = setup();
    await service.execute(input());
    await service.execute({ ...input(), idEmpresa: 2 });
    expect(store.records.size).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
  it('quarantines timeouts and exceptions without any automatic resend', async () => {
    const dispatch = jest.fn().mockRejectedValue(new Error('SECRET PROVIDER RESPONSE'));
    const { service } = setup(dispatch);
    const result = await service.execute(input());
    expect(result).toMatchObject({ estado: 'RESULTADO_INDETERMINADO', ultimoError: 'RECONCILIATION_REQUIRED' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    await service.execute(input());
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('does not trust a different folio or type in an otherwise successful response', async () => {
    for (const result of [{ ...success, folio: '127' }, { ...success, tipoDte: 39 }]) {
      const { service } = setup(jest.fn().mockResolvedValue(result));
      expect(await service.execute(input())).toMatchObject({ estado: 'RESULTADO_INDETERMINADO' });
    }
  });
  it('records a proven pre-send failure without automatically releasing it', async () => {
    const dispatch = jest.fn().mockResolvedValue({ state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' });
    const { service } = setup(dispatch);
    expect(await service.execute(input())).toMatchObject({ estado: 'FALLIDO', ultimoError: 'CONFIRMED_NOT_SENT' });
    await service.execute(input());
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('does not resend after completion persistence fails', async () => {
    const { service, store, dispatch } = setup();
    jest.spyOn(store, 'finish').mockRejectedValue(new Error('FAKE_DB_FAILURE'));
    await expect(service.execute(input())).rejects.toThrow('FAKE_DB_FAILURE');
    expect(await service.execute(input())).toMatchObject({ estado: 'EN_PROCESO', intentos: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown policy metadata and production before preparing work', async () => {
    const { service, store } = setup();
    for (const invalid of [{ ...input(), policyVersion: undefined as never }, { ...input(), ambiente: 'production' as never }]) {
      await expect(service.prepare(invalid)).rejects.toThrow('TAX_INTENT_INPUT_INVALID');
    }
    expect(store.records.size).toBe(0);
  });
});
