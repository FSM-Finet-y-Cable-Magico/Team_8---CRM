import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const supportUser: AuthUser = {
    idUsuario: 3,
    idEmpresa: 2,
    email: 'soporte@cable.local',
    nombreCompleto: 'Soporte Cable',
    roles: ['Soporte'],
  };

  it('busca clientes por telefono normalizado y limita por empresa asociada', async () => {
    const prisma = {
      cliente: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await service.list(supportUser, 'consolidado', '+56 9 4061-8332');

    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { idEmpresa: 2 },
                { contratos: { some: { idEmpresa: 2 } } },
              ],
            },
            expect.objectContaining({
              OR: expect.arrayContaining([
                { telefono: { contains: '+56940618332' } },
              ]),
            }),
          ],
        },
      }),
    );
  });

  it.each([
    ['RUT', '21.600.781-6', { rut: { contains: '21600781-6', mode: 'insensitive' } }],
    ['nombre', 'Xiao Zhong', { nombreCompleto: { contains: 'Xiao Zhong', mode: 'insensitive' } }],
  ])('busca clientes por %s', async (_criterion, query, expectedFilter) => {
    const prisma = {
      cliente: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await service.list(supportUser, 'consolidado', query);

    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([expectedFilter]),
            }),
          ]),
        }),
      }),
    );
  });

  it('permite consultar una cuenta compartida mediante telefono', async () => {
    const customer = {
      idCliente: 5,
      idEmpresa: 1,
      rut: '21600781-6',
      telefono: '+56940618332',
      contratos: [{ idEmpresa: 1 }, { idEmpresa: 2 }],
    };
    const prisma = {
      contrato: {
        findUnique: jest.fn(),
      },
      cliente: {
        findFirst: jest.fn().mockResolvedValue(customer),
      },
    };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.findByRutOrContract('+56940618332', supportUser);

    expect(result).toBe(customer);
    expect(prisma.contrato.findUnique).not.toHaveBeenCalled();
  });

  it('permite reactivar un cliente suspendido', async () => {
    const customer = {
      idCliente: 8,
      idEmpresa: 2,
      estado: 'Suspendido',
      contratos: [{ idEmpresa: 2 }],
    };
    const prisma = {
      cliente: {
        findUnique: jest.fn().mockResolvedValue(customer),
        update: jest.fn().mockResolvedValue({ ...customer, estado: 'Activo' }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.updateStatus(8, { estado: 'Activo' }, supportUser);

    expect(result.estado).toBe('Activo');
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'Activo' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        valorAnterior: { estado: 'Suspendido' },
        valorNuevo: { estado: 'Activo' },
      }),
    );
  });
});
