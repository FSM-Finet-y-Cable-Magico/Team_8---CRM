import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service';
import { ServiceWithdrawalService } from './service-withdrawal.service';
import { WithdrawalCapabilities, WithdrawalG3Receipt, WithdrawalStorage, WithdrawalTicketLink } from './withdrawal.storage';

/*
 * Flujo de baja por morosidad con persistencia EN MEMORIA y transacciones con rollback real.
 * No hay base de datos, red, G1, G3 ni VPS. La serialización del mock no certifica locks de PostgreSQL.
 */
const comercial = { idUsuario: 5, idEmpresa: 1, email: null, nombreCompleto: 'Comercial FiNet', roles: ['Comercial'] };
const admin = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Administrador', roles: ['Administrador'] };
const otherCompany = { ...comercial, idUsuario: 6, idEmpresa: 2 };

type Row = Record<string, any>;
type State = {
  services: Row[]; contracts: Row[]; customers: Row[]; requests: Row[]; tickets: Row[]; invoices: Row[]; notices: Row[];
  links: WithdrawalTicketLink[]; receipts: WithdrawalG3Receipt[]; receptions: Array<{ idSolicitudRetiro: number; numeroSerie: string; idOtG3: number; estadoG1: string }>; units: Row[]; prospects: Row[]; audits: Row[];
  catalog: Row[]; capabilities: WithdrawalCapabilities;
};

const officialCatalog = (offset = 0) => [
  ...['Instalación', 'Reparación', 'Internet lento', 'Colector defectuoso', 'Sintonización de TV', 'Cliente ausente', 'Otro']
    .map((nombre, index) => ({ idCategoria: offset + index + 1, nombre, slaHoras: null, tipo: 'TECNICA', tipoDisponible: true })),
  ...['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza', 'Facturación y cobro', 'Consulta general', 'Baja de servicio']
    .map((nombre, index) => ({ idCategoria: offset + index + 8, nombre, slaHoras: 24, tipo: 'ATENCION', tipoDisponible: true })),
  { idCategoria: offset + 15, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: null, tipo: 'INTERNA', tipoDisponible: true },
];

function setup(over: { catalogOffset?: number } = {}) {
  let state: State = {
    services: [{ idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, tipoServicio: 'Internet', estadoOperativo: 'Suspendido' }],
    contracts: [{ idContrato: 20, idCliente: 30, idEmpresa: 1, estado: 'Suspendido', plan: { nombreComercial: 'Fibra 300 Hogar' } }],
    customers: [{ idCliente: 30, idEmpresa: 1, rut: '12345678-5', nombreCompleto: 'Cliente Moroso', email: null, telefono: '+56900000000', estado: 'Suspendido' }],
    requests: [], tickets: [], links: [], receipts: [], receptions: [], prospects: [], audits: [],
    invoices: [{ idFactura: 70, idContrato: 20, monto: 19990, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [], conveniosPago: [] }],
    notices: [{ idEvento: 7, idEmpresa: 1, idCliente: 30, idServicio: 50, idContrato: 20, tipo: 'AVISO_PREVIO_RETIRO', fecha: new Date('2026-11-01T12:00:00Z') }],
    units: [{ numeroSerie: 'ONT-001', estado: 'Instalado en cliente', idServicio: 50 }],
    catalog: officialCatalog(over.catalogOffset ?? 0),
    capabilities: { ticketLink: true, g3Closure: false },
  };
  let nextId = 1000;
  const fail: Record<string, Error | undefined> = {};
  const failOnce = (key: string) => { const error = fail[key]; if (error) { fail[key] = undefined; throw error; } };
  const service = (id: number) => state.services.find(s => s.idServicio === id);
  const withRelations = (s: Row | undefined) => s && ({
    ...s, contrato: state.contracts.find(c => c.idContrato === s.idContrato) ?? null,
    cliente: state.customers.find(c => c.idCliente === s.idCliente) ?? null, empresa: { idEmpresa: s.idEmpresa, nombre: s.idEmpresa === 1 ? 'FiNet' : 'Cable Mágico' },
  });

  const prisma: Row = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => (Array.isArray(strings) && strings.join('').includes('categoria_falla')) ? structuredClone(state.catalog) : []),
    servicioContratado: {
      findUnique: jest.fn(async ({ where }: any) => structuredClone(withRelations(service(where.idServicio)) ?? null)),
      update: jest.fn(async ({ where, data }: any) => { failOnce('serviceUpdate'); return Object.assign(service(where.idServicio)!, data); }),
      count: jest.fn(async ({ where }: any) => state.services.filter(s => (where.idContrato === undefined || s.idContrato === where.idContrato)
        && (where.idCliente === undefined || s.idCliente === where.idCliente) && (where.idEmpresa === undefined || s.idEmpresa === where.idEmpresa)
        && s.estadoOperativo !== 'Baja').length),
    },
    servicioRetiroSolicitud: {
      findFirst: jest.fn(async ({ where }: any) => structuredClone(state.requests.find(r => r.idEmpresa === where.idEmpresa && r.idServicio === where.idServicio
        && !where.estado.notIn.includes(r.estado)) ?? null)),
      findUnique: jest.fn(async ({ where }: any) => structuredClone(state.requests.find(r => r.idSolicitudRetiro === where.idSolicitudRetiro) ?? null)),
      create: jest.fn(async ({ data }: any) => { const row = { idSolicitudRetiro: nextId++, createdAt: new Date(), ...data }; state.requests.push(row); return structuredClone(row); }),
      update: jest.fn(async ({ where, data }: any) => structuredClone(Object.assign(state.requests.find(r => r.idSolicitudRetiro === where.idSolicitudRetiro)!, data))),
    },
    factura: { findMany: jest.fn(async ({ where }: any) => structuredClone(state.invoices.filter(i => i.idContrato === where.idContrato))) },
    eventoGestionComercial: { findFirst: jest.fn(async ({ where }: any) => structuredClone(state.notices.filter(n => n.idEmpresa === where.idEmpresa && n.idCliente === where.idCliente
      && n.idServicio === where.idServicio && n.idContrato === where.idContrato && n.tipo === where.tipo).sort((a, b) => b.idEvento - a.idEvento)[0] ?? null)) },
    ticket: {
      create: jest.fn(async ({ data }: any) => { failOnce('ticket'); const row = { idTicket: nextId++, ...data }; state.tickets.push(row); return structuredClone(row); }),
      findUnique: jest.fn(async ({ where }: any) => structuredClone(state.tickets.find(t => t.idTicket === where.idTicket) ?? null)),
    },
    contrato: { update: jest.fn(async ({ where, data }: any) => Object.assign(state.contracts.find(c => c.idContrato === where.idContrato)!, data)),
      count: jest.fn(async ({ where }: any) => state.contracts.filter(c => c.idCliente === where.idCliente && c.idEmpresa === where.idEmpresa && !where.estado.notIn.includes(c.estado)).length) },
    cliente: {
      findUnique: jest.fn(async ({ where }: any) => { const c = state.customers.find(x => x.idCliente === where.idCliente); return c ? structuredClone({ ...c,
        contratos: state.contracts.filter(k => k.idCliente === c.idCliente).map(k => ({ estado: k.estado })),
        servicios: state.services.filter(s => s.idCliente === c.idCliente).map(s => ({ estadoOperativo: s.estadoOperativo })) }) : null; }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(state.customers.find(c => c.idCliente === where.idCliente)!, data)),
    },
    unidadEquipo: { findMany: jest.fn(async ({ where }: any) => structuredClone(state.units.filter(u => where.OR.some((cond: any) =>
      (cond.idServicio !== undefined && u.idServicio === cond.idServicio) || (cond.numeroSerie && cond.numeroSerie.in.includes(u.numeroSerie)))).map(u => ({ numeroSerie: u.numeroSerie, estado: u.estado })))) },
    prospecto: {
      findFirst: jest.fn(async ({ where }: any) => structuredClone(state.prospects.find(p => p.idEmpresa === where.idEmpresa && p.idCliente === (where.idCliente ?? null)) ?? null)),
      create: jest.fn(async ({ data }: any) => { const row = { idProspecto: nextId++, ...data }; state.prospects.push(row); return structuredClone(row); }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(state.prospects.find(p => p.idProspecto === where.idProspecto)!, data)),
    },
  };
  let queue = Promise.resolve();
  prisma.$transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const previous = queue; let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const before = structuredClone(state);
    try { return await work(prisma); } catch (error) { state = before; throw error; } finally { release(); }
  });
  const audit = { record: jest.fn(async (entry: Row) => { failOnce('audit:' + entry.accion); state.audits.push(entry); }) };
  const storage: WithdrawalStorage = {
    capabilities: jest.fn(async () => ({ ...state.capabilities })),
    findLinkByRequest: jest.fn(async (_tx, id) => structuredClone(state.links.find(l => l.idSolicitudRetiro === id) ?? null)),
    findLinkByTicket: jest.fn(async (_tx, id) => structuredClone(state.links.find(l => l.idTicket === id) ?? null)),
    insertLink: jest.fn(async (_tx, link) => {
      failOnce('link');
      if (state.links.some(l => l.idSolicitudRetiro === link.idSolicitudRetiro || l.idTicket === link.idTicket)) throw new Error('UNIQUE_VIOLATION');
      const row = { ...link, createdAt: new Date() }; state.links.push(row); return structuredClone(row);
    }),
    findReceipt: jest.fn(async (_tx, id) => structuredClone(state.receipts.find(r => r.idSolicitudRetiro === id) ?? null)),
    findReceptions: jest.fn(async (_tx, id) => structuredClone(state.receptions.filter(r => r.idSolicitudRetiro === id).map(({ idSolicitudRetiro: _id, ...rest }) => rest))),
    markReceiptApplied: jest.fn(async (_tx, id) => { const r = state.receipts.find(x => x.idSolicitudRetiro === id); if (r && !r.aplicadoEn) r.aplicadoEn = new Date(); }),
  };
  const tickets = new TicketsService(prisma as never, audit as never);
  const withdrawals = new ServiceWithdrawalService(prisma as never, audit as never, tickets, storage);
  return {
    withdrawals, prisma, audit, storage, fail, get state() { return state; },
    dto: { idServicio: 50, observaciones: 'Cliente notificado; sin pago tras el aviso previo de retiro', confirmacion: true as const },
    acciones: () => state.audits.map(a => a.accion),
  };
}

beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }); jest.setSystemTime(new Date('2026-11-12T12:00:00Z')); });
afterEach(() => jest.useRealTimers());

describe('Iniciar baja y retiro: solicitud, ticket «Baja de servicio» y vínculo atómicos', () => {
  it('crea solicitud MOROSIDAD, ticket CRM con la categoría oficial y el vínculo con el aviso; el servicio sigue suspendido', async () => {
    const c = setup();
    const result = await c.withdrawals.initiate(c.dto, comercial);
    expect(result.repetido).toBe(false);
    expect(result.solicitud).toMatchObject({ motivo: 'MOROSIDAD', estado: 'REGISTRADA', estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3', idContrato: 20, idCliente: 30, idEmpresa: 1 });
    expect(result.ticket).toMatchObject({ idCategoria: 14, origen: 'CRM', estado: 'Abierto', idServicio: 50, idCliente: 30, idEmpresa: 1 });
    expect(result.idAviso).toBe(7);
    expect(c.state.links).toEqual([expect.objectContaining({ idSolicitudRetiro: result.solicitud.idSolicitudRetiro, idTicket: result.ticket.idTicket, idAviso: 7, idServicio: 50, idContrato: 20 })]);
    expect(c.acciones()).toEqual(['CREAR_SOLICITUD_RETIRO_SERVICIO', 'CREAR_TICKET_BAJA_SERVICIO', 'VINCULAR_TICKET_SOLICITUD_RETIRO']);
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido');
    expect(c.state.contracts[0].estado).toBe('Suspendido');
    expect(c.prisma.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.invoices).toHaveLength(1);
  });

  it('el ID de la categoría se resuelve en el catálogo de la conexión: otro ambiente, otro ID', async () => {
    const c = setup({ catalogOffset: 700 });
    expect((await c.withdrawals.initiate(c.dto, comercial)).ticket.idCategoria).toBe(714);
  });

  it.each([
    ['ausente', (rows: Row[]) => rows.filter(r => r.nombre !== 'Baja de servicio')],
    ['solo como categoría técnica', (rows: Row[]) => rows.map(r => r.nombre === 'Baja de servicio' ? { ...r, tipo: 'TECNICA' } : r)],
    ['duplicada', (rows: Row[]) => [...rows, { idCategoria: 99, nombre: 'Baja de Servicio', slaHoras: 48, tipo: 'ATENCION', tipoDisponible: true }]],
    ['interna', (rows: Row[]) => rows.map(r => r.nombre === 'Baja de servicio' ? { ...r, tipo: 'INTERNA' } : r)],
  ])('categoría «Baja de servicio» %s: no crea nada', async (_name, transform) => {
    const c = setup(); c.state.catalog = transform(c.state.catalog);
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_TICKET_CATEGORY_UNAVAILABLE' } });
    expect(c.state.requests).toHaveLength(0); expect(c.state.tickets).toHaveLength(0); expect(c.state.links).toHaveLength(0); expect(c.state.audits).toHaveLength(0);
  });

  it('doble clic: dos inicios simultáneos dejan una sola solicitud, un ticket y un vínculo', async () => {
    const c = setup();
    const [a, b] = await Promise.all([c.withdrawals.initiate(c.dto, comercial), c.withdrawals.initiate(c.dto, comercial)]);
    expect(a.ticket.idTicket).toBe(b.ticket.idTicket);
    expect([a.repetido, b.repetido].sort()).toEqual([false, true]);
    expect(c.state.requests).toHaveLength(1); expect(c.state.tickets).toHaveLength(1); expect(c.state.links).toHaveLength(1);
  });

  it('reintento posterior (incluso con otra observación o tras pagar) devuelve la misma operación sin otro ticket', async () => {
    const c = setup();
    const first = await c.withdrawals.initiate(c.dto, comercial);
    c.state.invoices[0].pagos = [{ monto: 19990 }];
    const again = await c.withdrawals.initiate({ ...c.dto, observaciones: 'Reintento tras corte de red del navegador' }, comercial);
    expect(again).toMatchObject({ repetido: true, idAviso: 7 });
    expect(again.ticket.idTicket).toBe(first.ticket.idTicket);
    expect(c.state.tickets).toHaveLength(1);
    expect(c.acciones()).toHaveLength(3);
  });

  it.each([
    ['servicio activo intentando baja por morosidad', (s: State) => { s.services[0].estadoOperativo = 'Activo'; }, 'SERVICIO_SUSPENDIDO'],
    ['servicio suspendido sin aviso previo', (s: State) => { s.notices = []; }, 'AVISO_PREVIO'],
    ['servicio sin deuda vencida', (s: State) => { s.invoices[0].pagos = [{ monto: 19990 }]; }, 'DEUDA_VENCIDA'],
    ['prórroga vigente', (s: State) => { s.invoices[0].prorrogasPago = [{ nuevaFecha: new Date('2026-12-31'), estado: 'APROBADA' }]; }, 'DEUDA_VENCIDA'],
    ['convenio activo', (s: State) => { s.invoices[0].conveniosPago = [{ estado: 'ACTIVO' }]; }, 'DEUDA_VENCIDA'],
    ['servicio ya dado de baja', (s: State) => { s.services[0].estadoOperativo = 'Baja'; }, 'SIN_BAJA_PREVIA'],
    ['contrato de otro cliente', (s: State) => { s.contracts[0].idCliente = 999; }, 'CONTRATO'],
  ])('%s: rechaza con el requisito incumplido y no escribe nada', async (_name, mutate, requisito) => {
    const c = setup(); mutate(c.state);
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_NOT_ELIGIBLE', requisito } });
    expect(c.state.requests).toHaveLength(0); expect(c.state.tickets).toHaveLength(0); expect(c.state.links).toHaveLength(0); expect(c.state.audits).toHaveLength(0);
  });

  it('cliente de otra empresa: rechazo antes de abrir la transacción o consultar deuda y aviso', async () => {
    const c = setup();
    await expect(c.withdrawals.initiate(c.dto, otherCompany)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
    expect(c.prisma.factura.findMany).not.toHaveBeenCalled();
    expect(c.prisma.eventoGestionComercial.findFirst).not.toHaveBeenCalled();
  });

  it('contrato distinto al del servicio en la solicitud: rechazo sin escrituras', async () => {
    const c = setup();
    await expect(c.withdrawals.initiate({ ...c.dto, idContrato: 21 }, comercial)).rejects.toThrow('contrato no corresponde');
    expect(c.state.requests).toHaveLength(0);
  });

  it('solicitud activa previa sin vínculo (duplicada): conflicto explícito, sin segunda solicitud ni ticket', async () => {
    const c = setup();
    c.state.requests.push({ idSolicitudRetiro: 9, idEmpresa: 1, idCliente: 30, idServicio: 50, idContrato: 20, motivo: 'MOROSIDAD', estado: 'REGISTRADA' });
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_REQUEST_ACTIVE', idSolicitudRetiro: 9 } });
    expect(c.state.requests).toHaveLength(1); expect(c.state.tickets).toHaveLength(0);
  });

  it.each([
    ['auditoría de la solicitud', 'audit:CREAR_SOLICITUD_RETIRO_SERVICIO'],
    ['auditoría del ticket', 'audit:CREAR_TICKET_BAJA_SERVICIO'],
    ['auditoría del vínculo', 'audit:VINCULAR_TICKET_SOLICITUD_RETIRO'],
    ['escritura del ticket', 'ticket'],
    ['escritura del vínculo', 'link'],
  ])('falla de %s: revierte solicitud, ticket y vínculo; reintentar después funciona', async (_name, key) => {
    const c = setup(); c.fail[key] = new Error('WRITE_FAILED');
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toThrow('WRITE_FAILED');
    expect(c.state.requests).toHaveLength(0); expect(c.state.tickets).toHaveLength(0); expect(c.state.links).toHaveLength(0); expect(c.state.audits).toHaveLength(0);
    const result = await c.withdrawals.initiate(c.dto, comercial);
    expect(result.repetido).toBe(false); expect(c.state.tickets).toHaveLength(1);
  });

  it('sin el almacenamiento del vínculo aprobado responde bloqueado y no registra nada (sin éxito aparente)', async () => {
    const c = setup(); c.state.capabilities.ticketLink = false;
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_LINK_STORAGE_PENDING' } });
    expect(c.state.requests).toHaveLength(0); expect(c.state.tickets).toHaveLength(0);
    expect(c.prisma.servicioRetiroSolicitud.create).not.toHaveBeenCalled();
  });

  it('un vínculo inconsistente (ticket de otro servicio) se rechaza en el reintento', async () => {
    const c = setup(); const first = await c.withdrawals.initiate(c.dto, comercial);
    c.state.tickets.find(t => t.idTicket === first.ticket.idTicket)!.idServicio = 51;
    await expect(c.withdrawals.initiate(c.dto, comercial)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_LINK_INCONSISTENT' } });
  });

  it('observaciones demasiado breves se rechazan antes de cualquier escritura', async () => {
    const c = setup();
    await expect(c.withdrawals.initiate({ ...c.dto, observaciones: '   corto  ' }, comercial)).rejects.toThrow('mínimo 10 caracteres');
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('Elegibilidad en modo consulta', () => {
  it('precarga empresa, cliente, contrato, servicio, deuda, aviso y responsable sin escribir', async () => {
    const c = setup();
    const result = await c.withdrawals.eligibility(50, comercial);
    expect(result).toMatchObject({ eligible: true, habilitado: true, motivo: 'MOROSIDAD', firstFailure: null });
    expect(result.contexto).toMatchObject({
      empresa: { idEmpresa: 1, nombre: 'FiNet' }, cliente: { idCliente: 30, nombre: 'Cliente Moroso', rut: '12345678-5' },
      contrato: { idContrato: 20, plan: 'Fibra 300 Hogar' }, servicio: { idServicio: 50, estado: 'Suspendido' },
      deuda: { uncoveredCount: 1, totalExigible: 19990 }, aviso: { idEvento: 7 }, responsable: { idUsuario: 5, nombre: 'Comercial FiNet' },
    });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
    expect(c.state.audits).toHaveLength(0);
  });

  it('informa cuando el registro del vínculo aún no está habilitado, aunque los requisitos se cumplan', async () => {
    const c = setup(); c.state.capabilities.ticketLink = false;
    expect(await c.withdrawals.eligibility(50, comercial)).toMatchObject({ eligible: true, habilitado: false });
  });

  it('otra empresa no ve detalles financieros', async () => {
    const c = setup();
    await expect(c.withdrawals.eligibility(50, otherCompany)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.prisma.factura.findMany).not.toHaveBeenCalled();
  });
});

describe('Ticket para solicitudes previas (histórico sin vínculo)', () => {
  const legacy = (s: State) => s.requests.push({ idSolicitudRetiro: 9, idEmpresa: 1, idCliente: 30, idServicio: 50, idContrato: 20, motivo: 'MOROSIDAD', estado: 'REGISTRADA', observaciones: 'Registrada desde Clientes' });

  it('vincula un ticket nuevo revalidando los requisitos actuales, de forma idempotente', async () => {
    const c = setup(); legacy(c.state);
    const first = await c.withdrawals.openTicket(9, comercial);
    const again = await c.withdrawals.openTicket(9, comercial);
    expect(first.repetido).toBe(false); expect(again.repetido).toBe(true);
    expect(again.ticket.idTicket).toBe(first.ticket.idTicket);
    expect(c.state.tickets).toHaveLength(1);
    expect(c.state.links[0]).toMatchObject({ idSolicitudRetiro: 9, idAviso: 7 });
  });

  it('deuda regularizada después de la solicitud: no crea el ticket', async () => {
    const c = setup(); legacy(c.state); c.state.invoices[0].pagos = [{ monto: 19990 }];
    await expect(c.withdrawals.openTicket(9, comercial)).rejects.toMatchObject({ response: { requisito: 'DEUDA_VENCIDA' } });
    expect(c.state.tickets).toHaveLength(0);
  });

  it('una solicitud por otro motivo o cancelada no recibe ticket de baja por morosidad', async () => {
    const c = setup(); legacy(c.state); c.state.requests[0].motivo = 'Cambio de domicilio';
    await expect(c.withdrawals.openTicket(9, comercial)).rejects.toThrow('solicitudes por morosidad');
    c.state.requests[0].motivo = 'MOROSIDAD'; c.state.requests[0].estado = 'CANCELADA';
    await expect(c.withdrawals.openTicket(9, comercial)).rejects.toThrow('cerrada o cancelada');
    expect(c.state.tickets).toHaveLength(0);
  });
});

describe('Baja efectiva: solo con evidencia técnica, y nunca borra deuda', () => {
  const receipt = (over: Partial<WithdrawalG3Receipt> = {}): WithdrawalG3Receipt => ({
    idSolicitudRetiro: 0, idEmpresa: 1, claveSolicitud: 'g8-retiro-1-x', idOtG3: 900, estadoDespacho: 'ACEPTADA', estadoOt: 'COMPLETADA',
    cierreAprobado: true, fechaCierre: new Date('2026-11-20T15:00:00Z'), equiposRetirados: [{ numeroSerie: 'ONT-001' }], equiposFaltantes: [], aplicadoEn: null, ...over,
  });
  async function initiated(over: Partial<WithdrawalG3Receipt> | null = {}) {
    const c = setup(); c.state.capabilities.g3Closure = true;
    const started = await c.withdrawals.initiate(c.dto, comercial);
    const id = started.solicitud.idSolicitudRetiro;
    if (over) c.state.receipts.push(receipt({ idSolicitudRetiro: id, ...over }));
    if (over) c.state.receptions.push({ idSolicitudRetiro: id, numeroSerie: 'ONT-001', idOtG3: 900, estadoG1: 'En revisión' });
    c.state.units[0].estado = 'En revisión';
    return { c, id };
  }

  it('sin la integración de evidencia habilitada responde bloqueado y no modifica nada', async () => {
    const c = setup(); const started = await c.withdrawals.initiate(c.dto, comercial);
    await expect(c.withdrawals.finalize(started.solicitud.idSolicitudRetiro, admin)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CLOSURE_NOT_AVAILABLE' } });
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('con OT aprobada y equipos confirmados: Baja del servicio y del contrato, solicitud CERRADA y retorno a Prospectos; deuda intacta', async () => {
    const { c, id } = await initiated();
    const invoices = structuredClone(c.state.invoices);
    const result = await c.withdrawals.finalize(id, admin);
    expect(result).toMatchObject({ aplicado: true, contratoDeBaja: true, retornoProspectos: { action: 'CREADO' } });
    expect(c.state.services[0].estadoOperativo).toBe('Baja');
    expect(c.state.contracts[0].estado).toBe('Baja');
    expect(c.state.customers[0].estado).toBe('Baja');
    expect(c.state.requests[0].estado).toBe('CERRADA');
    expect(c.state.receipts[0].aplicadoEn).toBeInstanceOf(Date);
    expect(c.state.invoices).toEqual(invoices);
    expect(c.state.prospects).toEqual([expect.objectContaining({ idCliente: 30, idEmpresa: 1, clasificacionComercial: 'EXCLIENTE' })]);
    expect(c.acciones().slice(-2)).toEqual(['APLICAR_BAJA_POR_RETIRO_MOROSIDAD', 'MARCAR_EXCLIENTE_PROSPECTO']);
  });

  it('operación repetida: no vuelve a escribir', async () => {
    const { c, id } = await initiated();
    await c.withdrawals.finalize(id, admin); const audits = c.state.audits.length;
    expect(await c.withdrawals.finalize(id, admin)).toMatchObject({ aplicado: false, yaAplicado: true });
    expect(c.state.audits).toHaveLength(audits);
  });

  it.each([
    ['OT solo creada', { estadoOt: 'ASIGNADA', cierreAprobado: false }, 'OT_SIN_ACEPTAR'],
    ['cierre pendiente de aprobación', { estadoOt: 'PENDIENTE_APROBACION', cierreAprobado: false }, 'CIERRE_PENDIENTE_APROBACION'],
    ['cierre técnico rechazado', { estadoOt: 'EN_CURSO', cierreAprobado: false }, 'OT_SIN_ACEPTAR'],
    ['equipo no recuperado', { equiposFaltantes: [{ numeroSerie: 'STB-9' }] }, 'EQUIPOS_FALTANTES'],
  ])('%s: bloquea sin modificar servicio, contrato ni solicitud', async (_name, over, code) => {
    const { c, id } = await initiated(over as Partial<WithdrawalG3Receipt>);
    await expect(c.withdrawals.finalize(id, admin)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CLOSURE_BLOCKED', motivos: expect.arrayContaining([expect.objectContaining({ code })]) } });
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido'); expect(c.state.requests[0].estado).toBe('REGISTRADA');
  });

  it('sin recibo de evidencia (OT nunca aceptada) y con deuda vigente bloquea', async () => {
    const { c, id } = await initiated(null);
    await expect(c.withdrawals.finalize(id, admin)).rejects.toMatchObject({ response: { motivos: [expect.objectContaining({ code: 'SIN_EVIDENCIA_TECNICA' })] } });
  });

  it('retiro parcial, recepción de G1 pendiente o correlacionada con otra OT: bloquea', async () => {
    const partial = await initiated(); partial.c.state.units.push({ numeroSerie: 'STB-2', estado: 'Instalado en cliente', idServicio: 50 });
    await expect(partial.c.withdrawals.finalize(partial.id, admin)).rejects.toMatchObject({ response: { motivos: [expect.objectContaining({ code: 'RETIRO_PARCIAL' })] } });
    const pending = await initiated(); pending.c.state.receptions = [];
    await expect(pending.c.withdrawals.finalize(pending.id, admin)).rejects.toMatchObject({ response: { motivos: [expect.objectContaining({ code: 'RECEPCION_G1_PENDIENTE' })] } });
    const other = await initiated(); other.c.state.receptions[0].idOtG3 = 901;
    await expect(other.c.withdrawals.finalize(other.id, admin)).rejects.toMatchObject({ response: { motivos: [expect.objectContaining({ code: 'RECEPCION_G1_INCONSISTENTE' })] } });
    expect(other.c.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('equipo no recuperado con una decisión comercial: sigue bloqueado mientras la excepción no esté habilitada', async () => {
    const { c, id } = await initiated({ equiposFaltantes: [{ numeroSerie: 'STB-9' }] });
    await expect(c.withdrawals.finalize(id, admin)).rejects.toMatchObject({ response: { motivos: [expect.objectContaining({ code: 'EQUIPOS_FALTANTES' })] } });
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it.each([
    ['antes del despacho (sin OT)', null, 'ANTES_DEL_DESPACHO', 'CANCELAR_SOLICITUD'],
    ['durante la ejecución', { estadoOt: 'EN_CURSO', cierreAprobado: false }, 'EN_EJECUCION', 'COORDINAR_CANCELACION_CON_G3'],
    ['después del retiro aprobado', {}, 'DESPUES_DEL_RETIRO', 'DECISION_COMERCIAL_REQUERIDA'],
  ])('pago completo %s: no aplica la baja ni reactiva; informa la acción y conserva la deuda histórica', async (_name, over, etapa, accion) => {
    const { c, id } = await initiated(over as Partial<WithdrawalG3Receipt> | null);
    c.state.invoices[0].pagos = [{ monto: 19990 }];
    const invoices = structuredClone(c.state.invoices);
    await expect(c.withdrawals.finalize(id, admin)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DEBT_REGULARIZED', etapa, accion } });
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido');
    expect(c.state.requests[0].estado).toBe('REGISTRADA');
    expect(c.state.invoices).toEqual(invoices);
  });

  it('cambio concurrente: si el servicio fue reactivado tras el pago, no se da de baja', async () => {
    const { c, id } = await initiated(); c.state.services[0].estadoOperativo = 'Activo';
    await expect(c.withdrawals.finalize(id, admin)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_SERVICE_STATE_CHANGED' } });
    expect(c.state.services[0].estadoOperativo).toBe('Activo');
  });

  it('contrato con otro servicio operativo: solo el servicio retirado pasa a Baja y no hay retorno a Prospectos', async () => {
    const { c, id } = await initiated();
    c.state.services.push({ idServicio: 51, idCliente: 30, idEmpresa: 1, idContrato: 20, tipoServicio: 'TV', estadoOperativo: 'Activo' });
    const result = await c.withdrawals.finalize(id, admin);
    expect(result).toMatchObject({ contratoDeBaja: false, retornoProspectos: { action: 'MANTIENE_RELACION_OPERATIVA' } });
    expect(c.state.services.map(s => s.estadoOperativo)).toEqual(['Baja', 'Activo']);
    expect(c.state.contracts[0].estado).toBe('Suspendido');
    expect(c.state.prospects).toHaveLength(0);
  });

  it('recuperación tras falla local: si la auditoría falla todo revierte y el reintento aplica una sola vez', async () => {
    const { c, id } = await initiated();
    c.fail['audit:APLICAR_BAJA_POR_RETIRO_MOROSIDAD'] = new Error('AUDIT_FAILED');
    await expect(c.withdrawals.finalize(id, admin)).rejects.toThrow('AUDIT_FAILED');
    expect(c.state.services[0].estadoOperativo).toBe('Suspendido'); expect(c.state.requests[0].estado).toBe('REGISTRADA');
    expect(c.state.receipts[0].aplicadoEn).toBeNull(); expect(c.state.prospects).toHaveLength(0);
    expect((await c.withdrawals.finalize(id, admin)).aplicado).toBe(true);
    expect(c.state.prospects).toHaveLength(1);
  });

  it('otra empresa no puede aplicar la baja', async () => {
    const { c, id } = await initiated();
    await expect(c.withdrawals.finalize(id, { ...admin, roles: ['Comercial'], idEmpresa: 2 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('la actualización manual a CERRADA sigue prohibida', async () => {
    const { c, id } = await initiated();
    await expect(c.withdrawals.update(id, { estado: 'CERRADA' }, admin)).rejects.toThrow('evidencia tecnica');
    expect(c.state.requests[0].estado).toBe('REGISTRADA');
    expect(ConflictException).toBeDefined();
  });
});
