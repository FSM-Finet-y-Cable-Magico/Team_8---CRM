import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

const commercial: AuthUser = {
  idUsuario: 25,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('CompaniesService', () => {
  it('uses the same active prospect and active customer definitions in the summary', async () => {
    const prisma = {
      cliente: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(15),
      },
      prospecto: {
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 1, nombre: 'FiNet Limitada' }]) },
      ordenTrabajo: { count: jest.fn().mockResolvedValue(0) },
      ticket: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      unidadEquipo: { count: jest.fn().mockResolvedValue(0) },
      servicioContratado: { count: jest.fn().mockResolvedValue(0) },
      contrato: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      solicitudCliente: { count: jest.fn().mockResolvedValue(0) },
      historialCambioPlan: { findMany: jest.fn().mockResolvedValue([]) },
      categoriaFalla: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CompaniesService(prisma as unknown as PrismaService);

    const result = await service.summary(commercial, 'consolidado');

    expect(result.scope).toBe('1');
    expect(result.metricas).toEqual(expect.objectContaining({ clientes: 15, prospectos: 1 }));
    expect(prisma.prospecto.count).toHaveBeenCalledWith({
      where: {
        AND: [
          { idEmpresa: 1 },
          { idCliente: null },
          { OR: [{ estadoPipeline: null }, { estadoPipeline: { not: 'Perdido' } }] },
        ],
      },
    });
    expect(prisma.prospecto.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { idEmpresa: 1 },
            { idCliente: null },
            { OR: [{ estadoPipeline: null }, { estadoPipeline: { not: 'Perdido' } }] },
          ],
        },
      }),
    );
    expect(prisma.cliente.count).toHaveBeenLastCalledWith({
      where: {
        AND: [
          {
            OR: [
              { idEmpresa: 1 },
              { contratos: { some: { idEmpresa: 1 } } },
            ],
          },
          { estado: 'Activo' },
        ],
      },
    });
    expect(prisma.empresa.findMany).toHaveBeenCalledWith({
      where: { idEmpresa: 1 },
      orderBy: { idEmpresa: 'asc' },
    });
  });

  it('rejects non-admin users without an assigned company', async () => {
    const service = new CompaniesService({} as PrismaService);

    await expect(service.summary({ ...commercial, idEmpresa: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});
