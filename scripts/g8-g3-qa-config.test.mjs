import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateG8G3QaConfig } from './validate-g8-g3-qa-config.mjs';
const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const compose = load(readFileSync(new URL('../compose.g8-g3-qa.yaml', import.meta.url), 'utf8'));
const fixture = () => ({
  QA_BACKEND_IMAGE: `g8-backend@sha256:${'a'.repeat(64)}`, QA_FRONTEND_IMAGE: `g8-frontend@sha256:${'b'.repeat(64)}`,
  QA_DATABASE_URL: 'postgresql://g8_qa:synthetic@qa.invalid/finet_global_validacion?schema=public',
  QA_JWT_SECRET: 'synthetic-qa-config-test-not-a-deployment-secret', QA_FRONTEND_ORIGIN: 'https://g8-qa.invalid',
  QA_G3_API_URL: 'https://g3-qa.invalid', QA_G3_API_KEY: 'synthetic-outbound-only',
  QA_G8_INTEGRATION_API_KEYS: JSON.stringify([{ keyId: 'qa-g3', group: 'G3', sha256: 'c'.repeat(64), companies: [1, 2], active: true }]),
});

test('preflight acepta forma QA y nunca la presenta como autorizacion o prueba remota', () => {
  assert.deepEqual(validateG8G3QaConfig(fixture()), { valid: true, errors: [], credentialsPrinted: false, databaseUsed: false, deploymentAuthorized: false });
});
test('rechaza la base financiera, administrador PG y schema ajeno sin imprimir URLs', () => {
  for (const url of ['postgresql://g8_qa:synthetic@qa.invalid/crm_g8_prueba',
    'postgresql://postgres:synthetic@qa.invalid/finet_global_validacion',
    'postgresql://g8_qa:synthetic@qa.invalid/finet_global_validacion?schema=otro']) {
    const result = validateG8G3QaConfig({ ...fixture(), QA_DATABASE_URL: url });
    assert.equal(result.valid, false); assert.ok(result.errors.includes('QA_DATABASE_TARGET_OR_ROLE_INVALID'));
    assert.ok(!JSON.stringify(result).includes('synthetic@'));
  }
});
test('exige digest, claves scope G3, JWT y origen HTTPS sin ruta /api duplicada', () => {
  for (const override of [{ QA_BACKEND_IMAGE: 'g8:latest' }, { QA_JWT_SECRET: '' }, { QA_G3_API_KEY: '' },
    { QA_G8_INTEGRATION_API_KEYS: '[]' }, { QA_G8_INTEGRATION_API_KEYS: '{broken' },
    { QA_G8_INTEGRATION_API_KEYS: fixture().QA_G8_INTEGRATION_API_KEYS.replace('G3', 'G2') },
    { QA_G3_API_URL: 'https://g3-qa.invalid/api' }, { QA_FRONTEND_ORIGIN: 'http://g8-qa.invalid' }]) {
    assert.equal(validateG8G3QaConfig({ ...fixture(), ...override }).valid, false);
  }
});
test('no permite puertos ambiguos, inyeccion de binding ni puerto financiero conocido', () => {
  for (const override of [{ QA_BACKEND_PORT: '8800' }, { QA_BACKEND_PORT: '18809' },
    { QA_FRONTEND_PORT: '0.0.0.0:18809' }, { QA_BACKEND_PORT: '70000' }]) {
    assert.ok(validateG8G3QaConfig({ ...fixture(), ...override }).errors.includes('QA_PORTS_INVALID'));
  }
});
test('Compose fuerza proveedores apagados y worker false sin heredar archivos privados', () => {
  assert.equal(compose.name, 'finet-g8-g3-qa');
  assert.deepEqual(Object.keys(compose.services).sort(), ['backend', 'frontend']);
  const backend = compose.services.backend;
  assert.deepEqual(backend.command, ['node', 'dist/main.js']);
  assert.equal(backend.environment.PLAN_CHANGE_PROCESSOR_ENABLED, 'false');
  for (const key of ['G1_INTEGRATION_ENABLED', 'FACTURACION_CL_INTEGRATION_ENABLED',
    'FACTURACION_CL_PRODUCTION_ENABLED', 'FACTURACION_CL_DELIVERY_ENABLED']) assert.equal(backend.environment[key], 'false');
  for (const key of ['MAIL_PROVIDER', 'WHATSAPP_PROVIDER', 'BILLING_NOTIFICATION_MODE']) assert.equal(backend.environment[key], 'disabled');
  assert.equal(backend.environment.G3_INTEGRATION_ENABLED, 'true');
  assert.equal(backend.environment.G8_INTEGRATION_API_KEYS.startsWith('${QA_'), true);
  assert.equal(backend.environment.DATABASE_URL.startsWith('${QA_DATABASE_URL:?'), true);
  assert.equal(backend.env_file, undefined); assert.equal(backend.build, undefined);
});
test('Compose conserva recursos independientes, loopback y UI opt-in', () => {
  for (const service of Object.values(compose.services)) {
    assert.equal(service.container_name, undefined);
    assert.equal(service.network_mode, undefined);
    assert.equal(service.privileged, undefined);
    assert.equal(service.restart, 'no');
    for (const port of service.ports) assert.ok(port.startsWith('127.0.0.1:'));
  }
  assert.deepEqual(compose.services.backend.volumes, ['qa_generated:/app/generated']);
  assert.deepEqual(compose.volumes, { qa_generated: {} });
  assert.deepEqual(compose.networks, { qa: {} });
  assert.deepEqual(compose.services.frontend.profiles, ['ui']);
});
