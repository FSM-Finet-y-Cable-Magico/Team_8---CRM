'use strict';
// Opt-in harness. A dedicated fresh cluster must attest its independent run marker.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
async function main() {
  const raw = process.env.QA_CONTRACT_SIGNATURE_DB_URL;
  const runId = process.env.QA_CONTRACT_SIGNATURE_RUN_ID;
  let url;
  try { url = new URL(raw); } catch { throw Error('ISOLATED_QA_REQUIRED'); }
  if (process.env.NODE_ENV !== 'test' || !/^[a-f0-9]{32}$/.test(runId || '')
      || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '5432'
      || url.username !== 'qa_contract' || url.pathname !== '/qa_contract_signature_' + runId
      || url.search !== '?schema=public&connection_limit=1' || url.hash) throw Error('ISOLATED_QA_REQUIRED');
  const { isolatedQaEnv } = await import('./i3-release-acceptance.mjs');
  const env = { ...isolatedQaEnv(), RUN_CONTRACT_SIGNATURE_PG_QA: '1',
    QA_CONTRACT_SIGNATURE_DB_URL: raw, QA_CONTRACT_SIGNATURE_RUN_ID: runId };
  const result = spawnSync(process.execPath, ['--max-old-space-size=3072', '-r', resolve(root, 'scripts/qa-loopback-only.cjs'),
    require.resolve('jest/bin/jest'), '--runInBand', '--runTestsByPath',
    'src/contracts/contracts-signature.postgres.integration.spec.ts'], {
    cwd: resolve(root, 'backend'), env, stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
main().catch(() => { console.error('ISOLATED_QA_REQUIRED_OR_RUN_FAILED'); process.exitCode = 1; });
