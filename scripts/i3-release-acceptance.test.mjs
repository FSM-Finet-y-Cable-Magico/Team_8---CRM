import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseAcceptanceArgs, prepareEvidenceDirectory, isolatedQaEnv } from './i3-release-acceptance.mjs';

test('acceptance CLI preserves output-dir and rejects ambiguous options', () => {
  assert.deepEqual(parseAcceptanceArgs(['--run-local', '--output-dir', 'docs/evidencias/new-run']), { runLocal: true, outputDir: 'docs/evidencias/new-run' });
  for (const args of [['--output-dir'], ['--output-dir','--run-local'], ['--unknown'], ['--run-local','--run-local']]) assert.throws(() => parseAcceptanceArgs(args));
});
test('acceptance refuses historical directories and destinations outside the checkout', () => {
  const base = resolve('.codex-review'); mkdirSync(base, { recursive: true });
  const temp = mkdtempSync(join(base, 'output-policy-'));
  try {
    const file = join(temp, 'historical.json'); writeFileSync(file, 'unchanged');
    assert.throws(() => prepareEvidenceDirectory(temp), /ALREADY_EXISTS/);
    assert.equal(readFileSync(file, 'utf8'), 'unchanged');
    assert.throws(() => prepareEvidenceDirectory('../forbidden-evidence'), /OUTSIDE_CHECKOUT/);
    assert.throws(() => prepareEvidenceDirectory('backend/forbidden-evidence'), /RESERVED/);
    assert.equal(prepareEvidenceDirectory(join(temp, 'new')), join(temp, 'new'));
  } finally {
    assert.equal(dirname(temp), base); rmSync(temp, { recursive: true, force: true });
  }
});
test('QA socket guard blocks external connections before DNS and permits local servers', () => {
  const script = `const assert=require('node:assert/strict'),net=require('node:net');
    assert.throws(()=>net.connect({host:'provider.example.invalid',port:443}),{code:'QA_NETWORK_BLOCKED'});
    const server=net.createServer(s=>s.end('ok'));server.listen(0,()=>{
      assert.equal(server.address().address,'127.0.0.1');
      const client=net.connect(server.address().port,'127.0.0.1');let body='';
      client.on('data',b=>body+=b);client.on('end',()=>{assert.equal(body,'ok');server.close();});
    });
    assert.ok(server.address(), 'listen(0) must bind synchronously for Supertest');
    assert.throws(()=>net.createServer().listen(0,'0.0.0.0'),{code:'QA_NETWORK_BLOCKED'});`;
  const r = spawnSync(process.execPath, ['--require', resolve('scripts/qa-loopback-only.cjs'), '-e', script], { env: isolatedQaEnv(), encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
});
