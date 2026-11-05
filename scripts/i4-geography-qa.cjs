'use strict';
// New disposable cluster only. No supplied URL, .env or existing DB is accepted.
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
const { PrismaClient } = require('@prisma/client');
const { ProspectsService } = require('../backend/dist/prospects/prospects.service');
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
    result.postgres = cluster.version;
    result.runId = cluster.capability.runId;
    result.sourceSHA256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'backend/src/prospects/prospects.service.ts'))).digest('hex');
    const companies = await Promise.all([1, 2].map(n => db.empresa.create({ data: { nombre: `Empresa QA ${n}` } })));
    const customer = await db.cliente.create({ data: { idEmpresa: companies[0].idEmpresa, nombreCompleto: 'Identidad sintetica compartida', estado: 'Moroso' } });
    const coverage = { plansForLocation: async company => ({ coberturaComercial: true, planes: await db.plan.findMany({ where: { idEmpresa: company } }) }) };
    // The phase exercises persistence/locking, not mail, coverage provider or audit transport.
    const service = new ProspectsService(db, { record: async () => {} }, {}, coverage);
    const fixtures = [];
    for (const company of companies) {
      const idEmpresa = company.idEmpresa;
      const user = { idEmpresa, idUsuario: 1, roles: ['Comercial'] };
      const plan = await db.plan.create({ data: { idEmpresa, nombreComercial: 'Plan sintetico', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 7000 } });
      const prospect = await db.prospecto.create({ data: { idEmpresa, nombreCompleto: 'Prospecto sintetico', rut: '99000001-8', telefono: '+56900000001', direccion: 'Calle QA', comuna: `Comuna QA ${idEmpresa}`, region: 'Region no es ciudad', estadoPipeline: 'Cotizacion Enviada', latitud: -33, longitud: -70 } });
      await db.cotizacion.create({ data: { idProspecto: prospect.idProspecto, idPlan: plan.idPlan, fechaEnvio: new Date(), factibilidadVerificada: true } });
      const { contrato } = await service.contractPlan(prospect.idProspecto, { planId: plan.idPlan, ciudad: `Ciudad QA ${idEmpresa}` }, user);
      assert.equal(contrato.comunaInstalacion, prospect.comuna);
      assert.equal(contrato.ciudadInstalacion, `Ciudad QA ${idEmpresa}`);
      // Synthetic signed fixture: no real signing/reconciliation is invoked.
      await db.contrato.update({ where: { idContrato: contrato.idContrato }, data: { estado: 'Firmado', idCliente: customer.idCliente } });
      await db.prospecto.update({ where: { idProspecto: prospect.idProspecto }, data: { idCliente: customer.idCliente } });
      fixtures.push({ prospect, contrato, user });
    }
    result.cases.push({ name: 'contract_persists_registered_comuna_and_explicit_city_both_companies', status: 'PASS' });
    for (const { user, prospect } of fixtures) {
      const rows = await service.listPendingActivation(user);
      assert.equal(rows.length, 1); assert.equal(rows[0].idProspecto, prospect.idProspecto);
      assert.equal(rows[0].ubicacionInstalacion.ciudad, `Ciudad QA ${user.idEmpresa}`);
    }
    result.cases.push({ name: 'shared_identity_does_not_mix_company_locations', status: 'PASS' });
    const f = fixtures[0];
    await db.contrato.update({ where: { idContrato: f.contrato.idContrato }, data: { comunaInstalacion: null, ciudadInstalacion: null } });
    const before = await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contrato.idContrato } });
    const [row] = await service.listPendingActivation(f.user);
    assert.equal(row.ubicacionInstalacion.comuna, f.prospect.comuna);
    assert.equal(row.ubicacionInstalacion.ciudad, null);
    assert.equal(row.ubicacionInstalacion.fuenteComuna, 'PROSPECTO');
    assert.deepEqual(await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contrato.idContrato } }), before);
    await assert.rejects(service.contractPlan(f.prospect.idProspecto, { planId: f.contrato.idPlan, comuna: 'Otra' }, f.user));
    assert.deepEqual(await db.contrato.findUniqueOrThrow({ where: { idContrato: f.contrato.idContrato } }), before);
    result.cases.push({ name: 'signed_contract_preserved_projection_only_no_region_as_city', status: 'PASS' });
    assert.equal((await db.cliente.findUniqueOrThrow({ where: { idCliente: customer.idCliente } })).estado, 'Moroso');
    result.rows = { customers: await db.cliente.count(), contracts: await db.contrato.count(), prospects: await db.prospecto.count() };
    result.status = 'QA_PASS';
  } catch (e) { result.error = { name: e.name, code: e.code }; }
  finally {
    if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); result.cleanup = true; }
    const output = path.join(root, '.codex-review', `geography-qa-${randomUUID()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, evidence: output }));
  }
  if (result.status !== 'QA_PASS') process.exitCode = 1;
}
main().catch(() => { console.error('QA initialization or safe cleanup failed'); process.exitCode = 1; });
