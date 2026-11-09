import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { G3ClosureProcessor } from './g3-closure.processor';
import { G3CanonicalWebhookController, G3IntegrationController } from './g3-integration.controller';
import { G3_INTEGRATION_CLIENT } from './g3-integration.types';
import { sha256Payload } from './g3-integration.utils';
import { InstallationActivationService } from './installation-activation.service';
import { InstallationIntegrationService } from './installation-integration.service';

// Real HTTP controllers, validation, S2S guard, tracking service and closure processor.
// Only storage, commercial activation and the G3 transport are simulated.
function fixture(idEmpresa: number) {
  const snapshot = {
    request_id: `qa-request-${idEmpresa}`, trace_id: `qa-trace-${idEmpresa}`, id_empresa: idEmpresa,
    id_contrato: 20, id_prospecto: 10, id_plan: 7,
    persona: { rut: '12345678-5', nombre_completo: 'QA sintético', telefono: '+56900000000' },
    direccion: { direccion_completa: 'Direccion QA', comuna: 'Comuna QA' },
  };
  const tracking: any = {
    idIntegracion: 1, idEmpresa, idContrato: 20, idProspecto: 10, idPlan: 7,
    requestId: snapshot.request_id, traceId: snapshot.trace_id, idOtG3: '901', codigoOtG3: null,
    idCliente: null, idServicio: null, estadoIntegracion: 'EN_SEGUIMIENTO', estadoOtG3: 'EN_CURSO',
    fechaCierreProcesado: null, fechaSolicitud: new Date(), intentos: 1,
    payloadSnapshot: snapshot, payloadHash: sha256Payload(snapshot),
  };
  let event: any = null;
  const events = {
    findUnique: jest.fn(async () => structuredClone(event)),
    create: jest.fn(async ({ data }) => { event = { idEvento: 1, ...structuredClone(data) }; return structuredClone(event); }),
    update: jest.fn(async ({ data }) => { Object.assign(event, structuredClone(data)); return structuredClone(event); }),
  };
  const integrations = {
    findUnique: jest.fn(async ({ where }) => where.requestId && where.requestId !== tracking.requestId ? null : structuredClone(tracking)),
    update: jest.fn(async ({ data }) => { Object.assign(tracking, data); return structuredClone(tracking); }),
    updateMany: jest.fn(async ({ data }) => {
      if (tracking.estadoIntegracion === 'COMPLETADA' || tracking.fechaCierreProcesado) return { count: 0 };
      Object.assign(tracking, data); return { count: 1 };
    }),
  };
  const tx = { $queryRaw: jest.fn(async () => [{ id_integracion: 1 }]), integracionInstalacionG3: integrations, integracionEventoEntrante: events };
  const prisma = { ...tx, $transaction: jest.fn(async (callback) => callback(tx)) };
  const activation = { activate: jest.fn().mockResolvedValue({ idCliente: 30, idDireccion: 40, idServicio: 50, fechaActivacion: new Date() }) };
  const audit = { record: jest.fn(async () => undefined) };
  const payload = {
    id_ot: 901, request_id: snapshot.request_id, trace_id: snapshot.trace_id,
    id_empresa: idEmpresa, id_prospecto: 10, id_contrato: 20, id_plan: 7,
    equipos_instalados: [], equipos_retirados: [],
  };
  const client = {
    getWorkOrder: jest.fn(async () => ({ status: 200, durationMs: 1, data: { ...payload, estado: 'EN_CURSO' } })),
    getWorkOrderClosure: jest.fn<Promise<{ status: number; durationMs: number; data: Record<string, unknown> }>, []>(),
  };
  return { prisma, activation, audit, payload, tracking, events, client, getEvent: () => structuredClone(event) };
}

describe('HTTP G3: approval-only, correlacion e idempotencia', () => {
  let app: INestApplication;
  let store: ReturnType<typeof fixture>;
  async function start(company = 1) {
    store = fixture(company);
    const keys = [1, 2].map(idEmpresa => ({ keyId: `qa-g3-${idEmpresa}`, group: 'G3', companies: [idEmpresa], active: true,
      sha256: createHash('sha256').update(`synthetic-g3-${idEmpresa}`).digest('hex') }));
    const module = await Test.createTestingModule({
      controllers: [G3CanonicalWebhookController, G3IntegrationController],
      providers: [G3ClosureProcessor, InstallationIntegrationService, IntegrationApiKeyGuard, RolesGuard,
        { provide: PrismaService, useValue: store.prisma }, { provide: InstallationActivationService, useValue: store.activation },
        { provide: AuditService, useValue: store.audit }, { provide: G3_INTEGRATION_CLIENT, useValue: store.client },
        { provide: ConfigService, useValue: new ConfigService({ G8_INTEGRATION_API_KEYS: JSON.stringify(keys) }) }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest().user = { idUsuario: 7, idEmpresa: company, roles: ['Comercial'] }; return true;
    } }).compile();
    app = module.createNestApplication();
    app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  }
  afterEach(async () => { await app?.close(); });

  const canonical = '/api/integraciones/fsm/ordenes/901/cierre';
  const alias = '/api/integrations/g3/events/work-order-closed';
  const post = (url = canonical, company = 1) => request(app.getHttpServer()).post(url).set('X-API-KEY', `synthetic-g3-${company}`);

  it.each([1, 2])('acepta cierre aprobado contractual para empresa %s, con una sola activacion', async company => {
    await start(company);
    const result = await post(canonical, company).send(store.payload).expect(201);
    expect(result.body.duplicate).toBe(false);
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
    expect(store.events.create).toHaveBeenCalledTimes(1);
    expect(store.tracking).toMatchObject({ estadoIntegracion: 'COMPLETADA', idCliente: 30, idServicio: 50 });
  });

  it('un retry y la ruta alias deduplican el mismo evento sin activar otra vez', async () => {
    await start();
    await post().send(store.payload).expect(201);
    const hash = store.getEvent().payloadHash;
    for (const url of [canonical, alias]) {
      const result = await post(url).send(store.payload).expect(201);
      expect(result.body.duplicate).toBe(true);
    }
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
    expect(store.events.create).toHaveBeenCalledTimes(1);
    expect(store.getEvent().payloadHash).toBe(hash);
  });

  it('un cambio de equipos en un evento repetido conserva el 409 y la evidencia original', async () => {
    await start();
    await post().send(store.payload).expect(201);
    const previous = store.getEvent();
    await post().send({ ...store.payload, equipos_instalados: [{ numero_serie: 'QA-DISTINTA' }] }).expect(409);
    expect(store.getEvent()).toEqual(previous);
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
  });

  it.each(['id_ot', 'request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan', 'equipos_instalados', 'equipos_retirados'])
    ('rechaza ausencia de %s antes de activar', async field => {
      await start();
      const body: Record<string, unknown> = { ...store.payload }; delete body[field];
      await post().send(body).expect(400);
      expect(store.activation.activate).not.toHaveBeenCalled();
      expect(store.prisma.$transaction).not.toHaveBeenCalled();
    });

  it.each(['id_ot', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan'])('rechaza correlacion incompatible %s', async field => {
    await start();
    await post().send({ ...store.payload, [field]: field === 'trace_id' ? 'qa-otra-traza' : 999 }).expect(400);
    expect(store.activation.activate).not.toHaveBeenCalled();
    expect(store.events.create).not.toHaveBeenCalled();
  });

  it('rechaza key ausente y empresa no autorizada sin escrituras', async () => {
    await start();
    await request(app.getHttpServer()).post(canonical).send(store.payload).expect(401);
    await post(canonical, 2).send(store.payload).expect(403);
    await post().send({ ...store.payload, id_empresa: 2 }).expect(403);
    expect(store.prisma.$transaction).not.toHaveBeenCalled();
    expect(store.activation.activate).not.toHaveBeenCalled();
  });

  it.each(['EN_CURSO', 'PENDIENTE_APROBACION', 'COMPLETADA'])('estado=%s no sustituye el contrato approval-only', async estado => {
    await start();
    await post().send({ ...store.payload, estado }).expect(400);
    expect(store.activation.activate).not.toHaveBeenCalled();
    expect(store.events.create).not.toHaveBeenCalled();
  });

  it('rechaza campos desconocidos junto a datos tecnicos validos, sin quitar whitelist', async () => {
    await start();
    await post().send({ ...store.payload, id_tecnico: 35, usuario_tecnico: 'qa-tech', materiales: [],
      fecha_completada: '2026-11-08T12:00:00.000Z', campo_desconocido: true }).expect(400);
    expect(store.activation.activate).not.toHaveBeenCalled();
  });

  function enriched(tipo_ot: 'INSTALACION' | 'REPARACION' = 'INSTALACION') {
    const fecha = '2026-11-08T12:00:00.000Z';
    return { ...store.payload, tipo_ot, clave_idempotencia: `901:${fecha}`, fecha_completada: fecha,
      id_tecnico: 35, usuario_tecnico: 'qa-tech', potencia_optica_dbm: 0, resultado_llamada: '',
      resuelto_remotamente: false, materiales: [{ id_tipo_equipo: 7, nombre: 'Cable QA', cantidad: 2 }],
      cliente: null, direccion: null, categoria_falla: null, categoria_falla_otro: null };
  }
  function repair() {
    return { ...enriched('REPARACION'), request_id: null, trace_id: null, id_prospecto: null, id_contrato: null, id_plan: null };
  }
  function expectNoProcessing() {
    expect(store.prisma.$transaction).not.toHaveBeenCalled();
    expect(store.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(store.prisma.integracionInstalacionG3.findUnique).not.toHaveBeenCalled();
    expect(store.prisma.integracionInstalacionG3.update).not.toHaveBeenCalled();
    expect(store.events.create).not.toHaveBeenCalled();
    expect(store.activation.activate).not.toHaveBeenCalled();
    expect(store.audit.record).not.toHaveBeenCalled();
    expect(store.client.getWorkOrder).not.toHaveBeenCalled();
    expect(store.client.getWorkOrderClosure).not.toHaveBeenCalled();
  }

  it.each([1, 2])('reparacion independiente empresa %s devuelve acuse 200 sin procesamiento comercial ni persistencia', async company => {
    await start(company);
    const before = structuredClone(store.tracking);
    for (const url of [canonical, canonical, alias]) {
      const result = await post(url, company).send(repair()).expect(200);
      expect(result.body).toEqual({ received: true, processed: false, activated: false,
        code: 'G3_REPAIR_OUT_OF_INSTALLATION_SCOPE', tipo_ot: 'REPARACION', id_ot: 901, id_empresa: company });
    }
    expectNoProcessing();
    expect(store.tracking).toEqual(before);
    expect(store.getEvent()).toBeNull();
  });

  it('una reparacion sin referencias omitidas tampoco requiere tracking comercial', async () => {
    await start();
    const body: Record<string, unknown> = repair();
    for (const field of ['request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan']) delete body[field];
    await post().send(body).expect(200);
    expectNoProcessing();
  });

  it.each(['request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan'])('una reparacion con %s de instalacion contradictorio se rechaza', async field => {
    await start();
    await post().send({ ...repair(), [field]: store.payload[field as keyof typeof store.payload] }).expect(400);
    expectNoProcessing();
  });

  it('reparacion de empresa ajena o con OT de ruta incompatible no se acusa como recibida', async () => {
    await start();
    await post(canonical, 2).send(repair()).expect(403);
    await post().send({ ...repair(), id_ot: 902 }).expect(400);
    expectNoProcessing();
  });

  it('instalacion con todos los campos reales permite cierre unico y conserva hash en retries', async () => {
    await start();
    const body = enriched();
    await post().send(body).expect(201);
    const hash = store.getEvent().payloadHash;
    expect(hash).toBe(sha256Payload(body));
    expect((await post(alias).send(body).expect(201)).body.duplicate).toBe(true);
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
    expect(store.activation.activate.mock.calls[0][2]).toMatchObject({ id_tecnico: 35, resultado_llamada: '', materiales: body.materiales });
    await post().send({ ...body, usuario_tecnico: 'otro-qa-tech' }).expect(409);
    expect(store.getEvent().payloadHash).toBe(hash);
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
  });

  it('valida contexto anidado y equipos reales sin usarlo para sobrescribir identidad ni direccion comercial', async () => {
    await start();
    const body = { ...enriched(), cliente: { rut: null, nombre: 'QA contexto tecnico' },
      direccion: { direccion_completa: 'Direccion tecnica QA', comuna: 'QA' },
      categoria_falla: { id_categoria: 3, nombre: 'QA' },
      equipos_instalados: [{ numero_serie: 'QA-SERIE', accion: 'INSTALADO', estado_g1: 'Instalado en cliente' }],
      equipos_retirados: [{ numero_serie: 'QA-RETIRADO', accion: 'RETIRADO', estado_g1: 'En revision',
        motivo: 'QA', observacion_estado_fisico: 'QA', diagnostico: 'QA' }] };
    await post().send(body).expect(201);
    const technical = store.activation.activate.mock.calls[0][2];
    expect(technical.equipos_instalados).toEqual(body.equipos_instalados);
    for (const field of ['cliente', 'direccion', 'usuario_tecnico', 'categoria_falla']) expect(technical).not.toHaveProperty(field);
  });

  it('reconciliacion enriquecida y webhook identico comparten hash sin una segunda activacion', async () => {
    await start();
    const body = enriched();
    store.client.getWorkOrderClosure.mockResolvedValue({ status: 200, durationMs: 1,
      data: { ...body, tipo: 'INSTALACION', estado: 'COMPLETADA' } });
    await request(app.getHttpServer()).post('/api/integrations/g3/installations/1/reconcile').send({}).expect(201);
    expect(store.getEvent().payloadHash).toBe(sha256Payload(body));
    expect((await post().send(body).expect(201)).body.duplicate).toBe(true);
    expect(store.activation.activate).toHaveBeenCalledTimes(1);
    expect(store.events.create).toHaveBeenCalledTimes(1);
  });

  it.each(['request_id', 'trace_id', 'id_prospecto', 'id_contrato', 'id_plan'])('instalacion enriquecida sin %s no entra al procesador', async field => {
    await start();
    await post().send({ ...enriched(), [field]: null }).expect(400);
    expectNoProcessing();
  });

  it('una empresa autorizada en la key no puede activar referencias contractuales de otra', async () => {
    await start();
    await post(canonical, 2).send({ ...enriched(), id_empresa: 2 }).expect(400);
    expect(store.activation.activate).not.toHaveBeenCalled();
    expect(store.events.create).not.toHaveBeenCalled();
  });

  it.each([
    { id_tecnico: '35' }, { id_tecnico: -1 }, { usuario_tecnico: 35 },
    { materiales: [{ id_tipo_equipo: 7, nombre: 'QA', cantidad: -1 }] },
    { materiales: [{ id_tipo_equipo: 7, nombre: 'QA', cantidad: 1, valor_arbitrario: true }] },
    { fecha_completada: '2026-02-30T12:00:00.000Z' }, { potencia_optica_dbm: '0' },
    { cliente: { rut: null, nombre: 'QA', estado: 'Activo' } },
    { equipos_instalados: [{ numero_serie: 'QA', id_tecnico_g1: 35 }] },
    { usuario_tecnico: 'x'.repeat(101) }, { materiales: Array(1001).fill({ id_tipo_equipo: 7, nombre: 'Q', cantidad: 1 }) },
  ].map((value, index) => [index, value] as const))('rechaza tipos, limites o campos anidados fuera del contrato (caso %s)', async (_index, invalid) => {
    await start();
    await post().send({ ...enriched(), ...invalid }).expect(400);
    expectNoProcessing();
  });

  it('clave contradictoria, tipo desconocido y EN_CURSO no permiten activar ni ignorar un cierre invalido', async () => {
    await start();
    for (const body of [{ ...enriched(), clave_idempotencia: '902:otra-fecha' }, { ...enriched(), tipo_ot: 'RETIRO' },
      { ...repair(), estado: 'EN_CURSO' }, { ...repair(), tipo_ot: undefined }]) {
      await post().send(body).expect(400);
    }
    expectNoProcessing();
  });

  it.each(['EN_CURSO', 'COMPLETADA'])('GET detalle %s nunca confirma cierre ni activa cliente/servicio', async estado => {
    await start();
    store.client.getWorkOrder.mockResolvedValueOnce({ status: 200, durationMs: 1, data: { ...store.payload, estado } });
    await request(app.getHttpServer()).get('/api/integrations/g3/installations/1').expect(200);
    expect(store.client.getWorkOrder).toHaveBeenCalledWith('901', 1);
    expect(store.activation.activate).not.toHaveBeenCalled();
    expect(store.events.create).not.toHaveBeenCalled();
    expect(store.tracking.fechaCierreProcesado).toBeNull();
    expect(store.tracking.estadoIntegracion).not.toBe('COMPLETADA');
  });
});
