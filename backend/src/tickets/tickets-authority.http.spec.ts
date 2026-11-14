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
      if ('notIn' in condition) return !condition.notIn.includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
      if ('some' in condition) return (row[key] ?? []).some((child: any) => matches(child, condition.some));
    }
    return row[key] === condition;
  });
  const models = (tables: typeof state): any => Object.fromEntries(Object.keys(tables).map(name => [name, {
    findUnique: jest.fn(async ({ where }: any) => tables[name].find(row => matches(row, where)) ?? null),
    findFirst: jest.fn(async ({ where }: any) => tables[name].find(row => matches(row, where)) ?? null),
    findMany: jest.fn(async ({ where = {} }: any = {}) => tables[name].filter(row => matches(row, where))
      // Prisma entrega Date; el almacén JSON sintético conserva su serialización.
      .map(row => name === 'ordenTrabajo' ? { ...row, fechaCompletada: row.fechaCompletada ? new Date(row.fechaCompletada) : null } : row)),
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
  // La lectura histórica vigente consulta cierre_equipos, no inventario físico.
  db.$queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    if (!strings.join('').includes('FROM public.categoria_falla AS c')) return [];
    const tipoDisponible = state.categoriaFalla.some(row => Object.prototype.hasOwnProperty.call(row, 'tipo'));
    return state.categoriaFalla.map(row => ({ ...row, tipoDisponible,
      tipo: tipoDisponible ? (Object.prototype.hasOwnProperty.call(row, 'tipo') ? row.tipo : 'INTERNA') : null }));
  });
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

  it('catálogo HTTP conserva técnicos, IDs y SLA y distingue las siete atenciones por nombre', async () => {
    await start();
    const names = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
      'Facturación y cobro', 'Consulta general', 'Baja de servicio'];
    store.state.categoriaFalla.push(...names.map((nombre, i) => ({ idCategoria: 731 + i * 13,
      nombre: nombre.toUpperCase(), slaHoras: 12 })), { idCategoria: 309, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 2 });
    store.state.ticket[0].idCategoria = 309;
    store.state.ticket[0].estado = 'DERIVADO_OT';
    const before = clone(store.state);
    for (const company of [1, 2]) {
      const { body } = await send('get', 'tickets/categories', company).expect(200);
      expect(body.filter((row: any) => row.nombreAtencion).map((row: any) => row.nombreAtencion)).toEqual(names);
      expect(body.find((row: any) => row.idCategoria === 309)).toEqual({ idCategoria: 309,
        nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 2, nombreAtencion: null, tipo: null, tipoDisponible: false });
    }
    const { body } = await send('get', 'tickets', 1).expect(200);
    expect(body[0].categoria).toEqual({ idCategoria: 309, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 2 });
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
  });

  it('alta HTTP conserva el ID numérico y rechaza categorías técnicas o nombres libres', async () => {
    await start();
    Object.assign(store.state.cliente[0], { rut: '11111111-1', contratos: [], servicios: [] });
    store.state.categoriaFalla.push({ idCategoria: 914, nombre: 'CONSULTA GENERAL', slaHoras: 12 },
      { idCategoria: 309, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 2 });
    const body = { rut: '11111111-1', idCategoria: 914, prioridad: 'Media', descripcion: 'Consulta sintética QA' };
    const before = protectedState();
    await send('post', 'tickets', 1, { ...body, idCategoria: 309 }).expect(400);
    await send('post', 'tickets', 1, { ...body, idCategoria: 'Consulta general' }).expect(400);
    await send('post', 'tickets', 1, { ...body, categoria: 'Consulta general' }).expect(400);
    expect(store.writes).toEqual([]);
    const created = await send('post', 'tickets', 1, body).expect(201);
    expect(created.body).toMatchObject({ idCategoria: 914, idEmpresa: 1, estado: 'Abierto' });
    expect(protectedState()).toEqual(before);
    expect(store.writes).toEqual(['ticket.create', 'logAuditoria.create']);
  });

  it('HTTP: tipo global gobierna las altas sin ocultar categorías históricas ni escribir al consultar', async () => {
    await start();
    Object.assign(store.state.cliente[0], { rut: '11111111-1', contratos: [], servicios: [] });
    store.state.categoriaFalla.push({ idCategoria: 900, nombre: 'Consulta general', tipo: 'ATENCION', slaHoras: 12 },
      { idCategoria: 901, nombre: 'Mudanza', tipo: 'TECNICA', slaHoras: 4 },
      { idCategoria: 902, nombre: 'Asistente virtual', tipo: 'INTERNA', slaHoras: 3 });
    const before = clone(store.state);
    const catalog = await send('get', 'tickets/categories', 1).expect(200);
    expect(catalog.body.filter((row: any) => row.nombreAtencion).map((row: any) => row.idCategoria)).toEqual([900]);
    expect(catalog.body.find((row: any) => row.idCategoria === 902)).toMatchObject({ nombre: 'Asistente virtual', tipo: 'INTERNA', nombreAtencion: null });
    const body = { rut: '11111111-1', prioridad: 'Media', descripcion: 'Consulta sintética QA' };
    await send('post', 'tickets', 1, { ...body, idCategoria: 901 }).expect(400);
    await send('post', 'tickets', 1, { ...body, idCategoria: 902 }).expect(400);
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
    const created = await send('post', 'tickets', 1, { ...body, idCategoria: 900 }).expect(201);
    expect(created.body.idCategoria).toBe(900);
    await send('patch', 'tickets/1/category', 1, { idCategoria: 902 }).expect(400);
    await send('patch', 'tickets/1/category', 1, { idCategoria: 901 }).expect(200);
    expect(store.state.ticket[0].idCategoria).toBe(901);
    await send('patch', 'tickets/1/category', 1, { idCategoria: 902 }).expect(400);
    await send('patch', 'tickets/1/category', 1, { idCategoria: 901 }).expect(200);
    expect(store.state.ticket[0].idCategoria).toBe(901);
  });

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

  it('OT COMPLETADA no aparece abierta y admite solo el cierre comercial autorizado', async () => {
    for (const company of [1, 2]) for (const action of ['diagnosis', 'Resuelto', 'Cerrado']) {
      await start('Moroso');
      store.state.ordenTrabajo[company - 1].estado = 'COMPLETADA';
      const before = protectedState();
      const listed = await send('get', 'tickets', company).expect(200);
      expect(listed.body[0]).toMatchObject({ hasOpenWorkOrder: false });
      expect(listed.body[0].workOrders[0].estado).toBe('COMPLETADA');
      expect(store.writes).toEqual([]);
      expect(protectedState()).toEqual(before);
      if (action === 'diagnosis') await send('post', `tickets/${company}/diagnosis`, company, diagnosis).expect(201);
      else await send('patch', `tickets/${company}/status`, company, { estado: action }).expect(200);
      expect(protectedState()).toEqual(before);
      assertNoTechnicalWrites();
      await app.close();
    }
  });

  it('OT finalizada no oculta otra EN_CURSO, cancelada o de estado no reconocido', async () => {
    await start('Suspendido');
    store.state.ordenTrabajo[0].estado = 'COMPLETADA';
    store.state.ordenTrabajo.push({ ...store.state.ordenTrabajo[0], idOt: 3, estado: 'EN_CURSO' });
    for (const state of ['EN_CURSO', 'CANCELADA', 'PENDIENTE_APROBACION', 'desconocido', 'completada']) {
      store.state.ordenTrabajo[2].estado = state;
      const before = clone(store.state);
      const listed = await send('get', 'tickets', 1).expect(200);
      expect(listed.body[0].hasOpenWorkOrder).toBe(true);
      await send('post', 'tickets/1/diagnosis', 1, diagnosis).expect(400);
      await send('patch', 'tickets/1/status', 1, { estado: 'Cerrado' }).expect(400);
      expect(store.state).toEqual(before);
      expect(store.writes).toEqual([]);
    }
  });

  it('ticket tecnico sigue solo lectura aunque todas sus OT esten COMPLETADA', async () => {
    await start();
    store.state.ordenTrabajo[0].estado = 'COMPLETADA';
    store.state.ticket[0].estado = 'RESUELTO';
    const before = clone(store.state);
    await send('post', 'tickets/1/diagnosis', 1, diagnosis).expect(409);
    await send('patch', 'tickets/1/status', 1, { estado: 'Cerrado' }).expect(409);
    expect(store.state).toEqual(before);
    expect(store.writes).toEqual([]);
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

  it('ticket G3 compartido: API permite consulta y rechaza ediciones incluso administrador', async () => {
    await start();
    store.state.ticket[0].estado = 'DERIVADO_OT';
    store.state.ticket[0].origen = 'CRM';
    const before = clone(store.state);
    const visible = await send('get', 'tickets', 1).expect(200);
    expect(visible.body[0]).toMatchObject({ estado: 'DERIVADO_OT', estadoPresentacion: 'Derivado a OT',
      vocabularioEstado: 'G3', soloLecturaTecnica: true });
    for (const role of ['Soporte', 'Administrador']) {
      for (const [path, method, body] of [
        ['category', 'patch', { idCategoria: 2 }], ['priority', 'patch', { prioridad: 'Alta' }],
        ['status', 'patch', { estado: 'Resuelto' }], ['diagnosis', 'post', diagnosis],
        ['technical-notes', 'post', { observacion: 'Nota QA' }],
      ] as const) {
        const response = await send(method, `tickets/1/${path}`, 1, body, role).expect(409);
        expect(response.body.code).toBe('G3_TICKET_READ_ONLY');
      }
    }
    await send('patch', 'tickets/1/status', 2, { estado: 'Resuelto' }).expect(400);
    await send('post', 'tickets/1/diagnosis', 1, diagnosis, 'JEFE_TECNICO').expect(403);
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

  describe('P0-B: datos obligatorios, origen, atomicidad, catálogo global real y tickets de otros grupos', () => {
    const attentionNames = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
      'Facturación y cobro', 'Consulta general', 'Baja de servicio'];
    const attentionSla = [24, 48, 48, 48, 24, 24, 48];
    const technicalNames = ['Sintonización de TV', 'Internet lento', 'Colector defectuoso', 'Falla de planta externa',
      'IPTV pirata', 'Cliente ausente', 'Otro'];
    // Forma observada del catálogo global (IDs 1-7 TECNICA, 8-14 ATENCION, 15-16 INTERNA). El código
    // de producción no los conoce: aquí son solo datos y se desplazan para probar que no se fijan.
    const globalCatalog = (offset = 0) => [
      ...technicalNames.map((nombre, i) => ({ idCategoria: offset + 1 + i, nombre, tipo: 'TECNICA', slaHoras: 8 })),
      ...attentionNames.map((nombre, i) => ({ idCategoria: offset + 8 + i, nombre, tipo: 'ATENCION', slaHoras: attentionSla[i] })),
      { idCategoria: offset + 15, nombre: 'CAMBIO_CREDENCIALES_WIFI', tipo: 'INTERNA', slaHoras: null },
      { idCategoria: offset + 16, nombre: 'Asistente virtual', tipo: 'INTERNA', slaHoras: null },
    ];
    const prepare = () => {
      Object.assign(store.state.cliente[0], { rut: '11111111-1', contratos: [], servicios: [] });
      store.state.categoriaFalla.push({ idCategoria: 914, nombre: 'CONSULTA GENERAL', slaHoras: 12 });
    };
    const attentionBody = () => ({ rut: '11111111-1', idCategoria: 914, prioridad: 'Media', descripcion: 'Cliente reporta intermitencia' });
    const mutations = [
      ['categoria', 'patch', 'tickets/1/category', { idCategoria: 2 }],
      ['prioridad', 'patch', 'tickets/1/priority', { prioridad: 'Alta' }],
      ['estado', 'patch', 'tickets/1/status', { estado: 'Escalado', comentario: 'Motivo QA' }],
      ['nota', 'post', 'tickets/1/technical-notes', { observacion: 'Nota QA' }],
    ] as const;

    it.each([[''], ['   '], ['corta'], ['   corta   '], ['123456789']])
    ('alta exige descripción suficiente en el servidor, no solo en el formulario: %j', async descripcion => {
      await start();
      prepare();
      const { body } = await send('post', 'tickets', 1, { ...attentionBody(), descripcion }).expect(400);
      expect(JSON.stringify(body.message)).toMatch(/descripci[oó]n/i);
      expect(store.writes).toEqual([]);
    });

    it('alta guarda la descripción sin espacios sobrantes', async () => {
      await start();
      prepare();
      const created = await send('post', 'tickets', 1, { ...attentionBody(), descripcion: '  Cliente reporta intermitencia  ' }).expect(201);
      expect(created.body.descripcion).toBe('Cliente reporta intermitencia');
    });

    it.each(['PORTAL', 'ASISTENTE', 'BOT', 'WHATSAPP', 'crm', ''])
    ('alta rechaza atribuirse el origen %j: el CRM solo puede declarar su propio canal', async origen => {
      await start();
      prepare();
      await send('post', 'tickets', 1, { ...attentionBody(), origen }).expect(400);
      expect(store.writes).toEqual([]);
    });

    it('alta registra origen CRM con o sin el campo', async () => {
      await start();
      prepare();
      const implicit = await send('post', 'tickets', 1, attentionBody()).expect(201);
      const explicit = await send('post', 'tickets', 1, { ...attentionBody(), origen: 'CRM' }).expect(201);
      expect([implicit.body.origen, explicit.body.origen]).toEqual(['CRM', 'CRM']);
    });

    it.each([['alta', 'post', 'tickets', undefined] as const, ...mutations])
    ('%s: si la auditoría no puede persistirse no queda escritura parcial ni respuesta de éxito', async (_name, method, path, payload) => {
      await start();
      prepare();
      const before = clone(store.state);
      store.failNextAudit();
      await send(method, path, 1, payload ?? attentionBody()).expect(500);
      expect(store.state).toEqual(before);
      assertNoTechnicalWrites();
    });

    it.each(mutations)('%s: éxito registra exactamente un cambio y su auditoría en la misma operación', async (_name, method, path, payload) => {
      await start();
      prepare();
      await send(method, path, 1, payload).expect(method === 'post' ? 201 : 200);
      expect(store.writes).toEqual(['ticket.update', 'logAuditoria.create']);
      expect(store.state.logAuditoria).toHaveLength(1);
    });

    it.each([0, 700])('catálogo global real (IDs desplazados +%i): seis altas comerciales por su ID real, Baja de servicio reservada y ninguna técnica ni interna', async offset => {
      await start();
      prepare();
      store.state.categoriaFalla = globalCatalog(offset);
      const catalogBefore = clone(store.state.categoriaFalla);
      const { body } = await send('get', 'tickets/categories', 1).expect(200);
      expect(body.filter((row: any) => row.nombreAtencion).map((row: any) => [row.idCategoria, row.nombreAtencion]))
        .toEqual(attentionNames.map((nombre, i) => [offset + 8 + i, nombre]));
      expect(body).toHaveLength(16);
      for (let i = 0; i < attentionNames.length; i++) {
        if (attentionNames[i] === 'Baja de servicio') {
          // FINET 13-11-2026: listed in the catalogue, but reserved to the guided withdrawal of the Libro de Control.
          const rejected = await send('post', 'tickets', 1, { ...attentionBody(), idCategoria: offset + 8 + i }).expect(400);
          expect(rejected.body.code).toBe('WITHDRAWAL_TICKET_CATEGORY_RESERVED');
          continue;
        }
        const created = await send('post', 'tickets', 1, { ...attentionBody(), idCategoria: offset + 8 + i }).expect(201);
        expect(created.body.idCategoria).toBe(offset + 8 + i);
      }
      const forbidden = [...Array(7).keys()].map(i => offset + 1 + i).concat([offset + 15, offset + 16]);
      for (const idCategoria of forbidden) await send('post', 'tickets', 1, { ...attentionBody(), idCategoria }).expect(400);
      expect(store.state.categoriaFalla).toEqual(catalogBefore);
      expect(store.writes.filter(name => name === 'ticket.create')).toHaveLength(6);
    });

    it.each(['PORTAL', 'ASISTENTE'])('ticket creado desde G2 (origen %s): se lee legible y no se edita desde G8', async origen => {
      await start();
      Object.assign(store.state.ticket[0], { estado: 'ABIERTO', prioridad: 'MEDIA', origen, idUsuarioAsignado: null,
        descripcion: 'Reporte creado desde el portal de clientes' });
      const before = clone(store.state);
      const { body } = await send('get', 'tickets', 1).expect(200);
      expect(body[0]).toMatchObject({ estado: 'ABIERTO', estadoPresentacion: 'Abierto', vocabularioEstado: 'G3',
        soloLecturaTecnica: true, prioridad: 'MEDIA', origen, idEmpresa: 1 });
      for (const [, method, path, payload] of mutations) {
        const response = await send(method, path, 1, payload).expect(409);
        expect(response.body.code).toBe('G3_TICKET_READ_ONLY');
      }
      expect(store.state).toEqual(before);
      expect(store.writes).toEqual([]);
    });

    it('registros históricos incompletos o con valores ajenos siguen consultables, sin escribir ni fallar', async () => {
      await start();
      const base = { idEmpresa: 1, idServicio: null, idUsuarioAsignado: null, fechaCierre: null, origen: null };
      store.state.ticket = [
        { ...base, idTicket: 21, idCliente: null, idCategoria: 999, prioridad: 'Media', estado: 'LEGADO',
          descripcion: null, codigoSeguimiento: null, fechaCreacion: null },
        { ...base, idTicket: 22, idCliente: 100, idCategoria: 1, prioridad: '', estado: 'Abierto',
          descripcion: '', codigoSeguimiento: 'TK-HIST', fechaCreacion: '2026-01-01T00:00:00.000Z' },
        { ...base, idEmpresa: null, idTicket: 23, idCliente: null, idCategoria: 1, prioridad: 'Alta', estado: 'Abierto',
          descripcion: null, codigoSeguimiento: null, fechaCreacion: null },
      ];
      const before = clone(store.state);
      const support = await send('get', 'tickets', 1).expect(200);
      // 21 tiene prioridad Media; 22 trae una prioridad vacía (dato inyectado) y va al final.
      expect(support.body.map((row: any) => row.idTicket)).toEqual([21, 22]);
      expect(support.body.find((row: any) => row.idTicket === 21)).toMatchObject({ cliente: null, categoria: null,
        estadoPresentacion: 'LEGADO', vocabularioEstado: 'DESCONOCIDO', soloLecturaTecnica: true, observacionesTecnicas: [] });
      const admin = await send('get', 'tickets', 1, undefined, 'Administrador').expect(200);
      expect(admin.body.map((row: any) => row.idTicket).sort()).toEqual([21, 22, 23]);
      await send('patch', 'tickets/21/priority', 1, { prioridad: 'Alta' }).expect(409);
      expect(store.state).toEqual(before);
      expect(store.writes).toEqual([]);
    });

    it('la lista ordena por urgencia (Crítica, Alta, Media, Baja) sea cual sea el vocabulario y pone al final lo desconocido', async () => {
      await start();
      const base = { idEmpresa: 1, idCliente: 100, idServicio: null, idCategoria: 1, estado: 'Abierto', descripcion: 'QA', fechaCierre: null };
      store.state.ticket = ['Baja', 'Media', 'Alta', 'CRITICA', 'MEDIA', 'ALTA', 'Rara', 'Baja'].map((prioridad, i) => ({
        ...base, idTicket: 11 + i, prioridad, codigoSeguimiento: `TK-O${i}`, fechaCreacion: new Date(Date.UTC(2026, 0, 1 + i)) }));
      const { body } = await send('get', 'tickets', 1).expect(200);
      expect(body.map((row: any) => row.idTicket)).toEqual([14, 16, 13, 15, 12, 18, 11, 17]);
    });

    it('empresa 2 solo atribuye a su empresa: servicio ajeno rechazado, ticket general y de servicio propios, sin verse desde empresa 1', async () => {
      await start();
      prepare();
      Object.assign(store.state.cliente[0], { contratos: [{ idEmpresa: 1 }, { idEmpresa: 2 }], servicios: [{ idEmpresa: 1 }, { idEmpresa: 2 }] });
      // El arnés no resuelve `include`: cada servicio lleva su contrato como lo entregaría Prisma.
      for (const row of store.state.servicioContratado) {
        Object.assign(row, { idContrato: row.idEmpresa * 10, contrato: { idContrato: row.idEmpresa * 10, idCliente: 100, idEmpresa: row.idEmpresa } });
      }
      const foreign = await send('post', 'tickets', 2, { ...attentionBody(), idServicio: 1 }).expect(400);
      expect(foreign.body.message).toMatch(/no pertenece a tu empresa/);
      expect(store.writes).toEqual([]);
      const own = await send('post', 'tickets', 2, { ...attentionBody(), idServicio: 2 }).expect(201);
      const general = await send('post', 'tickets', 2, attentionBody()).expect(201);
      expect([own.body, general.body]).toEqual([expect.objectContaining({ idEmpresa: 2, idServicio: 2 }), expect.objectContaining({ idEmpresa: 2 })]);
      const company1 = await send('get', 'tickets', 1).expect(200);
      expect(company1.body.every((row: any) => row.idEmpresa === 1)).toBe(true);
      expect(company1.body).toHaveLength(1);
    });
  });
});
