import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { G2IntegrationController } from './g2-integration.controller';
import { G2IntegrationService } from './g2-integration.service';

const G2_KEY = 'g2-http-test-key';
const G3_KEY = 'g3-http-test-key';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const entry = (overrides: Record<string, unknown> = {}) => ({
  keyId: 'g2-test', group: 'G2', sha256: hash(G2_KEY), companies: [1, 2], active: true, ...overrides,
});

const INVOICES = '/api/integrations/g2/invoices';
const paymentBody = (id_empresa: number) => ({
  id_empresa, id_factura: 80, monto: 15000, fecha_pago: '2026-10-01T10:00:00.000Z',
  codigo_autorizacion: 'AUTH-1', codigo_transaccion: 'TX-1', pasarela: 'PORTAL_G2',
});

async function createApp(keys?: string) {
  const service = {
    invoices: jest.fn().mockResolvedValue({ items: [] }),
    invoiceDetail: jest.fn().mockResolvedValue({}),
    registerPayment: jest.fn().mockResolvedValue({}),
    paymentReceipt: jest.fn().mockResolvedValue({}),
    paymentTaxDocument: jest.fn().mockResolvedValue({ success: true, data: { id_pago: 3, estado: 'PENDIENTE' } }),
    registerWifiResult: jest.fn().mockResolvedValue({}),
  };
  const module = await Test.createTestingModule({
    controllers: [G2IntegrationController],
    providers: [
      IntegrationApiKeyGuard,
      { provide: G2IntegrationService, useValue: service },
      { provide: ConfigService, useValue: new ConfigService(keys === undefined ? {} : { G8_INTEGRATION_API_KEYS: keys }) },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  // Mismo pipe global que main.ts.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  return { app, service };
}

describe('autenticación HTTP de las rutas S2S de G2', () => {
  let app: INestApplication | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  const start = async (keys?: string) => {
    const created = await createApp(keys);
    app = created.app;
    return { http: request(created.app.getHttpServer()), service: created.service };
  };
  const configured = () => start(JSON.stringify([
    entry(),
    entry({ keyId: 'g3-test', group: 'G3', sha256: hash(G3_KEY) }),
  ]));

  it.each([
    ['get', `${INVOICES}?id_empresa=1&id_cliente=10`],
    ['get', `${INVOICES}/80?id_empresa=1`],
    ['post', '/api/integrations/g2/payments'],
    ['get', '/api/integrations/g2/payments/3/comprobante?id_empresa=1'],
    ['get', '/api/integrations/g2/payments/3/tax-document?id_empresa=1'],
    ['post', '/api/integrations/g2/tickets/50/wifi-result'],
  ] as const)('%s %s responde 401 sin X-API-KEY', async (method, path) => {
    const { http } = await configured();
    await http[method](path).send(method === 'post' ? { id_empresa: 1 } : undefined).expect(401);
  });

  it('responde 401 ante una key desconocida y no la repite en la respuesta', async () => {
    const { http, service } = await configured();
    const response = await http.get(`${INVOICES}?id_empresa=1&id_cliente=10`).set('X-API-KEY', 'clave-desconocida').expect(401);
    expect(JSON.stringify(response.body)).not.toContain('clave-desconocida');
    expect(service.invoices).not.toHaveBeenCalled();
  });

  it('responde 401 si la key de G2 está inactiva', async () => {
    const { http } = await start(JSON.stringify([entry({ active: false })]));
    await http.get(`${INVOICES}?id_empresa=1&id_cliente=10`).set('X-API-KEY', G2_KEY).expect(401);
  });

  it('responde 403 a una key de G3 y no la repite en la respuesta', async () => {
    const { http, service } = await configured();
    const response = await http.get(`${INVOICES}?id_empresa=1&id_cliente=10`).set('X-API-KEY', G3_KEY).expect(403);
    expect(JSON.stringify(response.body)).not.toContain(G3_KEY);
    expect(service.invoices).not.toHaveBeenCalled();
  });

  it('responde 403 a una empresa fuera del scope, por query y por body', async () => {
    const { http, service } = await configured();
    await http.get(`${INVOICES}?id_empresa=3&id_cliente=10`).set('X-API-KEY', G2_KEY).expect(403);
    await http.post('/api/integrations/g2/payments').set('X-API-KEY', G2_KEY).send(paymentBody(3)).expect(403);
    expect(service.invoices).not.toHaveBeenCalled();
    expect(service.registerPayment).not.toHaveBeenCalled();
  });

  it.each([1, 2])('autoriza la empresa %s con companies=[1,2]', async (idEmpresa) => {
    const { http, service } = await configured();
    await http.get(`${INVOICES}?id_empresa=${idEmpresa}&id_cliente=10`).set('X-API-KEY', G2_KEY).expect(200, { items: [] });
    expect(service.invoices).toHaveBeenCalledWith(expect.objectContaining({ id_empresa: idEmpresa, id_cliente: 10 }));
  });

  it('payments acepta el request de referencia con request_id y rechaza campos desconocidos', async () => {
    const { http, service } = await configured();
    // Request de referencia de la respuesta complementaria de G8 (02-10-2026, §4).
    const body = {
      request_id: '550e8400-e29b-41d4-a716-446655440000', id_empresa: 1, id_factura: 101, monto: 14990,
      fecha_pago: '2026-10-02T18:15:00Z', codigo_autorizacion: 'AUTH-987654',
      codigo_transaccion: 'PORTAL-20261002-000001', pasarela: 'PORTAL_G2',
    };
    await http.post('/api/integrations/g2/payments').set('X-API-KEY', G2_KEY).send(body).expect(201);
    expect(service.registerPayment).toHaveBeenCalledWith(expect.objectContaining(body));
    await http.post('/api/integrations/g2/payments').set('X-API-KEY', G2_KEY).send({ ...body, emitir: 'BOLETA' }).expect(400);
    const { codigo_autorizacion: _codigo, ...sinAutorizacion } = body;
    await http.post('/api/integrations/g2/payments').set('X-API-KEY', G2_KEY).send(sinAutorizacion).expect(400);
    expect(service.registerPayment).toHaveBeenCalledTimes(1);
  });

  it('tax-document responde con la key de G2 y respeta el scope de empresa', async () => {
    const { http, service } = await configured();
    const path = '/api/integrations/g2/payments/3/tax-document';
    await http.get(`${path}?id_empresa=2`).set('X-API-KEY', G2_KEY).expect(200, { success: true, data: { id_pago: 3, estado: 'PENDIENTE' } });
    expect(service.paymentTaxDocument).toHaveBeenCalledWith(3, 2);
    await http.get(`${path}?id_empresa=3`).set('X-API-KEY', G2_KEY).expect(403);
    await http.get(path).set('X-API-KEY', G2_KEY).expect(403);
    expect(service.paymentTaxDocument).toHaveBeenCalledTimes(1);
  });

  it('wifi-result acepta el body de G2 y rechaza campos desconocidos', async () => {
    const { http, service } = await configured();
    // Request de referencia de la respuesta complementaria de G8 (02-10-2026, §12).
    const body = {
      request_id: '47fa3f36-9f27-4a77-a3e0-0f602c080426',
      trace_id: 'd80359ef-8999-46d8-80e6-699215f783c2',
      id_empresa: 1,
      resultado: 'REQUIERE_ATENCION_MANUAL',
      detalle_saneado: 'Solicitud registrada para atención por técnico.',
    };
    const path = '/api/integrations/g2/tickets/77/wifi-result';
    await http.post(path).set('X-API-KEY', G2_KEY).send(body).expect(201);
    expect(service.registerWifiResult).toHaveBeenCalledWith(77, expect.objectContaining(body));
    await http.post(path).set('X-API-KEY', G2_KEY).send({ ...body, password: 'x' }).expect(400);
    await http.post(path).set('X-API-KEY', G2_KEY).send({ ...body, resultado: 'OK' }).expect(400);
    expect(service.registerWifiResult).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ausente', undefined],
    ['vacía', '[]'],
    ['con JSON mal formado', '[{'],
    ['con companies como texto', JSON.stringify([entry({ companies: ['1', '2'] })])],
  ])('rechaza todo con 401 si G8_INTEGRATION_API_KEYS está %s', async (_caso, keys) => {
    const { http, service } = await start(keys);
    await http.get(`${INVOICES}?id_empresa=1&id_cliente=10`).set('X-API-KEY', G2_KEY).expect(401);
    expect(service.invoices).not.toHaveBeenCalled();
  });
});
