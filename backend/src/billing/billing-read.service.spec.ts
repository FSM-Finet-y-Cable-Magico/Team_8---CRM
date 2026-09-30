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
});
