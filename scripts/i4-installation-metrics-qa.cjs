'use strict';
// No connection URL accepted. Own disposable cluster, synthetic rows, loopback only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
require('./qa-loopback-only.cjs');
const { PrismaClient } = require('@prisma/client');
const { CompaniesService } = require('../backend/dist/companies/companies.service');
const { todayDateOnly } = require('../backend/dist/common/date-rules');
const root = path.resolve(__dirname, '..');
const result = { status: 'QA_FAIL', cases: [], externalCalls: 0, cleanup: false };

async function main() {
  let cluster, db;
  const output = path.join(root, '.codex-review', `installation-metrics-qa-${randomUUID()}.json`);
  try {
    cluster = await createCluster('C:/Program Files/PostgreSQL/18/bin');
    db = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    await verifyDatabase(db, cluster.capability);
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
    const sql = fs.readFileSync(path.join(root, 'db/global/init-global.sql'), 'utf8');
    assert.doesNotMatch(sql, /^\s*\\/m);
    cluster.sql(sql);
    const today = todayDateOnly();
    const month = today.slice(0, 7);
    const date = `${month}-01T12:00:00Z`;
    const oldDate = new Date(`${month}-01T12:00:00Z`);
    oldDate.setUTCDate(0);
    result.environment = { postgres: cluster.version, host: '127.0.0.1', runId: cluster.capability.runId, month };
    result.sourceSHA256 = Object.fromEntries(['backend/src/companies/companies.service.ts', 'backend/src/companies/installation-metrics.ts', 'db/global/init-global.sql'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    const companies = await Promise.all([1, 2].map(n => db.empresa.create({ data: { nombre: `Empresa sintetica ${n}` } })));
    const customer = await db.cliente.create({ data: { idEmpresa: companies[0].idEmpresa, nombreCompleto: 'Identidad sintetica compartida', estado: 'Moroso' } });
    const service = new CompaniesService(db);
    const user = company => ({ idUsuario: 1, idEmpresa: company, roles: ['Comercial'], nombreCompleto: 'QA', email: null });
    const summary = async (company, requested = String(company)) => (await service.summary(user(company), requested)).metricas;
    const metadata = (ot, value) => ({ fuenteInstalacion: 'G3', idOtG3: String(ot), ...(value ? { fechaCompletadaG3: value } : {}) });
    async function fixture(company, ot, value = date, confirmed = true) {
      const plan = await db.plan.create({ data: { idEmpresa: company, nombreComercial: 'Plan QA', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 7000 } });
      const contract = await db.contrato.create({ data: { idEmpresa: company, idCliente: customer.idCliente, idPlan: plan.idPlan, fechaInicio: new Date(date), diaVencimiento: 10, estado: 'Activo' } });
      const subscribed = await db.servicioContratado.create({ data: { idEmpresa: company, idCliente: customer.idCliente, idContrato: contract.idContrato, tipoServicio: 'Internet', estadoOperativo: 'Activo', datosTecnicos: metadata(ot, value) } });
      const data = { idEmpresa: company, idCliente: customer.idCliente, idContrato: contract.idContrato, idPlan: plan.idPlan, idServicio: subscribed.idServicio,
        idOtG3: String(ot), requestId: randomUUID(), traceId: randomUUID(), payloadHash: '0'.repeat(64), payloadSnapshot: {},
        estadoIntegracion: confirmed ? 'COMPLETADA' : 'EN_SEGUIMIENTO', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: confirmed ? new Date() : null };
      const tracking = await db.integracionInstalacionG3.create({ data });
      return { contract, subscribed, tracking, data };
    }
    async function run(name, fn) {
      try { result.cases.push({ name, status: 'PASS', detail: await fn() }); }
      catch (error) { result.cases.push({ name, status: 'FAIL', code: error.code || error.name }); }
    }
    const one = companies[0].idEmpresa, two = companies[1].idEmpresa;
    const a = await fixture(one, 901);
    await run('confirmed_g3_without_local_order', async () => {
      const m = await summary(one); assert.equal(m.instalacionesMensuales, 1);
      assert.equal(await db.ordenTrabajo.count(), 0); return { monthly: 1, localRows: 0 };
    });
    await db.integracionInstalacionG3.create({ data: { ...a.data, requestId: randomUUID() } });
    await run('duplicate_confirmed_tracking_same_physical_order', async () => {
      assert.equal((await summary(one)).instalacionesMensuales, 1); return { trackingRows: 2, monthly: 1 };
    });
    await db.ordenTrabajo.create({ data: { idOt: 901, idEmpresa: one, idCliente: customer.idCliente, idServicio: a.subscribed.idServicio, tipoOt: 'Instalacion', estado: 'Completada', prioridad: 'Media', fechaCompletada: new Date(date) } });
    await run('local_mirror_does_not_double_count', async () => {
      assert.equal((await summary(one)).instalacionesMensuales, 1); return { trackingRows: 2, localRows: 1, monthly: 1 };
    });
    // These updates only exercise synthetic snapshots in this newly attested database.
    await db.servicioContratado.update({ where: { idServicio: a.subscribed.idServicio }, data: { datosTecnicos: metadata(901, null) } });
    await run('undated_completed_is_not_pending_execution_or_processed_month', async () => {
      const m = await summary(one); assert.equal(m.instalacionesMensuales, 0); assert.equal(m.instalacionesSinFechaTecnica, 1); assert.equal(m.instalacionesPendientes, 0);
      return { monthly: 0, pendingTechnicalDate: 1, pendingExecution: 0 };
    });
    await db.servicioContratado.update({ where: { idServicio: a.subscribed.idServicio }, data: { datosTecnicos: metadata(901, oldDate.toISOString()) } });
    await run('late_available_technical_date_credits_original_month_only', async () => {
      const m = await summary(one); assert.equal(m.instalacionesMensuales, 0); assert.equal(m.instalacionesSinFechaTecnica, 0);
      const old = await service.completedInstallationMetrics({ idEmpresa: one }, oldDate.toISOString().slice(0, 10));
      assert.equal(old.instalacionesMensuales, 1); return { currentMonth: 0, originalMonth: 1, pendingTechnicalDate: 0 };
    });
    await db.servicioContratado.update({ where: { idServicio: a.subscribed.idServicio }, data: { datosTecnicos: metadata(901, date) } });
    await fixture(two, 901);
    await run('same_order_number_shared_identity_remains_company_scoped', async () => {
      assert.equal((await summary(one, String(two))).instalacionesMensuales, 1);
      assert.equal((await summary(two, String(one))).instalacionesMensuales, 1);
      const consolidated = await service.summary({ ...user(one), roles: ['Administrador'] });
      assert.equal(consolidated.metricas.instalacionesMensuales, 2);
      assert.equal((await db.cliente.findUniqueOrThrow({ where: { idCliente: customer.idCliente } })).estado, 'Moroso');
      return { companyOne: 1, companyTwo: 1, consolidated: 2, financialStatePreserved: true };
    });
    const bad = await fixture(one, 902);
    await db.integracionInstalacionG3.update({ where: { idIntegracion: bad.tracking.idIntegracion }, data: { idServicio: a.subscribed.idServicio } });
    await run('inconsistent_contract_service_excluded_for_review', async () => {
      const m = await summary(one); assert.equal(m.instalacionesMensuales, 1); assert.equal(m.instalacionesRequierenRevision, 1);
      return { monthly: 1, review: 1 };
    });
    await fixture(one, 903, date, false);
    await run('remote_completion_without_confirmed_g8_closure_not_counted', async () => {
      const m = await summary(one); assert.equal(m.instalacionesMensuales, 1); assert.equal(m.instalacionesSinFechaTecnica, 0);
      return { monthly: 1, pendingTechnicalDate: 0 };
    });
    const snapshot = async () => JSON.stringify(await Promise.all([
      db.cliente.findMany({ orderBy: { idCliente: 'asc' } }), db.contrato.findMany({ orderBy: { idContrato: 'asc' } }),
      db.servicioContratado.findMany({ orderBy: { idServicio: 'asc' } }), db.ordenTrabajo.findMany({ orderBy: { idOt: 'asc' } }),
      db.integracionInstalacionG3.findMany({ orderBy: { idIntegracion: 'asc' } }), db.logAuditoria.count(),
    ]));
    await run('repeated_read_only_metrics_preserve_all_fixture_rows', async () => {
      const before = await snapshot(); await summary(one); await summary(two); assert.equal(await snapshot(), before);
      return { customers: await db.cliente.count(), contracts: await db.contrato.count(), services: await db.servicioContratado.count(), trackings: await db.integracionInstalacionG3.count(), localOrders: await db.ordenTrabajo.count(), writesFromSummary: 0 };
    });
    // Explicit unavailability is a mitigation, not certification of a churn formula.
    await db.contrato.update({ where: { idContrato: a.contract.idContrato }, data: { estado: 'Suspendido', fechaSuspension: new Date(date) } });
    const churn = await summary(one);
    assert.equal(await db.contrato.count({ where: { idEmpresa: one, estado: 'Baja' } }), 0);
    assert.equal(churn.churnBajasMensuales, null);
    assert.equal(churn.churnRateMensual, null);
    assert.equal(churn.churnEstado, 'HISTORIAL_INSUFICIENTE');
    result.churnDiagnostic = { status: 'UNAVAILABLE_EXPLICITLY', temporarySuspensions: 1, definitiveCancellations: 0,
      observedMonthlyLosses: churn.churnBajasMensuales, observedRate: churn.churnRateMensual,
      expectedLossesForFixture: 0, formulaCertified: false };
    result.status = result.cases.every(c => c.status === 'PASS') ? 'QA_PASS' : 'QA_FAIL';
  } catch (error) { result.error = { code: error.code || error.name }; }
  finally {
    if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); result.cleanup = true; }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
  }
  console.log(JSON.stringify({ ...result, evidence: output }));
  if (result.status !== 'QA_PASS') process.exitCode = 1;
}
main().catch(() => { console.error('QA initialization or safe cleanup failed'); process.exitCode = 1; });
