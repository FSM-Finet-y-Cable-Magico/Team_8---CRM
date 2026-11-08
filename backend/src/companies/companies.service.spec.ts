import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';
import { G3Installation, LocalInstallation } from './installation-metrics';

const commercial: AuthUser = {
  idUsuario: 25,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('CompaniesService CU47 integrado', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-03T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  function fixture(date: string | null, localRows: LocalInstallation[] = []) {
    const contrato = { idContrato: 10, idEmpresa: 1, idCliente: 30 };
    const remote: G3Installation = { idEmpresa: 1, idOtG3: '901', idServicio: 50, idCliente: 30, idContrato: 10, contrato,
      servicio: { idServicio: 50, idEmpresa: 1, idContrato: 10, idCliente: 30, contrato,
        datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: '901', fechaCompletadaG3: date } } };
    const count = () => jest.fn().mockResolvedValue(0), rows = () => jest.fn().mockResolvedValue([]);
    const prisma = {
      cliente: { count: count() }, prospecto: { count: count(), groupBy: rows() },
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 1 }]) },
      ordenTrabajo: { count: count(), findMany: jest.fn().mockResolvedValue(localRows) },
      integracionInstalacionG3: { findMany: jest.fn().mockResolvedValue([remote]) },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
      ticket: { count: count(), findMany: rows() }, unidadEquipo: { count: count() },
      servicioContratado: { count: count() }, contrato: { count: count(), findMany: rows() },
      solicitudCliente: { count: count() }, historialCambioPlan: { findMany: rows() }, categoriaFalla: { findMany: rows() },
    };
    return { prisma, service: new CompaniesService(prisma as unknown as PrismaService) };
  }
  it('incluye G3 sin OT local en instalaciones del mes técnico', async () => {
    const { service } = fixture('2026-11-02T12:00:00Z');
    expect((await service.summary(commercial)).metricas.instalacionesMensuales).toBe(1);
  });
  it.each([0, 1, 5])('no publica churn ni bajas con %i estados actuales sin historia fiable', async currentCount => {
    const { service, prisma } = fixture(null);
    prisma.contrato.count.mockResolvedValue(currentCount);
    expect((await service.summary(commercial)).metricas).toMatchObject({
      churnRateMensual: null, churnBajasMensuales: null, churnEstado: 'HISTORIAL_INSUFICIENTE',
    });
    expect(prisma.contrato.count).not.toHaveBeenCalled();
  });
  it('informa completadas pendientes de fecha sin convertirlas en pendientes de ejecución', async () => {
    const { service } = fixture(null);
    expect((await service.summary(commercial)).metricas).toEqual(expect.objectContaining({
      instalacionesMensuales: 0, instalacionesSinFechaTecnica: 1, instalacionesPendientes: 0,
    }));
  });
  it.each([
    [commercial, '2', 1], [{ ...commercial, idEmpresa: 2 }, '1', 2],
    [{ ...commercial, roles: ['Administrador'] }, '2', 2],
    [{ ...commercial, roles: ['Administrador'] }, 'consolidado', undefined],
  ] as Array<[AuthUser, string, number | undefined]>)('consulta ambas fuentes con empresa autorizada y snapshot consistente', async (user, scope, company) => {
    const { service, prisma } = fixture(null);
    await service.summary(user, scope);
    expect(prisma.integracionInstalacionG3.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ...(company ? { idEmpresa: company } : {}),
        estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: { not: null } }),
    }));
    expect(prisma.ordenTrabajo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ idEmpresa: company ?? { not: null }, tipoOt: { in: ['Instalacion', 'Instalación'], mode: 'insensitive' },
        estado: { equals: 'Completada', mode: 'insensitive' } }),
    }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' });
  });
});

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
      ordenTrabajo: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      integracionInstalacionG3: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
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
      empresa: { findMany: rows() }, ordenTrabajo: { count: count(), findMany: rows() },
      integracionInstalacionG3: { findMany: rows() },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
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
