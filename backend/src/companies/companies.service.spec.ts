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
          { OR: [{ estadoPipeline: null }, { estadoPipeline: { not: 'Perdido' } }] },
          { idCliente: null },
          { contratos: { none: { estado: { in: ['Firmado', 'Activo', 'Suspendido', 'Moroso'] } } } },
        ],
      },
    });
    expect(prisma.prospecto.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { idEmpresa: 1 },
            { OR: [{ estadoPipeline: null }, { estadoPipeline: { not: 'Perdido' } }] },
            { idCliente: null },
            { contratos: { none: { estado: { in: ['Firmado', 'Activo', 'Suspendido', 'Moroso'] } } } },
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
          { servicios: { some: { idEmpresa: 1, estadoOperativo: 'Activo' } } },
        ],
      },
    });
    expect(prisma.cliente.count).toHaveBeenNthCalledWith(1, {
      where: { AND: [
        { OR: [{ idEmpresa: 1 }, { contratos: { some: { idEmpresa: 1 } } }] },
        { contratos: { some: { idEmpresa: 1, estado: { in: ['Moroso', 'Suspendido'] } } } },
      ] },
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

  it.each([
    { user: { ...commercial, idEmpresa: 2 }, scope: '1', expected: { idEmpresa: 2 } },
    { user: { ...commercial, roles: ['Administrador'] }, scope: '2', expected: { idEmpresa: 2 } },
    { user: { ...commercial, roles: ['Administrador'] }, scope: 'consolidado', expected: {} },
  ])('limita servicios y consultas anidadas con scope $scope y rol $user.roles', async ({ user, scope, expected }) => {
    const count = () => jest.fn().mockResolvedValue(0);
    const rows = () => jest.fn().mockResolvedValue([]);
    const prisma = {
      cliente: { count: count() }, prospecto: { count: count(), groupBy: rows() },
      empresa: { findMany: rows() }, ordenTrabajo: { count: count() },
      ticket: { count: count(), findMany: rows() }, unidadEquipo: { count: count() },
      servicioContratado: { count: count() }, contrato: { count: count(), findMany: rows() },
      solicitudCliente: { count: count() }, historialCambioPlan: { findMany: rows() },
      categoriaFalla: { findMany: rows() },
    };
    const service = new CompaniesService(prisma as unknown as PrismaService);
    await service.summary(user, scope);
    expect(prisma.cliente.count).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([
        { servicios: { some: { ...expected, estadoOperativo: 'Activo' } } },
      ]) },
    }));
    expect(prisma.servicioContratado.count).toHaveBeenCalledWith({
      where: { ...expected, estadoOperativo: 'Activo' },
    });
    expect(prisma.contrato.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...expected, estado: { in: ['Activo', 'Moroso', 'Suspendido'] } },
    }));
    expect(prisma.historialCambioPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expected }));
  });
});
