import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { InstallationIntegrationService } from '../g3-integration/installation-integration.service';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';

const actor = { idUsuario: 7, idEmpresa: 1, email: null, nombreCompleto: 'QA', roles: ['Comercial'] };
const approval = { confirmarOrigenG2: true };
function setup() {
  const prospect = { idProspecto: 42, idEmpresa: 1, idCliente: null as number | null,
    clasificacionComercial: 'PROSPECTO', estadoPipeline: 'NUEVO', origenContacto: null as string | null,
    fechaConversion: null, fechaPerdida: null, motivoPerdida: null, tiempoConversionDias: null,
    rut: '11111111-1', latitud: null, longitud: null,
    _count: { contratos: 0, cotizaciones: 0, ordenesTrabajo: 0, integracionesInstalacionG3: 0 } };
  const logs = [
    { idLog: 101n, idEntidadAfectada: 42, accion: 'CREAR_PROSPECTO_PORTAL', valorNuevo: { origen: 'PORTAL', estado_pipeline: 'NUEVO' } as Record<string, unknown> },
    { idLog: 102n, idEntidadAfectada: 42, accion: 'ACEPTAR_POLITICA_PRIVACIDAD', valorNuevo: { formulario: 'CONTRATACION' } as Record<string, unknown> },
  ];
  const prisma = {
    prospecto: {
      findUnique: jest.fn(async () => ({ ...prospect })),
      findUniqueOrThrow: jest.fn(async () => ({ ...prospect })),
      findMany: jest.fn(async () => [{ ...prospect, contratos: [], cotizaciones: [] }]),
      update: jest.fn(async ({ data }: any) => { Object.assign(prospect, data); return { ...prospect }; }),
      create: jest.fn(),
    },
    cliente: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    logAuditoria: { findMany: jest.fn(async () => logs) },
    contrato: { create: jest.fn() }, servicioContratado: { create: jest.fn() }, ordenTrabajo: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1), $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async callback => {
    const before = { ...prospect };
    try { return await callback(prisma); } catch (error) { Object.assign(prospect, before); throw error; }
  });
  const audit = { record: jest.fn() };
  const coverage = { check: jest.fn(), plansForLocation: jest.fn() };
  const mail = { send: jest.fn() };
  return { prospect, logs, prisma, audit, coverage, service: new ProspectsService(prisma as never, audit as never, mail as never, coverage as never) };
}

describe('Revisión explícita de solicitudes G2, sin conversión implícita', () => {
  it('listado no normaliza NUEVO ni expone conteos de relaciones; ofrece solo revisión', async () => {
    const c = setup();
    const [row] = await c.service.list(actor);
    expect(row).toMatchObject({ estadoPipeline: 'NUEVO', requiereRevisionComercial: true, revisionOrigenG2Disponible: true });
    expect(row).not.toHaveProperty('_count');
    expect(c.prospect.estadoPipeline).toBe('NUEVO');
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
  });

  it('NUEVO y PORTAL actuales sin ambos eventos originales no prueban procedencia G2', async () => {
    const c = setup(); c.prospect.origenContacto = 'PORTAL'; c.logs.length = 0;
    expect((await c.service.list(actor))[0].revisionOrigenG2Disponible).toBe(false);
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it.each(['Comercial', 'Administrador'])('%s aprueba únicamente la etapa y la auditoría dentro de la misma transacción', async role => {
    const c = setup();
    const result = await c.service.reviewG2Prospect(42, approval, { ...actor, roles: [role] });
    expect(result).toMatchObject({ estadoPipeline: 'Prospecto Nuevo', requiereRevisionComercial: false, revisionOrigenG2Disponible: false });
    expect(c.prisma.prospecto.update.mock.calls[0][0].data).toEqual({ estadoPipeline: 'Prospecto Nuevo' });
    expect(c.prisma.$executeRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(c.prisma.$executeRaw.mock.calls[0][1]).toBe(42);
    expect(c.prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'REVISAR_SOLICITUD_G2',
      valorNuevo: expect.objectContaining({ evidenciasOrigenG2: { idLogCreacion: '101', idLogConsentimiento: '102' }, estadoPipeline: 'Prospecto Nuevo' }) }), c.prisma);
    expect(c.prospect.origenContacto).toBeNull();
    expect(c.coverage.check).not.toHaveBeenCalled();
    for (const model of ['cliente', 'contrato', 'servicioContratado', 'ordenTrabajo'] as const) expect(c.prisma[model].create).not.toHaveBeenCalled();
  });

  it.each([
    { estadoPipeline: 'Servicio Activo' }, { estadoPipeline: 'Prospecto Nuevo' }, { estadoPipeline: 'Perdido' },
    { clasificacionComercial: 'CLIENTE' },
    { idCliente: 12 }, { fechaConversion: new Date() }, { tiempoConversionDias: 0 }, { motivoPerdida: 'Precio' },
    ...['contratos', 'cotizaciones', 'ordenesTrabajo', 'integracionesInstalacionG3'].map(relation => ({
      _count: { contratos: 0, cotizaciones: 0, ordenesTrabajo: 0, integracionesInstalacionG3: 0, [relation]: 1 },
    })),
  ])('histórico o relación incompatible no se recupera: %j', async incompatible => {
    const c = setup(); Object.assign(c.prospect, incompatible);
    expect((await c.service.list(actor))[0].revisionOrigenG2Disponible).toBe(false);
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
  });

  it.each(['creación ausente', 'privacidad ausente', 'otro formulario', 'otro prospecto', 'otra empresa', 'otra etapa original'])
  ('evidencia original incompleta o contradictoria: %s', async kind => {
    const c = setup();
    if (kind === 'creación ausente') c.logs.shift();
    if (kind === 'privacidad ausente') c.logs.pop();
    if (kind === 'otro formulario') c.logs[1].valorNuevo.formulario = 'CONTACTO';
    if (kind === 'otro prospecto') c.logs[1].idEntidadAfectada = 99;
    if (kind === 'otra empresa') c.logs[0].valorNuevo.id_empresa = 2;
    if (kind === 'otra etapa original') c.logs[0].valorNuevo.estado_pipeline = 'Servicio Activo';
    expect((await c.service.list(actor))[0].revisionOrigenG2Disponible).toBe(false);
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
  });

  it('rechaza empresa ajena antes de adquirir el lock o revelar relaciones', async () => {
    const c = setup(); c.prospect.idEmpresa = 2;
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toThrow('no pertenece a tu empresa');
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['Soporte', 'Terreno', 'Inventario'])('rol %s no puede aprobar una revisión comercial', async role => {
    const c = setup();
    await expect(c.service.reviewG2Prospect(42, approval, { ...actor, roles: [role] })).rejects.toMatchObject({ status: 403 });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('identidad ya relacionada en la empresa no se fusiona ni se recupera automáticamente', async () => {
    const c = setup(); c.prisma.cliente.findFirst.mockResolvedValue({ idCliente: 12 });
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toThrow('identidad comercial relacionada');
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
  });

  it('fallo de auditoría revierte la etapa; repetición tras éxito no vuelve a auditar', async () => {
    const c = setup(); c.audit.record.mockRejectedValueOnce(new Error('QA audit failed'));
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toThrow('QA audit failed');
    expect(c.prospect.estadoPipeline).toBe('NUEVO');
    await c.service.reviewG2Prospect(42, approval, actor);
    c.audit.record.mockClear();
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it.each(['P2025', 'P2034'])('conflicto concurrente %s devuelve 409', async code => {
    const c = setup(); c.prisma.prospecto.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('QA conflict', { code, clientVersion: '5.22.0' }));
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it.each(['40001', '40P01'])('conflicto PostgreSQL %s del bloqueo devuelve 409', async code => {
    const c = setup();
    c.prisma.$executeRaw.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('QA lock conflict', {
      code: 'P2010', meta: { code }, clientVersion: '5.22.0',
    }));
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toMatchObject({ status: 409 });
    expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it('no oculta otros errores SQL como conflictos de concurrencia', async () => {
    const c = setup();
    const error = new Prisma.PrismaClientKnownRequestError('QA SQL error', {
      code: 'P2010', meta: { code: '42501' }, clientVersion: '5.22.0',
    });
    c.prisma.$executeRaw.mockRejectedValue(error);
    await expect(c.service.reviewG2Prospect(42, approval, actor)).rejects.toBe(error);
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it('sin revisión no habilita ubicación, cotización, contratación ni pipeline manual', async () => {
    const c = setup();
    for (const operation of [
      () => c.service.updateLocation(42, { ubicacion: { latitud: -33, longitud: -70 } }, actor),
      () => c.service.generateQuote(42, { planId: 1 }, actor),
      () => c.service.contractPlan(42, { planId: 1 }, actor),
      () => c.service.updatePipeline(42, { estadoPipeline: 'Prospecto Nuevo' }, actor),
    ]) await expect(operation()).rejects.toMatchObject({ status: 400 });
    expect(c.coverage.check).not.toHaveBeenCalled(); expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
  });

  describe('HTTP autenticado, permisos y validación estricta', () => {
    let app: INestApplication;
    let c: ReturnType<typeof setup>;
    beforeEach(async () => {
      c = setup();
      const module = await Test.createTestingModule({ controllers: [ProspectsController], providers: [RolesGuard,
        { provide: ProspectsService, useValue: c.service }, { provide: InstallationIntegrationService, useValue: {} }],
      }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        if (req.headers['x-qa-anonymous']) return false;
        req.user = { ...actor, roles: [req.headers['x-qa-role'] ?? 'Comercial'], idEmpresa: Number(req.headers['x-qa-company'] ?? 1) };
        return true;
      } }).compile();
      app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
    });
    afterEach(async () => app?.close());
    it('ruta dedicada acepta aprobación válida; no cambia el contrato del PATCH genérico', async () => {
      await request(app.getHttpServer()).post('/api/prospects/42/g2-review').send(approval).expect(201);
      expect(c.prospect.estadoPipeline).toBe('Prospecto Nuevo');
    });
    it.each([{}, { ...approval, confirmarOrigenG2: false }, { ...approval, referenciaSolicitudG2: 'inventada' },
      { ...approval, estadoPipeline: 'Factible' }])
    ('rechaza aprobación inválida o campos ajenos %j', async body => {
      await request(app.getHttpServer()).post('/api/prospects/42/g2-review').send(body).expect(400);
      expect(c.prisma.$transaction).not.toHaveBeenCalled();
    });
    it('autenticación, roles y empresa se verifican antes de escribir', async () => {
      const send = () => request(app.getHttpServer()).post('/api/prospects/42/g2-review').send(approval);
      await send().set('x-qa-anonymous', 'true').expect(403);
      await send().set('x-qa-role', 'Soporte').expect(403);
      await send().set('x-qa-company', '2').expect(400);
      expect(c.prisma.prospecto.update).not.toHaveBeenCalled();
    });
  });
});
