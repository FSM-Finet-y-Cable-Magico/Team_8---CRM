import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CompaniesService } from './companies.service';

const commercial: AuthUser = {
  idUsuario: 25,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('CompaniesService', () => {
  it('limits the summary to the company assigned to a non-admin user', async () => {
    const prisma = {
      cliente: { count: jest.fn().mockResolvedValue(17) },
      prospecto: { count: jest.fn().mockResolvedValue(11) },
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 1, nombre: 'FiNet Limitada' }]) },
    };
    const service = new CompaniesService(prisma as never);

    const result = await service.summary(commercial, 'consolidado');

    expect(result.scope).toBe('1');
    expect(result.metricas).toEqual({ clientes: 17, prospectos: 11 });
    expect(prisma.cliente.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { idEmpresa: 1 },
          { contratos: { some: { idEmpresa: 1 } } },
        ],
      },
    });
    expect(prisma.prospecto.count).toHaveBeenCalledWith({ where: { idEmpresa: 1 } });
    expect(prisma.empresa.findMany).toHaveBeenCalledWith({
      where: { idEmpresa: 1 },
      orderBy: { idEmpresa: 'asc' },
    });
  });

  it('rejects non-admin users without an assigned company', async () => {
    const service = new CompaniesService({} as never);

    await expect(service.summary({ ...commercial, idEmpresa: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});
