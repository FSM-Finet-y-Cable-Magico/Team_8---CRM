import assert from 'node:assert/strict';
import test from 'node:test';
import { main, writeGate } from './smoke-billing-write.mjs';

test('aborta antes de conectar si falta el flag explícito', async () => {
  let executed = false; const lines = [];
  const code = await main({ DATABASE_URL: 'postgresql://never-used' }, async () => { executed = true; }, line => lines.push(line));
  assert.equal(code, 2); assert.equal(executed, false); assert.match(lines.join(''), /BILLING_WRITE_TEST_NOT_ALLOWED/);
});

test('aborta antes de conectar si falta DATABASE_URL o si NODE_ENV es production', () => {
  assert.equal(writeGate({ ALLOW_RAILWAY_BILLING_WRITE_TEST: '1' }).reason, 'DATABASE_URL_NOT_CONFIGURED');
  assert.equal(writeGate({ ALLOW_RAILWAY_BILLING_WRITE_TEST: '1', DATABASE_URL: 'postgresql://unused', NODE_ENV: 'production' }).reason, 'RUN_FROM_OPERATOR_WORKSTATION_ONLY');
});

test('solo acepta éxito con rollback confirmado y no imprime conexión', async () => {
  const lines = [], secretUrl = 'postgresql://user:secret@private/db';
  const code = await main({ ALLOW_RAILWAY_BILLING_WRITE_TEST: '1', DATABASE_URL: secretUrl }, async () => ({ status: 'PASS_ROLLED_BACK', persisted: false }), line => lines.push(line));
  assert.equal(code, 0); assert.doesNotMatch(lines.join('\n'), /secret|private/);
});
