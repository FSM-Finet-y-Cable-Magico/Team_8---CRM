'use strict';
// No caller-supplied DB URL, existing cluster, Docker context or .env is accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function cleanEnv() {
  const result = { NODE_ENV: 'test', PGCLIENTENCODING: 'UTF8' };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) result[key] = process.env[key];
  }
  return result;
}

function assertTarget(capability) {
  const u = new URL(capability.url);
  assert.equal(u.protocol, 'postgresql:');
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.port, String(capability.port));
  assert.match(capability.database, /^p005_qa_[a-f0-9]{32}$/);
  assert.equal(u.pathname, `/${capability.database}`);
  assert.equal(u.username, 'p005_qa');
  assert.equal(u.search, '?schema=public&connection_limit=1');
  assert.equal(u.hash, '');
  assert.equal(u.search, '?schema=public&connection_limit=1');
  assert.equal(u.hash, '');
  assert.match(capability.runId, /^[a-f0-9-]{36}$/);
  assert.equal(capability.database, `p005_qa_${capability.runId.replaceAll('-', '')}`);
  assert.equal(path.basename(capability.root).startsWith('finet-p005-qa-'), true);
  assert.equal(path.dirname(path.resolve(capability.root)), path.resolve(os.tmpdir()));
  assert.equal(path.dirname(path.resolve(capability.root)), path.resolve(os.tmpdir()));
  assert.equal(path.resolve(capability.data), path.join(path.resolve(capability.root), 'data'));
  assert.equal(fs.readFileSync(path.join(capability.root, 'owner'), 'utf8'), capability.runId);
}

async function verifyDatabase(prisma, capability) {
  assertTarget(capability);
  const [identity] = await prisma.$queryRawUnsafe(`SELECT current_database() AS db, current_user AS usr,
    current_setting('data_directory') AS dir, current_setting('p005_qa.run_id') AS marker,
    inet_server_addr()::text AS host, inet_server_port() AS port, pg_backend_pid() AS pid,
    version() AS version`);
  assert.equal(identity.db, capability.database);
  assert.equal(identity.usr, 'p005_qa');
  assert.equal(identity.marker, capability.runId);
  assert.ok(['127.0.0.1', '127.0.0.1/32'].includes(identity.host));
  assert.equal(identity.port, capability.port);
  assert.equal(path.resolve(identity.dir).toLowerCase(), path.resolve(capability.data).toLowerCase());
  return identity;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function createCluster(binDir) {
  const bin = name => path.join(binDir, name + (process.platform === 'win32' ? '.exe' : ''));
  for (const name of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert.ok(fs.existsSync(bin(name)), `Missing binary ${name}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finet-p005-qa-'));
  const runId = randomUUID();
  const data = path.join(root, 'data');
  const database = `p005_qa_${runId.replaceAll('-', '')}`;
  const port = await freePort();
  const password = randomBytes(32).toString('hex');
  const pwFile = path.join(root, 'bootstrap-password');
  fs.writeFileSync(path.join(root, 'owner'), runId, { flag: 'wx' });
  fs.writeFileSync(pwFile, password, { mode: 0o600, flag: 'wx' });
  const env = cleanEnv();
  const capability = { root, data, database, port, runId,
    url: `postgresql://p005_qa:${password}@127.0.0.1:${port}/${database}?schema=public&connection_limit=1` };
  let started = false;
  function run(name, args, input) {
    // PostgreSQL daemon descendants must not inherit pipes that keep spawnSync open on Windows.
    return execFileSync(bin(name), args, { env, encoding: 'utf8', input, windowsHide: true, timeout: 60000,
      stdio: name === 'pg_ctl' ? 'ignore' : ['pipe', 'pipe', 'pipe'] });
  }
  function sql(sqlText, db = database) {
    return execFileSync(bin('psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'p005_qa', '-d', db,
      '-v', 'ON_ERROR_STOP=1', '-At'], { env: { ...env, PGPASSWORD: password }, input: sqlText,
      encoding: 'utf8', windowsHide: true, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  function stop() {
    // The capability can only identify the cluster this invocation created, never an existing installation.
    assertTarget(capability);
    if (started || fs.existsSync(path.join(data, 'postmaster.pid'))) {
      run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
    }
    assert.equal(fs.existsSync(path.join(data, 'postmaster.pid')), false);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('finet-p005-qa-'));
    assert.equal(fs.readFileSync(path.join(root, 'owner'), 'utf8'), runId);
    fs.rmSync(root, { recursive: true });
  }
  try {
    // initdb must create data itself. Existing directories are not accepted.
    assert.equal(fs.existsSync(data), false);
    run('initdb', ['-D', data, '-U', 'p005_qa', '--pwfile', pwFile, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale']);
    fs.unlinkSync(pwFile);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o',
      `-h 127.0.0.1 -p ${port} -c p005_qa.run_id=${runId}`, '-w', 'start']);
    started = true;
    // Read-only attestation precedes even CREATE DATABASE.
    assert.equal(sql("SELECT current_setting('p005_qa.run_id');", 'postgres').trim(), runId);
    assert.equal(path.resolve(sql('SHOW data_directory;', 'postgres').trim()).toLowerCase(), path.resolve(data).toLowerCase());
    sql(`CREATE DATABASE ${database};`, 'postgres');
    assertTarget(capability);
    return { capability, sql, stop, version: run('postgres', ['--version']).trim() };
  } catch (error) {
    try { stop(); } catch { /* Retain only this run's directory if safe cleanup cannot be confirmed. */ }
    throw error;
  }
}

module.exports = { cleanEnv, assertTarget, verifyDatabase, createCluster };
