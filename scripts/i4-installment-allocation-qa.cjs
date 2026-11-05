'use strict';
// Creates and attests its own disposable cluster. Never reads DATABASE_URL or .env.
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
const { PrismaClient } = require('@prisma/client');
const { InstallmentAllocationService } = require('../backend/dist/commercial/installment-allocation.service');
const { AuditService } = require('../backend/dist/audit/audit.service');
const { BillingService } = require('../backend/dist/billing/billing.service');
const { ConfigService } = require('@nestjs/config');
const root = path.resolve(__dirname, '..');
const migrationPath = 'backend/prisma/migrations/20261104090000_i4_manual_installment_allocation/migration.sql';
const evidence = { status: 'QA_FAIL', externalCalls: 0, sharedWrites: 0, cases: [], runs: [] };
const reject = (work, status) => assert.rejects(work, e => !status || e.getStatus?.() === status);
async function record(name, work) {
  const item = { name, status: 'FAIL' }; evidence.cases.push(item);
  Object.assign(item, await work(), { status: 'PASS' }); console.log('PASS', name);
}
async function run(mode) {
  let cluster, db, second;
  const info = { mode, cleanup: false }; evidence.runs.push(info);
  try {
    cluster = await createCluster(process.argv[2] || 'C:/Program Files/PostgreSQL/18/bin');
    db = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    second = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    await verifyDatabase(db, cluster.capability); await verifyDatabase(second, cluster.capability);
    Object.assign(info, { runId: cluster.capability.runId, engine: cluster.version, host: '127.0.0.1' });
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
    const canonical = fs.readFileSync(path.join(root, 'db/global/init-global.sql'), 'utf8');
    const previous = canonical.split('-- F3 manual allocations.')[0]; assert.notEqual(previous, canonical);
    const migration = fs.readFileSync(path.join(root, migrationPath), 'utf8');
    cluster.sql(mode === 'upgrade' ? previous : canonical);
    const companies = await Promise.all(['FiNet QA', 'Cable QA'].map(nombre => db.empresa.create({ data: { nombre } })));
    const customer = await db.cliente.create({ data: { idEmpresa: companies[0].idEmpresa, rut: '66666666-6', nombreCompleto: 'Identidad sintetica', estado: 'Moroso' } });
    const operator = await db.usuario.create({ data: { idEmpresa: companies[0].idEmpresa, nombreCompleto: 'Administrador QA', passwordHash: 'NO_LOGIN_QA' } });
    const operator2 = await db.usuario.create({ data: { idEmpresa: companies[1].idEmpresa, nombreCompleto: 'Administrador QA 2', passwordHash: 'NO_LOGIN_QA' } });
    const admin = { idUsuario: operator.idUsuario, idEmpresa: companies[0].idEmpresa, roles: ['Administrador'] };
    const admin2 = { ...admin, idUsuario: operator2.idUsuario };
    const contracts = [];
    for (const company of companies) contracts.push(await db.contrato.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, fechaInicio: new Date('2026-01-01'), diaVencimiento: 10, estado: 'Suspendido' } }));
    async function fixture({ company = 0, quota = ['3500', '3500'], payments = ['3500', '3500'], state = 'APROBADO' } = {}) {
      const total = quota.reduce((v, a) => v + Number(a), 0);
      const invoice = await db.factura.create({ data: { idContrato: contracts[company].idContrato, periodoMes: 1, periodoAnio: 2026, monto: total, fechaLimitePago: new Date('2026-01-10'), estado: 'Pagada' } });
      const agreement = await db.convenioPago.create({ data: { idEmpresa: companies[company].idEmpresa, idCliente: customer.idCliente, idContrato: invoice.idContrato, idFactura: invoice.idFactura,
        montoComprometido: total, cantidadCuotas: quota.length, condiciones: 'QA manual', fechaInicio: new Date('2026-01-01'), estado: state, idUsuarioResponsable: operator.idUsuario,
        cuotas: { create: quota.map((monto, i) => ({ numero: i + 1, monto, fechaVencimiento: new Date(i ? '2099-02-10' : '2026-01-10') })) } }, include: { cuotas: { orderBy: { numero: 'asc' } } } });
      const rows = [];
      for (const monto of payments) rows.push(await db.pago.create({ data: { idFactura: invoice.idFactura, idCliente: customer.idCliente, monto, fechaPago: new Date('2026-11-04T12:00:00Z'), pasarela: 'QA' } }));
      return { invoice, agreement, quotas: agreement.cuotas, payments: rows };
    }
    const historical = await fixture();
    const snapshot = async f => ({ invoice: await db.factura.findUnique({ where: { idFactura: f.invoice.idFactura } }), payments: await db.pago.findMany({ where: { idFactura: f.invoice.idFactura }, orderBy: { idPago: 'asc' } }), quotas: await db.cuotaConvenioPago.findMany({ where: { idConvenio: f.agreement.idConvenio }, orderBy: { numero: 'asc' } }) });
    const before = await snapshot(historical);
    await record(mode + '_migration_preserves_existing_financial_rows', async () => {
      if (mode === 'upgrade') {
        assert.throws(() => cluster.sql(migration.replace('COMMIT;', 'SELECT 1 / 0; COMMIT;')));
        assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='imputacion_cuota'").trim(), '0');
        cluster.sql(migration);
      }
      assert.deepEqual(await snapshot(historical), before);
      assert.equal(await db.imputacionCuota.count(), 0);
      const { parseGlobalSchema } = await import(pathToFileURL(path.join(__dirname, 'global-schema.mjs')));
      const verify = await import(pathToFileURL(path.join(__dirname, 'verify-global-db.mjs')));
      const global = parseGlobalSchema();
      const catalog = await verify.readCatalog(db);
      const comparison = verify.compareCatalog(global, catalog);
      // Exact canonical physical contract, including new PK/FK/checks/indexes/defaults.
      assert.equal(comparison.status, 'PASS', JSON.stringify(comparison));
      return { tables: global.counts.tables, historicalPayments: before.payments.length, unchanged: true };
    });
    const audit = new AuditService(db), service = new InstallmentAllocationService(db, audit);
    const other = new InstallmentAllocationService(second, new AuditService(second));
    const apply = (f, amounts, payment = 0, key = randomUUID(), who = admin, svc = service) => svc.apply(f.agreement.idConvenio,
      { idPago: f.payments[payment].idPago, clave: key, motivo: 'Confirmacion QA', cuotas: amounts.map(([index, monto]) => ({ idCuota: f.quotas[index].idCuota, monto })) }, who);
    const detail = f => service.detail(f.agreement.idConvenio, admin);
    await record(mode + '_7000_two_3500_explicit_only_g2_and_replay', async () => {
      const f = await fixture({ payments: [] });
      await db.factura.update({ where: { idFactura: f.invoice.idFactura }, data: { estado: 'Pendiente' } });
      const billing = new BillingService(db, audit, new ConfigService({}));
      const dto = { idFactura: f.invoice.idFactura, monto: 3500, pasarela: 'QA', codigoTransaccion: randomUUID(), codigoAutorizacion: 'QA-ONLY', fechaPago: '2026-11-04T12:00:00Z' };
      await billing.registerIntegrationPayment(dto, companies[0].idEmpresa);
      assert.equal((await billing.registerIntegrationPayment(dto, companies[0].idEmpresa)).duplicate, true);
      await billing.registerIntegrationPayment({ ...dto, codigoTransaccion: randomUUID() }, companies[0].idEmpresa);
      f.payments = await db.pago.findMany({ where: { idFactura: f.invoice.idFactura }, orderBy: { idPago: 'asc' } });
      assert.deepEqual((await detail(f)).cuotas.map(q => q.estado), ['PENDIENTE', 'PENDIENTE']);
      const financial = await snapshot(f), key = randomUUID();
      const first = await apply(f, [[0, '3500']], 0, key);
      assert.equal((await apply(f, [[0, '3500.00']], 0, key)).duplicado, true);
      await apply(f, [[1, '3500']], 1);
      const result = await detail(f), after = await snapshot(f);
      assert.deepEqual(result.cuotas.map(q => q.estado), ['PAGADA', 'PAGADA']);
      assert.deepEqual(after.invoice, financial.invoice); assert.deepEqual(after.payments, financial.payments);
      assert.equal(after.invoice.estado, 'Pagada'); assert.equal(after.payments.length, 2);
      assert.equal(result.operaciones.length, 2); assert.ok(first.operacion.idAuditoria);
      return { before: { invoice: 'Pagada', quotas: ['PENDIENTE', 'PENDIENTE'], payments: 2 }, after: { invoice: 'Pagada', quotas: ['PAGADA', 'PAGADA'], allocated: ['3500.00', '3500.00'], payments: 2, audits: 2 } };
    });
    await record(mode + '_partial_two_payments_one_quota_exact_decimals', async () => {
      const f = await fixture({ quota: ['0.30'], payments: ['0.10', '0.20'] });
      await apply(f, [[0, '0.10']]); let d = await detail(f); assert.equal(d.cuotas[0].estado, 'PARCIAL'); assert.equal(d.cuotas[0].saldo, '0.20');
      await apply(f, [[0, '0.20']], 1); d = await detail(f); assert.equal(d.cuotas[0].estado, 'PAGADA'); assert.equal(d.cuotas[0].saldo, '0.00'); return {};
    });
    await record(mode + '_one_payment_many_quotas_authorized_advance', async () => {
      const f = await fixture({ payments: ['7000'] }); await apply(f, [[0, '3500'], [1, '3500']]);
      const d = await detail(f); assert.deepEqual(d.cuotas.map(q => q.estado), ['PAGADA', 'PAGADA']); assert.equal(d.pagos[0].disponible, '0.00'); return {};
    });
    await record(mode + '_insufficient_overallocation_invalid_amounts_and_conflicting_key', async () => {
      const f = await fixture(); const key = randomUUID();
      await reject(() => apply(f, [[0, '3500'], [1, '1']]), 409);
      await reject(() => apply(f, [[0, '3501']], 1), 409);
      for (const value of ['-1', '0', '0.001', 'NaN', '1e2']) await reject(() => apply(f, [[0, value]]), 400);
      await apply(f, [[0, '1']], 0, key); await reject(() => apply(f, [[0, '2']], 0, key), 409);
      assert.equal((await detail(f)).cuotas[0].imputado, '1.00'); return {};
    });
    await record(mode + '_concurrent_operators_independent_connections_same_payment', async () => {
      const f = await fixture({ quota: ['7000', '7000'], payments: ['7000'] });
      const results = await Promise.allSettled([apply(f, [[0, '7000']]), apply(f, [[1, '7000']], 0, randomUUID(), admin2, other)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await detail(f)).pagos[0].disponible, '0.00');
      return { confirmed: 1, refused: 1 };
    });
    await record(mode + '_concurrent_different_payments_same_quota_and_same_key', async () => {
      const f = await fixture({ quota: ['3500'], payments: ['3500', '3500'] });
      const results = await Promise.allSettled([apply(f, [[0, '3500']]), apply(f, [[0, '3500']], 1, randomUUID(), admin2, other)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const g = await fixture(); const key = randomUUID();
      const same = await Promise.all([apply(g, [[0, '3500']], 0, key), apply(g, [[0, '3500']], 0, key, admin2, other)]);
      assert.equal(same.filter(r => r.duplicado).length, 1); return {};
    });
    await record(mode + '_compensating_partial_full_repeated_and_concurrent_reverse', async () => {
      const f = await fixture(); const a = await apply(f, [[0, '3500']]); const id = a.operacion.detalles[0].idImputacion;
      const dto = { clave: randomUUID(), motivo: 'Reversa QA', monto: '1000' };
      await service.reverse(f.agreement.idConvenio, id, dto, admin); assert.equal((await service.reverse(f.agreement.idConvenio, id, dto, admin)).duplicado, true);
      await reject(() => service.reverse(f.agreement.idConvenio, id, { ...dto, monto: '1001' }, admin), 409);
      assert.equal((await detail(f)).cuotas[0].estado, 'PARCIAL');
      const results = await Promise.allSettled([service.reverse(f.agreement.idConvenio, id, { ...dto, clave: randomUUID(), monto: '2500' }, admin), other.reverse(f.agreement.idConvenio, id, { ...dto, clave: randomUUID(), monto: '2500' }, admin2)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const d = await detail(f); assert.equal(d.cuotas[0].imputado, '0.00'); assert.equal(d.cuotas[0].estado, 'PENDIENTE');
      assert.equal(d.operaciones.length, 3); assert.equal(d.pagos[0].disponible, '3500.00'); return {};
    });
    await record(mode + '_company_scope_shared_identity_permissions_and_wrong_invoice', async () => {
      const a = await fixture(), b = await fixture({ company: 1 });
      for (const role of ['Comercial', 'Soporte', 'Terreno', 'Inventario']) {
        const user = { ...admin, roles: [role] };
        await reject(() => apply(a, [[0, '1']], 0, randomUUID(), user), 403);
        await reject(() => service.detail(b.agreement.idConvenio, user), 403);
        if (['Comercial', 'Soporte'].includes(role)) assert.equal((await service.detail(a.agreement.idConvenio, user)).puedeImputar, false);
      }
      await apply(b, [[0, '3500']]);
      await reject(() => service.apply(b.agreement.idConvenio, { idPago: a.payments[0].idPago, clave: randomUUID(), motivo: 'QA', cuotas: [{ idCuota: b.quotas[1].idCuota, monto: '1' }] }, admin), 400);
      await reject(() => service.apply(a.agreement.idConvenio, { idPago: a.payments[0].idPago, clave: randomUUID(), motivo: 'QA', cuotas: [{ idCuota: b.quotas[1].idCuota, monto: '1' }] }, admin), 400);
      assert.equal((await db.cliente.findUnique({ where: { idCliente: customer.idCliente } })).idEmpresa, companies[0].idEmpresa); return {};
    });
    await record(mode + '_same_invoice_multiple_agreements_share_payment_balance', async () => {
      const a = await fixture({ quota: ['3500'], payments: ['3500'] });
      const agreement = await db.convenioPago.create({ data: { idEmpresa: companies[0].idEmpresa, idCliente: customer.idCliente, idContrato: a.invoice.idContrato,
        idFactura: a.invoice.idFactura, montoComprometido: '3500', cantidadCuotas: 1, condiciones: 'Segundo convenio QA', fechaInicio: new Date('2026-01-01'), estado: 'APROBADO', idUsuarioResponsable: operator.idUsuario,
        cuotas: { create: [{ numero: 1, monto: '3500', fechaVencimiento: new Date('2099-01-01') }] } }, include: { cuotas: true } });
      const b = { ...a, agreement, quotas: agreement.cuotas };
      await apply(a, [[0, '3500']]); assert.equal((await detail(b)).pagos[0].disponible, '0.00');
      await reject(() => apply(b, [[0, '1']]), 409); assert.equal((await detail(b)).cuotas[0].imputado, '0.00'); return {};
    });
    await record(mode + '_unapproved_inconsistent_relations_and_legacy_paid_rejected', async () => {
      const pending = await fixture({ state: 'PENDIENTE' }); await reject(() => apply(pending, [[0, '1']]), 400);
      const broken = await fixture(); await db.convenioPago.update({ where: { idConvenio: broken.agreement.idConvenio }, data: { idContrato: contracts[1].idContrato } });
      await reject(() => apply(broken, [[0, '1']]), 409);
      const legacy = await fixture(); await db.cuotaConvenioPago.update({ where: { idCuota: legacy.quotas[0].idCuota }, data: { estado: 'PAGADA', fechaPago: new Date('2026-01-10') } });
      const original = await snapshot(legacy); assert.equal((await detail(legacy)).cuotas[0].estado, 'REQUIERE_REVISION');
      await reject(() => apply(legacy, [[0, '1']]), 409); assert.deepEqual(await snapshot(legacy), original); return {};
    });
    await record(mode + '_audit_failure_rolls_back_and_replay_survives_service_restart', async () => {
      const f = await fixture(); const old = await snapshot(f), count = await db.logAuditoria.count();
      const failed = new InstallmentAllocationService(db, { record: async (...args) => { await audit.record(...args); throw new Error('SYNTHETIC_AUDIT_FAILURE'); } });
      await reject(() => apply(f, [[0, '3500']], 0, randomUUID(), admin, failed));
      assert.deepEqual(await snapshot(f), old); assert.equal(await db.logAuditoria.count(), count); assert.equal((await detail(f)).operaciones.length, 0);
      const key = randomUUID(); await apply(f, [[0, '3500']], 0, key);
      assert.equal((await apply(f, [[0, '3500']], 0, key, admin, new InstallmentAllocationService(second, new AuditService(second)))).duplicado, true); return {};
    });
    await record(mode + '_untouched_history_global_financial_states_and_fk_integrity', async () => {
      assert.deepEqual(await snapshot(historical), before);
      assert.equal((await db.cliente.findUnique({ where: { idCliente: customer.idCliente } })).estado, 'Moroso');
      assert.deepEqual((await db.contrato.findMany({ orderBy: { idContrato: 'asc' } })).map(c => c.estado), ['Suspendido', 'Suspendido']);
      assert.equal(await db.operacionImputacionCuota.count(), await db.logAuditoria.count({ where: { accion: { in: ['IMPUTAR_PAGO_CUOTAS', 'REVERSAR_IMPUTACION_CUOTA'] } } }));
      await reject(() => db.imputacionCuota.create({ data: { idOperacion: 9999999, idCuota: historical.quotas[0].idCuota, monto: '1' } }));
      return { operations: await db.operacionImputacionCuota.count(), lines: await db.imputacionCuota.count(), automaticHistoricalRepairs: 0 };
    });
  } finally {
    if (second) await second.$disconnect(); if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); info.cleanup = true; }
  }
}
(async () => {
  const output = path.join(root, '.codex-review', `f3-installment-qa-${randomUUID()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    for (const mode of ['upgrade', 'fresh']) await run(mode);
    evidence.status = 'QA_PASS';
  } catch (e) {
    evidence.error = { code: e.code || e.name, sqlState: e.meta?.code, location: String(e.stack).split('\n').find(l => l.trim().startsWith('at ') && l.includes('i4-installment-allocation-qa.cjs:'))?.trim() };
    console.error(evidence.error); process.exitCode = 1;
  } finally {
    evidence.sourceSHA256 = Object.fromEntries(['backend/src/commercial/installment-allocation.service.ts', 'backend/prisma/schema.prisma', 'db/global/init-global.sql', migrationPath].map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')]));
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: evidence.status, cases: evidence.cases.length, evidence: output }));
  }
})();
