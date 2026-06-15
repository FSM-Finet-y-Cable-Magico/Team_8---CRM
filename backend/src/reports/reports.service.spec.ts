import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const admin: AuthUser = {
    idUsuario: 1,
    idEmpresa: 1,
    email: 'admin@finet.local',
    nombreCompleto: 'Administrador',
    roles: ['Administrador'],
  };

  it('aplica empresa y periodo al reporte', async () => {
    const prisma = {
      cliente: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ReportsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    await service.export('clientes', 'csv', admin, '2', '2026-05-01', '2026-05-31');

    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      where: {
        idEmpresa: 2,
        fechaCreacion: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lte: new Date('2026-05-31T23:59:59.999Z'),
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  });

  it('rechaza un periodo invertido', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2026-07-01', '2026-06-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza periodos anteriores al limite operacional', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('tickets', 'xlsx', admin, 'consolidado', '1700-01-01', '1800-12-31'),
    ).rejects.toThrow('no puede ser anterior a 2000-01-01');
  });

  it('rechaza periodos futuros', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2999-01-01', '2999-01-31'),
    ).rejects.toThrow('no puede incluir fechas futuras');
  });

  it('rechaza fechas calendario inexistentes', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2026-02-31', '2026-03-01'),
    ).rejects.toThrow('periodo informado no es valido');
  });
});
