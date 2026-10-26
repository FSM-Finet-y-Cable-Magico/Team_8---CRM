'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fork, execFileSync } = require('node:child_process');
const { createHash, randomUUID, randomBytes } = require('node:crypto');
const { createCluster, verifyDatabase, cleanEnv } = require('./p0-05-qa-isolation.cjs');
const repo = path.resolve(__dirname, '..');
const workerFile = path.join(__dirname, 'p0-05-qa-worker.cjs');
const children = new Set();
const digest = text => createHash('sha256').update(text).digest('hex');
const admin = { idUsuario: 1, idEmpresa: 1, roles: ['Administrador'], nombreCompleto: 'QA', email: null };

async function simulatedG1() {
  const key = randomBytes(32).toString('hex');
  const requests = [], effects = new Map(), behavior = new Map(), held = new Map();
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/integraciones/activaciones' || req.headers['x-api-key'] !== key) {
      res.writeHead(403).end(); return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) { res.writeHead(413).end(); return; } chunks.push(chunk); }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const hash = digest(JSON.stringify(payload));
    const duplicate = effects.has(payload.event_id);
    requests.push({ eventId: payload.event_id, hash, company: payload.id_empresa,
      contract: payload.id_contrato, customer: payload.id_cliente, service: payload.id_servicio, duplicate });
    const mode = behavior.get(payload.event_id);
    behavior.delete(payload.event_id);
    if (mode === 'hold-error') {
      held.set(payload.event_id, () => res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false })));
      return;
    }
    if (duplicate && effects.get(payload.event_id) !== hash) { res.writeHead(409).end(); return; }
    effects.set(payload.event_id, hash);
    if (mode === 'accept-disconnect') { res.destroy(); return; }
    if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 150));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, data: {
      event_id: payload.event_id, id_servicio: payload.id_servicio,
      equipos_asociados: payload.equipos.length, duplicado: duplicate,
    } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, key, requests, effects, behavior, held,
    close: () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}

function launch(capability, stub, input) {
  const child = fork(workerFile, [], { cwd: capability.root, windowsHide: true,
    env: { ...cleanEnv(), DATABASE_URL: capability.url }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  children.add(child);
  // Drain but never print service bodies, SQL errors, credentials or synthetic identities.
  child.stdout.resume(); child.stderr.resume();
  let readyResolve, readyReject, finishedResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let result = null, identity = null;
  const finished = new Promise(resolve => { finishedResolve = resolve; });
  const timer = setTimeout(() => { readyReject(new Error('QA worker timeout')); child.kill(); }, 85000);
  child.on('message', message => {
    if (message.ready) { identity = message; readyResolve(message); }
    else { result = message; if (message.setupFailed) readyReject(new Error(`QA worker setup: ${message.error}`)); }
  });
  child.on('error', error => readyReject(error));
  child.on('exit', (code, signal) => {
    clearTimeout(timer); children.delete(child);
    if (!identity) readyReject(new Error('QA worker exited before identity attestation'));
    finishedResolve({ ...result, exitCode: code, signal, backendPid: identity?.backendPid, processPid: child.pid });
  });
  child.send({ capability, g1Origin: stub.origin, g1Key: stub.key, ...input });
  return { ready, finished, go: () => child.send('go') };
}

async function waitUntil(check, timeout = 15000) {
  const until = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > until) throw new Error('QA barrier timeout');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function scenarios(prisma, cluster, stub, evidence) {
  const { sha256Payload } = require('../backend/dist/g3-integration/g3-integration.utils');
  const company1 = await prisma.empresa.create({ data: { nombre: 'QA FiNet sintetico' } });
  const company2 = await prisma.empresa.create({ data: { nombre: 'QA Cable Magico sintetico' } });
  let serial = 0;
  function syntheticRut() {
    const base = String(99000000 + ++serial);
    let sum = 0, factor = 2;
    for (const digit of [...base].reverse()) { sum += Number(digit) * factor; factor = factor === 7 ? 2 : factor + 1; }
    const dv = 11 - sum % 11;
    return `${base}-${dv === 11 ? '0' : dv === 10 ? 'K' : dv}`;
  }
  async function fixture(company = company1.idEmpresa, customer = null) {
    const rut = customer?.rut ?? syntheticRut();
    const plan = await prisma.plan.create({ data: { idEmpresa: company, nombreComercial: 'QA Internet',
      tipoPlan: 'Internet', tipoCliente: 'Particular', precioMensual: 1000 } });
    const prospect = await prisma.prospecto.create({ data: { idEmpresa: company, idCliente: customer?.idCliente,
      rut, nombreCompleto: 'Persona sintetica QA', telefono: '+56900000000', estadoPipeline: 'Contrato Firmado' } });
    const contract = await prisma.contrato.create({ data: { idEmpresa: company, idPlan: plan.idPlan,
      idProspecto: prospect.idProspecto, idCliente: customer?.idCliente,
      fechaInicio: new Date('2026-10-01'), diaVencimiento: 10, estado: 'Firmado' } });
    const requestId = randomUUID(), traceId = randomUUID();
    const snapshot = { request_id: requestId, trace_id: traceId, id_empresa: company,
      id_prospecto: prospect.idProspecto, id_contrato: contract.idContrato, id_plan: plan.idPlan,
      persona: { rut, nombre_completo: 'Persona sintetica QA', telefono: '+56900000000' },
      direccion: { direccion_completa: 'Direccion sintetica QA', comuna: 'Comuna QA' } };
    const tracking = await prisma.integracionInstalacionG3.create({ data: { idEmpresa: company, idCliente: customer?.idCliente,
      idProspecto: prospect.idProspecto, idContrato: contract.idContrato, idPlan: plan.idPlan,
      requestId, traceId, idOtG3: String(9800000 + prospect.idProspecto), estadoIntegracion: 'ENVIADA', estadoOtG3: 'PENDIENTE',
      payloadSnapshot: snapshot, payloadHash: sha256Payload(snapshot) } });
    return { id: tracking.idIntegracion, company, contract: contract.idContrato, prospect: prospect.idProspecto,
      eventId: `g8-g1-activation-${requestId}`, closure: { id_ot: Number(tracking.idOtG3), request_id: requestId, trace_id: traceId,
        id_empresa: company, id_prospecto: prospect.idProspecto, id_contrato: contract.idContrato, id_plan: plan.idPlan,
        equipos_instalados: [{ numero_serie: `QA-ONLY-${prospect.idProspecto}` }], equipos_retirados: [] } };
  }
  async function run(f, action, extra = {}) {
    const closure = ['process', 'crash-before-g1', 'crash-after-g1'].includes(action) ? f.closure : undefined;
    const worker = launch(cluster.capability, stub, { action, id: f.id, closure, user: admin, ...extra });
    await worker.ready; worker.go(); return worker.finished;
  }
  async function summary(f) {
    const tracking = await prisma.integracionInstalacionG3.findUniqueOrThrow({ where: { idIntegracion: f.id } });
    const event = await prisma.integracionEventoEntrante.findUnique({ where: { idIntegracion_eventType: { idIntegracion: f.id, eventType: 'WORK_ORDER_COMPLETADA' } } });
    const g1 = await prisma.integracionActivacionG1.findUnique({ where: { eventId: f.eventId } });
    const contract = await prisma.contrato.findUniqueOrThrow({ where: { idContrato: f.contract } });
    const prospect = await prisma.prospecto.findUniqueOrThrow({ where: { idProspecto: f.prospect } });
    const customer = tracking.idCliente ? await prisma.cliente.findUnique({ where: { idCliente: tracking.idCliente } }) : null;
    const services = await prisma.servicioContratado.findMany({ where: { idContrato: f.contract }, select: { estadoOperativo: true, idServicio: true } });
    const sent = stub.requests.filter(r => r.eventId === f.eventId);
    return { ids: { tracking: f.id, company: f.company, contract: f.contract, customer: tracking.idCliente,
      service: tracking.idServicio, eventId: f.eventId }, rows: {
      customersTotal: await prisma.cliente.count(), services: services.length,
      events: await prisma.integracionEventoEntrante.count({ where: { idIntegracion: f.id } }),
      g1: g1 ? 1 : 0,
      auditsG3: await prisma.logAuditoria.count({ where: { entidadAfectada: 'integracion_instalacion_g3', idEntidadAfectada: f.id } }),
      auditsG1: g1 ? await prisma.logAuditoria.count({ where: { entidadAfectada: 'integracion_activacion_g1', idEntidadAfectada: g1.idIntegracion } }) : 0,
    }, states: { tracking: tracking.estadoIntegracion, contract: contract.estado, customer: customer?.estado ?? null,
      prospect: prospect.estadoPipeline, prospectCustomer: prospect.idCliente, contractCustomer: contract.idCliente,
      services: services.map(s => s.estadoOperativo), g1: g1?.estadoIntegracion ?? null,
      auditG3: event?.result?.postClosure?.audit ?? null, g1Marker: event?.result?.postClosure?.g1 ?? null },
    attempts: g1?.intentos ?? 0, sends: sent.length, simulatedEffects: stub.effects.has(f.eventId) ? 1 : 0,
    payloadHashes: sent.map(r => r.hash), duplicateResponses: sent.filter(r => r.duplicate).length };
  }
  const fault = (kind, target = 0) => prisma.$executeRaw`INSERT INTO qa_fault(kind, target) VALUES (${kind}, ${target})`;
  const clearFaults = () => prisma.$executeRaw`DELETE FROM qa_fault`;
  const faultHits = async () => {
    const [row] = await prisma.$queryRaw`SELECT
      (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM qa_event_failure_hits)::integer AS event,
      (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM qa_audit_failure_hits)::integer AS audit`;
    return row;
  };
  const expectComplete = s => {
    assert.equal(s.states.tracking, 'COMPLETADA'); assert.equal(s.states.contract, 'Activo');
    assert.deepEqual(s.states.services, ['Activo']); assert.equal(s.rows.events, 1); assert.equal(s.rows.g1, 1);
    assert.equal(s.states.g1, 'COMPLETADA'); assert.equal(s.rows.auditsG3, 2); assert.equal(s.rows.auditsG1, 2);
    assert.equal(s.states.auditG3, 'COMPLETADA'); assert.equal(s.states.g1Marker.state, 'COMPLETADA');
    assert.equal(s.states.g1Marker.auditPending, false);
  };
  async function test(name, action) {
    await clearFaults();
    const hitsBefore = await faultHits();
    const start = Date.now();
    try {
      const details = await action();
      const hitsAfter = await faultHits();
      const injectedFailures = { event: hitsAfter.event - hitsBefore.event, audit: hitsAfter.audit - hitsBefore.audit };
      if (name.startsWith('01')) assert.equal(injectedFailures.event, 1);
      if (name.startsWith('03')) assert.equal(injectedFailures.audit, 1);
      if (name.startsWith('05')) assert.ok(injectedFailures.audit >= 1);
      evidence.scenarios.push({ name, status: 'PASS', ms: Date.now() - start, injectedFailures, ...details });
    }
    catch (error) {
      evidence.scenarios.push({ name, status: 'FAIL', error: error.code ?? error.name,
        message: String(error.message).replace(/postgresql:\/\/\S+/g, '[REDACTED]').slice(0, 700) });
    }
    console.log(`${evidence.scenarios.at(-1).status}: ${name}`);
  }

  await test('01 rollback real del evento', async () => {
    const f = await fixture(), before = await summary(f);
    await fault('event', f.id);
    const worker = await run(f, 'process');
    const after = await summary(f);
    assert.equal(worker.ok, false); assert.equal(worker.activationCalls, 1);
    assert.equal(after.rows.customersTotal, before.rows.customersTotal); assert.equal(after.rows.services, 0);
    assert.equal(after.rows.events, 0); assert.equal(after.rows.g1, 0); assert.equal(after.rows.auditsG3, 0);
    assert.equal(after.states.contract, 'Firmado'); assert.equal(after.states.tracking, 'ENVIADA'); assert.equal(after.sends, 0);
    assert.equal(after.states.prospect, before.states.prospect);
    assert.equal(after.states.prospectCustomer, null); assert.equal(after.states.contractCustomer, null);
    return { before, after, worker };
  });
  await test('02 caida antes de G1 y reinicio', async () => {
    const f = await fixture();
    const crashed = await run(f, 'crash-before-g1');
    assert.equal(crashed.exitCode, 73);
    const committed = await summary(f);
    assert.equal(committed.states.tracking, 'COMPLETADA'); assert.equal(committed.rows.events, 1); assert.equal(committed.rows.g1, 0);
    const recovered = await run(f, 'recover');
    assert.equal(recovered.ok, true); assert.equal(recovered.activationCalls, 0);
    assert.notEqual(crashed.processPid, recovered.processPid);
    const after = await summary(f); expectComplete(after); assert.equal(after.sends, 1);
    assert.equal(after.rows.customersTotal, committed.rows.customersTotal);
    return { committed, after, workers: [crashed, recovered] };
  });
  await test('03 segunda auditoria G3 revierte ambas', async () => {
    const f = await fixture(); await fault('g3-audit', f.id);
    const initial = await run(f, 'process'); assert.equal(initial.ok, true);
    const pending = await summary(f);
    assert.equal(pending.rows.auditsG3, 0); assert.equal(pending.states.auditG3, 'PENDIENTE');
    assert.equal(pending.states.g1, 'COMPLETADA');
    await clearFaults(); const recovered = await run(f, 'recover'); assert.equal(recovered.activationCalls, 0);
    const after = await summary(f); expectComplete(after); assert.equal(after.sends, 1);
    return { pending, after };
  });
  await test('04 recuperaciones concurrentes independientes', async () => {
    const f = await fixture(); assert.equal((await run(f, 'crash-before-g1')).exitCode, 73);
    stub.behavior.set(f.eventId, 'delay');
    const a = launch(cluster.capability, stub, { action: 'recover', id: f.id });
    const b = launch(cluster.capability, stub, { action: 'recover', id: f.id });
    const identities = await Promise.all([a.ready, b.ready]);
    assert.notEqual(identities[0].backendPid, identities[1].backendPid);
    a.go(); b.go(); const workers = await Promise.all([a.finished, b.finished]);
    for (const worker of workers) { assert.equal(worker.ok, true); assert.equal(worker.activationCalls, 0); }
    const after = await summary(f); expectComplete(after); assert.equal(after.attempts, 1); assert.equal(after.sends, 1);
    return { after, workers };
  });
  await test('05 G1 confirmado y caida local sin reenvio', async () => {
    const f = await fixture(); await fault('g1-audit');
    const crashed = await run(f, 'crash-after-g1'); assert.equal(crashed.exitCode, 74);
    const pending = await summary(f);
    assert.equal(pending.states.g1, 'COMPLETADA'); assert.equal(pending.rows.auditsG1, 0); assert.equal(pending.sends, 1);
    await clearFaults(); const recovered = await run(f, 'recover'); assert.equal(recovered.activationCalls, 0);
    const after = await summary(f); expectComplete(after); assert.equal(after.sends, 1);
    return { pending, after, workers: [crashed, recovered] };
  });
  await test('06 respuesta HTTP tardia no degrada resultado posterior', async () => {
    const f = await fixture(); stub.behavior.set(f.eventId, 'hold-error');
    const first = launch(cluster.capability, stub, { action: 'process', closure: f.closure });
    await first.ready; first.go(); await waitUntil(() => stub.held.has(f.eventId));
    const g1 = await prisma.integracionActivacionG1.findUniqueOrThrow({ where: { eventId: f.eventId } });
    // Fault injection ONLY inside the attested disposable cluster; no wait of five minutes is required.
    await prisma.integracionActivacionG1.update({ where: { idIntegracion: g1.idIntegracion }, data: { ultimoIntento: new Date(Date.now() - 360000) } });
    const second = await run(f, 'retry', { id: g1.idIntegracion }); assert.equal(second.ok, true);
    stub.held.get(f.eventId)(); stub.held.delete(f.eventId);
    const original = await first.finished; assert.equal(original.ok, true);
    const after = await summary(f); expectComplete(after); assert.equal(after.attempts, 2); assert.equal(after.sends, 2);
    const audits = await prisma.logAuditoria.findMany({ where: { entidadAfectada: 'integracion_activacion_g1', idEntidadAfectada: g1.idIntegracion } });
    assert.ok(audits.every(a => a.valorNuevo.intento === 2 && a.valorNuevo.statusHttp !== 503));
    return { after, workers: [original, second] };
  });
  await test('07 empresas y cliente compartido', async () => {
    const customer = await prisma.cliente.create({ data: { idEmpresa: company1.idEmpresa, rut: syntheticRut(), nombreCompleto: 'Identidad sintetica compartida', estado: 'Moroso' } });
    const f1 = await fixture(company1.idEmpresa, customer), f2 = await fixture(company2.idEmpresa, customer);
    assert.equal((await run(f1, 'process')).ok, true);
    assert.equal((await run(f2, 'crash-before-g1')).exitCode, 73);
    const before = await summary(f2);
    const denied = await run(f2, 'reconcile', { user: { ...admin, idEmpresa: company1.idEmpresa, roles: ['Comercial'] } });
    assert.equal(denied.status, 403); assert.equal(denied.activationCalls, 0);
    assert.deepEqual(await summary(f2), before);
    const foreign = await prisma.cliente.create({ data: { idEmpresa: company1.idEmpresa, rut: syntheticRut(), nombreCompleto: 'Otra identidad QA', estado: 'Activo' } });
    await prisma.servicioContratado.update({ where: { idServicio: before.ids.service }, data: { idCliente: foreign.idCliente } });
    await run(f2, 'recover'); const inconsistent = await summary(f2);
    assert.equal(inconsistent.states.g1Marker.state, 'ERROR_REQUIERE_REVISION'); assert.equal(inconsistent.sends, 0);
    await prisma.servicioContratado.update({ where: { idServicio: before.ids.service }, data: { idCliente: customer.idCliente } });
    await run(f2, 'reconcile', { user: { ...admin, idEmpresa: company2.idEmpresa, roles: ['Comercial'] } });
    const first = await summary(f1), second = await summary(f2);
    expectComplete(first); expectComplete(second);
    assert.equal(first.ids.customer, second.ids.customer); assert.equal(first.states.customer, 'Moroso'); assert.equal(second.states.customer, 'Moroso');
    assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { idCliente: customer.idCliente } })).idEmpresa, company1.idEmpresa);
    const sent = stub.requests.filter(r => r.eventId === f2.eventId);
    assert.equal(sent.length, 1); assert.equal(sent[0].company, company2.idEmpresa); assert.equal(sent[0].contract, f2.contract);
    assert.equal(sent[0].customer, customer.idCliente); assert.equal(sent[0].service, second.ids.service);
    return { denied, inconsistent, companies: [first, second] };
  });
  await test('08 idempotencia G1 simulado tras ACK perdido', async () => {
    const f = await fixture(); stub.behavior.set(f.eventId, 'accept-disconnect');
    assert.equal((await run(f, 'process')).ok, true);
    const pending = await summary(f); assert.equal(pending.states.g1, 'PENDIENTE_SINCRONIZACION_G1'); assert.equal(pending.simulatedEffects, 1);
    const g1 = await prisma.integracionActivacionG1.findUniqueOrThrow({ where: { eventId: f.eventId } });
    const retried = await run(f, 'retry', { id: g1.idIntegracion }); assert.equal(retried.ok, true); assert.equal(retried.activationCalls, 0);
    await run(f, 'recover'); const after = await summary(f);
    assert.equal(after.states.g1, 'COMPLETADA'); assert.equal(after.rows.services, 1); assert.equal(after.rows.events, 1);
    assert.equal(after.rows.auditsG1, 3); assert.equal(after.sends, 2); assert.equal(after.simulatedEffects, 1);
    assert.equal(new Set(after.payloadHashes).size, 1); assert.equal(after.duplicateResponses, 1);
    assert.equal(after.rows.g1, 1); assert.equal(after.states.auditG3, 'COMPLETADA');
    assert.equal(after.states.g1Marker.state, 'COMPLETADA');
    return { pending, after, worker: retried };
  });
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1, 'Usage: node scripts/p0-05-postgresql-qa.cjs [PostgreSQL bin directory]');
  const evidenceFile = path.join(repo, 'docs/i4-p0-05-postgresql-qa.evidence.json');
  const evidence = { status: 'QA_BLOCKED', startedAt: new Date().toISOString(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    scenarios: [], productionAccess: false, realProviderAccess: false, cleanup: false };
  let cluster, prisma, stub;
  try {
    assert.ok(fs.existsSync(path.join(repo, 'backend/dist/g3-integration/g3-closure.processor.js')), 'Run backend build first');
    cluster = await createCluster(args[0] ?? 'C:/Program Files/PostgreSQL/18/bin');
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    const identity = await verifyDatabase(prisma, cluster.capability);
    evidence.environment = { engine: cluster.version, version: identity.version, host: identity.host, port: identity.port,
      database: identity.db, runId: cluster.capability.runId, temporaryDataDirectory: cluster.capability.data,
      primaryBackendPid: identity.pid, dockerUsed: false, connectionLimitPerWorker: 1 };
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';").trim(), '0');
    const canonical = fs.readFileSync(path.join(repo, 'db/global/init-global.sql'), 'utf8');
    assert.doesNotMatch(canonical, /^\s*\\/m, 'psql meta-commands forbidden');
    evidence.canonicalSha256 = digest(canonical);
    cluster.sql(canonical); // Canonical DDL ONLY on this newly created, empty and attested database.
    cluster.sql(`CREATE TABLE qa_fault(kind text NOT NULL, target integer NOT NULL);
      -- Sequences are intentionally nontransactional witnesses that a fault was reached.
      CREATE SEQUENCE qa_event_failure_hits;
      CREATE SEQUENCE qa_audit_failure_hits;
      CREATE FUNCTION qa_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF EXISTS(SELECT 1 FROM qa_fault WHERE kind='event' AND target=NEW.id_integracion) THEN
          PERFORM nextval('qa_event_failure_hits'); RAISE EXCEPTION 'QA_EVENT_FAILURE'; END IF;
        RETURN NEW; END $$;
      CREATE TRIGGER qa_event BEFORE INSERT ON integracion_evento_entrante FOR EACH ROW EXECUTE FUNCTION qa_fail_event();
      CREATE FUNCTION qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF (NEW.accion='ACTIVAR_SERVICIO_DESDE_G3' AND EXISTS(SELECT 1 FROM qa_fault WHERE kind='g3-audit' AND target=NEW.id_entidad_afectada))
        OR (NEW.entidad_afectada='integracion_activacion_g1' AND EXISTS(SELECT 1 FROM qa_fault WHERE kind='g1-audit')) THEN
          PERFORM nextval('qa_audit_failure_hits'); RAISE EXCEPTION 'QA_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER qa_audit BEFORE INSERT ON log_auditoria FOR EACH ROW EXECUTE FUNCTION qa_fail_audit();`);
    stub = await simulatedG1(); evidence.environment.simulatedG1 = stub.origin;
    await scenarios(prisma, cluster, stub, evidence);
    evidence.finalRows = { companies: await prisma.empresa.count(), customers: await prisma.cliente.count(),
      contracts: await prisma.contrato.count(), services: await prisma.servicioContratado.count(),
      trackingsG3: await prisma.integracionInstalacionG3.count(), events: await prisma.integracionEventoEntrante.count(),
      trackingsG1: await prisma.integracionActivacionG1.count(), audits: await prisma.logAuditoria.count(),
      localHttpRequests: stub.requests.length, simulatedEffects: stub.effects.size };
    evidence.status = evidence.scenarios.length === 8 && evidence.scenarios.every(s => s.status === 'PASS') ? 'QA_PASS' : 'QA_FAIL';
  } catch (error) {
    evidence.blocker = { code: error.code ?? error.name,
      message: String(error.message).replace(/postgresql:\/\/\S+/g, '[REDACTED]').slice(0, 700) };
  } finally {
    for (const child of children) child.kill();
    if (prisma) await prisma.$disconnect();
    if (stub) await stub.close();
    if (cluster) { try { cluster.stop(); evidence.cleanup = true; } catch { evidence.cleanup = false; evidence.status = 'QA_BLOCKED'; } }
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(evidence.status);
  process.exitCode = evidence.status === 'QA_PASS' ? 0 : 1;
}

main().catch(() => { console.error('QA_BLOCKED: harness initialization failed'); process.exitCode = 1; });
