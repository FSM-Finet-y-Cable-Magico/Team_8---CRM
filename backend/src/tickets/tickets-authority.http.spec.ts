import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DomainOwnershipService } from '../domain-ownership/domain-ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersController } from '../work-orders/work-orders.controller';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

const diagnosis = { causaRaiz: 'Causa QA', descripcionProblema: 'Problema QA', accionesRealizadas: 'Acciones QA',
  estadoFinalServicio: 'Activo', observaciones: 'Observacion QA' };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Real controllers, services, guards and audit. Only authentication and storage
// are simulated; no AppModule, environment, database or external integration.
function persistence(customerStatus = 'Moroso') {
  const state: Record<string, any[]> = {
    cliente: [{ idCliente: 100, idEmpresa: 1, nombreCompleto: 'QA', estado: customerStatus }],
    contrato: [1, 2].map(idEmpresa => ({ idContrato: idEmpresa * 10, idCliente: 100, idEmpresa, estado: 'Suspendido' })),
    servicioContratado: [1, 2].map(idEmpresa => ({ idServicio: idEmpresa, idCliente: 100, idEmpresa, estadoOperativo: 'Suspendido' })),
    ticket: [1, 2].map(idEmpresa => ({ idTicket: idEmpresa, idEmpresa, idCliente: 100, idServicio: idEmpresa,
      idCategoria: 1, prioridad: 'Media', estado: 'En progreso', fechaCierre: null,
      descripcion: '[Observacion tecnica - QA]\nNota previa', codigoSeguimiento: `TK-QA-${idEmpresa}` })),
    ordenTrabajo: [1, 2].map(idEmpresa => ({ idOt: idEmpresa, idEmpresa, idTicket: idEmpresa, idCliente: 100,
      idServicio: idEmpresa, idProspecto: null, idTecnico: null, tipoOt: 'Reparacion', estado: 'Completada',
      observaciones: 'HISTORICO_QA', fechaCompletada: '2026-10-01T12:00:00.000Z' })),
    historialOt: [{ idOt: 1, estadoNuevo: 'Completada', observaciones: 'HISTORICO_QA' }],
    categoriaFalla: [{ idCategoria: 1, nombre: 'Soporte QA' }, { idCategoria: 2, nombre: 'Consulta QA' }],
    prospecto: [], usuario: [], logAuditoria: [],
  };
  const writes: string[] = [];
  let failAudit = false;
  const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, condition]: [string, any]) => {
    if (condition === undefined) return true;
    if (key === 'OR') return condition.some((clause: any) => matches(row, clause));
    if (condition && typeof condition === 'object') {
      if ('in' in condition) return condition.in.includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
    }
    return row[key] === condition;
  });
  const models = (tables: typeof state): any => Object.fromEntries(Object.keys(tables).map(name => [name, {
    findUnique: jest.fn(async ({ where }: any) => tables[name].find(row => matches(row, where)) ?? null),
    findFirst: jest.fn(async ({ where }: any) => tables[name].find(row => matches(row, where)) ?? null),
    findMany: jest.fn(async ({ where = {} }: any = {}) => tables[name].filter(row => matches(row, where))),
    update: jest.fn(async ({ where, data }: any) => {
      writes.push(`${name}.update`);
      const row = tables[name].find(value => matches(value, where));
      if (!row) throw new Error('Missing QA row');
      Object.assign(row, data);
      return { ...row };
    }),
    create: jest.fn(async ({ data }: any) => {
      writes.push(`${name}.create`);
      if (name === 'logAuditoria' && failAudit) throw new Error('QA audit failure');
      tables[name].push({ ...data });
      return { ...data };
    }),
  }]));
  const db = models(state);
  db.$transaction = jest.fn(async (callback: (tx: any) => Promise<any>) => {
    const draft = clone(state);
    const result = await callback(models(draft));
    Object.assign(state, draft); // Commit only on success; rejection discards the draft.
    return result;
  });
  return { state, db, writes, failNextAudit: () => { failAudit = true; } };
}

describe('P0-02 HTTP: Tickets, autoridad G3 y persistencia financiera', () => {
  let app: INestApplication;
  let store: ReturnType<typeof persistence>;
  async function start(customerStatus = 'Moroso') {
    store = persistence(customerStatus);
    const module = await Test.createTestingModule({
      controllers: [TicketsController, WorkOrdersController],
      providers: [TicketsService, WorkOrdersService, DomainOwnershipService, AuditService, RolesGuard,
        { provide: PrismaService, useValue: store.db }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        if (req.headers['x-qa-anonymous']) return false;
        req.user = { idUsuario: 7, idEmpresa: Number(req.headers['x-qa-company']) || null,
          nombreCompleto: 'QA', email: null, roles: [req.headers['x-qa-role'] ?? 'Soporte'] };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  }
  afterEach(async () => { await app?.close(); });
  const send = (method: 'post' | 'patch' | 'get', path: string, company = 1, body?: object, role = 'Soporte') =>
    request(app.getHttpServer())[method](`/api/${path}`).set('x-qa-company', String(company)).set('x-qa-role', role).send(body);
  const protectedState = () => clone(Object.fromEntries(['cliente', 'contrato', 'servicioContratado', 'ordenTrabajo', 'historialOt']
    .map(name => [name, store.state[name]])));
  const assertNoTechnicalWrites = () => expect(store.writes.filter(name => !name.startsWith('ticket.') && !name.startsWith('logAuditoria.'))).toEqual([]);

  it.each([1, 2].flatMap(company => ['Activo', 'Moroso', 'Suspendido'].flatMap(estado =>
    ['Activo', 'En Mantencion'].map(observed => ({ company, estado, observed })))))
  ('diagnostico empresa $company, cliente $estado y observacion $observed: solo ticket y auditoria', async ({ company, estado, observed }) => {
    await start(estado);
    const before = protectedState();
    const otherTicket = clone(store.state.ticket.find(t => t.idEmpresa !== company));
    const { body } = await send('post', `tickets/${company}/diagnosis`, company, { ...diagnosis, estadoFinalServicio: observed }).expect(201);
    expect(body.estado).toBe('Resuelto');
    expect(body.fechaCierre).toBeTruthy();
    for (const text of ['Nota previa', diagnosis.causaRaiz, diagnosis.descripcionProblema, diagnosis.accionesRealizadas, diagnosis.observaciones, `Estado final: ${observed}`]) {
      expect(body.descripcion).toContain(text);
    }
    expect(protectedState()).toEqual(before);
    expect(store.state.ticket.find(t => t.idEmpresa !== company)).toEqual(otherTicket);
    expect(store.state.logAuditoria).toEqual([expect.objectContaining({ accion: 'REGISTRAR_DIAGNOSTICO_VISITA',
      idEntidadAfectada: company, valorAnterior: { estado: 'En progreso' },
      valorNuevo: expect.objectContaining({ causaRaiz: diagnosis.causaRaiz, estadoFinalServicio: observed }) })]);
    expect(store.writes).toEqual(['ticket.update', 'logAuditoria.create']);
    const notes = await send('get', `tickets/${company}/technical-notes`, company).expect(200);
    expect(notes.body[0].texto).toBe('Nota previa');
  });

  it('rollback de diagnostico si no puede persistirse su auditoria', async () => {
    await start();
    const before = clone(store.state);
    store.failNextAudit();
    await send('post', 'tickets/1/diagnosis', 1, diagnosis).expect(500);
    expect(store.state).toEqual(before);
    assertNoTechnicalWrites();
  });

  it('diagnostico sin OT sigue resolviendo solo el ticket', async () => {
    await start();
    store.state.ordenTrabajo = [];
    await send('post', 'tickets/1/diagnosis', 1, diagnosis).expect(201);
    assertNoTechnicalWrites();
    expect(store.state.cliente[0].estado).toBe('Moroso');
  });

  it.each(['diagnosis', 'Resuelto', 'Cerrado'])('OT pendiente bloquea %s, pero permite notas y seguimiento comercial', async action => {
    await start();
    store.state.ordenTrabajo[0].estado = 'Pendiente';
    const before = clone(store.state);
    const result = action === 'diagnosis'
      ? await send('post', 'tickets/1/diagnosis', 1, diagnosis).expect(400)
      : await send('patch', 'tickets/1/status', 1, { estado: action }).expect(400);
    expect(result.body.message).toContain('G3');
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
    await send('post', 'tickets/1/technical-notes', 1, { observacion: 'Seguimiento QA sin cierre' }).expect(201);
    await send('patch', 'tickets/1/status', 1, { estado: 'Escalado', comentario: 'Pendiente coordinacion' }).expect(200);
    expect(store.state.ticket[0].descripcion).toContain('Seguimiento QA sin cierre');
    expect(store.state.ticket[0].estado).toBe('Escalado');
    expect(protectedState()).toEqual(Object.fromEntries(Object.keys(protectedState()).map(name => [name, before[name]])));
    assertNoTechnicalWrites();
  });

  it.each(['Resuelto', 'Cerrado'])('estado comercial %s no modifica una OT completada ni finanzas', async estado => {
    await start();
    const before = protectedState();
    await send('patch', 'tickets/1/status', 1, { estado }).expect(200);
    expect(store.state.ticket[0].estado).toBe(estado);
    expect(protectedState()).toEqual(before);
    assertNoTechnicalWrites();
  });

  it.each([false, true])('creacion OT y retries concurrentes rechazados incluso con OT existente=%s', async existing => {
    await start();
    if (!existing) store.state.ordenTrabajo = [];
    const before = protectedState();
    const tickets = clone(store.state.ticket);
    const replies = await Promise.all([send('post', 'tickets/1/work-order', 1, {}), send('post', 'tickets/1/work-order', 1, {})]);
    replies.forEach(reply => {
      expect(reply.status).toBe(410);
      expect(reply.body.code).toBe('G3_INTEGRATION_REQUIRED');
      expect(reply.body.message).toContain('ratificado');
    });
    expect(protectedState()).toEqual(before);
    expect(store.state.ticket).toEqual(tickets);
    expect(store.db.$transaction).not.toHaveBeenCalled();
    expect(store.writes).toEqual(['logAuditoria.create', 'logAuditoria.create']);
  });

  it.each(['Soporte', 'Terreno', 'Administrador'])('cierre reparacion local rechazado para %s sin consultar ni modificar OT', async role => {
    await start();
    const before = protectedState();
    const { body } = await send('patch', 'work-orders/1/complete-repair', 1, { observaciones: 'QA', estadoFinalServicio: 'Activo' }, role).expect(400);
    // DTO validation is preserved before the route's authority guard.
    expect(body.message).toBeDefined();
    const rejected = await send('patch', 'work-orders/1/complete-repair', 1, { observaciones: 'Cierre QA', estadoFinalServicio: 'Activo' }, role).expect(410);
    expect(rejected.body.code).toBe('G3_INTEGRATION_REQUIRED');
    expect(store.db.ordenTrabajo.findUnique).not.toHaveBeenCalled();
    expect(protectedState()).toEqual(before);
    expect(store.writes).toEqual(['logAuditoria.create']);
  });

  it('administrador conserva diagnostico comercial consolidado, pero no crea OT', async () => {
    await start('Suspendido');
    await send('post', 'tickets/2/diagnosis', 0, diagnosis, 'Administrador').expect(201);
    await send('post', 'tickets/1/work-order', 0, {}, 'Administrador').expect(410);
    expect(store.state.cliente[0].estado).toBe('Suspendido');
    assertNoTechnicalWrites();
  });

  it.each([0, 2].flatMap(company => ['diagnosis', 'work-order', 'status', 'technical-notes'].map(action => ({ company, action }))))
  ('rechaza identificador ajeno o usuario sin empresa: $company/$action', async ({ company, action }) => {
    await start();
    const before = clone(store.state);
    const payload = action === 'diagnosis' ? diagnosis : action === 'status' ? { estado: 'Resuelto' }
      : action === 'technical-notes' ? { observacion: 'Nota QA' } : {};
    await send(action === 'status' ? 'patch' : 'post', `tickets/1/${action}`, company, payload).expect(400);
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
    expect(store.db.ordenTrabajo.findFirst).not.toHaveBeenCalled();
  });

  it.each(['diagnosis', 'work-order'])('ticket inexistente rechaza %s sin escrituras', async action => {
    await start();
    await send('post', `tickets/999/${action}`, 1, action === 'diagnosis' ? diagnosis : {}).expect(404);
    expect(store.writes).toEqual([]);
  });

  it('rol Comercial no puede registrar diagnostico ni generar OT', async () => {
    await start();
    await send('post', 'tickets/1/diagnosis', 1, diagnosis, 'Comercial').expect(403);
    await send('post', 'tickets/1/work-order', 1, {}, 'Comercial').expect(403);
    expect(store.writes).toEqual([]);
  });

  it.each([1, 2])('lectura de Tickets y OT historicas empresa %s conserva registros', async company => {
    await start();
    const before = clone(store.state);
    const tickets = await send('get', 'tickets', company).expect(200);
    expect(tickets.body).toHaveLength(1);
    expect(tickets.body[0].workOrders[0]).toMatchObject({ idEmpresa: company, observaciones: 'HISTORICO_QA' });
    const orders = await send('get', 'work-orders', company).expect(200);
    expect(orders.body).toHaveLength(1);
    expect(orders.body[0].idEmpresa).toBe(company);
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
  });

  it('categoria, prioridad y notas siguen disponibles sin escrituras financieras', async () => {
    await start();
    const before = protectedState();
    await send('patch', 'tickets/1/category', 1, { idCategoria: 2 }).expect(200);
    await send('patch', 'tickets/1/priority', 1, { prioridad: 'Alta' }).expect(200);
    await send('post', 'tickets/1/technical-notes', 1, { observacion: 'Nota tecnica QA' }).expect(201);
    expect(store.state.ticket[0]).toMatchObject({ idCategoria: 2, prioridad: 'Alta', estado: 'En progreso' });
    expect(protectedState()).toEqual(before);
    expect(store.state.logAuditoria.map(row => row.accion)).toEqual([
      'CLASIFICAR_TICKET', 'ASIGNAR_PRIORIDAD_TICKET', 'REGISTRAR_OBSERVACION_TECNICA_TICKET',
    ]);
    assertNoTechnicalWrites();
  });
});
