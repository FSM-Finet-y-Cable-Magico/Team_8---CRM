import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTestApi } from './verify-test-api.mjs';

const input = { environment: 'test', source: 'provider-test-section', credentials: { usuario: 'SIMULATED_USER', rut: 'SIMULATED_RUT', clave: 'SIMULATED_PASSWORD' } };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('probe permits only login and version, with raw Authorization and no redirects', async () => {
  const calls = [];
  const result = await verifyTestApi(input, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    if (calls.length === 1) {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), input.credentials);
      return response(200, { token: 'SIMULATED_TOKEN' });
    }
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'SIMULATED_TOKEN');
    return response(200, { version: '1.2.3' });
  });
  assert.deepEqual(calls, ['https://rest.facturacion.cl/login', 'https://rest.facturacion.cl/wsds/version']);
  assert.equal(result.login, 'PASS');
  assert.equal(result.version, 'PASS');
  assert.equal(result.emissionRequests, 0);
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});

test('probe refuses a production marker or missing test provenance before connecting', async () => {
  let calls = 0;
  const request = async () => { calls++; };
  for (const value of [{ ...input, environment: 'production' }, { ...input, source: undefined }, { ...input, credentials: {} }]) {
    await assert.rejects(verifyTestApi(value, request), /CONFIRMED_TEST_CREDENTIALS_REQUIRED/);
  }
  assert.equal(calls, 0);
});

test('failed or malformed login does not retry or consult version', async () => {
  for (const resultResponse of [response(401, { error: 'SIMULATED_PASSWORD' }), response(200, null), response(200, { token: 'bad\r\nheader' }),
    { status: 200, ok: true, json: async () => { throw new Error('SIMULATED_PASSWORD'); } }]) {
    let calls = 0;
    const result = await verifyTestApi(input, async () => { calls++; return resultResponse; });
    assert.equal(calls, 1);
    assert.notEqual(result.login, 'PASS');
    assert.equal(result.version, 'NOT_RUN');
    assert.ok(!JSON.stringify(result).includes('SIMULATED'));
  }
});

test('transport failure emits a sanitized code and never retries', async () => {
  let calls = 0;
  const result = await verifyTestApi(input, async () => {
    calls++;
    throw Object.assign(new Error('SIMULATED_PASSWORD'), { cause: { code: 'EACCES' } });
  });
  assert.equal(calls, 1);
  assert.equal(result.transportError, 'EACCES');
  assert.equal(result.login, 'TRANSPORT_FAILED');
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});

test('unexpected version content is not printed as service metadata', async () => {
  let calls = 0;
  const result = await verifyTestApi(input, async () => ++calls === 1 ? response(200, { token: 'SIMULATED_TOKEN' }) : response(200, { version: 'SIMULATED_PASSWORD' }));
  assert.equal(result.login, 'PASS');
  assert.equal(result.version, 'UNEXPECTED_RESPONSE');
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});
