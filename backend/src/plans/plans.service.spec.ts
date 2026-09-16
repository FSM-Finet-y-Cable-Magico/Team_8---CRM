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
