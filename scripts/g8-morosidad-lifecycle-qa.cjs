'use strict';
// Real PostgreSQL in a newly owned loopback cluster; G3 is an explicit in-process simulator.
// No operational .env or caller-supplied database URL is accepted.
require('./qa-loopback-only.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createCluster, verifyDatabase } = require('./g8-morosidad-qa-isolation.cjs');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { AuditService } = require('../backend/dist/audit/audit.service');
const { BillingService } = require('../backend/dist/billing/billing.service');
const { CommercialControlBookService } = require('../backend/dist/commercial/commercial-control-book.service');
const { TicketsService } = require('../backend/dist/tickets/tickets.service');
const { ProspectsService } = require('../backend/dist/prospects/prospects.service');
const { WithdrawalWorkflowService } = require('../backend/dist/g3-integration/withdrawal-workflow.service');
const { WithdrawalTrackingProcessor } = require('../backend/dist/g3-integration/withdrawal-tracking.processor');
const { withdrawalClosure } = require('../backend/dist/g3-integration/g3-withdrawal-closure-contract');
const { assertNoContractDebt } = require('../backend/dist/contracts/contract-debt.guard');
const { formerCustomerDebt } = require('../backend/dist/common/returning-customer');
const { validateRut } = require('../backend/dist/rut/rut.util');

const repo = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const report = { status: 'RUNNING', database: 'FRESH_LOOPBACK_ONLY', g3: 'SIMULATED', cases: [] };
const reportPath = path.join(repo, 'tmp', 'flujo-morosidad-postgresql.json');
let cluster, owner, db;
async function check(name, work) {
  await work();
  report.cases.push({ name, status: 'PASS' });
  console.log('PASS ' + name);
}

async function main() {
  cluster = await createCluster();
  owner = new PrismaClient({ datasources: { db: { url: cluster.capability.url } } });
  const identity = await verifyDatabase(owner, cluster.capability);
  report.runId = cluster.capability.runId;
  report.database = identity.db;
  report.host = identity.host;
  assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(), '0');
  cluster.sql(read('db/global/init-global.sql'));
  // Reproduce the separately owned catalog extension only inside this new test database.
  cluster.sql("ALTER TABLE public.categoria_falla ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'INTERNA' CHECK (tipo IN ('ATENCION','TECNICA','INTERNA'));");
  const runtimePassword = randomBytes(24).toString('hex');
  cluster.sql(`CREATE ROLE g8_moro_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    GRANT CONNECT ON DATABASE ${identity.db} TO g8_moro_runtime;
    GRANT USAGE ON SCHEMA public TO g8_moro_runtime;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO g8_moro_runtime;
    GRANT INSERT, UPDATE ON public.solicitud_retiro_servicio, public.ticket, public.prospecto, public.evento_gestion_comercial TO g8_moro_runtime;
    GRANT INSERT ON public.log_auditoria TO g8_moro_runtime;
    GRANT UPDATE ON public.cliente, public.contrato, public.servicio_contratado TO g8_moro_runtime;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO g8_moro_runtime;`);
  const runtimeUrl = new URL(cluster.capability.url);
  runtimeUrl.username = 'g8_moro_runtime'; runtimeUrl.password = runtimePassword;
  db = new PrismaClient({ datasources: { db: { url: runtimeUrl.toString() } } });
  const [runtimeIdentity] = await db.$queryRaw`SELECT current_database() AS db, current_user AS usr, current_setting('g8moro_qa.run_id') AS marker`;
  assert.equal(runtimeIdentity.db, identity.db); assert.equal(runtimeIdentity.usr, 'g8_moro_runtime');
  assert.equal(runtimeIdentity.marker, cluster.capability.runId);
  for (const nombre of ['Baja de servicio', 'Término de servicio']) {
    await owner.$executeRaw`INSERT INTO public.categoria_falla (nombre, tipo) VALUES (${nombre}, 'ATENCION')`;
  }
  const company = await owner.empresa.create({ data: { nombre: 'FiNet QA flujo' } });
  const user = await owner.usuario.create({ data: { idEmpresa: company.idEmpresa, nombreCompleto: 'QA flujo', email: 'flujo@example.invalid', activo: true, passwordHash: 'QA_DISABLED_' + randomBytes(32).toString('hex') } });
  const actor = { idUsuario: user.idUsuario, idEmpresa: company.idEmpresa, nombreCompleto: user.nombreCompleto, email: user.email, roles: ['Administrador'] };
  const plan = await owner.plan.create({ data: { idEmpresa: company.idEmpresa, nombreComercial: 'Internet QA', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 19990 } });
  let sequence = 0;
  async function fixture(name, invoices = 0, linked = false) {
    const body = String(90020000 + ++sequence);
    const rut = [...'0123456789K'].map(dv => body + '-' + dv).find(value => validateRut(value).valid);
    assert.ok(rut);
    const customer = await owner.cliente.create({ data: { idEmpresa: company.idEmpresa, nombreCompleto: 'QA ' + name, rut, estado: 'Activo', telefono: '+56912345678' } });
    const contract = await owner.contrato.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idPlan: plan.idPlan, estado: 'Activo', fechaInicio: new Date('2026-01-01'), diaVencimiento: 10, direccionInstalacion: 'Domicilio QA 123', comunaInstalacion: 'Ñuñoa' } });
    const service = await owner.servicioContratado.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, estadoOperativo: 'Activo', tipoServicio: 'Internet' } });
    const rows = [];
    for (let i = 0; i < invoices; i++) rows.push(await owner.factura.create({ data: { idContrato: contract.idContrato, periodoMes: i + 1, periodoAnio: 2020, monto: 19990, fechaLimitePago: new Date('2020-01-10'), estado: 'Vencida' } }));
    const prospect = linked ? await owner.prospecto.create({ data: { idCliente: customer.idCliente, idEmpresa: company.idEmpresa, rut, nombreCompleto: customer.nombreCompleto, telefono: customer.telefono, estadoPipeline: 'Servicio Activo', origenContacto: 'Referido' } }) : null;
    return { customer, contract, service, invoices: rows, prospect };
  }
  const audit = new AuditService(db);
  const config = new ConfigService({ BILLING_CUT_DAYS: '5', BILLING_NOTIFICATION_MODE: 'disabled', G3_WITHDRAWAL_DISPATCH_ENABLED: 'true', G3_WITHDRAWAL_VOLUNTARY_ENABLED: 'true', WITHDRAWAL_FINALIZE_ENABLED: 'true', WITHDRAWAL_TRACKING_ENABLED: 'true' });
  const orders = new Map();
  const g3 = {
    configured: () => true,
    createOrder: async payload => {
      const id = 9000 + orders.size;
      orders.set(id, { payload, state: 'PENDIENTE' });
      return { status: 201, body: { success: true, data: { id_ot: id, tipo_ot: 'BAJA', estado: 'PENDIENTE', request_id: payload.request_id, trace_id: payload.trace_id } } };
    },
    readOrder: async (id, idEmpresa) => {
      const order = orders.get(id); assert.ok(order);
      return { status: 200, body: { success: true, data: { id_ot: id, id_empresa: idEmpresa, tipo_ot: 'BAJA', estado: order.state, ...order.payload } } };
    },
    cancelOrder: async () => { throw new Error('Unexpected cancellation'); },
  };
  const workflow = new WithdrawalWorkflowService(db, audit, new TicketsService(db, audit), config, g3, undefined, undefined,
    { getEquipmentByService: async () => ({ status: 200, data: [] }) });
  const processor = new WithdrawalTrackingProcessor(workflow, config);
  const prospects = new ProspectsService(db, audit, {}, {}, {});
  const financial = async () => json(await Promise.all([owner.factura.findMany({ orderBy: { idFactura: 'asc' } }), owner.pago.findMany({ orderBy: { idPago: 'asc' } })]));
  async function closure(idOt) {
    const { payload: p } = orders.get(idOt);
    return withdrawalClosure({ clave_idempotencia: 'baja:' + idOt, id_ot: idOt, id_empresa: company.idEmpresa, tipo_ot: 'BAJA', fecha_completada: new Date().toISOString(),
      request_id: p.request_id, trace_id: p.trace_id, id_solicitud_retiro: p.id_solicitud_retiro_externa,
      id_servicio: p.id_servicio_externo, id_contrato: p.id_contrato_externo, id_cliente_externo: p.id_cliente_externo, id_ticket_externo: p.id_ticket_externo,
      equipos_instalados: [], equipos_retirados: [], equipos_faltantes: [], materiales: [] });
  }
  const moroso = await fixture('MOROSIDAD', 3);
  await owner.convenioPago.create({ data: { idEmpresa: company.idEmpresa, idCliente: moroso.customer.idCliente, idContrato: moroso.contract.idContrato,
    idFactura: moroso.invoices[2].idFactura, montoComprometido: 19990, cantidadCuotas: 1, condiciones: 'Convenio QA', fechaInicio: new Date(), estado: 'APROBADO', idUsuarioResponsable: user.idUsuario } });
  const before = await financial();
  await new BillingService(db, audit, config).suspendContract(moroso.contract.idContrato, actor, { observacion: 'Suspensión sintética QA' });
  await new CommercialControlBookService(db, audit, config).registerEvent({ idCliente: moroso.customer.idCliente, idContrato: moroso.contract.idContrato,
    idServicio: moroso.service.idServicio, tipo: 'AVISO_PREVIO_RETIRO', canal: 'TELEFONO', fecha: new Date().toISOString(), observacion: 'Aviso sintético QA de retiro' }, actor);
  await check('eligible_but_storage_missing_explains_disabled_button', async () => {
    const result = await workflow.eligibility(moroso.service.idServicio, actor);
    assert.equal(result.eligible, true); assert.equal(result.habilitado, false);
    assert.equal(result.contexto.deuda.totalExigible, 39980);
  });
  cluster.sql(read('db/g8/migrations/002_service_withdrawal.sql'));
  cluster.sql(read('db/g8/migrations/003_withdrawal_voluntary_termination.sql'));
  cluster.sql(read('db/g8/migrations/004_deferred_voluntary_termination.sql'));
  cluster.sql(read('db/g8/migrations/004_deferred_voluntary_termination.sql')); // idempotent
  for (const version of ['002_service_withdrawal', '003_withdrawal_voluntary_termination', '004_deferred_voluntary_termination']) {
    cluster.sql('\\set g8_runtime_role g8_moro_runtime\n' + read('db/g8/migrations/' + version + '.grants.sql'));
  }
  cluster.sql('SET ROLE g8_moro_runtime;\n' + read('db/g8/migrations/004_deferred_voluntary_termination.verify.sql'));
  let started;
  await check('notice_and_uncovered_debt_allow_withdrawal_despite_other_invoice_agreement', async () => {
    const result = await workflow.eligibility(moroso.service.idServicio, actor);
    assert.equal(result.eligible, true); assert.equal(result.habilitado, true); assert.equal(result.bajaAutomaticaHabilitada, true);
    started = await workflow.initiate({ idServicio: moroso.service.idServicio, observaciones: 'Retiro sintético QA tras aviso y deuda' }, actor);
    assert.ok(started.despacho.idOtG3, json(started.despacho));
  });
  const idOt = started.despacho.idOtG3;
  const notice = await closure(idOt);
  await workflow.receiveWithdrawalClosure(notice);
  await check('technician_closure_pending_approval_keeps_suspended_customer', async () => {
    orders.get(idOt).state = 'PENDIENTE_APROBACION';
    await workflow.refreshOrder(started.solicitud.idSolicitudRetiro, actor, true);
    await processor.tick();
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: moroso.service.idServicio } })).estadoOperativo, 'Suspendido');
    assert.equal(await owner.prospecto.count({ where: { idCliente: moroso.customer.idCliente } }), 0);
  });
  await check('approved_closure_automatically_returns_prospect_with_unchanged_historical_debt', async () => {
    orders.get(idOt).state = 'COMPLETADA';
    await workflow.refreshOrder(started.solicitud.idSolicitudRetiro, actor, true);
    const tick = await processor.tick(); assert.equal(tick.fallidas, 0);
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: moroso.service.idServicio } })).estadoOperativo, 'Baja');
    assert.equal((await owner.contrato.findUnique({ where: { idContrato: moroso.contract.idContrato } })).estado, 'Baja');
    assert.equal((await owner.ticket.findUnique({ where: { idTicket: started.ticket.idTicket } })).estado, 'Cerrado');
    assert.equal(await financial(), before);
    const listed = await prospects.search(actor, { paginated: 'true', scope: String(company.idEmpresa) });
    assert.equal(listed.items.find(row => row.idCliente === moroso.customer.idCliente).excliente.situacionFinanciera, 'CON_DEUDA');
    await assert.rejects(assertNoContractDebt(db, { idEmpresa: company.idEmpresa, idCliente: moroso.customer.idCliente, rut: moroso.customer.rut, idUsuario: user.idUsuario }), e => e.response.code === 'CONTRACT_CUSTOMER_DEBT');
  });
  await check('duplicate_closure_and_tracking_do_not_duplicate_prospect_or_termination', async () => {
    assert.equal((await workflow.receiveWithdrawalClosure(notice)).duplicate, true);
    await processor.tick();
    assert.equal(await owner.prospecto.count({ where: { idCliente: moroso.customer.idCliente } }), 1);
    assert.equal(await owner.logAuditoria.count({ where: { accion: 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD', idEntidadAfectada: moroso.service.idServicio } }), 1);
  });
  await check('historical_debt_keeps_recontract_block_until_paid_in_full', async () => {
    const context = { idEmpresa: company.idEmpresa, idCliente: moroso.customer.idCliente, rut: moroso.customer.rut, idUsuario: user.idUsuario };
    await owner.pago.create({ data: { idFactura: moroso.invoices[0].idFactura, idCliente: moroso.customer.idCliente, monto: 10000, fechaPago: new Date(), pasarela: 'QA_LOCAL' } });
    await assert.rejects(assertNoContractDebt(db, context), e => e.response.code === 'CONTRACT_CUSTOMER_DEBT');
    for (const [index, invoice] of moroso.invoices.entries()) {
      await owner.pago.create({ data: { idFactura: invoice.idFactura, idCliente: moroso.customer.idCliente, monto: index === 0 ? 9990 : 19990, fechaPago: new Date(), pasarela: 'QA_LOCAL' } });
      await owner.factura.update({ where: { idFactura: invoice.idFactura }, data: { estado: 'Pagada' } });
    }
    await assertNoContractDebt(db, context);
    assert.equal(await formerCustomerDebt(db, moroso.customer.idCliente, company.idEmpresa, moroso.customer.rut), 'SIN_DEUDA');
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: moroso.service.idServicio } })).estadoOperativo, 'Baja');
  });
  const voluntary = await fixture('VOLUNTARIA_SIN_DEUDA', 0, true);
  let ended;
  const voluntaryDto = row => ({ rut: row.customer.rut, idServicio: row.service.idServicio, canal: 'PRESENCIAL', solicitante: 'TITULAR', requerimientoEn: new Date().toISOString(), evidencia: 'Identidad verificada en QA sintética', descripcion: 'El titular pide terminar voluntariamente el servicio', confirmacionIdentidad: true });
  await check('voluntary_request_keeps_service_and_original_prospect_until_approved_closure', async () => {
    ended = await workflow.terminateVoluntarily(voluntaryDto(voluntary), actor);
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: voluntary.service.idServicio } })).estadoOperativo, 'Activo');
    assert.equal((await owner.prospecto.findUnique({ where: { idProspecto: voluntary.prospect.idProspecto } })).estadoPipeline, 'Servicio Activo');
    const [pending] = await owner.$queryRaw`SELECT termino_comercial_en FROM g8_retiros.termino_servicio WHERE id_servicio = ${voluntary.service.idServicio}`;
    assert.equal(pending.termino_comercial_en, null);
    const technical = ended.despacho.idOtG3;
    await workflow.receiveWithdrawalClosure(await closure(technical));
    orders.get(technical).state = 'PENDIENTE_APROBACION';
    await workflow.refreshOrder(ended.solicitud.idSolicitudRetiro, actor, true);
    await processor.tick();
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: voluntary.service.idServicio } })).estadoOperativo, 'Activo');
  });
  await check('voluntary_approved_closure_returns_same_prospect_as_lost_without_debt_and_allows_new_contract', async () => {
    const technical = ended.despacho.idOtG3;
    assert.equal(orders.get(technical).payload.motivo, 'VOLUNTARIA');
    orders.get(technical).state = 'COMPLETADA';
    await workflow.refreshOrder(ended.solicitud.idSolicitudRetiro, actor, true);
    const tick = await processor.tick(); assert.equal(tick.fallidas, 0);
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: voluntary.service.idServicio } })).estadoOperativo, 'Baja');
    const same = await owner.prospecto.findUnique({ where: { idProspecto: voluntary.prospect.idProspecto } });
    assert.equal(same.estadoPipeline, 'Perdido'); assert.equal(same.idCliente, voluntary.customer.idCliente);
    assert.equal(same.origenContacto, 'Referido');
    assert.equal(await formerCustomerDebt(db, voluntary.customer.idCliente, company.idEmpresa, voluntary.customer.rut), 'SIN_DEUDA');
    await assertNoContractDebt(db, { idEmpresa: company.idEmpresa, idCliente: voluntary.customer.idCliente, rut: voluntary.customer.rut, idUsuario: user.idUsuario });
    const listed = await prospects.search(actor, { paginated: 'true', scope: String(company.idEmpresa), estado: 'Perdido' });
    assert.equal(listed.items.find(row => row.idProspecto === same.idProspecto).excliente.etiqueta, 'Perdido');
    assert.ok(listed.counts.Perdido >= 1);
  });
  await check('voluntary_repeated_tracking_closes_ticket_and_applies_commercial_termination_only_once', async () => {
    await processor.tick();
    assert.equal((await owner.ticket.findUnique({ where: { idTicket: ended.ticket.idTicket } })).estado, 'Cerrado');
    assert.equal(await owner.logAuditoria.count({ where: { accion: 'TERMINO_VOLUNTARIO_SERVICIO', idEntidadAfectada: voluntary.service.idServicio } }), 1);
    assert.equal(await owner.logAuditoria.count({ where: { accion: 'APLICAR_BAJA_POR_RETIRO_VOLUNTARIO', idEntidadAfectada: voluntary.service.idServicio } }), 1);
    assert.equal(await owner.logAuditoria.count({ where: { accion: 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD', idEntidadAfectada: voluntary.service.idServicio } }), 0);
  });
  const voluntaryDebt = await fixture('VOLUNTARIA_CON_DEUDA', 1);
  await check('voluntary_does_not_forgive_real_debt', async () => {
    const financialBefore = await financial();
    const requested = await workflow.terminateVoluntarily(voluntaryDto(voluntaryDebt), actor);
    const technical = requested.despacho.idOtG3;
    await workflow.receiveWithdrawalClosure(await closure(technical));
    orders.get(technical).state = 'COMPLETADA';
    await workflow.refreshOrder(requested.solicitud.idSolicitudRetiro, actor, true);
    assert.equal((await processor.tick()).fallidas, 0);
    assert.equal((await owner.servicioContratado.findUnique({ where: { idServicio: voluntaryDebt.service.idServicio } })).estadoOperativo, 'Baja');
    assert.equal(await financial(), financialBefore);
    assert.equal(await formerCustomerDebt(db, voluntaryDebt.customer.idCliente, company.idEmpresa, voluntaryDebt.customer.rut), 'CON_DEUDA');
    await assert.rejects(assertNoContractDebt(db, { idEmpresa: company.idEmpresa, idCliente: voluntaryDebt.customer.idCliente, rut: voluntaryDebt.customer.rut, idUsuario: user.idUsuario }), e => e.response.code === 'CONTRACT_CUSTOMER_DEBT');
  });
  processor.onModuleDestroy();
  report.status = 'PASS';
}
main().catch(error => {
  report.status = 'FAIL'; report.error = { name: error.name, message: String(error.message).replace(/postgresql:\/\/\S+/g, '[REDACTED]') };
  console.error(report.error); process.exitCode = 1;
}).finally(async () => {
  await db?.$disconnect(); await owner?.$disconnect();
  cluster?.stop();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, json(report));
  console.log('Evidence: ' + reportPath);
});
