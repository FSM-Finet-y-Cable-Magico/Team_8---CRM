import { TicketsService } from './tickets.service';

/**
 * FINET 13-11-2026: «Baja de servicio» is created only by the guided withdrawal (Libro de Control) and its LINKED ticket
 * only changes category or closes inside that flow (finalization). Historical tickets of the category without a link,
 * and every other category, keep their usual handling. The category is resolved by canonical name, never a fixed ID.
 */
const operator = { idUsuario: 7, idEmpresa: 2, email: null, nombreCompleto: 'QA', roles: ['Comercial'] };
const CATALOG = [
  { idCategoria: 731, nombre: 'Consulta general', tipo: 'ATENCION', slaHoras: 24 },
  { idCategoria: 737, nombre: 'BAJA DE SERVICIO', tipo: 'ATENCION', slaHoras: 48 },
  { idCategoria: 701, nombre: 'Internet lento', tipo: 'TECNICA', slaHoras: 8 },
];

function sqlText(query: unknown) {
  if (Array.isArray(query)) return query.join('?');
  const value = query as { strings?: string[]; sql?: string };
  return value.strings?.join('?') ?? value.sql ?? '';
}

function setup({ idCategoria = 737, linked = true, storage = true } = {}) {
  const ticket = { idTicket: 10, idCliente: 5, idEmpresa: 2, idServicio: 20, idCategoria, estado: 'Abierto', origen: 'CRM', descripcion: 'Baja', fechaCierre: null };
  const prisma = {
    $queryRaw: jest.fn(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes('categoria_falla')) return CATALOG.map(row => ({ ...row, tipoDisponible: true }));
      if (text.includes('to_regclass')) return [{ ticketLink: storage, g3Dispatch: storage, g1Reception: storage }];
      if (text.includes('solicitud_ticket')) return linked ? [{ idSolicitudRetiro: 44, idTicket: 10, idServicio: 20 }] : [];
      throw new Error('unexpected query ' + text);
    }),
    ticket: { findUnique: jest.fn().mockResolvedValue(ticket), update: jest.fn(async ({ data }) => ({ ...ticket, ...data })) },
    ordenTrabajo: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (work: (client: typeof prisma) => unknown) => work(prisma));
  const audit = { record: jest.fn() };
  return { prisma, audit, service: new TicketsService(prisma as never, audit as never) };
}

describe('Ticket «Baja de servicio»: solo dentro del flujo guiado', () => {
  it('no se reclasifica un ticket hacia «Baja de servicio» (aunque el nombre difiera en formato)', async () => {
    const c = setup({ idCategoria: 731 });
    await expect(c.service.updateCategory(10, { idCategoria: 737 }, operator)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_TICKET_CATEGORY_RESERVED' }) });
    expect(c.prisma.ticket.update).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it('el ticket vinculado no se reclasifica fuera de la categoría (rompería el cierre de la baja)', async () => {
    const c = setup();
    await expect(c.service.updateCategory(10, { idCategoria: 731 }, operator)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_TICKET_MANAGED_BY_FLOW', idSolicitudRetiro: 44 }) });
    expect(c.prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(['Resuelto', 'Cerrado'])('el ticket vinculado no pasa manualmente a %s antes de la baja aplicada', async estado => {
    const c = setup();
    await expect(c.service.updateStatus(10, { estado } as never, operator)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_TICKET_MANAGED_BY_FLOW' }) });
    expect(c.prisma.ticket.update).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it('el ticket vinculado admite avances que no lo cierran (En progreso)', async () => {
    const c = setup();
    await expect(c.service.updateStatus(10, { estado: 'En progreso' } as never, operator)).resolves.toMatchObject({ estado: 'En progreso' });
  });

  it('el ticket vinculado no se cierra con un diagnóstico técnico', async () => {
    const c = setup();
    await expect(c.service.registerDiagnosis(10, { causaRaiz: 'Retiro', descripcionProblema: 'Baja', accionesRealizadas: 'Ninguna', estadoFinalServicio: 'Activo' }, operator))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_TICKET_MANAGED_BY_FLOW' }) });
    expect(c.prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('un ticket histórico de la categoría SIN vínculo conserva su cierre manual', async () => {
    const c = setup({ linked: false });
    await expect(c.service.updateStatus(10, { estado: 'Cerrado' } as never, operator)).resolves.toMatchObject({ estado: 'Cerrado' });
  });

  it('sin el almacenamiento privado (002 no aplicada) no hay vínculos y no se consulta la tabla', async () => {
    const c = setup({ storage: false });
    await expect(c.service.updateStatus(10, { estado: 'Cerrado' } as never, operator)).resolves.toMatchObject({ estado: 'Cerrado' });
    expect(c.prisma.$queryRaw.mock.calls.some(([query]) => sqlText(query).includes('FROM g8_retiros.solicitud_ticket'))).toBe(false);
  });

  it('otras categorías no consultan el almacenamiento de retiros', async () => {
    const c = setup({ idCategoria: 731 });
    await c.service.updateStatus(10, { estado: 'Cerrado' } as never, operator);
    expect(c.prisma.$queryRaw.mock.calls.some(([query]) => sqlText(query).includes('to_regclass'))).toBe(false);
  });
});
