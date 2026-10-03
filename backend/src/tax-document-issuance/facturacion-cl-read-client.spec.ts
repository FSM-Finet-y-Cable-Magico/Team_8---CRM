import { FacturacionClReadClient, FacturacionClRequest } from './facturacion-cl-read-client';

const companies = [1, 2].map(idEmpresa => ({ idEmpresa, enabled: true, environment: 'sandbox' as const }));
const credentials = jest.fn(async (idEmpresa: number) => ({ usuario: `FAKE_USER_${idEmpresa}`, rut: 'FAKE_RUT', clave: 'FAKE_SECRET' }));
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const client = (request: FacturacionClRequest, now?: () => number, enabled = true) =>
  new FacturacionClReadClient({ enabled, companies, credentials }, request, now);

describe('FacturacionClReadClient', () => {
  beforeEach(() => credentials.mockClear());
  it('authenticates and consults only version, without exposing the token', async () => {
    const request = jest.fn().mockResolvedValueOnce(reply(200, { token: 'FAKE_TOKEN' })).mockResolvedValueOnce(reply(200, { version: '1.2.3' }));
    const api = client(request);
    expect(await api.authenticate(1)).toEqual({ authenticated: true, environment: 'sandbox', idEmpresa: 1 });
    expect(await api.version(1)).toEqual({ state: 'VERIFIED', version: '1.2.3' });
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://rest.facturacion.cl/login', 'https://rest.facturacion.cl/wsds/version']);
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'GET', redirect: 'error', headers: { Authorization: 'FAKE_TOKEN' } });
  });
  it('fails before connecting when disabled or the company is missing', async () => {
    const request = jest.fn();
    await expect(client(request, undefined, false).authenticate(1)).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    await expect(client(request).authenticate(3)).rejects.toMatchObject({ code: 'COMPANY_DISABLED_OR_MISSING' });
    expect(request).not.toHaveBeenCalled();
    expect(credentials).not.toHaveBeenCalled();
  });
  it('refuses production and duplicate configuration', () => {
    expect(() => new FacturacionClReadClient({ enabled: true, companies: [{ idEmpresa: 1, enabled: true, environment: 'production' as never }], credentials })).toThrow('CONFIGURATION_INVALID');
    expect(() => new FacturacionClReadClient({ enabled: true, companies: [companies[0], companies[0]], credentials })).toThrow('CONFIGURATION_INVALID');
  });
  it('does not permit later mutation of the original options to enable it', async () => {
    const options = { enabled: false, companies: [...companies], credentials };
    const request = jest.fn();
    const api = new FacturacionClReadClient(options, request);
    options.enabled = true;
    await expect(api.authenticate(1)).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(request).not.toHaveBeenCalled();
  });
  it('caches independently and shares concurrent logins only within a company', async () => {
    let now = 0;
    const request = jest.fn().mockResolvedValue(reply(200, { token: 'FAKE_TOKEN' }));
    const api = client(request, () => now);
    await Promise.all([api.authenticate(1), api.authenticate(1), api.authenticate(2)]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(credentials.mock.calls.map(call => call[0]).sort()).toEqual([1, 2]);
    now = (24 * 60 - 5) * 60000;
    await api.authenticate(1);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it.each([401, 500])('sanitizes auth HTTP %i and does not retry', async status => {
    const request = jest.fn().mockResolvedValue(reply(status, { error: 'FAKE_SECRET' }));
    await expect(client(request).authenticate(1)).rejects.toMatchObject({ message: 'AUTH_HTTP_FAILED', httpStatus: status });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('sanitizes malformed auth and network failures', async () => {
    await expect(client(jest.fn().mockResolvedValue(reply(200, { token: '\r\nFAKE_SECRET' }))).authenticate(1)).rejects.toThrow('AUTH_INVALID_RESPONSE');
    await expect(client(jest.fn().mockRejectedValue(new Error('FAKE_SECRET'))).authenticate(1)).rejects.toThrow('AUTH_TRANSPORT_FAILED');
  });
  it('reports the observed array discrepancy without returning its contents', async () => {
    const request = jest.fn().mockResolvedValueOnce(reply(200, { token: 'FAKE_TOKEN' })).mockResolvedValueOnce(reply(200, { version: ['FAKE_SECRET'] }));
    expect(await client(request).version(1)).toEqual({ state: 'CONTRACT_MISMATCH', responseShape: 'version:array' });
  });
  it('invalidates only the rejected token, without automatic login or version retry', async () => {
    const request = jest.fn().mockResolvedValueOnce(reply(200, { token: 'FAKE_TOKEN' })).mockResolvedValueOnce(reply(401, {})).mockResolvedValueOnce(reply(200, { token: 'FAKE_NEW_TOKEN' }));
    const api = client(request);
    await expect(api.version(1)).rejects.toMatchObject({ code: 'VERSION_HTTP_FAILED' });
    expect(request).toHaveBeenCalledTimes(2);
    await api.authenticate(1);
    expect(request).toHaveBeenCalledTimes(3);
  });
});
