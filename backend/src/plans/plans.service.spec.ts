import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { PlansService } from './plans.service';

const commercial: AuthUser = {
  idUsuario: 25,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

const administrator: AuthUser = {
  idUsuario: 1,
  idEmpresa: 1,
  email: 'admin@finet.local',
  nombreCompleto: 'Administrador FiNet',
  roles: ['Administrador'],
};

describe('PlansService', () => {
  const audit = { record: jest.fn() };
  beforeEach(() => jest.clearAllMocks());
  const planInput = { idEmpresa: 1, nombreComercial: 'Plan 400', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 400, precioMensual: 24990 };

  it('crea el plan sin exigir ni crear zonas', async () => {
    const created = { ...planInput, idPlan: 8 };
    const prisma = { plan: { create: jest.fn().mockResolvedValue(created) }, $transaction: jest.fn() };
    expect(await new PlansService(prisma as never, audit as never).create(planInput, commercial)).toBe(created);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  function assignmentHarness(previous = [7], available = [7, 8]) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id_plan: 5 }]),
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 5, idEmpresa: 1, precioMensual: 24990 }) },
      zonaPago: { findMany: jest.fn().mockResolvedValue(available.map(idZonaPago => ({ idZonaPago }))) },
      planZonaPrecio: {
        findMany: jest.fn().mockResolvedValue(previous.map(idZonaPago => ({ idZonaPago }))),
        updateMany: jest.fn(), createMany: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(callback => callback(tx)) };
    return { service: new PlansService(prisma as never, audit as never), tx };
  }

  it('asigna varias zonas, conserva los precios existentes y crea solo las nuevas relaciones', async () => {
    const { service, tx } = assignmentHarness([7, 9]);
    expect(await service.assignZones(5, [8, 7], commercial)).toEqual({ idPlan: 5, assignedZoneIds: [7, 8] });
    expect(tx.zonaPago.findMany).toHaveBeenCalledWith({ where: { idEmpresa: 1, activo: { not: false }, idZonaPago: { in: [7, 8] } }, select: { idZonaPago: true } });
    expect(tx.planZonaPrecio.updateMany).toHaveBeenCalledWith({ where: { idPlan: 5, activo: true, idZonaPago: { notIn: [7, 8] } }, data: { activo: false } });
    expect(tx.planZonaPrecio.createMany).toHaveBeenCalledWith({ data: [{ idPlan: 5, idZonaPago: 8, precioMensual: 24990, activo: true }] });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ASIGNAR_ZONAS_PLAN', valorNuevo: { zoneIds: [7, 8] } }), tx);
  });

  it('guardar de nuevo no duplica asignaciones', async () => {
    const { service, tx } = assignmentHarness([7, 8]);
    await service.assignZones(5, [7, 8, 7], commercial);
    expect(tx.planZonaPrecio.createMany).not.toHaveBeenCalled();
  });

  it('permite quitar todas las zonas sin borrar su historial', async () => {
    const { service, tx } = assignmentHarness();
    expect(await service.assignZones(5, [], commercial)).toEqual({ idPlan: 5, assignedZoneIds: [] });
    expect(tx.planZonaPrecio.updateMany).toHaveBeenCalledWith({ where: { idPlan: 5, activo: true }, data: { activo: false } });
    expect(tx.planZonaPrecio.createMany).not.toHaveBeenCalled();
  });

  it('rechaza una zona inexistente, inactiva o de otra empresa sin modificar asignaciones', async () => {
    const { service, tx } = assignmentHarness([7], [7]);
    await expect(service.assignZones(5, [7, 8], administrator)).rejects.toThrow('activas y pertenecer');
    expect(tx.planZonaPrecio.updateMany).not.toHaveBeenCalled();
    expect(tx.planZonaPrecio.createMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('impide asignar zonas a planes de otra empresa', async () => {
    const { service, tx } = assignmentHarness();
    tx.plan.findUnique.mockResolvedValueOnce({ idPlan: 5, idEmpresa: 2, precioMensual: 24990 });
    await expect(service.assignZones(5, [7], commercial)).rejects.toThrow('no pertenece');
    expect(tx.zonaPago.findMany).not.toHaveBeenCalled();
    expect(tx.planZonaPrecio.updateMany).not.toHaveBeenCalled();
  });

  it('la auditoría y las asignaciones forman parte de la misma transacción', async () => {
    const { service } = assignmentHarness();
    audit.record.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.assignZones(5, [7, 8], commercial)).rejects.toThrow('Audit unavailable');
  });

  it('consulta las zonas activas de la empresa del plan con la selección actual', async () => {
    const prisma = {
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 5, idEmpresa: 1 }) },
      zonaPago: { findMany: jest.fn().mockResolvedValue([{ idZonaPago: 7, nombreZona: 'Zona P', precios: [{ idPlanZonaPrecio: 1 }] }, { idZonaPago: 8, nombreZona: 'Zona Z', precios: [] }]) },
    };
    const data = await new PlansService(prisma as never, audit as never).zones(5, commercial);
    expect(data.zones).toEqual([{ idZonaPago: 7, nombreZona: 'Zona P', assigned: true }, { idZonaPago: 8, nombreZona: 'Zona Z', assigned: false }]);
    expect(prisma.zonaPago.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 1, activo: { not: false } } }));
  });

  it('las asignaciones con precio base siguen las ediciones del plan', async () => {
    const plan = { ...planInput, idPlan: 5, activo: true };
    const tx = { $queryRaw: jest.fn(), plan: { findUnique: jest.fn().mockResolvedValue(plan), update: jest.fn().mockResolvedValue({ ...plan, precioMensual: 27990 }) }, planZonaPrecio: { updateMany: jest.fn() } };
    const prisma = { plan: { findUnique: jest.fn().mockResolvedValue(plan) }, $transaction: jest.fn(callback => callback(tx)) };
    await new PlansService(prisma as never, audit as never).update(5, { precioMensual: 27990 }, commercial);
    expect(tx.planZonaPrecio.updateMany).toHaveBeenCalledWith({
      where: { idPlan: 5, activo: true, precioMensual: 24990, valorInstalacion: null, fechaInicio: null, fechaFin: null }, data: { precioMensual: 27990 },
    });
  });

  it('impide mover un plan de empresa mientras conserva zonas asignadas', async () => {
    const plan = { ...planInput, idPlan: 5, activo: true };
    const tx = { $queryRaw: jest.fn(), plan: { findUnique: jest.fn().mockResolvedValue(plan), update: jest.fn() }, planZonaPrecio: { count: jest.fn().mockResolvedValue(2) } };
    const prisma = { plan: { findUnique: jest.fn().mockResolvedValue(plan) }, $transaction: jest.fn(callback => callback(tx)) };
    await expect(new PlansService(prisma as never, audit as never).update(5, { idEmpresa: 2 }, administrator)).rejects.toThrow('Desasigna');
    expect(tx.plan.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ nombreComercial: '', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 300, precioMensual: 19990 }, 'campos obligatorios'],
    [{ nombreComercial: 'Plan inválido', tipoPlan: 'Fibra libre', tipoCliente: 'Residencial', velocidadMbps: 300, precioMensual: 19990 }, 'catálogo permitido'],
    [{ nombreComercial: 'Plan sin precio', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 300, precioMensual: 0 }, 'mayor que cero'],
    [{ nombreComercial: 'Plan sin velocidad', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 0, precioMensual: 19990 }, 'velocidad es obligatoria'],
  ])('rechaza planes comerciales inválidos', async (input, expectedMessage) => {
    const prisma = { plan: { create: jest.fn() } };
    const service = new PlansService(prisma as never, audit as never);

    await expect(service.create({ ...input, idEmpresa: 1 }, administrator)).rejects.toThrow(expectedMessage);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });

  it('limita los planes a la empresa de un usuario no administrador', async () => {
    const prisma = {
      plan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PlansService(prisma as never, audit as never);

    await service.list(commercial, 'consolidado');

    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: { idEmpresa: 1, activo: true },
      orderBy: { idPlan: 'asc' },
      include: { empresa: true },
    });
  });

  it('lista todos los planes activos del catalogo para un administrador en scope consolidado', async () => {
    const prisma = {
      plan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PlansService(prisma as never, audit as never);

    await service.list(administrator, 'consolidado');

    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: { idPlan: 'asc' },
      include: { empresa: true },
    });
  });

  it('rechaza usuarios no administradores sin empresa asignada', () => {
    const service = new PlansService({} as never, audit as never);

    expect(() => service.list({ ...commercial, idEmpresa: null })).toThrow(BadRequestException);
  });

  it('elimina un plan sin uso y registra la auditoria', async () => {
    const plan = { idPlan: 8, idEmpresa: 1, nombreComercial: 'Plan prueba', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 500, precioMensual: 19990, activo: true, empresa: null };
    const tx = {
      plan: { findUnique: jest.fn().mockResolvedValue(plan), delete: jest.fn().mockResolvedValue(plan) },
      contrato: { count: jest.fn().mockResolvedValue(0) },
      cotizacion: { count: jest.fn().mockResolvedValue(0) },
      historialCambioPlan: { count: jest.fn().mockResolvedValue(0) },
      planZonaPrecio: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new PlansService(prisma as never, audit as never);

    await service.remove(8, administrator);

    expect(tx.plan.delete).toHaveBeenCalledWith({ where: { idPlan: 8 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ELIMINAR_PLAN_COMERCIAL', idEntidadAfectada: 8 }));
  });

  it('protege los planes que ya tienen historial', async () => {
    const plan = { idPlan: 8, idEmpresa: 1, nombreComercial: 'Plan en uso', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 500, precioMensual: 19990, activo: true, empresa: null };
    const tx = {
      plan: { findUnique: jest.fn().mockResolvedValue(plan), delete: jest.fn() },
      contrato: { count: jest.fn().mockResolvedValue(1) },
      cotizacion: { count: jest.fn().mockResolvedValue(0) },
      historialCambioPlan: { count: jest.fn().mockResolvedValue(0) },
      planZonaPrecio: { deleteMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new PlansService(prisma as never, audit as never);

    await expect(service.remove(8, administrator)).rejects.toThrow('desactivarlo');
    expect(tx.plan.delete).not.toHaveBeenCalled();
  });
});
