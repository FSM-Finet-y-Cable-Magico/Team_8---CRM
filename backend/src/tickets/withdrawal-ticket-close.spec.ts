import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

// Real TicketsService.closeWithdrawalTicket over a transaction double: the category is resolved by its official
// name from the connection's catalogue (no fixed IDs), and the write is optimistic on the state read.
function setup(ticketOverrides: Record<string, unknown> = {}, options: { categories?: unknown[]; pendingOrder?: boolean } = {}) {
  const categories = options.categories ?? [
    { idCategoria: 41, nombre: 'Baja de servicio', slaHoras: 48, tipoDisponible: true, tipo: 'ATENCION' },
    { idCategoria: 42, nombre: 'Sin servicio', slaHoras: 24, tipoDisponible: true, tipo: 'TECNICA' },
  ];
  let ticket: any = { idTicket: 77, idEmpresa: 1, idCliente: 33, idServicio: 61, idCategoria: 41, estado: 'Abierto', descripcion: 'Retiro', fechaCierre: null, ...ticketOverrides };
  const audits: any[] = [];
  const queries: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join('?'); queries.push(text);
      return /categoria_falla/.test(text) ? categories : [];
    }),
    ticket: {
      findUnique: jest.fn(async () => (ticket ? { ...ticket } : null)),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.estado !== ticket.estado || where.idEmpresa !== ticket.idEmpresa) {
          throw new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'test' });
        }
        ticket = { ...ticket, ...data }; return { ...ticket };
      }),
    },
    ordenTrabajo: { findFirst: jest.fn(async () => (options.pendingOrder ? { idOrden: 5, estado: 'Pendiente' } : null)) },
    logAuditoria: { create: jest.fn(async ({ data }: any) => { audits.push(data); return data; }) },
  };
  const service = new TicketsService({} as PrismaService, new AuditService({} as PrismaService));
  const input = { idTicket: 77, idEmpresa: 1, idCliente: 33, idServicio: 61, idSolicitudRetiro: 15, idOtG3: 930, idUsuario: 7 };
  return { service, tx, input, audits, queries, current: () => ticket };
}

describe('cierre automático del ticket «Baja de servicio»', () => {
  it.each(['Abierto', 'En progreso', 'Escalado', 'Resuelto'])('desde %s pasa a Cerrado con fecha, nota y auditoría, bajo bloqueo', async estado => {
    const h = setup({ estado });
    await expect(h.service.closeWithdrawalTicket(h.tx, h.input)).resolves.toEqual({ action: 'CERRADO', estadoAnterior: estado });
    expect(h.current()).toMatchObject({ estado: 'Cerrado', fechaCierre: expect.any(Date) });
    expect(h.current().descripcion).toMatch(/Cerrado automáticamente al aplicar la baja por morosidad \(solicitud 15, OT de retiro 930\)/);
    expect(h.tx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ where: { idTicket: 77, idEmpresa: 1, estado } }));
    expect(h.audits).toEqual([expect.objectContaining({ accion: 'CERRAR_TICKET_BAJA_SERVICIO', idEntidadAfectada: 77, idUsuario: 7,
      valorAnterior: { estado }, valorNuevo: { estado: 'Cerrado', automatico: true, idSolicitudRetiro: 15, idOtG3: 930 } })]);
    expect(h.queries[0]).toMatch(/FROM ticket WHERE id_ticket = \? FOR UPDATE/);
  });

  it('idempotente: un ticket ya Cerrado no se reescribe ni se audita', async () => {
    const h = setup({ estado: 'Cerrado', fechaCierre: new Date('2026-11-12T10:00:00Z') });
    await expect(h.service.closeWithdrawalTicket(h.tx, h.input)).resolves.toEqual({ action: 'YA_CERRADO', estadoAnterior: 'Cerrado' });
    expect(h.tx.ticket.update).not.toHaveBeenCalled();
    expect(h.audits).toEqual([]);
  });

  it.each([
    ['otra empresa', { idEmpresa: 2 }, {}],
    ['otro cliente', { idCliente: 34 }, {}],
    ['otro servicio', { idServicio: 62 }, {}],
    ['otra categoría', { idCategoria: 42 }, {}],
    ['categoría oficial ausente del catálogo', {}, { categories: [{ idCategoria: 42, nombre: 'Sin servicio', slaHoras: 24, tipoDisponible: true, tipo: 'TECNICA' }] }],
    ['categoría oficial duplicada', {}, { categories: [
      { idCategoria: 41, nombre: 'Baja de servicio', slaHoras: 48, tipoDisponible: true, tipo: 'ATENCION' },
      { idCategoria: 43, nombre: 'Baja de Servicio', slaHoras: 48, tipoDisponible: true, tipo: 'ATENCION' }] }],
    ['OT local pendiente', {}, { pendingOrder: true }],
  ])('rechaza sin escribir: %s', async (_name, ticket, options) => {
    const h = setup(ticket, options);
    await expect(h.service.closeWithdrawalTicket(h.tx, h.input)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_TICKET_INCONSISTENT' } });
    expect(h.tx.ticket.update).not.toHaveBeenCalled();
    expect(h.audits).toEqual([]);
  });

  it('un estado técnico de G3 es solo lectura: no se cierra desde G8', async () => {
    const h = setup({ estado: 'EN_CURSO' });
    await expect(h.service.closeWithdrawalTicket(h.tx, h.input)).rejects.toMatchObject({ response: { code: 'G3_TICKET_READ_ONLY' } });
    expect(h.tx.ticket.update).not.toHaveBeenCalled();
  });

  it('ticket inexistente aborta', async () => {
    const h = setup();
    h.tx.ticket.findUnique.mockResolvedValueOnce(null);
    await expect(h.service.closeWithdrawalTicket(h.tx, h.input)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_TICKET_INCONSISTENT' } });
  });
});
