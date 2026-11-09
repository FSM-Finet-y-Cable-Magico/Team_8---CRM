'use strict';
// Own disposable PostgreSQL only: no supplied DB URL, .env or existing cluster.
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createCluster, verifyDatabase } = require('./p0-05-qa-isolation.cjs');
const { PrismaClient } = require('@prisma/client');
const { TicketsService } = require('../backend/dist/tickets/tickets.service');
const { AuditService } = require('../backend/dist/audit/audit.service');
const { G2IntegrationService } = require('../backend/dist/g2-integration/g2-integration.service');
const root = path.resolve(__dirname, '..');
const names = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
  'Facturación y cobro', 'Consulta general', 'Baja de servicio'];
const result = { status: 'QA_FAIL', cases: [], externalCalls: 0, cleanup: false };
const digest = value => createHash('sha256').update(value).digest('hex');

async function main() {
  let cluster, db;
  try {
    result.phase = 'isolated_cluster_initialization';
    cluster = await createCluster('C:/Program Files/PostgreSQL/18/bin');
    db = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
    await verifyDatabase(db, cluster.capability);
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
    const sql = fs.readFileSync(path.join(root, 'db/global/init-global.sql'), 'utf8');
    assert.doesNotMatch(sql, /^\s*\\/m);
    result.phase = 'synthetic_schema';
    cluster.sql(sql); // Only the newly attested empty cluster, never a shared database.
    result.postgres = cluster.version;
    result.runId = cluster.capability.runId;
    result.sourceSHA256 = Object.fromEntries(['backend/src/tickets/ticket-attention-categories.ts',
      'backend/src/tickets/tickets.service.ts', 'backend/src/g2-integration/g2-integration.service.ts',
      'db/global/init-global.sql'].map(file => [file, digest(fs.readFileSync(path.join(root, file)))]));
    const audit = new AuditService(db);
    const tickets = new TicketsService(db, audit);
    const categorySnapshot = async () => JSON.stringify(await db.$queryRaw`
      SELECT to_jsonb(c) AS row FROM public.categoria_falla c ORDER BY id_categoria`);
    async function run(name, fn) {
      result.phase = name;
      const detail = await fn();
      result.cases.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });
    }
    // Deliberately nonstandard generated IDs. No contractual meaning is attached to them.
    await db.$executeRaw`ALTER SEQUENCE public.categoria_falla_id_categoria_seq RESTART WITH 401`;
    const attention = await Promise.all(names.map(nombre => db.categoriaFalla.create({ data: { nombre, slaHoras: 12 } })));
    const technical = await db.categoriaFalla.create({ data: { nombre: 'FIBRA_CORTADA', slaHoras: 4 } });
    const wifi = await db.categoriaFalla.create({ data: { nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 3 } });
    const bot = await db.categoriaFalla.create({ data: { nombre: 'Asistente virtual', slaHoras: 8 } });
    await run('legacy_without_tipo_preserves_seven_real_ids_and_sla', async () => {
      const before = await categorySnapshot();
      const catalog = await tickets.categories();
      assert.deepEqual(catalog.filter(c => c.nombreAtencion).map(c => c.idCategoria).sort((a, b) => a - b),
        attention.map(c => c.idCategoria).sort((a, b) => a - b));
      assert.ok(catalog.every(c => c.tipoDisponible === false && c.tipo === null));
      assert.equal(await categorySnapshot(), before);
      return { commercial: 7, total: catalog.length, catalogUnchanged: true };
    });
    // Synthetic equivalent of the confirmed global extension, only in this disposable DB.
    cluster.sql("ALTER TABLE public.categoria_falla ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'INTERNA' CHECK (tipo IN ('TECNICA','ATENCION','INTERNA'));");
    for (const category of attention) await db.$executeRaw`UPDATE public.categoria_falla SET tipo='ATENCION' WHERE id_categoria=${category.idCategoria}`;
    await db.$executeRaw`UPDATE public.categoria_falla SET tipo='TECNICA' WHERE id_categoria=${technical.idCategoria}`;
    await run('classified_global_projection_excludes_internal_and_keeps_historical_rows', async () => {
      const before = await categorySnapshot();
      const catalog = await tickets.categories();
      assert.deepEqual(catalog.filter(c => c.nombreAtencion).map(c => c.nombreAtencion).sort(), [...names].sort());
      assert.ok(catalog.every(c => c.tipoDisponible));
      assert.equal(catalog.find(c => c.idCategoria === wifi.idCategoria).tipo, 'INTERNA');
      assert.equal(catalog.find(c => c.idCategoria === bot.idCategoria).nombreAtencion, null);
      assert.equal(catalog.find(c => c.idCategoria === technical.idCategoria).tipo, 'TECNICA');
      assert.equal(await categorySnapshot(), before);
      return { commercial: 7, internal: 2, technical: 1, catalogUnchanged: true };
    });
    const companies = await Promise.all([1, 2].map(n => db.empresa.create({ data: { nombre: `Empresa QA ${n}` } })));
    const customer = await db.cliente.create({ data: { idEmpresa: companies[0].idEmpresa,
      nombreCompleto: 'Identidad compartida QA', rut: '11111111-1', estado: 'Moroso' } });
    const operator = await db.usuario.create({ data: { idEmpresa: companies[1].idEmpresa,
      nombreCompleto: 'Operador QA', passwordHash: randomUUID(), activo: true } });
    const services = [];
    for (const company of companies) {
      const plan = await db.plan.create({ data: { idEmpresa: company.idEmpresa, nombreComercial: 'Plan QA',
        tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 7000 } });
      const contract = await db.contrato.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente,
        idPlan: plan.idPlan, fechaInicio: new Date('2026-01-01T00:00:00Z'), diaVencimiento: 10, estado: 'Suspendido' } });
      services.push(await db.servicioContratado.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente,
        idContrato: contract.idContrato, tipoServicio: 'Internet', estadoOperativo: 'Suspendido' } }));
    }
    const protectedSnapshot = async () => JSON.stringify(await Promise.all(['cliente', 'contrato', 'servicioContratado', 'factura', 'pago', 'ordenTrabajo'].map(model => db[model].findMany())));
    const beforeFinancial = await protectedSnapshot();
    const actor = { idUsuario: operator.idUsuario, idEmpresa: companies[1].idEmpresa,
      nombreCompleto: 'QA', email: null, roles: ['Soporte'] };
    const request = { rut: customer.rut, idCategoria: attention[0].idCategoria, idServicio: services[1].idServicio,
      prioridad: 'Media', descripcion: 'Consulta sintética de atención' };
    let created;
    await run('commercial_creation_uses_db_id_and_contract_company_for_shared_customer', async () => {
      created = await tickets.create(request, actor);
      assert.equal(created.idCategoria, attention[0].idCategoria);
      assert.equal(created.idEmpresa, companies[1].idEmpresa);
      assert.equal(created.idServicio, services[1].idServicio);
      assert.equal(await protectedSnapshot(), beforeFinancial);
      return { tickets: await db.ticket.count(), financialRowsUnchanged: true };
    });
    for (const category of [technical, wifi, bot]) await run(`commercial_creation_rejects_${category.nombre}`, async () => {
      const before = await db.ticket.count();
      await assert.rejects(tickets.create({ ...request, idCategoria: category.idCategoria }, actor), e => e.getStatus() === 400);
      assert.equal(await db.ticket.count(), before);
    });
    await run('manual_reclassification_rejects_internal_without_changing_ticket_or_audit', async () => {
      const before = JSON.stringify(await db.ticket.findUniqueOrThrow({ where: { idTicket: created.idTicket } }));
      const auditCount = await db.logAuditoria.count();
      for (const category of [wifi, bot]) await assert.rejects(tickets.updateCategory(created.idTicket, { idCategoria: category.idCategoria }, actor), e => e.getStatus() === 400);
      assert.equal(JSON.stringify(await db.ticket.findUniqueOrThrow({ where: { idTicket: created.idTicket } })), before);
      assert.equal(await db.logAuditoria.count(), auditCount);
    });
    await run('manual_reclassification_accepts_technical_without_operational_or_financial_changes', async () => {
      await tickets.updateCategory(created.idTicket, { idCategoria: technical.idCategoria }, actor);
      assert.equal((await db.ticket.findUniqueOrThrow({ where: { idTicket: created.idTicket } })).idCategoria, technical.idCategoria);
      await tickets.updateCategory(created.idTicket, { idCategoria: attention[0].idCategoria }, actor);
      assert.equal(await protectedSnapshot(), beforeFinancial);
    });
    await run('official_name_with_wrong_type_is_not_offered_or_created', async () => {
      await db.$executeRaw`UPDATE public.categoria_falla SET tipo='TECNICA' WHERE id_categoria=${attention[1].idCategoria}`;
      assert.equal((await tickets.categories()).filter(c => c.nombreAtencion).length, 6);
      await assert.rejects(tickets.create({ ...request, idCategoria: attention[1].idCategoria }, actor), e => e.getStatus() === 400);
      await db.$executeRaw`UPDATE public.categoria_falla SET tipo='ATENCION' WHERE id_categoria=${attention[1].idCategoria}`;
    });
    await run('case_insensitive_duplicate_is_retained_but_both_ids_are_unavailable', async () => {
      const duplicate = await db.categoriaFalla.create({ data: { nombre: names[0].toUpperCase(), slaHoras: 20 } });
      await db.$executeRaw`UPDATE public.categoria_falla SET tipo='ATENCION' WHERE id_categoria=${duplicate.idCategoria}`;
      const before = await categorySnapshot();
      const catalog = await tickets.categories();
      for (const id of [duplicate.idCategoria, attention[0].idCategoria]) assert.equal(catalog.find(c => c.idCategoria === id).nombreAtencion, null);
      assert.equal(await categorySnapshot(), before);
    });
    const wifiTicket = await db.ticket.create({ data: { idEmpresa: companies[1].idEmpresa, idCliente: customer.idCliente,
      idServicio: services[1].idServicio, idCategoria: wifi.idCategoria, prioridad: 'Media', estado: 'abierto', origen: 'PORTAL_G2' } });
    const g2 = new G2IntegrationService(db, {}, {}, audit);
    const response = { id_empresa: companies[1].idEmpresa, id_servicio: services[1].idServicio, resultado: 'APLICADO',
      detalle_saneado: 'Operación confirmada por simulación QA', request_id: randomUUID(), trace_id: randomUUID() };
    await run('wifi_result_uses_exact_internal_category_and_is_idempotent_in_postgresql', async () => {
      const first = await g2.registerWifiResult(wifiTicket.idTicket, response);
      const repeat = await g2.registerWifiResult(wifiTicket.idTicket, response);
      assert.equal(first.duplicate, false); assert.equal(repeat.duplicate, true);
      assert.equal(await db.integracionResultadoWifiG2.count(), 1);
      assert.equal((await db.ticket.findUniqueOrThrow({ where: { idTicket: wifiTicket.idTicket } })).estado, 'Resuelto');
      return { wifiResults: 1, applied: 1, duplicate: true };
    });
    await run('wifi_result_conflict_and_cross_company_are_rejected_without_financial_changes', async () => {
      await assert.rejects(g2.registerWifiResult(wifiTicket.idTicket, { ...response, detalle_saneado: 'Otro resultado QA' }), e => e.getStatus() === 409);
      await assert.rejects(g2.registerWifiResult(wifiTicket.idTicket, { ...response, id_empresa: companies[0].idEmpresa }), e => e.getStatus() === 400);
      assert.equal(await protectedSnapshot(), beforeFinancial);
    });
    await run('historical_internal_and_technical_categories_remain_readable_without_new_activation', async () => {
      await db.ticket.create({ data: { idEmpresa: companies[1].idEmpresa, idCliente: customer.idCliente,
        idServicio: services[1].idServicio, idCategoria: technical.idCategoria, prioridad: 'Media', estado: 'DERIVADO_OT' } });
      const listed = await tickets.list(actor);
      assert.ok(listed.some(t => t.idCategoria === wifi.idCategoria && t.categoria.nombre === wifi.nombre));
      assert.ok(listed.some(t => t.idCategoria === technical.idCategoria && t.soloLecturaTecnica));
      assert.equal(await protectedSnapshot(), beforeFinancial);
      assert.equal((await db.ticket.findUniqueOrThrow({ where: { idTicket: created.idTicket } })).idCategoria, attention[0].idCategoria);
    });
    result.rows = { categories: await db.categoriaFalla.count(), tickets: await db.ticket.count(), wifiResults: await db.integracionResultadoWifiG2.count(),
      invoices: await db.factura.count(), payments: await db.pago.count(), workOrders: await db.ordenTrabajo.count() };
    result.status = 'QA_PASS';
  } catch (error) {
    result.error = { name: error.name, code: error.code, status: error.status,
      startupStep: ['initdb', 'pg_ctl', 'psql'].find(step => String(error.message).includes(step)) ?? null,
      assertion: error.operator ?? null };
  }
  finally {
    if (db) await db.$disconnect();
    if (cluster) { cluster.stop(); result.cleanup = true; }
    const output = path.join(root, '.codex-review', `ticket-categories-qa-${randomUUID()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...result, evidence: output }));
  }
  if (result.status !== 'QA_PASS') process.exitCode = 1;
}
main().catch(() => { console.error('QA initialization or safe cleanup failed'); process.exitCode = 1; });
