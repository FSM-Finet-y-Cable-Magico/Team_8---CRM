import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { BillingService } from '../billing/billing.service';
import { BillingReadService } from '../billing/billing-read.service';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { G2IntegrationController } from './g2-integration.controller';
import { G2IntegrationService } from './g2-integration.service';

// In-memory persistence, not a replacement for PostgreSQL Serializable/unique-index tests.
// Queries execute their relation filters; transactions serialize and restore writes on failure.
function matches(row: any, where: any = {}): boolean {
  if (!row) return false;
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((item: any) => matches(row, item));
    if (value === undefined) return true;
    const actual = row[key];
    if (value && typeof value === 'object') {
      if ('is' in value) return matches(actual, value.is);
      if ('some' in value) return actual?.some((item: any) => matches(item, value.some));
      if ('not' in value && actual === value.not) return false;
      if ('in' in value && !value.in.includes(actual)) return false;
      if ('notIn' in value && value.notIn.includes(actual)) return false;
      if ('lt' in value && !(actual < value.lt)) return false;
      return true;
    }
    return actual === value;
  });
}

async function setup(primary = 1, shared = true) {
  const key = randomUUID();
  const customer = { idCliente: 10, idEmpresa: primary, estado: 'Moroso', importadoMasivo: false,
    nombreCompleto: 'QA local', rut: '11111111-1', email: null, datosTecnicos: null };
  const state = {
    customer, contracts: (shared ? [1, 2] : [primary]).map(idEmpresa => ({
      idContrato: 30 + idEmpresa, idCliente: 10, idEmpresa, estado: 'Moroso', diaVencimiento: 10,
    })),
    invoices: (shared ? [1, 2] : [primary]).map(idEmpresa => ({
      idFactura: 80 + idEmpresa, idContrato: 30 + idEmpresa, monto: 10000, estado: 'Pendiente',
      periodoMes: 9, periodoAnio: 2026, fechaLimitePago: new Date('2020-01-01'),
    })),
    services: (shared ? [1, 2] : [primary]).map(idEmpresa => ({
      idServicio: 50 + idEmpresa, idContrato: 30 + idEmpresa, idEmpresa, estadoOperativo: 'Suspendido',
      datosTecnicos: null, fechaCreacion: new Date('2026-09-20'), ordenes: [{ idOt: 100 + idEmpresa }],
    })),
    payments: [] as any[], audits: [] as any[], jobs: [] as any[],
  };
  const contractRow = (c: any) => c && ({ ...c, cliente: state.customer,
    servicios: state.services.filter(s => s.idContrato === c.idContrato),
    facturas: state.invoices.filter(i => i.idContrato === c.idContrato).map(i => ({ ...i, pagos: state.payments.filter(p => p.idFactura === i.idFactura), prorrogasPago: [] })),
  });
  const invoiceRow = (i: any) => i && ({ ...i, pagos: state.payments.filter(p => p.idFactura === i.idFactura), prorrogasPago: [],
    contrato: contractRow(state.contracts.find(c => c.idContrato === i.idContrato)),
  });
  const update = (rows: any[], where: any, data: any) => {
    const targets = rows.filter(row => matches(row, where));
    targets.forEach(row => Object.assign(row, data));
    return { count: targets.length };
  };
  const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  const db = {
    factura: {
      findUnique: jest.fn(async ({ where }) => invoiceRow(state.invoices.find(i => matches(i, where)))),
      findFirst: jest.fn(async ({ where }) => state.invoices.map(invoiceRow).find(i => matches(i, where)) ?? null),
      findMany: jest.fn(async ({ where }) => state.invoices.map(invoiceRow).filter(i => matches(i, where))),
      count: jest.fn(async ({ where }) => state.invoices.map(invoiceRow).filter(i => matches(i, where)).length),
      update: jest.fn(async ({ where, data }) => { update(state.invoices, where, data); return state.invoices.find(i => matches(i, where)); }),
    },
    pago: {
      findUnique: jest.fn(async ({ where }) => {
        const payment = state.payments.find(p => matches(p, where));
        return payment ? { ...payment, factura: invoiceRow(state.invoices.find(i => i.idFactura === payment.idFactura)) } : null;
      }),
      create: jest.fn(async ({ data }) => {
        if (state.payments.some(p => p.codigoTransaccion === data.codigoTransaccion)) throw { code: 'P2002' };
        const payment = { idPago: state.payments.length + 1, ...data }; state.payments.push(payment); return payment;
      }),
    },
    contrato: {
      findFirst: jest.fn(async ({ where }) => state.contracts.find(c => matches(c, where)) ?? null),
      findUnique: jest.fn(async ({ where }) => contractRow(state.contracts.find(c => matches(c, where)))),
      findMany: jest.fn(async ({ where }) => state.contracts.filter(c => matches(c, where)).map(contractRow)),
      update: jest.fn(async ({ where, data }) => { update(state.contracts, where, data); return state.contracts.find(c => matches(c, where)); }),
    },
    cliente: { updateMany: jest.fn(async ({ where, data }) => update([state.customer], where, data)) },
    servicioContratado: { updateMany: jest.fn(async ({ where, data }) => update(state.services, where, data)) },
    convenioPago: empty(), prorrogaPago: empty(), cargoAdicional: empty(), cambioCondicionPago: empty(), eventoGestionComercial: empty(),
    logNotificacion: empty(),
  };
  let tail = Promise.resolve();
  let failCommit = 0;
  const prisma = { ...db, $transaction: jest.fn(async (work: any, options?: any) => {
    if (Array.isArray(work)) return Promise.all(work);
    expect(options).toEqual({ isolationLevel: 'Serializable' });
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const backup = structuredClone(state);
    try {
      const result = await work(db);
      if (failCommit > 0) { failCommit--; throw { code: 'P2034' }; }
      return result;
    } catch (error) { Object.assign(state, backup); throw error; }
    finally { release(); }
  }) };
  const audit = { record: jest.fn(async (entry: any) => { state.audits.push(entry); }) };
  const issuer = {
    enqueuePayment: jest.fn(async (_tx: any, payment: any) => { state.jobs.push(payment); }),
    processPayment: jest.fn().mockResolvedValue({ state: 'PENDIENTE' }),
  };
  const billing = new BillingService(prisma as never, audit as never, new ConfigService(), issuer as never);
  const read = new BillingReadService(prisma as never);
  const integrations = new G2IntegrationService(prisma as never, read, billing, audit as never);
  const module = await Test.createTestingModule({ controllers: [G2IntegrationController], providers: [
    IntegrationApiKeyGuard, { provide: G2IntegrationService, useValue: integrations },
    { provide: ConfigService, useValue: new ConfigService({ G8_INTEGRATION_API_KEYS: JSON.stringify([
      { keyId: 'qa-local', group: 'G2', sha256: createHash('sha256').update(key).digest('hex'), companies: [1, 2], active: true },
    ]) }) },
  ] }).compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  const http = request(app.getHttpServer());
  const post = (body: any) => http.post('/api/integrations/g2/payments').set('X-API-KEY', key).send(body);
  const get = (path: string) => http.get(`/api/integrations/g2/${path}`).set('X-API-KEY', key);
  return { app, post, get, state, prisma, db, billing, issuer, audit, failCommits: (n: number) => { failCommit = n; } };
}

const body = (company = 1, amount = 10000, transaction = 'qa-confirmed-1') => ({
  id_empresa: company, id_factura: 80 + company, monto: amount, fecha_pago: '2026-10-01T10:00:00.000Z',
  codigo_autorizacion: 'QA-confirmation', codigo_transaccion: transaction, pasarela: 'PORTAL_G2',
});
const user = (idEmpresa: number) => ({ idUsuario: 1, idEmpresa, roles: ['Comercial'], nombreCompleto: 'QA', email: null });

describe('P0-03 HTTP real con persistencia simulada, sin servicios externos', () => {
  let app: INestApplication;
  const start = async (primary = 1, shared = true) => { const ctx = await setup(primary, shared); app = ctx.app; return ctx; };
  afterEach(async () => { await app?.close(); });

  it.each([1, 2])('cliente exclusivo empresa %s: pago y comprobante autorizados', async company => {
    const ctx = await start(company, false);
    const response = await ctx.post(body(company)).expect(201);
    expect(response.body.data).toMatchObject({ id_factura: 80 + company, duplicado: false, saldo: 0, estado_factura: 'Pagada' });
    expect(ctx.state.customer.estado).toBe('Activo');
    expect(ctx.state.payments).toHaveLength(1);
    await ctx.get(`payments/1/comprobante?id_empresa=${company}`).expect(200);
    await ctx.get(`payments/1/comprobante?id_empresa=${3 - company}`).expect(404);
  });

  it.each([1, 2])('cliente compartido principal %s: paga ambas empresas sin tocar estado global', async primary => {
    const ctx = await start(primary);
    for (const company of [1, 2]) {
      const list = await ctx.get(`invoices?id_empresa=${company}&id_cliente=10&page=1&page_size=20`).expect(200);
      expect(list.body.items.map((i: any) => i.idFactura)).toEqual([80 + company]);
      const detail = await ctx.get(`invoices/${80 + company}?id_empresa=${company}`).expect(200);
      expect(detail.body.aceptaPagos).toBe(true);
      await ctx.get(`invoices/${80 + company}?id_empresa=${3 - company}`).expect(404);
      await ctx.post(body(company, 4000, `partial-${company}`)).expect(201);
      expect(ctx.state.invoices.find(i => i.idFactura === 80 + company)?.estado).toBe('Pendiente');
      const paid = await ctx.post(body(company, 6000, `full-${company}`)).expect(201);
      expect(paid.body.data.saldo).toBe(0);
      if (company === 1) expect(ctx.state.contracts.find(c => c.idEmpresa === 2)?.estado).toBe('Moroso');
      expect(ctx.state.customer).toMatchObject({ idEmpresa: primary, estado: 'Moroso' });
    }
    expect(ctx.state.payments).toHaveLength(4);
    expect(ctx.db.cliente.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza factura/contrato ajenos y pagos mal relacionados sin filtrar comprobantes', async () => {
    const ctx = await start();
    await ctx.post({ ...body(), id_factura: 82 }).expect(400);
    const filtered = await ctx.get('invoices?id_empresa=1&id_contrato=32&page=1&page_size=20').expect(200);
    expect(filtered.body.items).toEqual([]);
    expect(ctx.state.payments).toHaveLength(0);
    await ctx.post(body()).expect(201);
    ctx.state.payments[0].idCliente = 999;
    await ctx.get('payments/1/comprobante?id_empresa=1').expect(404);
  });

  it('retry exacto y concurrente conserva un pago, una auditoría y un trabajo tributario', async () => {
    const ctx = await start();
    const responses = await Promise.all([ctx.post(body()), ctx.post(body())]);
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    expect(responses.map(r => r.body.data.duplicado).sort()).toEqual([false, true]);
    expect(ctx.state.payments).toHaveLength(1);
    expect(ctx.state.audits.filter(a => a.accion === 'REGISTRAR_PAGO_G2')).toHaveLength(1);
    expect(ctx.state.jobs).toHaveLength(1);
    await ctx.post(body(1, 9999)).expect(409);
    await ctx.post(body(2)).expect(409);
    expect(ctx.state.payments).toHaveLength(1);
  });

  it('pagos parciales concurrentes no reutilizan saldo ni permiten sobrepago', async () => {
    const ctx = await start();
    const responses = await Promise.all([ctx.post(body(1, 6000, 'A')), ctx.post(body(1, 6000, 'B'))]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 400]);
    expect(ctx.state.payments).toHaveLength(1);
    expect((await ctx.get('invoices/81?id_empresa=1')).body.saldo).toBe(4000);
  });

  it('colisión única P2002 reconsulta el pago confirmado y devuelve duplicado', async () => {
    const ctx = await start();
    await ctx.post(body()).expect(201);
    // The competing transaction has committed; the losing transaction reports P2002.
    ctx.prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    const retry = await ctx.post(body()).expect(201);
    expect(retry.body.data.duplicado).toBe(true);
    expect(ctx.state.payments).toHaveLength(1);
    expect(ctx.state.jobs).toHaveLength(1);
  });

  it('identidad inconsistente en el contrato no autoriza un pago por empresa o RUT coincidentes', async () => {
    const ctx = await start();
    ctx.state.contracts[0].idCliente = 999;
    await ctx.post(body()).expect(400);
    expect(ctx.state.payments).toHaveLength(0);
    expect(ctx.state.audits).toHaveLength(0);
  });

  it('rollback P2034 y retry interno no dejan efectos parciales', async () => {
    const ctx = await start();
    ctx.failCommits(1);
    await ctx.post(body()).expect(201);
    expect(ctx.state.payments).toHaveLength(1);
    expect(ctx.state.jobs).toHaveLength(1);
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('conflicto agotado revierte pago, factura, contrato, servicio, auditoría y outbox', async () => {
    const ctx = await start();
    const before = structuredClone(ctx.state);
    ctx.failCommits(3);
    await ctx.post(body()).expect(409);
    expect(ctx.state).toEqual(before);
    await ctx.post(body()).expect(201);
    expect(ctx.state.payments).toHaveLength(1);
  });

  it('fallo Facturación/SMTP posterior al commit no revierte ni duplica el pago', async () => {
    const ctx = await start();
    ctx.issuer.processPayment.mockRejectedValue(new Error('simulated provider/SMTP failure'));
    await ctx.post(body()).expect(201);
    const retry = await ctx.post(body()).expect(201);
    expect(retry.body.data.duplicado).toBe(true);
    expect(ctx.state.payments).toHaveLength(1);
    expect(ctx.state.jobs).toHaveLength(1);
  });

  it('respuesta perdida tras commit permite reconciliar la misma transacción confirmada sin recobro', async () => {
    const ctx = await start();
    ctx.db.factura.findFirst.mockRejectedValueOnce(new Error('simulated read failure'));
    await ctx.post(body()).expect(500);
    expect(ctx.state.payments).toHaveLength(1);
    const retry = await ctx.post(body()).expect(201);
    expect(retry.body.data).toMatchObject({ duplicado: true, saldo: 0 });
    expect(ctx.state.payments).toHaveLength(1);
  });

  it.each(['Moroso', 'Suspendido', 'Baja'])('cobranza compartida preserva estado global %s', async estado => {
    const ctx = await start();
    ctx.state.customer.estado = estado;
    await ctx.post(body()).expect(201);
    expect(ctx.state.customer.estado).toBe(estado);
    expect(ctx.state.contracts.find(c => c.idEmpresa === 2)?.estado).toBe('Moroso');
  });

  it('refresco y suspensión afectan solo contrato/servicio autorizados de un cliente compartido', async () => {
    const ctx = await start();
    ctx.state.customer.estado = 'Activo';
    ctx.state.contracts.forEach(c => { c.estado = 'Activo'; });
    ctx.state.services.forEach(s => { s.estadoOperativo = 'Activo'; });
    await ctx.billing.refreshDelinquency(user(2));
    expect(ctx.state.contracts.map(c => c.estado)).toEqual(['Activo', 'Moroso']);
    await ctx.billing.suspendContract(32, user(2));
    expect(ctx.state.contracts.map(c => c.estado)).toEqual(['Activo', 'Suspendido']);
    expect(ctx.state.services.map(s => s.estadoOperativo)).toEqual(['Activo', 'Suspendido']);
    expect(ctx.state.customer.estado).toBe('Activo');
    expect(ctx.db.cliente.updateMany).not.toHaveBeenCalled();
  });
});
