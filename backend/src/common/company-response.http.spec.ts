import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditService } from '../audit/audit.service';
import { DomainOwnershipService } from '../domain-ownership/domain-ownership.service';
import { InstallationIntegrationService } from '../g3-integration/installation-integration.service';
import { MonitoringController } from '../monitoring/monitoring.controller';
import { MonitoringService } from '../monitoring/monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsController } from '../requests/requests.controller';
import { RequestsService } from '../requests/requests.service';
import { ServicesController } from '../services/services.controller';
import { ServicesService } from '../services/services.service';
import { TicketsController } from '../tickets/tickets.controller';
import { TicketsService } from '../tickets/tickets.service';
import { TvipController } from '../tvip/tvip.controller';
import { TvipService } from '../tvip/tvip.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

// Actual controllers/services/role guard and JSON serialization; only persistence
// and JWT identity are simulated. No AppModule, .env, database or external client.
function fixture(companies = [1, 2]) {
  const customer = {
    idCliente: 100, idEmpresa: companies[0], rut: '11111111-1', nombreCompleto: 'Identidad QA',
    email: 'qa@example.invalid', telefono: null, estado: 'Moroso',
    datosTecnicos: { direccion: 'GLOBAL_PRIVATE' }, obsConflictivo: 'GLOBAL_PRIVATE',
    passwordPortalHash: 'HASH_MUST_NEVER_LEAVE',
    contratos: companies.map(idEmpresa => ({ idEmpresa })), servicios: companies.map(idEmpresa => ({ idEmpresa })),
  };
  const contracts = companies.map(idEmpresa => ({
    idContrato: idEmpresa * 10, idEmpresa, idCliente: 100, estado: 'Activo', cliente: customer,
    plan: { idPlan: idEmpresa, idEmpresa, nombreComercial: `TV_${idEmpresa}`, tipoPlan: 'Internet+TV' },
  }));
  const units = companies.map(idEmpresa => ({
    idUnidad: idEmpresa * 100, idEmpresa, idServicio: idEmpresa, idClienteInstalado: 100,
    numeroSerie: `UNIT_${idEmpresa}`, estado: 'Instalado', idCajaNap: idEmpresa,
  }));
  const services = companies.map(idEmpresa => ({
    idServicio: idEmpresa, idEmpresa, idCliente: 100, idContrato: idEmpresa * 10, idDireccion: idEmpresa,
    cliente: customer, contrato: contracts.find(c => c.idEmpresa === idEmpresa),
    direccion: { idDireccion: idEmpresa, idCliente: 100, direccionCompleta: `ADDRESS_${idEmpresa}` },
    estadoOperativo: 'Activo', datosTecnicos: { potencia: -20 },
    equipos: units.filter(u => u.idEmpresa === idEmpresa), tickets: [], ordenes: [], solicitudes: [],
  }));
  const requests = companies.map(idEmpresa => ({
    idSolicitud: idEmpresa, idEmpresa, idCliente: 100, idServicio: idEmpresa, estado: 'Abierta',
    observaciones: null, cliente: customer, servicio: services.find(s => s.idEmpresa === idEmpresa),
    usuarioRegistro: { idEmpresa, idUsuario: idEmpresa, nombreCompleto: 'Operador QA' },
  }));
  const tickets = companies.map(idEmpresa => ({
    idTicket: idEmpresa, idEmpresa, idCliente: 100, idServicio: idEmpresa,
    idCategoria: 1, estado: 'Abierto', prioridad: 'Media', descripcion: `TICKET_${idEmpresa}`,
  }));
  const measurements = companies.map(idEmpresa => ({
    idMonitoreo: BigInt(idEmpresa), idUnidad: idEmpresa * 100, idCliente: 100, idCajaNap: idEmpresa,
    timestampMedicion: new Date(Date.now() + idEmpresa * 1000), potenciaActualDbm: -20 - idEmpresa, estadoConexion: 'Online',
  })).reverse(); // Other-company measurement can be the newest for this identity.
  const history = companies.map(idEmpresa => ({
    idHistorialOnt: BigInt(idEmpresa), idUnidad: idEmpresa * 100, evento: `HISTORY_${idEmpresa}`,
  }));
  const orders = companies.map(idEmpresa => ({
    idOt: idEmpresa, idEmpresa, idTicket: idEmpresa, idCliente: 100, estado: 'Pendiente', observaciones: `ORDER_${idEmpresa}`,
  }));
  // Minimal interpreter for the actual predicates used by these routes, rather
  // than fixed responses that would ignore missing company filters.
  const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, condition]: [string, any]) => {
    if (condition === undefined) return true;
    if (key === 'OR') return condition.some((clause: any) => matches(row, clause));
    if (condition && typeof condition === 'object' && 'in' in condition) return condition.in.includes(row[key]);
    return row[key] === condition;
  });
  const model = (rows: any[]) => ({
    findMany: jest.fn(async ({ where = {} }: any = {}) => rows.filter(r => matches(r, where))),
    findUnique: jest.fn(async ({ where }: any) => rows.find(r => matches(r, where)) ?? null),
    findFirst: jest.fn(async ({ where }: any) => rows.find(r => matches(r, where)) ?? null),
    create: jest.fn(async ({ data }: any) => ({ ...data })),
    update: jest.fn(async ({ where, data }: any) => ({ ...rows.find(r => matches(r, where)), ...data })),
  });
  const db = {
    cliente: model([customer]), contrato: model(contracts), servicioContratado: model(services),
    solicitudCliente: model(requests), ticket: model(tickets), unidadEquipo: model(units),
    monitoreoOnt: model(measurements), historialConexionOnt: model(history), ordenTrabajo: model(orders),
    cajaNap: model(companies.map(idEmpresa => ({ idEmpresa, idCajaNap: idEmpresa, identificadorUnico: `NAP_${idEmpresa}` }))),
    categoriaFalla: model([{ idCategoria: 1, nombre: 'Consulta QA' }]),
    credencialesTvip: model(companies.map(idEmpresa => ({
      idContrato: idEmpresa * 10, idCredencial: idEmpresa, usuarioTvip: `TV_USER_${idEmpresa}`,
      passwordTvipHash: 'TV_HASH_MUST_NEVER_LEAVE',
    }))),
    integracionInstalacionG3: model([]), integracionActivacionG1: model([]), usuario: model([]), logAuditoria: model([]),
  };
  return { db, customer, contracts, services, requests, tickets, units, measurements, history, orders };
}

describe('P0-01 aislamiento de respuestas HTTP', () => {
  let app: INestApplication;
  let data: ReturnType<typeof fixture>;
  let audit: { record: jest.Mock };
  async function start(companies = [1, 2]) {
    data = fixture(companies);
    audit = { record: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [TvipController, MonitoringController, ServicesController, RequestsController, TicketsController],
      providers: [TvipService, MonitoringService, ServicesService, RequestsService, TicketsService, RolesGuard,
        { provide: PrismaService, useValue: data.db }, { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: new ConfigService({}) },
        { provide: InstallationIntegrationService, useValue: {} }, { provide: DomainOwnershipService, useValue: {} }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        req.user = { idUsuario: 7, idEmpresa: Number(req.headers['x-test-company']) || null,
          nombreCompleto: 'QA', email: null, roles: [req.headers['x-test-role'] ?? 'Soporte'] };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  }
  afterEach(async () => { await app?.close(); });
  const get = (path: string, company: number, role = 'Soporte') => request(app.getHttpServer())
    .get(`/api/${path}`).set('x-test-company', String(company)).set('x-test-role', role);
  const post = (path: string, company: number, body: unknown, role = 'Soporte') => request(app.getHttpServer())
    .post(`/api/${path}`).set('x-test-company', String(company)).set('x-test-role', role).send(body as object);
  const assertIdentity = (value: any) => {
    expect(value).toEqual({ idCliente: 100, rut: '11111111-1', nombreCompleto: 'Identidad QA', email: 'qa@example.invalid', telefono: null });
  };
  const assertPrivateAbsent = (body: unknown) => {
    expect(JSON.stringify(body)).not.toMatch(/GLOBAL_PRIVATE|HASH_MUST_NEVER_LEAVE|Moroso|passwordPortalHash/);
  };

  it.each([
    { company: 1, role: 'Soporte' },
    { company: 2, role: 'Soporte' },
    { company: 0, role: 'Administrador' },
  ])('HTTP conserva null en materialesG3 y filtra solo lo no autorizado: $company/$role', async ({ company, role }) => {
    await start();
    const targetCompany = company || 1;
    const service = data.services.find(row => row.idEmpresa === targetCompany)!;
    const own = { idEmpresa: targetCompany, descripcion: 'MATERIAL_QA' };
    const other = { idEmpresa: 3 - targetCompany, descripcion: 'MATERIAL_OTRA_EMPRESA' };
    const materials = Object.freeze([null, Object.freeze(own), null, Object.freeze([null, 'QA', null]), null]);
    // Read paths only. Frozen fixtures catch writes to original objects/arrays.
    const technicalData = Object.freeze({ potencia: -20, materialesG3: materials });
    service.datosTecnicos = technicalData;
    const paths = [`services/customer/100`, `services/${targetCompany}`, `monitoring/services/${targetCompany}/status`, 'requests'];
    const materialArray = (path: string, body: any) => {
      const row = path === 'requests' ? body.find((r: any) => r.idEmpresa === targetCompany).servicio
        : path.startsWith('monitoring/') ? body.servicios[0]
        : Array.isArray(body) ? body.find((r: any) => r.idEmpresa === targetCompany) : body;
      return row.datosTecnicos.materialesG3;
    };
    for (const path of paths) {
      const { body } = await get(path, company, role).expect(200);
      expect(materialArray(path, body)).toEqual(materials);
      expect(materialArray(path, body)).toHaveLength(materials.length);
      expect(JSON.stringify(body)).not.toContain('HASH_MUST_NEVER_LEAVE');
    }
    expect(service.datosTecnicos).toBe(technicalData);
    expect(technicalData.materialesG3).toEqual([null, own, null, [null, 'QA', null], null]);

    const mixed = Object.freeze([null, own, Object.freeze(other), null]);
    service.datosTecnicos = Object.freeze({ potencia: -20, materialesG3: mixed });
    for (const path of paths) {
      const { body } = await get(path, company, role).expect(200);
      const expected = role === 'Administrador' ? mixed : [null, own, null];
      expect(materialArray(path, body)).toEqual(expected);
      expect(materialArray(path, body)).toHaveLength(expected.length);
      if (role !== 'Administrador') {
        expect(JSON.stringify(body)).not.toContain('MATERIAL_OTRA_EMPRESA');
        assertPrivateAbsent(body);
      }
    }
    expect(mixed).toEqual([null, own, other, null]);
    expect(data.db.servicioContratado.update).not.toHaveBeenCalled();
    expect(data.db.cliente.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([1, 2])('conserva cliente exclusivo de empresa %s y rechaza la otra', async company => {
    await start([company]);
    const services = await get('services/customer/100', company).expect(200);
    expect(services.body).toHaveLength(1);
    assertIdentity(services.body[0].cliente);
    await get('services/customer/100', 3 - company).expect(400);
    await get('tvip/customer/100', 3 - company).expect(400);
    await get('monitoring/customers/100/status', 3 - company).expect(400);
  });

  it.each([1, 2])('cliente compartido: servicios, solicitudes, tickets y TV IP solo empresa %s', async company => {
    await start();
    for (const path of ['services/customer/100', 'requests', 'requests/customer/100', 'tickets']) {
      const { body } = await get(path, company).expect(200);
      expect(body).toHaveLength(1);
      expect(body[0].idEmpresa).toBe(company);
      assertIdentity(body[0].cliente);
      assertPrivateAbsent(body);
      expect(JSON.stringify(body)).not.toMatch(new RegExp(`ADDRESS_${3 - company}|ORDER_${3 - company}|TV_${3 - company}`));
    }
    const { body } = await get('tvip/customer/100', company).expect(200);
    expect(body).toHaveLength(1);
    expect(body[0].idContrato).toBe(company * 10);
    expect(body[0].credencial.usuarioTvip).toBe(`TV_USER_${company}`);
    expect(JSON.stringify(body)).not.toContain('HASH');
    expect(data.db.credencialesTvip.findMany).toHaveBeenCalledWith({ where: { idContrato: { in: [company * 10] } } });
  });

  it.each([1, 2])('mediciones de empresa %s no usan el ultimo dato global del cliente compartido', async company => {
    await start();
    for (const path of [`customers/100`, `services/${company}`, `equipment/${company * 100}`]) {
      const { body } = await get(`monitoring/${path}/status`, company).expect(200);
      expect(body.ultimaMedicion.idUnidad).toBe(company * 100);
      expect(body.equipo.numeroSerie).toBe(`UNIT_${company}`);
      expect(body.cajaNap.identificadorUnico).toBe(`NAP_${company}`);
      expect(body.historial.map((e: any) => e.evento)).toEqual([`HISTORY_${company}`]);
      assertPrivateAbsent(body);
    }
    const { body } = await get('monitoring/customers/100/history', company).expect(200);
    expect(body.map((e: any) => e.idUnidad)).toEqual([company * 100]);
  });

  it.each([1, 2])('rechaza IDs directos ajenos para empresa %s antes de escribir', async company => {
    await start();
    const other = 3 - company;
    await get(`services/${other}`, company).expect(400);
    await get(`monitoring/services/${other}/status`, company).expect(400);
    await get(`monitoring/equipment/${other * 100}/status`, company).expect(400);
    await get(`tickets/${other}/technical-notes`, company).expect(400);
    await post(`tvip/contracts/${other * 10}/generate`, company, {}).expect(400);
    await post(`tvip/contracts/${other * 10}/regenerate`, company, {}).expect(400);
    expect(data.db.credencialesTvip.create).not.toHaveBeenCalled();
    expect(data.db.credencialesTvip.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([1, 2])('ticket de cliente compartido utiliza la empresa %s y valida servicio y cliente', async company => {
    await start();
    const body = { rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA' };
    await post('tickets', company, { ...body, idServicio: 3 - company }).expect(400);
    expect(data.db.ticket.create).not.toHaveBeenCalled();
    const accepted = await post('tickets', company, { ...body, idServicio: company }).expect(201);
    expect(accepted.body.idEmpresa).toBe(company);
    const withoutService = await post('tickets', company, body).expect(201);
    expect(withoutService.body.idEmpresa).toBe(company);
    data.services.find(s => s.idEmpresa === company)!.idCliente = 999;
    const count = data.db.ticket.create.mock.calls.length;
    await post('tickets', company, { ...body, idServicio: company }).expect(400);
    expect(data.db.ticket.create).toHaveBeenCalledTimes(count);
    expect(data.customer.idEmpresa).toBe(1); // Never reassign the shared identity.
    expect(data.db.cliente.update).not.toHaveBeenCalled();
  });

  it('conserva administracion consolidada sin exponer el hash del portal', async () => {
    await start();
    for (const path of ['services/customer/100', 'requests', 'tickets', 'tvip/customer/100']) {
      const { body } = await get(path, 0, 'Administrador').expect(200);
      expect(body).toHaveLength(2);
      expect(JSON.stringify(body)).not.toContain('HASH_MUST_NEVER_LEAVE');
    }
    const { body } = await get('services/2', 0, 'Administrador').expect(200);
    expect(body.cliente.estado).toBe('Moroso');
    expect(body.cliente.datosTecnicos.direccion).toBe('GLOBAL_PRIVATE');
    const monitoring = await get('monitoring/customers/100/status', 0, 'Administrador').expect(200);
    expect(monitoring.body.servicios).toHaveLength(2);
    await post('tickets', 0, { rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA', idServicio: 2 }, 'Administrador').expect(201);
  });

  it('rechaza usuarios sin empresa y conserva el guard de roles', async () => {
    await start();
    data.customer.idEmpresa = null as never;
    for (const path of ['tvip/customer/100', 'services/customer/100', 'monitoring/customers/100/status', 'requests/customer/100', 'tickets']) {
      await get(path, 0).expect(400);
    }
    await get('tvip/customer/100', 1, 'Terreno').expect(403);
  });

  it('no publica relaciones anidadas de otra empresa ni historial de auditoria global', async () => {
    await start();
    const service = data.services[0];
    service.contrato = data.contracts[1];
    service.equipos = data.units;
    service.direccion = { idDireccion: 2, idCliente: 999, direccionCompleta: 'FOREIGN_ADDRESS' };
    service.ordenes = [{ idEmpresa: 2, tipoOt: 'Instalacion', estado: 'Completada' }] as never;
    data.requests[0].servicio = data.services[1];
    data.orders.push({ ...data.orders[1], idTicket: 1 });
    data.db.logAuditoria.findMany.mockResolvedValue([
      { idLog: 1n, entidadAfectada: 'servicio_contratado', idEntidadAfectada: 1, accion: 'CAMBIO', valorNuevo: { cliente: data.customer } },
      { idLog: 2n, entidadAfectada: 'cliente', idEntidadAfectada: 100, valorNuevo: { idServicio: 1, estado: 'Moroso' } },
    ]);
    const { body } = await get('services/1', 1).expect(200);
    expect(body.contrato).toBeNull();
    expect(body.direccion).toBeNull();
    expect(body.ordenes).toEqual([]);
    expect(body.instalacion).toBeNull();
    expect(body.equipos.map((u: any) => u.idEmpresa)).toEqual([1]);
    expect(body.auditoria).toEqual([{ idLog: '1', entidadAfectada: 'servicio_contratado', idEntidadAfectada: 1, accion: 'CAMBIO' }]);
    assertPrivateAbsent(body);
    const requests = await get('requests', 1).expect(200);
    expect(requests.body[0].servicio).toBeNull();
    const tickets = await get('tickets', 1).expect(200);
    expect(tickets.body[0].workOrders.map((o: any) => o.idEmpresa)).toEqual([1]);
  });

  it('sin equipos atribuibles no busca mediciones solo por cliente; NAP ajena queda oculta', async () => {
    await start();
    data.services[0].equipos = [];
    let response = await get('monitoring/services/1/status', 1).expect(200);
    expect(response.body.ultimaMedicion).toBeNull();
    expect(data.db.monitoreoOnt.findFirst).not.toHaveBeenCalled();
    data.services[0].equipos = [data.units[0]];
    data.measurements.find(m => m.idUnidad === 100)!.idCajaNap = 2;
    response = await get('monitoring/services/1/status', 1).expect(200);
    expect(response.body.cajaNap).toBeNull();
    expect(response.body.ultimaMedicion.idCajaNap).toBeNull();
  });

  it('rechaza baja de servicio con contrato cruzado sin iniciar transaccion ni auditoria', async () => {
    await start();
    data.services[0].contrato = data.contracts[1];
    await request(app.getHttpServer()).patch('/api/services/1/deactivate')
      .set('x-test-company', '1').send({}).expect(400);
    // The mock intentionally has no $transaction: entering it would fail with 500.
    expect(data.db.servicioContratado.update).not.toHaveBeenCalled();
    expect(data.db.contrato.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('RUT coincidente sin relacion empresarial no autoriza crear ticket', async () => {
    await start([1]);
    await post('tickets', 2, { rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA' }).expect(400);
    expect(data.db.ticket.create).not.toHaveBeenCalled();
  });

  it.each([1, 2].flatMap(company => ['sin contrato', 'empresa ajena', 'cliente ajeno', 'referencia distinta']
    .map(defect => ({ company, defect }))))('ticket rechaza $defect en empresa $company antes de escribir', async ({ company, defect }) => {
    await start();
    const service = data.services.find(s => s.idEmpresa === company)!;
    const originalContract = service.contrato!;
    service.contrato = defect === 'sin contrato' ? undefined : {
      ...originalContract,
      ...(defect === 'empresa ajena' ? { idEmpresa: 3 - company } : {}),
      ...(defect === 'cliente ajeno' ? { idCliente: 999 } : {}),
      ...(defect === 'referencia distinta' ? { idContrato: 999 } : {}),
    };
    // Another valid contract for this company cannot authorize a corrupt service.
    const { body } = await post('tickets', company, {
      rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA', idServicio: company,
    }).expect(400);
    expect(body.message).toContain('contrato vinculado');
    expect(data.db.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(data.db.cliente.update).not.toHaveBeenCalled();
  });

  it.each([1, 2])('empresa principal %s sin contrato no autoriza ticket sin servicio', async company => {
    await start([company]);
    data.contracts.splice(0);
    const { body } = await post('tickets', company, {
      rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA',
    }).expect(400);
    expect(body.message).toContain('contrato vinculado');
    expect(data.db.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['Moroso', 'Suspendido'])('permite soporte con contrato propio %s sin alterar estado financiero', async estado => {
    await start();
    data.contracts[1].estado = estado;
    data.customer.estado = estado;
    for (const idServicio of [2, undefined]) {
      const { body } = await post('tickets', 2, {
        rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA', idServicio,
      }).expect(201);
      expect(body.idEmpresa).toBe(2);
      expect(body.idCliente).toBe(100);
    }
    expect(data.customer.estado).toBe(estado);
    expect(data.customer.idEmpresa).toBe(1);
    expect(data.db.cliente.update).not.toHaveBeenCalled();
    expect(data.db.contrato.update).not.toHaveBeenCalled();
    expect(data.db.servicioContratado.update).not.toHaveBeenCalled();
  });

  it('administrador tampoco crea un ticket con contrato inconsistente', async () => {
    await start();
    data.services[1].contrato = data.contracts[0];
    await post('tickets', 0, {
      rut: '11111111-1', idCategoria: 1, prioridad: 'Media', descripcion: 'QA', idServicio: 2,
    }, 'Administrador').expect(400);
    expect(data.db.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('filtra tambien las respuestas de escritura y el camino idempotente de solicitudes', async () => {
    await start();
    data.db.solicitudCliente.create.mockResolvedValue(data.requests[0]);
    const created = await post('requests', 1, { idServicio: 1, tipoSolicitud: 'Consulta', descripcion: 'QA' }).expect(201);
    assertIdentity(created.body.cliente);
    for (const [path, body] of [
      ['requests/1/status', { estado: 'Abierta' }],
      ['requests/1/status', { estado: 'En Gestion' }],
      ['requests/1/feasibility', { factible: true }],
      ['services/1', { observaciones: 'QA' }],
    ] as const) {
      const response = await request(app.getHttpServer()).patch(`/api/${path}`).set('x-test-company', '1').send(body).expect(200);
      assertIdentity(response.body.cliente);
      assertPrivateAbsent(response.body);
    }
  });
});
