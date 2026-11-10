import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./i4-contract-signature-qa.cjs', import.meta.url));
for (const [name, extra] of [
  ['no usa DATABASE_URL como alternativa', { NODE_ENV: 'test', DATABASE_URL: 'operational-url-must-not-be-used' }],
  ['rechaza producción antes de cargar Prisma', { NODE_ENV: 'production' }],
  ['rechaza host externo y no publica la URL', { NODE_ENV: 'test', QA_CONTRACT_SIGNATURE_RUN_ID: 'a'.repeat(32),
    QA_CONTRACT_SIGNATURE_DB_URL: 'postgresql://qa_contract@example.invalid:5432/qa_contract_signature_' + 'a'.repeat(32) + '?schema=public&connection_limit=1' }],
]) test('harness de firma ' + name, () => {
  const result = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH, ...extra }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /^ISOLATED_QA_REQUIRED_OR_RUN_FAILED\r?\n$/);
  assert.doesNotMatch(result.stderr, /operational-url|synthetic-only|example\.invalid/);
});

for (const name of ['off','recovery']) test('harness '+name+' rechaza URL ajena antes de cargar la aplicación y no publica claves',()=>{
  const script=fileURLToPath(new URL('./i4-contract-signature-'+name+'-qa.cjs',import.meta.url));
  const url='postgresql://qa_contract:synthetic-only@example.invalid:5432/foreign';
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test',
    QA_CONTRACT_SIGNATURE_RUN_ID:'a'.repeat(32),QA_SIGNATURE_OFF_DB_URL:url,QA_CONTRACT_SIGNATURE_DB_URL:url}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.doesNotMatch(result.stderr,/synthetic-only|example\\.invalid|postgresql:/);
});
