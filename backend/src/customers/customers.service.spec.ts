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
});
