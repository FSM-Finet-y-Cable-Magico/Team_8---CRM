'use strict';
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
const { ProspectsService } = require('../backend/dist/prospects/prospects.service');
const { AuditService } = require('../backend/dist/audit/audit.service');
const { CoverageDomainService } = require('../backend/dist/coverage/coverage-domain.service');
const { CommercialCoverageProvider } = require('../backend/dist/coverage/commercial-coverage.provider');
const root = path.resolve(__dirname, '..');
const result = { status: 'QA_FAIL', cases: [], externalCalls: 0, cleanup: false };
const point = { latitud: -33.475, longitud: -70.675 };
const approval = { confirmarOrigenG2: true };

async function main() {
  let cluster, db;
  const otherConnections = [];
  try {
    result.phase = 'isolated_cluster';
    cluster = await createCluster('C:/Program Files/PostgreSQL/18/bin');
    const client = () => new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    db = client(); await verifyDatabase(db, cluster.capability);
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
    cluster.sql(fs.readFileSync(path.join(root, 'db/global/init-global.sql'), 'utf8'));
    result.postgres = cluster.version; result.runId = cluster.capability.runId;
    result.sourceSHA256 = Object.fromEntries(['backend/src/prospects/prospects.service.ts', 'backend/src/prospects/g2-prospect-review.ts',
      'backend/src/coverage/commercial-coverage.provider.ts', 'db/global/init-global.sql'].map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    // Own cluster only. Avoid even reusing the reference prospect's number in QA evidence.
    await db.$executeRaw`ALTER SEQUENCE public.prospecto_id_prospecto_seq RESTART WITH 1001`;
    const companies = await Promise.all([1, 2].map(n => db.empresa.create({ data: { nombre: `Empresa QA ${n}` } })));
    const operator = await db.usuario.create({ data: { idEmpresa: companies[0].idEmpresa, nombreCompleto: 'Comercial QA', passwordHash: randomUUID() } });
    const actor = { idUsuario: operator.idUsuario, idEmpresa: companies[0].idEmpresa, email: null, nombreCompleto: 'QA', roles: ['Comercial'] };
    const audit = new AuditService(db);
    const commercial = new CommercialCoverageProvider(db);
    const coverage = new CoverageDomainService(db, new ConfigService({}), audit, commercial, {}, {}, {});
    const mail = { sendQuote: async () => ({ status: 'disabled' }) };
    const service = (storage = db, auditing = audit, covering = coverage) => new ProspectsService(storage, auditing, mail, covering);
    const crm = service();
    const polygon = { type: 'Polygon', coordinates: [[[-71, -34], [-70, -34], [-70, -33], [-71, -33], [-71, -34]]] };
    const zones = await Promise.all(companies.map(company => db.zonaPago.create({ data: { idEmpresa: company.idEmpresa,
      nombreZona: 'Cobertura QA', tipoZona: 'COBERTURA_GENERAL', activo: true, poligonoGeojson: polygon } })));
    const plan = await db.plan.create({ data: { idEmpresa: actor.idEmpresa, nombreComercial: 'Plan QA vigente', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 7000, activo: true } });
    await db.planZonaPrecio.create({ data: { idPlan: plan.idPlan, idZonaPago: zones[0].idZonaPago, precioMensual: 7000, activo: true } });
    async function g2Request({ company = actor.idEmpresa, proof = 'both', data = {} } = {}) {
      // Simulate G2's confirmed shared-DB transaction, not a call to its real backend.
      return db.$transaction(async tx => {
        const p = await tx.prospecto.create({ data: { idEmpresa: company, nombreCompleto: 'Solicitud QA', estadoPipeline: 'NUEVO',
          clasificacionComercial: 'PROSPECTO', origenContacto: null, fechaCreacion: new Date(), ...data } });
        if (proof !== 'none') await tx.logAuditoria.create({ data: { accion: 'CREAR_PROSPECTO_PORTAL', entidadAfectada: 'prospecto',
          idEntidadAfectada: p.idProspecto, valorNuevo: { origen: 'PORTAL', estado_pipeline: 'NUEVO' } } });
        if (proof === 'both') await tx.logAuditoria.create({ data: { accion: 'ACEPTAR_POLITICA_PRIVACIDAD', entidadAfectada: 'prospecto',
          idEntidadAfectada: p.idProspecto, valorNuevo: { formulario: 'CONTRATACION' } } });
        return p;
      });
    }
    const state = idProspecto => db.prospecto.findUniqueOrThrow({ where: { idProspecto } });
    const reviewCount = id => db.logAuditoria.count({ where: { accion: 'REVISAR_SOLICITUD_G2', idEntidadAfectada: id } });
    async function run(name, fn) { result.phase = name; const detail = await fn(); result.cases.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }); }
    const p = await g2Request({ data: { rut: '11111111-1', telefono: '+56900000001', email: 'qa@example.invalid', direccion: 'Calle QA' } });
    await run('original_g2_audits_with_null_origin_make_review_available_without_writes', async () => {
      const before = await db.logAuditoria.count();
      const row = (await crm.list(actor)).find(row => row.idProspecto === p.idProspecto);
      assert.equal(row.requiereRevisionComercial, true); assert.equal(row.revisionOrigenG2Disponible, true);
      assert.equal((await state(p.idProspecto)).estadoPipeline, 'NUEVO'); assert.equal(await db.logAuditoria.count(), before);
    });
    await run('explicit_review_only_advances_to_new_and_preserves_null_original_origin', async () => {
      await crm.reviewG2Prospect(p.idProspecto, approval, actor);
      const row = await state(p.idProspecto);
      assert.equal(row.estadoPipeline, 'Prospecto Nuevo'); assert.equal(row.origenContacto, null); assert.equal(row.latitud, null);
      assert.equal(await reviewCount(p.idProspecto), 1); assert.equal(await db.contrato.count(), 0);
      assert.equal(await db.cliente.count(), 0); assert.equal(await db.servicioContratado.count(), 0); assert.equal(await db.ordenTrabajo.count(), 0);
    });
    await run('missing_location_cannot_quote_or_verify_feasibility', async () => {
      await assert.rejects(crm.verifyFeasibility(p.idProspecto, { resultado: 'Factible' }, actor), e => e.getStatus() === 400);
      await assert.rejects(crm.generateQuote(p.idProspecto, { planId: plan.idPlan }, actor), e => e.getStatus() === 400);
      assert.equal(await db.cotizacion.count(), 0);
    });
    await run('authorized_location_persists_geography_without_assigning_feasible', async () => {
      await crm.updateLocation(p.idProspecto, { ubicacion: point, comuna: 'Comuna QA', region: 'Región QA' }, actor);
      const row = await state(p.idProspecto);
      assert.equal(row.estadoPipeline, 'Prospecto Nuevo'); assert.equal(row.comuna, 'Comuna QA'); assert.equal(row.region, 'Región QA');
      assert.equal(row.latitud, point.latitud); assert.equal(await db.cotizacion.count(), 0);
    });
    await run('real_local_polygon_and_company_plan_determine_feasibility_then_quote_and_pdf', async () => {
      const checked = await crm.verifyTomodat(p.idProspecto, point, actor);
      assert.equal(checked.estadoPipeline, 'Factible'); assert.equal(checked.cobertura.coberturaComercial, true);
      const quote = await crm.generateQuote(p.idProspecto, { planId: plan.idPlan }, actor);
      assert.equal(quote.envioEmail, 'disabled'); assert.equal(quote.idPlan, plan.idPlan);
      const pdf = await crm.buildQuotePdfBuffer(p.idProspecto, quote.idCotizacion, actor);
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      return { pdfBytes: pdf.length, sentQuotes: await db.cotizacion.count({ where: { idProspecto: p.idProspecto, fechaEnvio: { not: null } } }) };
    });
    await run('contract_confirmation_preserves_geography_and_does_not_activate_customer_or_service', async () => {
      await crm.contractPlan(p.idProspecto, { planId: plan.idPlan }, actor);
      const contract = await db.contrato.findFirstOrThrow({ where: { idProspecto: p.idProspecto } });
      assert.equal(contract.estado, 'Pendiente firma contrato'); assert.equal(contract.comunaInstalacion, 'Comuna QA'); assert.equal(contract.ciudadInstalacion, null);
      assert.equal(await db.cliente.count(), 0); assert.equal(await db.servicioContratado.count(), 0); assert.equal(await db.ordenTrabajo.count(), 0);
      const fresh = (await service().list(actor)).find(row => row.idProspecto === p.idProspecto);
      assert.equal(fresh.comuna, 'Comuna QA'); assert.equal(fresh.latitud, point.latitud);
      await assert.rejects(crm.updateLocation(p.idProspecto, { ubicacion: { latitud: -32, longitud: -70 } }, actor), e => e.getStatus() === 400);
    });
    await run('current_portal_label_or_creation_audit_alone_never_qualify', async () => {
      for (const proof of ['none', 'creation']) {
        const invalid = await g2Request({ proof, data: { origenContacto: 'PORTAL' } });
        await assert.rejects(crm.reviewG2Prospect(invalid.idProspecto, approval, actor), e => e.getStatus() === 409);
        assert.equal((await state(invalid.idProspecto)).estadoPipeline, 'NUEVO');
      }
    });
    await run('already_recovered_or_historical_pipeline_is_not_normalized_again', async () => {
      for (const estadoPipeline of ['Prospecto Nuevo', 'Servicio Activo', 'Perdido']) {
        const historical = await g2Request({ data: { estadoPipeline } });
        await assert.rejects(crm.reviewG2Prospect(historical.idProspecto, approval, actor), e => e.getStatus() === 409);
        assert.equal((await state(historical.idProspecto)).estadoPipeline, estadoPipeline); assert.equal(await reviewCount(historical.idProspecto), 0);
      }
    });
    await run('other_company_has_no_recovery_authority_or_nested_evidence_exposure', async () => {
      const foreign = await g2Request({ company: companies[1].idEmpresa });
      await assert.rejects(crm.reviewG2Prospect(foreign.idProspecto, approval, actor), e => e.getStatus() === 400);
      assert.ok(!(await crm.list(actor)).some(row => row.idProspecto === foreign.idProspecto));
    });
    await run('failed_audit_fk_rolls_back_stage_and_review_record', async () => {
      const candidate = await g2Request();
      const failingAudit = { record: (input, tx) => audit.record({ ...input, idUsuario: 2147483647 }, tx) };
      await assert.rejects(service(db, failingAudit).reviewG2Prospect(candidate.idProspecto, approval, actor));
      assert.equal((await state(candidate.idProspecto)).estadoPipeline, 'NUEVO'); assert.equal(await reviewCount(candidate.idProspecto), 0);
    });
    await run('two_independent_connections_approve_once_and_one_audit_survives', async () => {
      const candidate = await g2Request();
      const a = client(), b = client(); otherConnections.push(a, b);
      await verifyDatabase(a, cluster.capability); await verifyDatabase(b, cluster.capability);
      const [[pidA], [pidB]] = await Promise.all([a.$queryRaw`SELECT pg_backend_pid() AS pid`, b.$queryRaw`SELECT pg_backend_pid() AS pid`]);
      assert.notEqual(pidA.pid, pidB.pid);
      let release, waiting = 0;
      const barrier = new Promise(resolve => { release = resolve; });
      const storage = conn => ({ prospecto: conn.prospecto, cliente: conn.cliente, logAuditoria: conn.logAuditoria,
        $transaction: async (...args) => { waiting++; if (waiting === 2) release(); await barrier; return conn.$transaction(...args); } });
      const outcomes = await Promise.allSettled([service(storage(a)).reviewG2Prospect(candidate.idProspecto, approval, actor), service(storage(b)).reviewG2Prospect(candidate.idProspecto, approval, actor)]);
      result.concurrencyOutcomes = outcomes.map(outcome => outcome.status === 'fulfilled' ? { status: 'fulfilled' }
        : { status: 'rejected', code: outcome.reason.code, sqlState: outcome.reason.meta?.code, httpStatus: outcome.reason.getStatus?.() });
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(o => o.status === 'rejected' && o.reason.getStatus?.() === 409).length, 1);
      assert.equal(await reviewCount(candidate.idProspecto), 1);
      return { separateConnections: true, approvals: 1, conflicts: 1, reviewAudits: 1 };
    });
    await run('negative_coverage_and_no_company_plan_cannot_quote', async () => {
      const negative = await g2Request({ data: { direccion: 'Domicilio QA', email: 'qa@example.invalid' } });
      await crm.reviewG2Prospect(negative.idProspecto, approval, actor);
      const outside = { latitud: -10, longitud: -10 };
      await crm.updateLocation(negative.idProspecto, { ubicacion: outside }, actor);
      assert.equal((await crm.verifyTomodat(negative.idProspecto, outside, actor)).estadoPipeline, 'No Factible');
      await assert.rejects(crm.generateQuote(negative.idProspecto, { planId: plan.idPlan }, actor), e => e.getStatus() === 400);
      const second = { ...actor, idEmpresa: companies[1].idEmpresa };
      const noPlan = await g2Request({ company: second.idEmpresa, data: { direccion: 'Domicilio QA', email: 'qa@example.invalid' } });
      await crm.reviewG2Prospect(noPlan.idProspecto, approval, second);
      await crm.updateLocation(noPlan.idProspecto, { ubicacion: point }, second);
      const checked = await crm.verifyTomodat(noPlan.idProspecto, point, second);
      assert.equal(checked.cobertura.planes.length, 0);
      await assert.rejects(crm.generateQuote(noPlan.idProspecto, { planId: plan.idPlan }, second), e => e.getStatus() === 400);
    });
    await run('contract_created_while_coverage_runs_prevents_location_and_feasibility_writes', async () => {
      const candidate = await g2Request({ data: { direccion: 'Domicilio QA' } });
      await crm.reviewG2Prospect(candidate.idProspecto, approval, actor);
      const racingCoverage = { check: async (...args) => {
        const checked = await coverage.check(...args);
        await db.contrato.create({ data: { idProspecto: candidate.idProspecto, idEmpresa: actor.idEmpresa, idPlan: plan.idPlan,
          estado: 'Pendiente firma contrato', fechaInicio: new Date(), diaVencimiento: 1 } });
        return checked;
      } };
      await assert.rejects(service(db, audit, racingCoverage).verifyTomodat(candidate.idProspecto, point, actor), e => e.getStatus() === 400);
      assert.equal((await state(candidate.idProspecto)).latitud, null); assert.equal((await state(candidate.idProspecto)).estadoPipeline, 'Prospecto Nuevo');
      assert.equal(await db.cotizacion.count({ where: { idProspecto: candidate.idProspecto } }), 0);
    });
    await run('geography_changed_during_coverage_returns_conflict_without_using_stale_result', async () => {
      const candidate = await g2Request({ data: { direccion: 'Domicilio QA' } });
      await crm.reviewG2Prospect(candidate.idProspecto, approval, actor);
      const racingCoverage = { check: async (...args) => {
        const checked = await coverage.check(...args);
        await db.prospecto.update({ where: { idProspecto: candidate.idProspecto }, data: { comuna: 'Comuna corregida QA' } });
        return checked;
      } };
      await assert.rejects(service(db, audit, racingCoverage).verifyTomodat(candidate.idProspecto, point, actor), e => e.getStatus() === 409);
      const fresh = await state(candidate.idProspecto);
      assert.equal(fresh.comuna, 'Comuna corregida QA'); assert.equal(fresh.latitud, null);
      assert.equal(fresh.estadoPipeline, 'Prospecto Nuevo');
      assert.equal(await db.cotizacion.count({ where: { idProspecto: candidate.idProspecto } }), 0);
    });
    assert.equal(await db.factura.count(), 0); assert.equal(await db.pago.count(), 0);
    assert.equal(await db.ticket.count(), 0); assert.equal(await db.categoriaFalla.count(), 0);
    result.rows = { prospects: await db.prospecto.count(), contracts: await db.contrato.count(), customers: await db.cliente.count(),
      services: await db.servicioContratado.count(), workOrders: await db.ordenTrabajo.count(), payments: await db.pago.count(), tickets: await db.ticket.count() };
    result.status = 'QA_PASS';
  } catch (error) { result.error = { name: error.name, code: error.code, assertion: error.operator, httpStatus: error.getStatus?.(),
    actual: typeof error.actual === 'number' ? error.actual : undefined, expected: typeof error.expected === 'number' ? error.expected : undefined }; }
  finally {
    await Promise.all(otherConnections.map(conn => conn.$disconnect()));
    if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); result.cleanup = true; }
    const output = path.join(root, '.codex-review', `g2-prospect-review-qa-${randomUUID()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, evidence: output }));
  }
  if (result.status !== 'QA_PASS') process.exitCode = 1;
}
main().catch(() => { console.error('Isolated QA or safe cleanup failed'); process.exitCode = 1; });
