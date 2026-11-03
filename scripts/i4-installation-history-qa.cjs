'use strict';
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
const { PrismaClient } = require('@prisma/client');
const { InstallationHistoryService } = require('../backend/dist/g3-integration/installation-history.service');
const root = path.resolve(__dirname, '..');
async function main() {
  let cluster, db;
  const result = { status: 'QA_FAIL', cases: [], externalCalls: 0, cleanup: false };
  try {
    cluster = await createCluster('C:/Program Files/PostgreSQL/18/bin');
    db = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    await verifyDatabase(db, cluster.capability);
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
    cluster.sql(fs.readFileSync(path.join(root, 'db/global/init-global.sql'), 'utf8'));
    result.postgres = cluster.version; result.runId = cluster.capability.runId;
    result.sourceSHA256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'backend/src/g3-integration/installation-history.service.ts'))).digest('hex');
    const companies = await Promise.all([1, 2].map(n => db.empresa.create({ data: { nombre: `Empresa QA ${n}` } })));
    const customer = await db.cliente.create({ data: { idEmpresa: companies[0].idEmpresa, nombreCompleto: 'Identidad QA compartida', estado: 'Moroso' } });
    async function fixture(idEmpresa, ot, date) {
      const plan = await db.plan.create({ data: { idEmpresa, nombreComercial: 'Plan QA', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 7000 } });
      const contract = await db.contrato.create({ data: { idEmpresa, idCliente: customer.idCliente, idPlan: plan.idPlan, fechaInicio: new Date('2026-01-01'), diaVencimiento: 10, estado: 'Activo' } });
      const service = await db.servicioContratado.create({ data: { idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, tipoServicio: 'Internet', estadoOperativo: 'Activo', datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: String(ot), ...(date ? { fechaCompletadaG3: date } : {}) } } });
      const data = { idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, idPlan: plan.idPlan, idServicio: service.idServicio, idOtG3: String(ot), requestId: randomUUID(), traceId: randomUUID(), payloadHash: '0'.repeat(64), payloadSnapshot: {}, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: new Date() };
      await db.integracionInstalacionG3.create({ data });
      return { data, service };
    }
    const one = companies[0].idEmpresa, two = companies[1].idEmpresa;
    const dated = await fixture(one, 901, '2026-10-01T12:00:00Z');
    await fixture(one, 902, null); await fixture(two, 901, null);
    await db.integracionInstalacionG3.create({ data: { ...dated.data, requestId: randomUUID() } });
    await db.ordenTrabajo.create({ data: { idOt: 901, idEmpresa: one, idCliente: customer.idCliente, idServicio: dated.service.idServicio, tipoOt: 'Instalacion', estado: 'Completada', prioridad: 'Media', fechaCompletada: new Date() } });
    const history = new InstallationHistoryService(db);
    const user = idEmpresa => ({ idEmpresa, idUsuario: 1, roles: ['Comercial'] });
    const snapshot = async () => JSON.stringify(await Promise.all([db.cliente.findMany(), db.contrato.findMany(), db.servicioContratado.findMany(), db.ordenTrabajo.findMany(), db.integracionInstalacionG3.findMany(), db.logAuditoria.count()]));
    const before = await snapshot();
    const a = await history.list(user(one), String(two));
    assert.equal(a.items.length, 2);
    const datedRow = a.items.find(row => row.idOt === '901'), undated = a.items.find(row => row.idOt === '902');
    assert.deepEqual(datedRow.fechasTecnicasOriginales, ['2026-10-01T12:00:00Z']);
    assert.equal(datedRow.solicitudesG3.length, 2); assert.deepEqual(datedRow.ordenesLocales, [901]);
    result.cases.push({ name: 'same_physical_order_duplicates_and_local_mirror_grouped_with_original_date', status: 'PASS' });
    assert.equal(undated.estado, 'COMPLETADA'); assert.equal(undated.clasificacionFecha, 'PENDIENTE_FECHA_TECNICA');
    assert.deepEqual(undated.fechasTecnicasOriginales, []); assert.deepEqual(undated.ordenesLocales, []);
    result.cases.push({ name: 'completed_without_local_order_or_date_not_pending_execution', status: 'PASS' });
    assert.equal((await history.list(user(two), String(one))).items.length, 1);
    assert.equal((await history.list({ ...user(one), roles: ['Administrador'] })).items.length, 3);
    assert.equal(await snapshot(), before);
    result.cases.push({ name: 'shared_customer_isolated_and_all_queries_read_only', status: 'PASS' });
    const foreign = await db.contrato.findFirstOrThrow({ where: { idEmpresa: two } });
    // Deliberately inconsistent synthetic relationship, never a production repair.
    await db.integracionInstalacionG3.updateMany({ where: { idEmpresa: one, idOtG3: '902' }, data: { idContrato: foreign.idContrato } });
    const invalid = (await history.list(user(one))).items.find(row => row.idOt === '902');
    assert.equal(invalid.clasificacionFecha, 'REQUIERE_REVISION'); assert.equal(invalid.idContrato, null); assert.equal(invalid.idServicio, null);
    result.cases.push({ name: 'inconsistent_foreign_contract_redacted_and_flagged', status: 'PASS' });
    result.rows = { customers: await db.cliente.count(), contracts: await db.contrato.count(), services: await db.servicioContratado.count(), trackings: await db.integracionInstalacionG3.count(), localOrders: await db.ordenTrabajo.count() };
    result.status = 'QA_PASS';
  } catch (e) { result.error = { name: e.name, code: e.code }; }
  finally {
    if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); result.cleanup = true; }
    const output = path.join(root, '.codex-review', `installation-history-qa-${randomUUID()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, evidence: output }));
  }
  if (result.status !== 'QA_PASS') process.exitCode = 1;
}
main().catch(() => { console.error('QA initialization or safe cleanup failed'); process.exitCode = 1; });
