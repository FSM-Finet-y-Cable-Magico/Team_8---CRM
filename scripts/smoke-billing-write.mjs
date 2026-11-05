import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const MARKER_PREFIX = 'TEST_G8_BILLING_';

export function writeGate(env) {
  if (env.ALLOW_RAILWAY_BILLING_WRITE_TEST !== '1') return { allowed: false, reason: 'BILLING_WRITE_TEST_NOT_ALLOWED' };
  if (!env.DATABASE_URL?.trim()) return { allowed: false, reason: 'DATABASE_URL_NOT_CONFIGURED' };
  if (env.NODE_ENV === 'production') return { allowed: false, reason: 'RUN_FROM_OPERATOR_WORKSTATION_ONLY' };
  return { allowed: true };
}

export async function runScenario(env = process.env) {
  const { PrismaClient } = require('@prisma/client');
  const { ConfigService } = require('@nestjs/config');
  const { AuditService } = require('../backend/dist/audit/audit.service.js');
  const { BillingService } = require('../backend/dist/billing/billing.service.js');
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });
  const marker = `${MARKER_PREFIX}${Date.now()}`;
  const rollback = new Error('EXPECTED_BILLING_SMOKE_ROLLBACK');
  try {
    await prisma.$transaction(async tx => {
      const scoped = new Proxy({}, {
        get: (_target, property) => property === '$transaction'
          ? async work => work(tx)
          : tx[property],
      });
      const audit = new AuditService(scoped);
      const billing = new BillingService(scoped, audit, new ConfigService({ BILLING_CUT_DAYS: '5', BILLING_NOTIFICATION_MODE: 'disabled' }));
      const company = await tx.empresa.create({ data: { nombre: `${marker}_A` } });
      const otherCompany = await tx.empresa.create({ data: { nombre: `${marker}_B` } });
      const user = await tx.usuario.create({ data: {
        idEmpresa: company.idEmpresa, nombreCompleto: marker, email: `${marker.toLowerCase()}@invalid.test`,
        passwordHash: 'test-account-no-login', activo: false,
      } });
      const customer = await tx.cliente.create({ data: { idEmpresa: company.idEmpresa, nombreCompleto: `${marker}_CLIENT`, estado: 'Activo' } });
      const otherCustomer = await tx.cliente.create({ data: { idEmpresa: otherCompany.idEmpresa, nombreCompleto: `${marker}_OTHER`, estado: 'Activo' } });
      const plan = await tx.plan.create({ data: { idEmpresa: company.idEmpresa, nombreComercial: marker, tipoPlan: 'Internet', tipoCliente: 'Persona', precioMensual: 10000 } });
      const otherPlan = await tx.plan.create({ data: { idEmpresa: otherCompany.idEmpresa, nombreComercial: `${marker}_OTHER`, tipoPlan: 'Internet', tipoCliente: 'Persona', precioMensual: 10000 } });
      const contract = await tx.contrato.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idPlan: plan.idPlan, fechaInicio: new Date('2026-01-01'), diaVencimiento: 5, estado: 'Activo' } });
      const otherContract = await tx.contrato.create({ data: { idEmpresa: otherCompany.idEmpresa, idCliente: otherCustomer.idCliente, idPlan: otherPlan.idPlan, fechaInicio: new Date('2026-01-01'), diaVencimiento: 5, estado: 'Activo' } });
      const invoice = await tx.factura.create({ data: { idContrato: contract.idContrato, periodoMes: 1, periodoAnio: 2026, monto: 10000, fechaEmision: new Date('2026-01-01'), fechaLimitePago: new Date('2026-01-05'), estado: 'Pendiente', folioExterno: marker } });
      const otherInvoice = await tx.factura.create({ data: { idContrato: otherContract.idContrato, periodoMes: 1, periodoAnio: 2026, monto: 10000, fechaLimitePago: new Date('2026-01-05'), estado: 'Pendiente', folioExterno: `${marker}_OTHER` } });
      const actor = { idUsuario: user.idUsuario, idEmpresa: company.idEmpresa, roles: ['Comercial'] };

      const partial = await billing.registerPayment({ idFactura: invoice.idFactura, monto: 4000, pasarela: 'TEST', codigoTransaccion: `${marker}_PARTIAL` }, actor);
      if (partial.paidInFull || partial.saldoPendiente !== 6000) throw new Error('PARTIAL_PAYMENT_ASSERTION_FAILED');
      let overpaymentRejected = false;
      try { await billing.registerPayment({ idFactura: invoice.idFactura, monto: 6000.01, pasarela: 'TEST' }, actor); }
      catch { overpaymentRejected = true; }
      if (!overpaymentRejected) throw new Error('OVERPAYMENT_WAS_ACCEPTED');
      let crossCompanyRejected = false;
      try { await billing.registerPayment({ idFactura: otherInvoice.idFactura, monto: 1, pasarela: 'TEST' }, actor); }
      catch { crossCompanyRejected = true; }
      if (!crossCompanyRejected) throw new Error('CROSS_COMPANY_PAYMENT_WAS_ACCEPTED');

      await billing.refreshDelinquency(actor, String(company.idEmpresa));
      if ((await tx.contrato.findUnique({ where: { idContrato: contract.idContrato } }))?.estado !== 'Moroso') throw new Error('DELINQUENCY_ASSERTION_FAILED');
      await tx.prorrogaPago.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, idFactura: invoice.idFactura, fechaOriginal: new Date('2026-01-05'), nuevaFecha: new Date('2099-01-05'), motivo: marker, estado: 'APROBADA', idUsuarioResponsable: user.idUsuario } });
      await billing.refreshDelinquency(actor, String(company.idEmpresa));
      if ((await tx.contrato.findUnique({ where: { idContrato: contract.idContrato } }))?.estado !== 'Activo') throw new Error('EXTENSION_ASSERTION_FAILED');

      await tx.convenioPago.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, idFactura: invoice.idFactura, montoComprometido: 6000, cantidadCuotas: 1, condiciones: marker, fechaInicio: new Date('2026-01-01'), estado: 'PENDIENTE', idUsuarioResponsable: user.idUsuario,
        cuotas: { create: [{ numero: 1, monto: 6000, fechaVencimiento: new Date('2099-01-05'), estado: 'PENDIENTE' }] } } });
      await tx.cargoAdicional.create({ data: { idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato, tipo: 'OTRO', monto: 1000, fecha: new Date('2026-01-01'), estado: 'PENDIENTE_FACTURACION', afectaSaldo: false, observacion: marker, idUsuarioResponsable: user.idUsuario } });
      const final = await billing.registerPayment({ idFactura: invoice.idFactura, monto: 6000, pasarela: 'TEST', codigoTransaccion: `${marker}_FINAL` }, actor);
      if (!final.paidInFull || final.saldoPendiente !== 0) throw new Error('FINAL_PAYMENT_ASSERTION_FAILED');
      if ((await tx.factura.findUnique({ where: { idFactura: invoice.idFactura } }))?.estado !== 'Pagada') throw new Error('INVOICE_STATE_ASSERTION_FAILED');
      throw rollback;
    }, { timeout: 120000, maxWait: 10000 });
  } catch (error) {
    if (error !== rollback) throw error;
    return { status: 'PASS_ROLLED_BACK', marker, persisted: false };
  } finally {
    await prisma.$disconnect();
  }
}

export async function main(env = process.env, execute = runScenario, output = console.log) {
  const gate = writeGate(env);
  if (!gate.allowed) { output(JSON.stringify({ status: 'ABORT', reason: gate.reason })); return 2; }
  try {
    const result = await execute(env);
    output(JSON.stringify({ status: result.status, markerPrefix: MARKER_PREFIX, persisted: result.persisted }));
    return result.status === 'PASS_ROLLED_BACK' && result.persisted === false ? 0 : 1;
  } catch {
    output(JSON.stringify({ status: 'FAIL', reason: 'BILLING_WRITE_TEST_FAILED', cleanup: 'TRANSACTION_ROLLED_BACK' }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
