import test from 'node:test';
import assert from 'node:assert/strict';
import { FacturacionClPrototypeClient, createFixtureTransport, parseProcessingResponse } from './prototype.mjs';

const companies = [1, 2].map(idEmpresa => ({ idEmpresa, environment: 'sandbox', enabled: true }));
const login = { status: 200, body: { token: 'SIMULATED_PRIVATE_TOKEN' } };
const document = { Resultado: 'True', Folio: '126', TipoDte: '33' };
const success = { status: 200, body: { WSPLANO: { Resultado: 'True', Detalle: { Documento: document } } } };
const input = { idEmpresa: 1, fileBytes: Buffer.from('SIMULATED_NOT_A_VALID_DTE'), formato: 2, expectedDteType: 33 };
function setup(fixtures, options = {}) {
  const transport = createFixtureTransport(fixtures);
  return { transport, client: new FacturacionClPrototypeClient({ enabled: true, companies, transport, ...options }) };
}

test('simulation recognizes success and retains only sanitized request metadata', async () => {
  const { client, transport } = setup([
    { ...login, expect: { method: 'POST', path: '/login', headers: { 'Content-Type': 'application/json' }, body: {
      usuario: 'SIMULATED_USER_1', rut: 'SIMULATED_RUT_1', clave: 'SIMULATED_PASSWORD_1',
    } } },
    { ...success, expect: { method: 'GET', path: '/wsds/procesar', headers: { Authorization: login.body.token }, query: {
      file: input.fileBytes.toString('base64'), formato: '2',
    } } },
  ]);
  assert.deepEqual(await client.processIntegration(input), { simulated: true, state: 'GENERADO', folio: '126', tipoDte: '33' });
  assert.deepEqual(transport.metadata(), [
    { idEmpresa: 1, method: 'POST', path: '/login', formato: null },
    { idEmpresa: 1, method: 'GET', path: '/wsds/procesar', formato: '2' },
  ]);
  assert.ok(!JSON.stringify(transport.metadata()).includes('SIMULATED_'));
});

test('no global network API is needed for the simulated path', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('NETWORK_FORBIDDEN'); });
  const { client } = setup([login, success]);
  assert.equal((await client.processIntegration(input)).state, 'GENERADO');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('integration defaults to disabled and cannot use an arbitrary transport', async () => {
  const { client, transport } = setup([], { enabled: false });
  await assert.rejects(client.processIntegration(input), { code: 'INTEGRATION_DISABLED' });
  assert.equal(transport.metadata().length, 0);
  assert.throws(() => new FacturacionClPrototypeClient({ transport: { request: globalThis.fetch } }), { code: 'FIXTURE_TRANSPORT_REQUIRED' });
  const defaultClient = new FacturacionClPrototypeClient({ companies, transport });
  await assert.rejects(defaultClient.authenticate(1), { code: 'INTEGRATION_DISABLED' });
});

test('production, credential fields and duplicate companies are rejected', () => {
  for (const invalidCompanies of [
    [{ idEmpresa: 1, environment: 'production', enabled: true }],
    [{ ...companies[0], clave: 'MUST_NOT_BE_ACCEPTED' }],
    [companies[0], companies[0]],
    [{ ...companies[0], idEmpresa: 0 }],
  ]) {
    assert.throws(() => setup([], { companies: invalidCompanies }), { code: 'INVALID_CONFIGURATION' });
  }
});

test('disabled or unknown company cannot authenticate or process', async () => {
  const { client, transport } = setup([], { companies: [{ ...companies[0], enabled: false }] });
  await assert.rejects(client.authenticate(1), { code: 'COMPANY_DISABLED_OR_MISSING' });
  await assert.rejects(client.processIntegration({ ...input, idEmpresa: 2 }), { code: 'COMPANY_DISABLED_OR_MISSING' });
  assert.equal(transport.metadata().length, 0);
});

test('invalid input stops before any authentication', async () => {
  const { client, transport } = setup([]);
  for (const change of [{ fileBytes: '' }, { fileBytes: new Uint8Array() }, { formato: 3 }, { expectedDteType: undefined }]) {
    await assert.rejects(client.processIntegration({ ...input, ...change }), { code: 'INVALID_INTEGRATION_INPUT' });
  }
  assert.equal(transport.metadata().length, 0);
});

test('authentication failures expose only fixed codes and never process a document', async () => {
  for (const [fixture, code] of [
    [{ status: 401, body: { error: 'SIMULATED_PRIVATE_TOKEN' } }, 'AUTH_HTTP_FAILED'],
    [{ status: 503 }, 'AUTH_HTTP_FAILED'],
    [{ status: 200, body: {} }, 'AUTH_INVALID_RESPONSE'],
    [{ status: 200, body: { token: 'invalid\r\nheader' } }, 'AUTH_INVALID_RESPONSE'],
    [{ failure: 'unknown' }, 'AUTH_TRANSPORT_FAILED'],
  ]) {
    const { client, transport } = setup([fixture]);
    await assert.rejects(client.processIntegration(input), { code, message: code });
    assert.equal(transport.metadata().length, 1);
  }
});

test('tokens are cached per company and refreshed before 24 hours', async () => {
  let time = 0;
  const { client, transport } = setup([login, login, login], { now: () => time });
  await client.authenticate(1);
  await client.authenticate(1);
  await client.authenticate(2);
  assert.deepEqual(transport.metadata().map(row => row.idEmpresa), [1, 2]);
  time = (24 * 60 - 5) * 60 * 1000;
  await client.authenticate(1);
  assert.deepEqual(transport.metadata().map(row => row.idEmpresa), [1, 2, 1]);
});

test('concurrent authentications share one login for the same company', async () => {
  const { client, transport } = setup([login]);
  const results = await Promise.all([client.authenticate(1), client.authenticate(1), client.authenticate(1)]);
  assert.equal(transport.metadata().length, 1);
  assert.ok(results.every(result => result.authenticated && result.simulated));
  assert.ok(!JSON.stringify(results).includes(login.body.token));
});

test('a failed login does not poison the next explicit authentication', async () => {
  const { client, transport } = setup([{ status: 401 }, login]);
  await assert.rejects(client.authenticate(1), { code: 'AUTH_HTTP_FAILED' });
  assert.equal((await client.authenticate(1)).authenticated, true);
  assert.equal(transport.metadata().length, 2);
});

test('outer success cannot hide an individual error or prove no existing DTE', () => {
  const body = { WSPLANO: { Resultado: 'True', Detalle: { Documento: { ...document, Resultado: 'False', Error: 'SIMULATED_PRIVATE_TOKEN: already exists' } } } };
  const result = parseProcessingResponse(body, 33);
  assert.equal(result.state, 'RESULTADO_INDETERMINADO');
  assert.ok(!JSON.stringify(result).includes('SIMULATED_PRIVATE_TOKEN'));
});

test('missing, ambiguous, malformed and mismatched results are indeterminate', () => {
  for (const body of [null, '<html>error</html>', {},
    { WSPLANO: { Resultado: 'False' } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: [document, document] } } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: { ...document, Folio: '' } } } },
    { WSPLANO: { Resultado: 'True', Detalle: { Documento: { ...document, TipoDte: '39' } } } },
  ]) assert.equal(parseProcessingResponse(body, 33).state, 'RESULTADO_INDETERMINADO');
  assert.equal(parseProcessingResponse({ WSPLANO: { Resultado: 'True', Detalle: { Documento: [document] } } }, 33).state, 'GENERADO');
});

test('timeout and HTTP failures never automatically resend the processing request', async () => {
  for (const fixture of [{ failure: 'unknown' }, { status: 401 }, { status: 429 }, { status: 500 }]) {
    const { client, transport } = setup([login, fixture, success]);
    assert.equal((await client.processIntegration(input)).state, 'RESULTADO_INDETERMINADO');
    assert.equal(transport.metadata().length, 2);
  }
});

test('only an explicit simulated pre-send failure is classified as not sent', async () => {
  const { client, transport } = setup([login, { failure: 'before-send' }]);
  assert.deepEqual(await client.processIntegration(input), { simulated: true, state: 'NO_ENVIADO', code: 'TRANSPORT_CONFIRMED_NOT_SENT' });
  assert.equal(transport.metadata().length, 2);
});
