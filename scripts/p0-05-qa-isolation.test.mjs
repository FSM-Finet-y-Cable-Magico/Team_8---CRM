import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import isolation from './p0-05-qa-isolation.cjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finet-p005-qa-'));
  const runId = randomUUID();
  fs.writeFileSync(path.join(root, 'owner'), runId);
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.equal(fs.readFileSync(path.join(root, 'owner'), 'utf8'), runId);
    // This test directory contains only its ownership file, no cluster.
    fs.unlinkSync(path.join(root, 'owner'));
    fs.rmdirSync(root);
  });
  const database = `p005_qa_${runId.replaceAll('-', '')}`;
  return { root, runId, database, data: path.join(root, 'data'), port: 54329,
    url: `postgresql://p005_qa:synthetic-test-only@127.0.0.1:54329/${database}?schema=public&connection_limit=1` };
}

test('rejects external hosts, existing DB names, ports, users and URL overrides before connecting', t => {
  const cap = fixture(t);
  assert.doesNotThrow(() => isolation.assertTarget(cap));
  for (const url of [
    cap.url.replace('127.0.0.1', 'external.invalid'),
    cap.url.replace(cap.database, 'postgres'),
    cap.url.replace(':54329/', ':5432/'),
    cap.url.replace('p005_qa:', 'postgres:'),
    cap.url + '&host=external.invalid',
  ]) assert.throws(() => isolation.assertTarget({ ...cap, url }));
});

test('rejects an unowned directory and a different cluster data path', t => {
  const cap = fixture(t);
  assert.throws(() => isolation.assertTarget({ ...cap, data: path.join(cap.root, 'existing') }));
  fs.writeFileSync(path.join(cap.root, 'owner'), randomUUID());
  assert.throws(() => isolation.assertTarget(cap));
  fs.writeFileSync(path.join(cap.root, 'owner'), cap.runId);
});

test('live identity attestation requires matching DB, user, marker, host, port and data directory', async t => {
  const cap = fixture(t);
  const row = { db: cap.database, usr: 'p005_qa', marker: cap.runId, host: '127.0.0.1/32', port: cap.port, dir: cap.data };
  const client = value => ({ $queryRawUnsafe: async () => [value] });
  await isolation.verifyDatabase(client(row), cap);
  for (const change of [
    { db: 'postgres' }, { usr: 'postgres' }, { marker: randomUUID() },
    { host: '192.0.2.1' }, { port: 5432 }, { dir: path.join(cap.root, 'other') },
  ]) await assert.rejects(isolation.verifyDatabase(client({ ...row, ...change }), cap));
});

test('child environment does not inherit DB credentials, PG connection overrides or provider keys', () => {
  const names = ['DATABASE_URL', 'PGHOST', 'PGPASSWORD', 'PGSERVICE', 'G1_API_KEY', 'G3_API_URL', 'NODE_OPTIONS'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = 'synthetic-test-only';
    const env = isolation.cleanEnv();
    for (const name of names) assert.equal(env[name], undefined);
    assert.equal(env.NODE_ENV, 'test');
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
