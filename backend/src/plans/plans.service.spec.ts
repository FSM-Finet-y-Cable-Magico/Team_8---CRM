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

describe('PlansService', () => {
  it('limita los planes a la empresa de un usuario no administrador', async () => {
    const prisma = {
      plan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PlansService(prisma as never);

    await service.list(commercial, 'consolidado');

    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: { idEmpresa: 1, activo: true },
      orderBy: { idPlan: 'asc' },
      include: { empresa: true },
    });
  });

  it('rechaza usuarios no administradores sin empresa asignada', () => {
    const service = new PlansService({} as never);

    expect(() => service.list({ ...commercial, idEmpresa: null })).toThrow(BadRequestException);
  });
});
