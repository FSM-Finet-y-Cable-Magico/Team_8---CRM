import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isMorosityReason, ServiceWithdrawalService } from './service-withdrawal.service';

const user = { idUsuario: 5, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };

function setup() {
  const serviceRow = { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, estadoOperativo: 'Activo', contrato: { idContrato: 20, idCliente: 30, idEmpresa: 1 } };
  const created = {
    idSolicitudRetiro: 1, idEmpresa: 1, idCliente: 30, idServicio: 50, idContrato: 20,
    motivo: 'Cambio de domicilio', fechaSolicitada: new Date('2026-09-30'), estado: 'REGISTRADA',
    estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3', idUsuarioResponsable: 5, observaciones: null,
  };
  let rows: Array<typeof created> = [];
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    factura: { findMany: jest.fn().mockResolvedValue([{ estado: 'Pendiente', monto: 7000, pagos: [], fechaLimitePago: new Date('2020-01-01'), prorrogasPago: [] }]) },
    eventoGestionComercial: { findFirst: jest.fn().mockResolvedValue({ idEvento: 7 }) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue(serviceRow), update: jest.fn(), delete: jest.fn() },
    contrato: { findUnique: jest.fn() },
    servicioRetiroSolicitud: {
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...created, ...data }; rows.push(row); return row; }),
      findFirst: jest.fn().mockImplementation(async () => rows.find(row => !['CANCELADA', 'CERRADA'].includes(row.estado)) ?? null),
      findUnique: jest.fn().mockImplementation(async () => rows[0] ?? created),
      update: jest.fn().mockImplementation(async ({ data }) => { const row = { ...(rows[0] ?? created), ...data }; rows[0] = row; return row; }),
      findMany: jest.fn().mockResolvedValue([created]),
    },
    ordenTrabajo: { create: jest.fn() },
    ticket: { create: jest.fn() },
  };
  let queue = Promise.resolve();
  const $transaction = jest.fn(async (work) => {
    // Model independent transactions serialized on the service row, not PostgreSQL certification.
    const previous = queue; let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const before = structuredClone(rows);
    try { return await work(prisma); } catch (error) { rows = before; throw error; } finally { release(); }
  });
  Object.assign(prisma, { $transaction });
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new ServiceWithdrawalService(prisma as never, audit as never), prisma, audit, serviceRow, rows: () => rows };
}

describe('Etapa 3 - CU-84 solicitud de retiro', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-11T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  // Generic customer request «Retiro de servicio» (not morosity). The morosity withdrawal is only /initiate (Libro de Control).
  const dto = { idServicio: 50, motivo: 'Cambio de domicilio sin cobertura', fechaSolicitada: '2026-09-30', observaciones: 'Cliente solicita retiro por mudanza' };

  it('dos solicitudes iguales conservan una sola solicitud y auditoria bajo bloqueo', async () => {
    const c = setup();
    const [a, b] = await Promise.all([c.service.create(dto, user), c.service.create(dto, user)]);
    expect(a.idSolicitudRetiro).toBe(b.idSolicitudRetiro);
    expect(c.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(c.rows()).toHaveLength(1);
    expect(c.audit.record).toHaveBeenCalledTimes(1);
    expect(c.serviceRow.estadoOperativo).toBe('Activo');
    expect(c.prisma.ticket.create).not.toHaveBeenCalled();
    expect(c.prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ valorNuevo: expect.objectContaining({ idAviso: null, motivo: dto.motivo }) }), c.prisma);
  });

  it('un payload diferente no reemplaza la evidencia de una solicitud activa', async () => {
    const c = setup(); await c.service.create(dto, user);
    await expect(c.service.create({ ...dto, observaciones: 'Otra operacion' }, user)).rejects.toBeInstanceOf(ConflictException);
    expect(c.rows()[0].observaciones).toBe(dto.observaciones);
  });

  it('fallo de auditoria revierte solicitud y permite repetir sin duplicados', async () => {
    const c = setup();
    c.audit.record.mockRejectedValueOnce(new Error('AUDIT_FAILED'));
    await expect(c.service.create(dto, user)).rejects.toThrow('AUDIT_FAILED');
    expect(c.rows()).toHaveLength(0);
    expect(c.prisma.ticket.create).not.toHaveBeenCalled();
    await c.service.create(dto, user);
    expect(c.rows()).toHaveLength(1);
  });

  it.each(['MOROSIDAD', 'Morosidad', ' morosidad ', 'Cliente moroso', 'Retiro por mora', 'No pago', 'IMPAGO reiterado', 'falta de pago', 'Morosidád'])(
    'un motivo de morosidad (%p) no se acepta aquí: solo el flujo guiado del Libro de Control', async motivo => {
      const c = setup(); c.serviceRow.estadoOperativo = 'Suspendido';
      await expect(c.service.create({ ...dto, motivo }, user)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_GUIDED_FLOW_REQUIRED' } });
      expect((c.prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
      expect(c.rows()).toHaveLength(0);
      expect(c.audit.record).not.toHaveBeenCalled();
    });

  it('un servicio suspendido no admite una solicitud genérica con otro motivo', async () => {
    const c = setup(); c.serviceRow.estadoOperativo = 'Suspendido';
    await expect(c.service.create(dto, user)).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_GUIDED_FLOW_REQUIRED' } });
    expect(c.rows()).toHaveLength(0);
    expect(c.prisma.factura.findMany).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });

  it.each(['Cambio de domicilio', 'Cliente sin deuda se muda de ciudad', 'Retiro voluntario', 'Moraleja: fin de contrato'])(
    'un motivo ajeno a la morosidad (%p) se conserva', motivo => {
      expect(isMorosityReason(motivo)).toBe(false);
    });

  it('rechaza contrato distinto aunque sea del mismo cliente sin consultas cruzadas', async () => {
    const c = setup();
    await expect(c.service.create({ ...dto, idContrato: 21 }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(c.prisma.contrato.findUnique).not.toHaveBeenCalled();
  });

  it('no admite cierre manual en lugar de evidencia tecnica y cancelacion no reactiva ni da de baja', async () => {
    const c = setup(); await c.service.create(dto, user);
    await expect(c.service.update(1, { estado: 'CERRADA' }, user)).rejects.toThrow('evidencia tecnica');
    expect(c.rows()[0].estado).toBe('REGISTRADA');
    await c.service.update(1, { estado: 'CANCELADA' }, user);
    expect(c.rows()[0].estado).toBe('CANCELADA');
    expect(c.prisma.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.prisma.ticket.create).not.toHaveBeenCalled();
    expect(c.prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(c.serviceRow.estadoOperativo).toBe('Activo');
  });

  it('empresa ajena se rechaza antes de crear solicitud, ticket o consultar evidencia comercial', async () => {
    const c = setup(); c.serviceRow.idEmpresa = 2;
    await expect(c.service.create(dto, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.prisma.factura.findMany).not.toHaveBeenCalled();
    expect(c.prisma.eventoGestionComercial.findFirst).not.toHaveBeenCalled();
    expect(c.prisma.servicioRetiroSolicitud.create).not.toHaveBeenCalled();
    expect(c.prisma.ticket.create).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });
  it('50. registra una solicitud de retiro valida', async () => {
    const { service } = setup(); await expect(service.create({ idServicio: 50, motivo: 'Cambio de domicilio', fechaSolicitada: '2026-09-30' }, user)).resolves.toMatchObject({ estado: 'REGISTRADA', estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3' });
  });
  it('51. servicio es obligatorio y debe existir', async () => {
    const { service, prisma } = setup(); prisma.servicioContratado.findUnique.mockResolvedValue(null);
    await expect(service.create({ idServicio: 999, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('52. empresa cruzada es rechazada', async () => {
    const { service, serviceRow } = setup(); serviceRow.idEmpresa = 2;
    await expect(service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('53. motivo es obligatorio', async () => {
    const { service } = setup(); await expect(service.create({ idServicio: 50, motivo: '   ', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('54. registra auditoria con servicio y bloqueo tecnico', async () => {
    const { service, audit, prisma } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_SOLICITUD_RETIRO_SERVICIO', valorNuevo: expect.objectContaining({ idServicio: 50, estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3' }) }), prisma);
  });
  it('55. registrar retiro no borra ni da de baja el Servicio', async () => {
    const { service, prisma } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(prisma.servicioContratado.delete).not.toHaveBeenCalled(); expect(prisma.servicioContratado.update).not.toHaveBeenCalled();
  });
  it('56. sin contrato G3 de retiro no inventa OrdenTrabajo', async () => {
    const { service, prisma } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });
  it('57. el estado de despacho permanece bloqueado hasta existir contrato ratificado', async () => {
    const { service } = setup(); const result = await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(result.estadoDespachoTecnico).toBe('BLOQUEADO_CONTRATO_G3');
  });
});
