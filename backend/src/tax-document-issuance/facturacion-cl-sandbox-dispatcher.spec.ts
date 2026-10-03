import { FacturacionClSandboxDispatcher, FacturacionClApprovedTestContract } from './facturacion-cl-sandbox-dispatcher';
import { FacturacionClReadOptions, FacturacionClRequest } from './facturacion-cl-read-client';
import { TaxIntentRecord, TaxIntentStore, taxIntentFingerprint } from './tax-emission-intent.service';

const document = { bytes: Buffer.from('FICTIONAL_NOT_VALID_DTE'), tipoDte: 33 as const, formato: 2 as const, folio: '126' };
const identity = { idEmpresa: 1, idFactura: 10, businessKey: 'FAKE_IDENTITY', policyVersion: 'FAKE_RULE', ambiente: 'sandbox' as const, document };
const contract: FacturacionClApprovedTestContract = { idEmpresa: 1, approved: true, environment: 'sandbox', policyVersion: 'FAKE_RULE', allowedDteTypes: [33] };
const options: FacturacionClReadOptions = { enabled: true, companies: [{ idEmpresa: 1, enabled: true, environment: 'sandbox' }],
  credentials: async () => ({ usuario: 'SIMULATED_USER', rut: 'SIMULATED_RUT', clave: 'SIMULATED_PASSWORD' }) };
const success = { WSPLANO: { Resultado: 'True', Detalle: { Documento: { Resultado: 'True', Folio: '126', TipoDte: '33' } } } };
const requestInput = { idEmpresa: 1, intentId: 'FAKE_UUID', claimId: 'FAKE_OWNER', document };
function setup(body: unknown = success, enabled = true, config = options) {
  const record: TaxIntentRecord = { ...identity, idPago: null, idIntencion: 'FAKE_UUID', tipoDte: 33, formato: 2,
    fingerprint: taxIntentFingerprint(identity), folioEsperado: '126', estado: 'EN_PROCESO', intentos: 1,
    claimId: 'FAKE_OWNER', folio: null, ultimoError: null };
  // Shared persistence double, survives construction of another dispatcher.
  let started = false;
  const store = { find: jest.fn().mockImplementation(async () => ({ ...record })),
    beginDispatch: jest.fn().mockImplementation(async () => { if (started) return false; started = true; return true; }),
  } as unknown as TaxIntentStore;
  const request = jest.fn<ReturnType<FacturacionClRequest>, Parameters<FacturacionClRequest>>()
    .mockImplementation(async url => ({ ok: true, status: 200, json: async () => url.endsWith('/login') ? { token: 'SIMULATED_TOKEN' } : body }));
  const create = () => new FacturacionClSandboxDispatcher(config, store, [contract], enabled, request);
  return { dispatcher: create(), create, store, request, record };
}

describe('FacturacionClSandboxDispatcher (fake transport only, no provider calls)', () => {
  it('is disabled by default and requires both company and emission gates', async () => {
    const { store, request } = setup();
    const dispatcher = new FacturacionClSandboxDispatcher(options, store, [contract], undefined, request);
    expect(dispatcher.canIssue(1)).toBe(false);
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' });
    for (const config of [{ ...options, enabled: false }, { ...options, companies: [] }]) {
      expect(setup(success, true, config).dispatcher.canIssue(1)).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects production or invalid contracts before a request', () => {
    const { store, request } = setup();
    expect(() => new FacturacionClSandboxDispatcher(options, store, [{ ...contract, environment: 'production' as never }], true, request))
      .toThrow('EMISSION_CONFIGURATION_INVALID');
    expect(() => new FacturacionClSandboxDispatcher(options, store, [{ ...contract, allowedDteTypes: [] }], true, request))
      .toThrow('EMISSION_CONFIGURATION_INVALID');
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { estado: 'PENDIENTE' }, { claimId: 'OTHER_OWNER' }, { intentos: 2 }, { ambiente: 'production' },
    { policyVersion: 'OTHER_RULE' }, { fingerprint: '0'.repeat(64) }, { folioEsperado: '127' }, { idEmpresa: 2 },
  ])('requires persisted company, owner, policy, content and folio proof: %j', async changed => {
    const { dispatcher, record, request } = setup();
    Object.assign(record, changed);
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' });
    expect(request).not.toHaveBeenCalled();
  });
  it('uses documented GET, raw Authorization, Base64 and both result levels', async () => {
    const { dispatcher, request, store } = setup();
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'GENERADO', folio: '126', tipoDte: 33 });
    expect(store.beginDispatch).toHaveBeenCalledWith(expect.objectContaining({ idEmpresa: 1 }), 'FAKE_OWNER');
    const [destination, init] = request.mock.calls[1];
    const url = new URL(destination);
    expect(url.origin + url.pathname).toBe('https://rest.facturacion.cl/wsds/procesar');
    expect(url.searchParams.get('formato')).toBe('2');
    expect(Buffer.from(url.searchParams.get('file')!, 'base64')).toEqual(document.bytes);
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { Authorization: 'SIMULATED_TOKEN' } });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('prevents concurrent and restarted direct dispatches with the same durable marker', async () => {
    const { dispatcher, request, create } = setup();
    const results = await Promise.all([dispatcher.dispatch(requestInput), dispatcher.dispatch(requestInput)]);
    expect(results.filter(result => result.state === 'GENERADO')).toHaveLength(1);
    expect(results.filter(result => result.state === 'RESULTADO_INDETERMINADO')).toHaveLength(1);
    expect(await create().dispatch(requestInput)).toEqual({ state: 'RESULTADO_INDETERMINADO' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    {}, null, { WSPLANO: { Resultado: 'False' } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: { Resultado: 'False', Folio: '126', TipoDte: '33' } } } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: { Resultado: 'True', Folio: '127', TipoDte: '33' } } } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: { Resultado: 'True', Folio: '126', TipoDte: '39' } } } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: [] } } },
  ])('keeps uncertain processing responses quarantined: %j', async body => {
    const { dispatcher, request } = setup(body);
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'RESULTADO_INDETERMINADO' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not dispatch on failed authentication and exposes no provider message', async () => {
    const { dispatcher, request } = setup();
    request.mockRejectedValue(new Error('FAKE_SECRET'));
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'FALLIDO', code: 'CONFIRMED_NOT_SENT' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([401, 500])('never retries processing HTTP %i', async status => {
    const { dispatcher, request } = setup();
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'SIMULATED_TOKEN' }) })
      .mockResolvedValue({ ok: false, status, json: async () => { throw new Error('MUST_NOT_READ_BODY'); } });
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'RESULTADO_INDETERMINADO' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('preserves uncertainty after processing timeout or a failed durable marker', async () => {
    const { dispatcher, request } = setup();
    request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'SIMULATED_TOKEN' }) })
      .mockRejectedValue(new Error('FAKE_TIMEOUT_SECRET'));
    expect(await dispatcher.dispatch(requestInput)).toEqual({ state: 'RESULTADO_INDETERMINADO' });
    expect(request).toHaveBeenCalledTimes(2);
    const next = setup();
    jest.spyOn(next.store, 'beginDispatch').mockRejectedValue(new Error('FAKE_DB_FAILURE'));
    expect(await next.dispatcher.dispatch(requestInput)).toEqual({ state: 'RESULTADO_INDETERMINADO' });
    expect(next.request).not.toHaveBeenCalled();
  });
});
