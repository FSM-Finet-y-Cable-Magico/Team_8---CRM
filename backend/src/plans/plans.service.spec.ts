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
});
