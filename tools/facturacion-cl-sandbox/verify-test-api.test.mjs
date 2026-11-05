import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTestApi, verifyProductionApi, productionInputFromEnvironment } from './verify-test-api.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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


const prod = { environment: 'production', source: 'provider-production-section', idEmpresa: 1,
  credentials: { usuario: 'SIMULATED_PROD_FINET', rut: 'SIMULATED_CORPORATE_RUT', clave: 'SIMULATED_PROD_PASSWORD' } };
const prodEnv = () => ({
  FACTURACION_CL_PRODUCTION_PREFLIGHT_ENABLED: 'true',
  FACTURACION_CL_PRODUCTION_PREFLIGHT_COMPANIES: JSON.stringify([{ idEmpresa: 1, alias: 'FINET' }, { idEmpresa: 2, alias: 'CABLE_MAGICO' }]),
  FACTURACION_CL_FINET_PRODUCTION_CREDENTIALS: JSON.stringify(prod.credentials),
  FACTURACION_CL_CABLE_MAGICO_PRODUCTION_CREDENTIALS: JSON.stringify({ usuario: 'SIMULATED_PROD_CABLE',
    rut: 'SIMULATED_SECOND_RUT', clave: 'SIMULATED_SECOND_PASSWORD' }),
});

test('production preflight authenticates and reads version only without claiming certification', async () => {
  const calls = [];
  const result = await verifyProductionApi(prod, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    if (calls.length === 1) {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), prod.credentials);
      return response(200, { token: 'SIMULATED_PROD_TOKEN' });
    }
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'SIMULATED_PROD_TOKEN');
    return response(200, { version: '1.2.3' });
  });
  assert.deepEqual(calls, ['https://rest.facturacion.cl/login', 'https://rest.facturacion.cl/wsds/version']);
  assert.equal(result.login, 'PASS'); assert.equal(result.version, 'PASS');
  assert.equal(result.readOnly, true); assert.equal(result.emissionRequests, 0);
  assert.equal(result.productionReady, false); assert.equal(result.issuerIdentityVerified, false);
  assert.equal(result.environmentEvidence, 'OPERATOR_DECLARED');
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});

test('production preflight rejects missing provenance or malformed credentials before any request', async () => {
  let calls = 0;
  for (const value of [{ ...prod, environment: 'test' }, { ...prod, source: undefined },
    { ...prod, idEmpresa: 0 }, { ...prod, idEmpresa: '1' }, { ...prod, credentials: {} },
    { ...prod, credentials: { ...prod.credentials, endpoint: '/wsds/procesar' } },
    { ...prod, credentials: { ...prod.credentials, clave: '  ' } },
    { ...prod, credentials: { ...prod.credentials, usuario: 'bad\r\nheader' } }]) {
    await assert.rejects(verifyProductionApi(value, async () => { calls++; }), /CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED/);
  }
  assert.equal(calls, 0);
});

test('known shared DEMO credentials cannot be relabeled as production', async () => {
  let calls = 0;
  for (const credentials of [{ ...prod.credentials, usuario: ' demofe ' }, { ...prod.credentials, rut: '1-9' }]) {
    await assert.rejects(verifyProductionApi({ ...prod, credentials }, async () => { calls++; }), /DEMO_CREDENTIALS_NOT_PRODUCTION/);
  }
  assert.equal(calls, 0);
});

test('production login rejection and invalid token never retry or consult version', async () => {
  for (const reply of [response(401, { message: prod.credentials.clave }), response(200, {}),
    response(200, { token: 'SIMULATED\r\nTOKEN' }), { status: 200, ok: true, json: async () => { throw new Error(prod.credentials.clave); } }]) {
    let calls = 0;
    const result = await verifyProductionApi(prod, async () => { calls++; return reply; });
    assert.equal(calls, 1); assert.notEqual(result.login, 'PASS');
    assert.equal(result.version, 'NOT_RUN'); assert.equal(result.productionReady, false);
    assert.ok(!JSON.stringify(result).includes('SIMULATED'));
  }
});

test('unexpected production version remains a visible contract mismatch with redacted content', async () => {
  let calls = 0;
  const result = await verifyProductionApi(prod, async () => ++calls === 1
    ? response(200, { token: 'SIMULATED_TOKEN' })
    : response(200, { version: [prod.credentials.clave], privateField: prod.credentials.usuario }));
  assert.equal(result.version, 'UNEXPECTED_RESPONSE');
  assert.equal(result.versionResponseShape.version, 'array');
  assert.equal(result.productionReady, false);
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});

test('arbitrary transport exception codes cannot echo credentials into production reports', async () => {
  const result = await verifyProductionApi(prod, async () => {
    throw Object.assign(new Error(prod.credentials.clave), { cause: { code: prod.credentials.clave } });
  });
  assert.equal(result.transportError, 'TRANSPORT_ERROR');
  assert.equal(result.login, 'TRANSPORT_FAILED');
  assert.ok(!JSON.stringify(result).includes('SIMULATED'));
});

test('production credentials are selected by an explicit independent company map', () => {
  const env = prodEnv();
  assert.deepEqual(productionInputFromEnvironment(env, 1).credentials, prod.credentials);
  const second = productionInputFromEnvironment(env, 2);
  assert.equal(second.idEmpresa, 2);
  assert.equal(second.credentials.usuario, 'SIMULATED_PROD_CABLE');
  assert.notEqual(second.credentials.clave, prod.credentials.clave);
});

test('production lookup never falls back to sandbox or another company credentials', () => {
  const env = prodEnv();
  delete env.FACTURACION_CL_CABLE_MAGICO_PRODUCTION_CREDENTIALS;
  env.FACTURACION_CL_CABLE_MAGICO_SANDBOX_CREDENTIALS = JSON.stringify(prod.credentials);
  env.FACTURACION_CL_FINET_SANDBOX_CREDENTIALS = JSON.stringify(prod.credentials);
  assert.throws(() => productionInputFromEnvironment(env, 2), /CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED/);
  assert.throws(() => productionInputFromEnvironment(env, 3), /PRODUCTION_COMPANY_MISSING/);
});

test('production map rejects malformed and ambiguous company entries', () => {
  for (const rows of [null, {}, [{ idEmpresa: 1, alias: 'FINET' }, { idEmpresa: 1, alias: 'CABLE_MAGICO' }],
    [{ idEmpresa: 1, alias: 'FINET' }, { idEmpresa: 2, alias: 'FINET' }],
    [{ idEmpresa: '1', alias: 'FINET' }], [{ idEmpresa: 1, alias: 'finet' }],
    [{ idEmpresa: 1, alias: 'FINET', environment: 'production' }], [null]]) {
    assert.throws(() => productionInputFromEnvironment({ ...prodEnv(),
      FACTURACION_CL_PRODUCTION_PREFLIGHT_COMPANIES: JSON.stringify(rows) }, 1), /PRODUCTION_COMPANIES_INVALID/);
  }
  assert.throws(() => productionInputFromEnvironment({ ...prodEnv(),
    FACTURACION_CL_PRODUCTION_PREFLIGHT_COMPANIES: 'not-json' }, 1), /PRODUCTION_COMPANIES_INVALID/);
});

test('production preflight remains disabled by default and ignores emission flags', () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    assert.throws(() => productionInputFromEnvironment({ ...prodEnv(),
      FACTURACION_CL_INTEGRATION_ENABLED: 'true', FACTURACION_CL_PRODUCTION_PREFLIGHT_ENABLED: flag }, 1),
    /PRODUCTION_PREFLIGHT_DISABLED/);
  }
});

test('production preflight refuses invalid requested company identifiers', () => {
  for (const id of [0, -1, 1.5, '1', NaN, Infinity]) {
    assert.throws(() => productionInputFromEnvironment(prodEnv(), id), /PRODUCTION_COMPANY_INVALID/);
  }
});

test('production credential JSON must be complete and errors contain no private input', () => {
  for (const raw of ['not-json', 'null', '[]', '{}', JSON.stringify({ ...prod.credentials, clave: '' }),
    JSON.stringify({ ...prod.credentials, extra: prod.credentials.clave })]) {
    assert.throws(() => productionInputFromEnvironment({ ...prodEnv(),
      FACTURACION_CL_FINET_PRODUCTION_CREDENTIALS: raw }, 1), error =>
      error.message === 'CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED' && !error.message.includes('SIMULATED'));
  }
});

test('production CLI exits before connecting when the explicit preflight flag is disabled', () => {
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL('./verify-test-api.mjs', import.meta.url)), '--production-company', '1'],
    { env: { ...process.env, ...prodEnv(), FACTURACION_CL_PRODUCTION_PREFLIGHT_ENABLED: 'false' }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'PRODUCTION_PREFLIGHT_DISABLED');
  assert.ok(!result.stderr.includes('SIMULATED'));
});

test('production CLI reports configuration errors without leaking malformed private JSON', () => {
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL('./verify-test-api.mjs', import.meta.url)), '--production-company', '1'],
    { env: { ...process.env, ...prodEnv(), FACTURACION_CL_FINET_PRODUCTION_CREDENTIALS: 'SIMULATED_MALFORMED_SECRET' },
      encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED');
});


test('both read-only probes accept only a singleton dotted version and retain its wire shape', async () => {
  for (const [verify, value] of [[verifyTestApi, input], [verifyProductionApi, prod]]) {
    const calls = [];
    const result = await verify(value, async (url, options) => {
      calls.push({ url, method: options.method });
      return calls.length === 1 ? response(200, { token: 'SIMULATED_TOKEN' }) : response(200, { version: ['1.2.3.4'] });
    });
    assert.deepEqual(calls, [{ url: 'https://rest.facturacion.cl/login', method: 'POST' },
      { url: 'https://rest.facturacion.cl/wsds/version', method: 'GET' }]);
    assert.equal(result.login, 'PASS'); assert.equal(result.version, 'PASS');
    assert.equal(result.reportedVersion, '1.2.3.4');
    assert.deepEqual(result.versionResponseShape, { version: 'array' });
    assert.equal(result.emissionRequests, 0);
    if (verify === verifyProductionApi) { assert.equal(result.productionReady, false); assert.equal(result.issuerIdentityVerified, false); }
    assert.ok(!JSON.stringify(result).includes('SIMULATED'));
  }
});

test('both probes reject ambiguous or malformed version arrays and never retry', async () => {
  for (const [verify, value] of [[verifyTestApi, input], [verifyProductionApi, prod]]) {
    for (const version of [[], ['1.2', '1.3'], [123], [null], [{}], [['1.2']], ['SIMULATED_PASSWORD'], ['1.2\n'], [' 1.2']]) {
      let calls = 0;
      const result = await verify(value, async () => ++calls === 1
        ? response(200, { token: 'SIMULATED_TOKEN' }) : response(200, { version }));
      assert.equal(calls, 2); assert.equal(result.version, 'UNEXPECTED_RESPONSE');
      assert.equal(result.reportedVersion, undefined);
      assert.ok(!JSON.stringify(result).includes('SIMULATED'));
    }
  }
});

test('version normalization cannot accept failed HTTP or multiline scalar responses', async () => {
  for (const [verify, value] of [[verifyTestApi, input], [verifyProductionApi, prod]]) {
    for (const [status, version] of [[500, ['1.2']], [401, ['1.2']], [200, '1.2\n'], [200, '1.2\r']]) {
      let calls = 0;
      const result = await verify(value, async () => ++calls === 1
        ? response(200, { token: 'SIMULATED_TOKEN' }) : response(status, { version }));
      assert.equal(calls, 2); assert.equal(result.version, 'UNEXPECTED_RESPONSE');
      assert.equal(result.reportedVersion, undefined);
      assert.ok(!JSON.stringify(result).includes('SIMULATED'));
    }
  }
});
