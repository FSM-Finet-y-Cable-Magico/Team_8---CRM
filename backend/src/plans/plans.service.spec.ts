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
  const planInput = { idEmpresa: 1, nombreComercial: 'Plan por zona', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 400, precioMensual: 24990, idZonaPago: 7, valorInstalacionZona: 15000 };

  it.each([null, { idEmpresa: 2, activo: true }, { idEmpresa: 1, activo: false }])('rechaza zonas inexistentes, inactivas o de otra empresa antes de crear el plan', async zone => {
    const prisma = { zonaPago: { findUnique: jest.fn().mockResolvedValue(zone) }, plan: { create: jest.fn() }, $transaction: jest.fn() };
    const service = new PlansService(prisma as never, audit as never);
    await expect(service.create(planInput, administrator)).rejects.toThrow('La zona');
    expect(prisma.plan.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('crea plan y precio de zona en la misma transacción', async () => {
    const created = { ...planInput, idPlan: 8 };
    const tx = { plan: { create: jest.fn().mockResolvedValue(created) }, planZonaPrecio: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = { zonaPago: { findUnique: jest.fn().mockResolvedValue({ idEmpresa: 1, activo: true }) }, plan: { create: jest.fn() }, $transaction: jest.fn(callback => callback(tx)) };
    const service = new PlansService(prisma as never, audit as never);
    expect(await service.create(planInput, commercial)).toBe(created);
    expect(prisma.plan.create).not.toHaveBeenCalled();
    expect(tx.planZonaPrecio.create).toHaveBeenCalledWith({ data: { idPlan: 8, idZonaPago: 7, precioMensual: 24990, valorInstalacion: 15000, activo: true } });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('propaga el fallo de precio por zona sin anunciar un plan creado', async () => {
    const tx = { plan: { create: jest.fn().mockResolvedValue({ ...planInput, idPlan: 8 }) }, planZonaPrecio: { create: jest.fn().mockRejectedValue(new Error('Falló precio')) } };
    const prisma = { zonaPago: { findUnique: jest.fn().mockResolvedValue({ idEmpresa: 1, activo: true }) }, $transaction: jest.fn(callback => callback(tx)) };
    await expect(new PlansService(prisma as never, audit as never).create(planInput, commercial)).rejects.toThrow('Falló precio');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('permite crear planes sin zona y rechaza instalación sin zona', async () => {
    const prisma = { plan: { create: jest.fn().mockResolvedValue({ ...planInput, idPlan: 8 }) } };
    const service = new PlansService(prisma as never, audit as never);
    await expect(service.create({ ...planInput, idZonaPago: undefined }, commercial)).rejects.toThrow('Selecciona la zona');
    await service.create({ ...planInput, idZonaPago: undefined, valorInstalacionZona: undefined }, commercial);
    expect(prisma.plan.create).toHaveBeenCalledTimes(1);
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
