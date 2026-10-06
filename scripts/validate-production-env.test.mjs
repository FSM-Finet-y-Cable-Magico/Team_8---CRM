import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { main, validateFacturacionClCompanies, validateProductionEnv } from './validate-production-env.mjs';

const base = {
  DATABASE_URL: 'postgresql://app:private-value@db.internal:5432/crm',
  JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
  PORT: '3000',
  FRONTEND_URL: 'https://crm.example.test',
  G1_INTEGRATION_ENABLED: 'false',
};

test('variables G1 opcionales no bloquean módulos independientes ni inventan credenciales', () => {
  const result = validateProductionEnv(base);
  assert.equal(result.ok, true);
  assert.equal(result.rows.some(row => row.startsWith('G1_SECOND_CREDENTIAL:')), false);
  assert.ok(result.rows.includes('G8_S2S_AUTH: not configured'));
});

test('Facturacion.cl queda bloqueado mientras falta contrato y valida separacion por empresa', () => {
  const companies = JSON.stringify([
    { idEmpresa: 1, alias: 'FINET', environment: 'sandbox', enabled: true },
    { idEmpresa: 2, alias: 'CABLE_MAGICO', environment: 'production', enabled: false },
  ]);
  assert.equal(validateProductionEnv({ ...base, FACTURACION_CL_COMPANIES: companies }).ok, true);
  const enabled = validateProductionEnv({ ...base, FACTURACION_CL_INTEGRATION_ENABLED: 'true', FACTURACION_CL_COMPANIES: companies });
  assert.equal(enabled.ok, false);
  assert.ok(enabled.errors.includes('FACTURACION_CL_INTEGRATION_ENABLED_PENDING_CONTRACT'));
  assert.equal(validateFacturacionClCompanies('[{"idEmpresa":1,"alias":"FINET","environment":"sandbox","enabled":true,"password":"x"}]').valid, false);
});

test('G1 habilitado requiere URL y key sin inventar segunda credencial', () => {
  const missing = validateProductionEnv({ ...base, G1_INTEGRATION_ENABLED: 'true' });
  assert.equal(missing.ok, false);
  const ready = validateProductionEnv({ ...base, G1_INTEGRATION_ENABLED: 'true', G1_API_URL: 'https://g1.example.test', G1_API_KEY: 'opaque-key' });
  assert.equal(ready.ok, true);
});

test('valida hashes S2S, scope y rotación sin claves en claro', () => {
  const sha256 = createHash('sha256').update('never-committed-key').digest('hex');
  const result = validateProductionEnv({ ...base, G8_INTEGRATION_API_KEYS: JSON.stringify([
    { keyId: 'g1-current', group: 'G1', sha256, companies: [1], active: true },
    { keyId: 'g1-next', group: 'G1', sha256: 'b'.repeat(64), companies: [1, 2], active: false },
  ]) });
  assert.equal(result.ok, true);
  assert.equal(result.rows.some(row => row.includes('never-committed-key')), false);
});

test('salida nunca imprime valores sensibles', () => {
  const lines = [];
  assert.equal(main({ ...base, DATABASE_URL: 'secret-database-value', JWT_SECRET: 'secret-jwt-value' }, line => lines.push(line)), 1);
  const output = lines.join('\n');
  assert.doesNotMatch(output, /secret-database-value|secret-jwt-value/);
});
