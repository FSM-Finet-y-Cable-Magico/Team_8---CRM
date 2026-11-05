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

    expect(result).toEqual(expect.objectContaining({
      idCliente: 5, telefono: customer.telefono, contratos: [{ idEmpresa: 2 }],
      datosTecnicos: null, estado: 'Restringido por empresa', idEmpresa: null,
    }));
    expect(prisma.contrato.findUnique).not.toHaveBeenCalled();
  });

  it('conserva la actualizacion global auditada para administradores autorizados', async () => {
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

    const result = await service.updateStatus(8, { estado: 'Activo' }, { ...supportUser, roles: ['Administrador'] });

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

  const admin = { ...supportUser, roles: ['Administrador'] };
  const shared = {
    idCliente: 5, idEmpresa: 1, rut: '21600781-6', nombreCompleto: 'Cliente compartido',
    email: 'shared@example.test', telefono: '+56940618332', estado: 'Moroso',
    datosTecnicos: { nodoPrincipal: 'GLOBAL_PRIVATE' }, passwordPortalHash: 'PRIVATE_HASH',
    esConflictivo: true, obsConflictivo: 'GLOBAL_OBSERVATION', origenContacto: 'GLOBAL_ORIGIN',
    empresa: { idEmpresa: 1, nombre: 'FiNet' },
    contratos: [
      { idContrato: 10, idEmpresa: 1, plan: { idEmpresa: 1, empresa: { idEmpresa: 1, nombre: 'FiNet' } } },
      { idContrato: 20, idEmpresa: 2, plan: { idEmpresa: 2, empresa: { idEmpresa: 2, nombre: 'Cable Magico' } } },
      { idContrato: 21, idEmpresa: 2, plan: { idEmpresa: 1, nombreComercial: 'FOREIGN_PLAN' } },
    ],
    direcciones: [],
  };

  it.each([1, 2])('lista identidad compartida y solo contratos de la empresa %i', async (idEmpresa) => {
    const snapshot = JSON.stringify(shared);
    const prisma = { cliente: { findMany: jest.fn().mockResolvedValue([shared]) } };
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    const [result] = await service.list({ ...supportUser, idEmpresa }, String(3 - idEmpresa));
    expect(result.idCliente).toBe(5);
    expect(result.contratos?.every((row) => row.idEmpresa === idEmpresa)).toBe(true);
    expect(result.datosTecnicos).toBeNull();
    expect(result.estado).toBe('Restringido por empresa');
    expect(result).not.toHaveProperty('passwordPortalHash');
    expect(result).not.toHaveProperty('obsConflictivo');
    expect(JSON.stringify(result)).not.toMatch(/GLOBAL_|FOREIGN_PLAN/);
    expect(JSON.stringify(shared)).toBe(snapshot);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        contratos: expect.objectContaining({ where: { idEmpresa } }),
        direcciones: expect.objectContaining({ where: { servicios: { some: { idEmpresa } } } }),
      }),
    }));
  });

  it('conserva consulta consolidada y limita vista empresarial del administrador', async () => {
    const prisma = { cliente: { findMany: jest.fn().mockResolvedValue([shared]) } };
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    const [consolidated] = await service.list(admin);
    expect(consolidated.contratos).toHaveLength(3);
    expect(consolidated.estado).toBe('Moroso');
    expect(consolidated.datosTecnicos).toEqual(shared.datosTecnicos);
    expect(consolidated).not.toHaveProperty('passwordPortalHash');
    const [scoped] = await service.list(admin, '2');
    expect(scoped.contratos).toHaveLength(2);
    expect(scoped.datosTecnicos).toBeNull();
  });

  it.each(['Comercial', 'Soporte', 'Terreno', 'Inventario'])('bloquea cambios globales del rol %s antes de consultar o escribir', async (role) => {
    const prisma = { cliente: { findUnique: jest.fn(), update: jest.fn() } };
    const audit = { record: jest.fn() };
    const service = new CustomersService(prisma as unknown as PrismaService, audit as unknown as AuditService);
    const user = { ...supportUser, roles: [role] };
    await expect(service.updateStatus(5, { estado: 'Activo' }, user)).rejects.toMatchObject({ status: 403 });
    await expect(service.updateTechnicalData(5, { nodoPrincipal: 'NODO' }, user)).rejects.toMatchObject({ status: 403 });
    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rechaza acceso sin empresa incluso a clientes sin empresa', async () => {
    const service = new CustomersService({} as PrismaService, {} as AuditService);
    const user = { ...supportUser, idEmpresa: null };
    await expect(service.list(user)).rejects.toThrow();
    await expect(service.history(5, user)).rejects.toThrow('empresa valida');
    await expect(service.findByRutOrContract('5', user)).rejects.toThrow('empresa valida');
  });

  it('no usa un contrato ajeno como criterio de busqueda de un cliente compartido', async () => {
    const prisma = {
      contrato: { findFirst: jest.fn().mockResolvedValue(null) },
      cliente: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
    };
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    await expect(service.findByRutOrContract('10', supportUser)).rejects.toThrow('Cliente no encontrado');
    expect(prisma.contrato.findFirst).toHaveBeenCalledWith({ where: { idContrato: 10, idEmpresa: 2 } });
    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
    expect(prisma.cliente.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [
        { OR: expect.arrayContaining([{ contratos: { some: { idContrato: 10, idEmpresa: 2 } } }]) },
        { OR: [{ idEmpresa: 2 }, { contratos: { some: { idEmpresa: 2 } } }] },
      ] },
    }));
  });

  it.each([1, 2])('rechaza un cliente exclusivo de otra empresa (%i)', async (idEmpresa) => {
    const prisma = { cliente: { findUnique: jest.fn().mockResolvedValue({
      ...shared, idEmpresa: 3 - idEmpresa, contratos: [{ idEmpresa: 3 - idEmpresa }],
    }) } };
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    await expect(service.history(5, { ...supportUser, idEmpresa })).rejects.toThrow('no pertenece');
  });

  function historyPrisma() {
    return {
      cliente: { findUnique: jest.fn().mockResolvedValue(shared) },
      contrato: { findMany: jest.fn().mockResolvedValue(shared.contratos) },
      servicioContratado: { findMany: jest.fn().mockResolvedValue([{
        idServicio: 8, idEmpresa: 2, contrato: shared.contratos[0],
        zonaPago: { idEmpresa: 1, nombre: 'FOREIGN_ZONE' },
        equipos: [{ idEmpresa: 1 }, { idEmpresa: 2 }],
        solicitudes: [{ idEmpresa: 1 }, { idEmpresa: 2 }],
      }]) },
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
      ordenTrabajo: { findMany: jest.fn().mockResolvedValue([]) },
      unidadEquipo: { findMany: jest.fn().mockResolvedValue([]) },
      solicitudCliente: { findMany: jest.fn().mockResolvedValue([]) },
      observacionOperativa: { findMany: jest.fn().mockResolvedValue([]) },
      historialCambioPlan: { findMany: jest.fn().mockResolvedValue([]) },
      contratoDigital: { findMany: jest.fn().mockResolvedValue([]) },
      logAuditoria: { findMany: jest.fn().mockResolvedValue([{
        idLog: BigInt(1), valorNuevo: { idCliente: 5, secretoAjeno: 'FOREIGN_AUDIT' },
      }]) },
    };
  }

  it('historial restringe relaciones, documentos y auditoria global aunque compartan cliente', async () => {
    const prisma = historyPrisma();
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    const result = await service.history(5, supportUser);
    expect(result.contratos).toHaveLength(2);
    expect(result.servicios[0]).toMatchObject({
      contrato: null, zonaPago: null, equipos: [{ idEmpresa: 2 }], solicitudes: [{ idEmpresa: 2 }],
    });
    expect(result.auditoria).toEqual([]);
    expect(prisma.logAuditoria.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/GLOBAL_|FOREIGN_|PRIVATE_HASH/);
    for (const model of ['contrato', 'servicioContratado', 'ticket', 'ordenTrabajo', 'solicitudCliente',
      'historialCambioPlan', 'contratoDigital'] as const) {
      expect(prisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { idCliente: 5, idEmpresa: 2 },
      }));
    }
    expect(prisma.contrato.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        contratosDigitales: expect.objectContaining({ where: { idEmpresa: 2 } }),
      }),
    }));
  });

  it('historial consolidado conserva auditoria y relaciones compartidas', async () => {
    const prisma = historyPrisma();
    const service = new CustomersService(prisma as unknown as PrismaService, {} as AuditService);
    const result = await service.history(5, admin);
    expect(result.contratos).toHaveLength(3);
    expect(result.cliente.estado).toBe('Moroso');
    expect(result.auditoria[0].idLog).toBe('1');
    expect(prisma.logAuditoria.findMany).toHaveBeenCalledTimes(1);
  });
});
