import { ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

// Ported from PR #81 (service-withdrawal-flow.spec.ts: «el ID de la categoría se resuelve en el catálogo de la
// conexión: otro ambiente, otro ID») onto the consolidated TicketsService.createWithdrawalTicket. No fixed IDs.
function setup(categories: unknown[]) {
  const created: any[] = [];
  const audits: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => (/categoria_falla/.test(strings.join('?')) ? categories : [])),
    ticket: { create: jest.fn(async ({ data }: any) => { const row = { idTicket: 500 + created.length, ...data }; created.push(row); return row; }) },
    logAuditoria: { create: jest.fn(async ({ data }: any) => { audits.push(data); return data; }) },
  };
  const service = new TicketsService({} as PrismaService, new AuditService({} as PrismaService));
  const input = { idEmpresa: 1, idCliente: 33, idServicio: 61, idContrato: 20, idSolicitudRetiro: 15, idAviso: 9, descripcion: 'Baja por morosidad', idUsuario: 7 };
  return { service, tx, input, created, audits };
}
const category = (idCategoria: number, nombre: string, tipo: string | null = 'ATENCION') => ({ idCategoria, nombre, slaHoras: 48, tipoDisponible: tipo !== null, tipo });

describe('ticket «Baja de servicio» del inicio de retiro', () => {
  it.each([
    ['ambiente global', [category(1, 'Sin servicio', 'TECNICA'), category(12, 'Baja de servicio')], 12],
    ['otro ambiente, otro ID', [category(3, 'Baja de servicio'), category(4, 'Facturación')], 3],
  ])('%s: usa el ID del catálogo de la conexión', async (_name, categories, expected) => {
    const h = setup(categories);
    const ticket = await h.service.createWithdrawalTicket(h.tx, h.input);
    expect(ticket.idCategoria).toBe(expected);
    expect(h.created[0]).toMatchObject({ idEmpresa: 1, idCliente: 33, idServicio: 61, estado: 'Abierto', origen: 'CRM' });
    expect(h.audits.map(a => a.accion)).toEqual(['CREAR_TICKET_BAJA_SERVICIO']);
  });

  it.each([
    ['sin la categoría oficial', [category(1, 'Sin servicio', 'TECNICA')]],
    ['categoría duplicada (ambigua)', [category(3, 'Baja de servicio'), category(9, 'Baja de Servicio')]],
    ['la categoría existe pero es técnica', [category(3, 'Baja de servicio', 'TECNICA')]],
  ])('%s: no crea el ticket y aborta (la transacción del inicio revierte todo)', async (_name, categories) => {
    const h = setup(categories);
    await expect(h.service.createWithdrawalTicket(h.tx, h.input)).rejects.toBeInstanceOf(ConflictException);
    expect(h.created).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });
});
