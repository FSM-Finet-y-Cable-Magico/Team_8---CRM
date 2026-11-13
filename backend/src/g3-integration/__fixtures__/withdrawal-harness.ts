import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../../common/auth.types';
import { G3HttpReply } from '../g3-withdrawal-contract';
import { G3WithdrawalClient } from '../http-g3-withdrawal.client';
import { StoredReception, WithdrawalDispatch, WithdrawalStorage, WithdrawalTicketLink } from '../withdrawal.storage';

/**
 * In-memory doubles for the withdrawal workflow: a Prisma subset with REAL transaction rollback
 * (state snapshot restored on throw), the private g8_retiros storage, the tickets service and a
 * scripted G3 client. Synthetic data only; nothing leaves the process.
 */
export const comercial = (idEmpresa = 1): AuthUser => ({ idUsuario: 7, idEmpresa, email: 'qa@example.invalid', nombreCompleto: 'Comercial QA', roles: ['Comercial'] });

export function withdrawalHarness(options: { storage?: boolean; dispatch?: boolean; finalize?: boolean } = {}) {
  const state = {
    services: [
      { idServicio: 61, idCliente: 33, idEmpresa: 1, idContrato: 20, idDireccion: 5, estadoOperativo: 'Suspendido', tipoServicio: 'Internet' },
      { idServicio: 62, idCliente: 33, idEmpresa: 1, idContrato: 20, idDireccion: 5, estadoOperativo: 'Activo', tipoServicio: 'TV' },
      { idServicio: 71, idCliente: 34, idEmpresa: 2, idContrato: 30, idDireccion: 6, estadoOperativo: 'Suspendido', tipoServicio: 'Internet' },
    ] as any[],
    contracts: [
      { idContrato: 20, idCliente: 33, idEmpresa: 1, estado: 'Suspendido', direccionInstalacion: 'Calle QA 123', comunaInstalacion: 'Ñuñoa' },
      { idContrato: 30, idCliente: 34, idEmpresa: 2, estado: 'Suspendido', direccionInstalacion: 'Otra 1', comunaInstalacion: 'Viña del Mar' },
    ] as any[],
    customers: [{ idCliente: 33, idEmpresa: 1, rut: '123456785', nombreCompleto: 'Cliente QA', estado: 'Moroso' }, { idCliente: 34, idEmpresa: 2, rut: '11111111-1', nombreCompleto: 'Otro QA', estado: 'Moroso' }] as any[],
    addresses: [{ idDireccion: 5, direccionCompleta: 'Calle QA 123', comuna: 'Ñuñoa' }, { idDireccion: 6, direccionCompleta: 'Otra 1', comuna: 'Viña del Mar' }] as any[],
    invoices: [{ idFactura: 1, idContrato: 20, monto: 20000, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [] as any[], prorrogasPago: [], conveniosPago: [] as any[] },
      { idFactura: 2, idContrato: 30, monto: 15000, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [], conveniosPago: [] }] as any[],
    notices: [{ idEvento: 9, idEmpresa: 1, idCliente: 33, idServicio: 61, idContrato: 20, tipo: 'AVISO_PREVIO_RETIRO', fecha: new Date('2026-11-01') },
      { idEvento: 10, idEmpresa: 2, idCliente: 34, idServicio: 71, idContrato: 30, tipo: 'AVISO_PREVIO_RETIRO', fecha: new Date('2026-11-01') }] as any[],
    requests: [] as any[],
    tickets: [] as any[],
    prospects: [] as any[],
    audits: [] as any[],
    links: [] as WithdrawalTicketLink[],
    dispatches: [] as WithdrawalDispatch[],
    receptions: [] as Array<StoredReception & { idSolicitudRetiro: number; idEmpresa: number }>,
    // Writes that must never happen in this flow (payments, invoices, signatures, G1 inventory).
    forbiddenWrites: [] as string[],
    /** Failure injection for rollback tests. */
    failAuditOn: null as string | null,
    failTicket: false,
  };
  const clone = <T>(value: T): T => structuredClone(value);
  const withRelations = (service: any) => service && ({
    ...service,
    contrato: state.contracts.find(c => c.idContrato === service.idContrato) ?? null,
    cliente: state.customers.find(c => c.idCliente === service.idCliente) ?? null,
    empresa: { idEmpresa: service.idEmpresa, nombre: `Empresa ${service.idEmpresa}` },
    direccion: state.addresses.find(a => a.idDireccion === service.idDireccion) ?? null,
  });
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, cond]: [string, any]) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ('notIn' in cond) return !cond.notIn.includes(row[key]);
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      if ('equals' in cond) return String(row[key]).toLowerCase() === String(cond.equals).toLowerCase();
      if (key === 'contrato') return true;
      return matches(row[key] ?? {}, cond);
    }
    return row[key] === cond;
  });
  let nextRequest = 15; let nextTicket = 77; let nextProspect = 500;
  const forbidden = (name: string) => ({ create: () => { state.forbiddenWrites.push(name); }, update: () => { state.forbiddenWrites.push(name); }, updateMany: () => { state.forbiddenWrites.push(name); } });
  const db: any = {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    servicioContratado: {
      findUnique: async ({ where }: any) => clone(withRelations(state.services.find(s => s.idServicio === where.idServicio)) ?? null),
      update: async ({ where, data }: any) => { const row = state.services.find(s => s.idServicio === where.idServicio); Object.assign(row, data); return clone(row); },
      count: async ({ where }: any) => state.services.filter(s => matches(s, where)).length,
    },
    contrato: {
      findUnique: async ({ where }: any) => clone(state.contracts.find(c => c.idContrato === where.idContrato) ?? null),
      update: async ({ where, data }: any) => { const row = state.contracts.find(c => c.idContrato === where.idContrato); Object.assign(row, data); return clone(row); },
      count: async ({ where }: any) => state.contracts.filter(c => matches(c, where)).length,
    },
    prospecto: {
      findFirst: async ({ where }: any) => clone([...state.prospects].sort((a, b) => a.idProspecto - b.idProspecto).find(p => matches(p, where)) ?? null),
      create: async ({ data }: any) => { const row = { idProspecto: nextProspect++, clasificacionComercial: 'PROSPECTO', ...data }; state.prospects.push(row); return clone(row); },
      update: () => { state.forbiddenWrites.push('prospecto.update'); },
    },
    cliente: {
      findUnique: async ({ where }: any) => {
        const c = state.customers.find(x => x.idCliente === where.idCliente);
        return c ? clone({ ...c, contratos: state.contracts.filter(k => k.idCliente === c.idCliente).map(k => ({ estado: k.estado })),
          servicios: state.services.filter(s => s.idCliente === c.idCliente).map(s => ({ estadoOperativo: s.estadoOperativo })) }) : null;
      },
      update: async ({ where, data }: any) => { const row = state.customers.find(c => c.idCliente === where.idCliente); Object.assign(row, data); return clone(row); },
    },
    servicioRetiroSolicitud: {
      findFirst: async ({ where }: any) => clone(state.requests.find(r => matches(r, where)) ?? null),
      findUnique: async ({ where }: any) => clone(state.requests.find(r => r.idSolicitudRetiro === where.idSolicitudRetiro) ?? null),
      create: async ({ data }: any) => { const row = { idSolicitudRetiro: nextRequest++, createdAt: new Date(), updatedAt: new Date(), ...data }; state.requests.push(row); return clone(row); },
      update: async ({ where, data }: any) => { const row = state.requests.find(r => r.idSolicitudRetiro === where.idSolicitudRetiro); Object.assign(row, data); return clone(row); },
    },
    factura: { findMany: async ({ where }: any) => clone(state.invoices.filter(i => i.idContrato === where.idContrato)), ...forbidden('factura') },
    eventoGestionComercial: { findFirst: async ({ where }: any) => clone([...state.notices].reverse().find(n => matches(n, where)) ?? null) },
    ticket: { findUnique: async ({ where }: any) => clone(state.tickets.find(t => t.idTicket === where.idTicket) ?? null) },
    logAuditoria: { create: async ({ data }: any) => { if (state.failAuditOn && data.accion === state.failAuditOn) throw new Error('AUDIT_FAILED'); state.audits.push(data); return data; } },
    pago: forbidden('pago'), contratoDigital: forbidden('contratoDigital'), unidadEquipo: { ...forbidden('unidadEquipo'), findMany: async () => [] },
  };
  // Row locks: `SELECT ... FOR UPDATE` on a service serializes transactions like PostgreSQL does.
  const locks = new Map<string, Promise<void>>();
  const prisma: any = {
    ...db,
    $transaction: async (work: (tx: any) => Promise<unknown>) => {
      const held: Array<() => void> = [];
      const tx = { ...db, $queryRaw: async (strings: TemplateStringsArray | unknown, ...values: unknown[]) => {
        const text = Array.isArray(strings) ? strings.join('?') : '';
        const table = /FROM\s+(\w+)\s+WHERE[\s\S]*FOR UPDATE/i.exec(text)?.[1];
        if (table) {
          const key = `${table}:${String(values[0])}`;
          if (!held.some(release => (release as any).key === key)) {
            while (locks.has(key)) await locks.get(key);
            let release!: () => void;
            locks.set(key, new Promise<void>(resolve => { release = () => { locks.delete(key); resolve(); }; }));
            (release as any).key = key; held.push(release);
          }
        }
        return [];
      } };
      const before = clone({ ...state, forbiddenWrites: [] });
      try { return await work(tx); } catch (error) {
        for (const key of Object.keys(before) as Array<keyof typeof state>) if (key !== 'forbiddenWrites') (state as any)[key] = (before as any)[key];
        throw error;
      } finally { held.forEach(release => release()); }
    },
  };

  const storageOn = options.storage !== false;
  const storage: WithdrawalStorage = {
    capabilities: async () => ({ ticketLink: storageOn, g3Dispatch: storageOn, g1Reception: storageOn }),
    findLinkByRequest: async (_tx, id) => clone(state.links.find(l => l.idSolicitudRetiro === id) ?? null),
    findLinkByTicket: async (_tx, id) => clone(state.links.find(l => l.idTicket === id) ?? null),
    insertLink: async (_tx, link) => { const row = { ...link, createdAt: new Date() }; state.links.push(row); return clone(row); },
    insertDispatch: async (_tx, row) => {
      if (state.dispatches.some(d => d.requestId === row.requestId)) throw new Error('UNIQUE request_id');
      const created: WithdrawalDispatch = { ...row, payloadSnapshot: clone(row.payloadSnapshot) as Record<string, unknown>, estadoDespacho: 'PENDIENTE', intentos: 0,
        ultimoIntentoEn: null, ultimoErrorCodigo: null, ultimoErrorStatus: null, idOtG3: null, estadoOt: null, estadoOtLeidoEn: null, fechaCompletadaG3: null,
        cierreClave: null, cierreHash: null, cierreRecibidoEn: null, equiposRetirados: [], equiposFaltantes: [], recepcionClaveEvento: null,
        recepcionSincronizadaEn: null, aplicadoEn: null };
      state.dispatches.push(created); return clone(created);
    },
    findDispatch: async (_tx, id) => clone(state.dispatches.find(d => d.idSolicitudRetiro === id) ?? null),
    findDispatchByRequestId: async (_tx, requestId) => clone(state.dispatches.find(d => d.requestId === requestId) ?? null),
    claimDispatch: async (_tx, id, staleBefore) => {
      const row = state.dispatches.find(d => d.idSolicitudRetiro === id);
      if (!row) return null;
      const stale = row.estadoDespacho === 'ENVIANDO' && row.ultimoIntentoEn && row.ultimoIntentoEn < staleBefore;
      if (!['PENDIENTE', 'REINTENTABLE'].includes(row.estadoDespacho) && !stale) return null;
      Object.assign(row, { estadoDespacho: 'ENVIANDO', intentos: row.intentos + 1, ultimoIntentoEn: new Date() });
      return clone(row);
    },
    updateDispatch: async (_tx, id, patch) => {
      const row = state.dispatches.find(d => d.idSolicitudRetiro === id);
      if (patch.idOtG3 != null && state.dispatches.some(d => d !== row && d.idEmpresa === row!.idEmpresa && d.idOtG3 === patch.idOtG3)) throw new Error('UNIQUE (id_empresa, id_ot_g3)');
      Object.assign(row!, clone(patch));
    },
    findReceptions: async (_tx, id) => {
      const current = state.dispatches.find(d => d.idSolicitudRetiro === id)?.recepcionClaveEvento;
      return clone(state.receptions.filter(r => r.idSolicitudRetiro === id && r.claveEvento === current));
    },
    storeReceptionVersion: async (_tx, id, idEmpresa, clave, rows) => {
      const existing = state.receptions.filter(r => r.idSolicitudRetiro === id && r.claveEvento === clave);
      const key = (items: StoredReception[]) => JSON.stringify(items.map(r => [r.numeroSerie, r.idOtG3, r.resultado, r.estadoG1, r.idServicioExterno, r.detalle, r.estadoRecepcion]).sort());
      if (existing.length && key(existing) !== key(rows)) return 'CONFLICTO';
      if (!existing.length) state.receptions.push(...rows.map(r => ({ ...clone(r), claveEvento: clave, idSolicitudRetiro: id, idEmpresa })));
      Object.assign(state.dispatches.find(d => d.idSolicitudRetiro === id)!, { recepcionClaveEvento: clave, recepcionSincronizadaEn: new Date() });
      return existing.length ? 'REPETIDA' : 'NUEVA';
    },
    markApplied: async (_tx, id) => { const row = state.dispatches.find(d => d.idSolicitudRetiro === id)!; row.aplicadoEn = row.aplicadoEn ?? new Date(); },
  };

  const tickets = {
    createWithdrawalTicket: jest.fn(async (_tx: unknown, input: any) => {
      if (state.failTicket) throw new Error('TICKET_FAILED');
      const ticket = { idTicket: nextTicket++, idEmpresa: input.idEmpresa, idCliente: input.idCliente, idServicio: input.idServicio, idCategoria: 900,
        estado: 'Abierto', descripcion: input.descripcion, fechaCierre: null as Date | null };
      state.tickets.push(ticket); return clone(ticket);
    }),
    // Mirrors TicketsService.closeWithdrawalTicket (its rules are unit-tested against the real service).
    closeWithdrawalTicket: jest.fn(async (_tx: unknown, input: any) => {
      const ticket = state.tickets.find(t => t.idTicket === input.idTicket);
      if (!ticket || ticket.idEmpresa !== input.idEmpresa || ticket.idCliente !== input.idCliente || ticket.idServicio !== input.idServicio) {
        throw new ConflictException({ code: 'WITHDRAWAL_TICKET_INCONSISTENT', message: 'ticket inconsistente' });
      }
      if (ticket.estado === 'Cerrado') return { action: 'YA_CERRADO', estadoAnterior: 'Cerrado' };
      if (state.failAuditOn === 'CERRAR_TICKET_BAJA_SERVICIO') throw new Error('AUDIT_FAILED');
      const estadoAnterior = ticket.estado;
      Object.assign(ticket, { estado: 'Cerrado', fechaCierre: new Date() });
      state.audits.push({ accion: 'CERRAR_TICKET_BAJA_SERVICIO', idEntidadAfectada: ticket.idTicket, idUsuario: input.idUsuario,
        valorNuevo: { estado: 'Cerrado', automatico: true, idSolicitudRetiro: input.idSolicitudRetiro, idOtG3: input.idOtG3 } });
      return { action: 'CERRADO', estadoAnterior };
    }),
  };

  const g3Replies: Array<G3HttpReply | (() => Promise<G3HttpReply>)> = [];
  const g3Calls: Array<{ op: string; args: unknown[] }> = [];
  const next = async (op: string, args: unknown[]) => {
    g3Calls.push({ op, args: clone(args) });
    const reply = g3Replies.shift();
    if (!reply) throw new Error(`Respuesta G3 no programada para ${op}`);
    return typeof reply === 'function' ? reply() : reply;
  };
  const g3: G3WithdrawalClient = {
    configured: () => true,
    createOrder: payload => next('create', [payload]),
    cancelOrder: (requestId, body) => next('cancel', [requestId, body]),
    readOrder: (idOt, idEmpresa) => next('read', [idOt, idEmpresa]),
  };

  const config = new ConfigService({
    G3_WITHDRAWAL_DISPATCH_ENABLED: options.dispatch === false ? 'false' : 'true',
    WITHDRAWAL_FINALIZE_ENABLED: options.finalize ? 'true' : 'false',
  });
  const audit = new AuditService(prisma);
  return { state, prisma, storage, tickets, g3, g3Replies, g3Calls, config, audit };
}

export const created = (requestId = 'g8-retiro-1-15', idOt = 930, traceId?: string): G3HttpReply => ({
  status: 201, body: { success: true, data: { request_id: requestId, ...(traceId ? { trace_id: traceId } : {}), id_ot: idOt, tipo_ot: 'BAJA', estado: 'PENDIENTE' } },
});
export const replayed = (requestId = 'g8-retiro-1-15', idOt = 930, estado = 'PENDIENTE'): G3HttpReply => ({
  status: 200, body: { success: true, data: { request_id: requestId, id_ot: idOt, estado, duplicado: true } },
});
export const orderRead = (estado: string, idOt = 930, idEmpresa = 1): G3HttpReply => ({
  status: 200, body: { success: true, data: { id_ot: idOt, id_empresa: idEmpresa, tipo_ot: 'BAJA', estado, fecha_completada: estado === 'COMPLETADA' ? '2026-11-13T14:00:00.000Z' : null, origen_integracion: null } },
});
