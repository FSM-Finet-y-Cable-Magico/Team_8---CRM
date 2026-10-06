import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BillingReadService } from './billing-read.service';

const commercial: AuthUser = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
const row = {
  idFactura: 8, idContrato: 4, periodoMes: 9, periodoAnio: 2026, monto: new Prisma.Decimal(10000),
  fechaEmision: new Date('2026-09-01'), fechaLimitePago: new Date('2026-09-20'), estado: 'Pendiente',
  tipoDocumento: 'BOLETA', folioExterno: 'F-8', pagos: [{ idPago: 1, monto: new Prisma.Decimal(2500),
    fechaPago: new Date('2026-09-10'), pasarela: 'Caja', codigoTransaccion: null }], prorrogasPago: [],
  contrato: { idContrato: 4, idEmpresa: 1, idCliente: 3, estado: 'Activo', diaVencimiento: 20,
    cliente: { idCliente: 3, idEmpresa: 1, nombreCompleto: 'Cliente Test', rut: '11111111-1' },
    plan: { nombreComercial: 'Plan Test' } },
};

describe('BillingReadService', () => {
  it('fuerza empresa y cliente de la misma empresa en el listado', async () => {
    const prisma = {
      factura: { findMany: jest.fn().mockResolvedValue([row]), count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
    };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    const result = await service.invoices({ scope: 'consolidado', page: 1, pageSize: 20 }, commercial);
    expect(result.items[0]).toMatchObject({ saldo: 7500, aceptaPagos: true });
    expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contrato: { is: { idEmpresa: 1, cliente: { is: { idEmpresa: 1 } } } } },
    }));
  });

  it('filtra S2S por empresa y RUT exacto y conserva los conceptos de Billing', async () => {
    const prisma = {
      factura: { findMany: jest.fn().mockResolvedValue([row]), count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
    };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    const result = await service.invoicesForCompany({ rut: '11111111-1', page: 1, pageSize: 20 }, 1);
    expect(result.items[0]).toMatchObject({
      monto: 10000,
      pagado: 2500,
      saldo: 7500,
      saldoFavor: 0,
      saldoExigible: 7500,
      fechaVencimientoEfectiva: '2026-09-20',
      diasAtraso: expect.any(Number),
      estadoCalculado: 'Vencida',
      aceptaPagos: true,
    });
    expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contrato: { is: { idEmpresa: 1, cliente: { is: { idEmpresa: 1, rut: '11111111-1' } } } } },
    }));
  });

  it.each([
    [{ idCliente: 3 }, 1, { idEmpresa: 1, cliente: { is: { idEmpresa: 1, idCliente: 3 } } }],
    [{ idContrato: 4 }, 2, { idEmpresa: 2, idContrato: 4, cliente: { is: { idEmpresa: 2 } } }],
  ])('mantiene aislamiento por empresa con identificadores exactos', async (identity, idEmpresa, contractScope) => {
    const prisma = {
      factura: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
    };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    await expect(service.invoicesForCompany({ ...identity, page: 1, pageSize: 20 }, idEmpresa))
      .resolves.toMatchObject({ items: [], pagination: { totalRows: 0 } });
    expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contrato: { is: contractScope } },
    }));
  });

  it('responde lista vacía para cliente inexistente o RUT perteneciente a otra empresa', async () => {
    const prisma = {
      factura: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
    };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    await expect(service.invoicesForCompany({ rut: '11111111-1', page: 1, pageSize: 20 }, 2))
      .resolves.toMatchObject({ items: [], pagination: { totalRows: 0 } });
  });

  it('rechaza un scope explícito de otra empresa', async () => {
    const service = new BillingReadService({} as PrismaService);
    await expect(service.invoices({ scope: '2', page: 1, pageSize: 20 }, commercial)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('oculta por existencia una factura de otra empresa y rechaza roles ajenos', async () => {
    const prisma = { factura: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    await expect(service.detail(8, commercial)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.factura.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contrato: { is: { idEmpresa: 1, cliente: { is: { idEmpresa: 1 } } } } }),
    }));
    await expect(service.detail(8, { ...commercial, roles: ['Terreno'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el detalle S2S usa el mismo balance y oculta facturas cross-company', async () => {
    const relations = {
      convenioPago: { findMany: jest.fn().mockResolvedValue([]) },
      prorrogaPago: { findMany: jest.fn().mockResolvedValue([]) },
      cargoAdicional: { findMany: jest.fn().mockResolvedValue([]) },
      cambioCondicionPago: { findMany: jest.fn().mockResolvedValue([]) },
      eventoGestionComercial: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { factura: { findFirst: jest.fn().mockResolvedValue(row) }, ...relations };
    const service = new BillingReadService(prisma as unknown as PrismaService);
    await expect(service.detailForCompany(8, 1)).resolves.toMatchObject({
      saldoExigible: 7500,
      fechaVencimientoEfectiva: '2026-09-20',
      aceptaPagos: true,
    });
    prisma.factura.findFirst.mockResolvedValueOnce(null);
    await expect(service.detailForCompany(8, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
