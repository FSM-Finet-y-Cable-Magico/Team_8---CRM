import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

const cobranzas: AuthUser = {
  idUsuario: 7,
  idEmpresa: 1,
  email: 'cobranzas@finet.local',
  nombreCompleto: 'Cobranzas FiNet',
  roles: ['Cobranzas'],
};

const paymentDto = {
  idFactura: 80,
  monto: 20000,
  pasarela: 'Caja local',
};

describe('BillingService lifecycle de pago', () => {
  it('no convierte un pago de contrato firmado en activacion inicial', async () => {
    const invoice = {
      idFactura: 80,
      idContrato: 30,
      monto: 20000,
      estado: 'Pendiente',
      pagos: [],
      contrato: {
        idContrato: 30,
        idEmpresa: 1,
        estado: 'Firmado',
        cliente: { idCliente: 10 },
        servicios: [{
          idServicio: 55,
          estadoOperativo: 'Pendiente Instalacion',
          datosTecnicos: null,
          fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
          ordenes: [],
        }],
      },
    };
    const tx = {
      pago: { create: jest.fn().mockResolvedValue({ idPago: 101 }) },
      factura: {
        update: jest.fn().mockResolvedValue({ ...invoice, estado: 'Pagada' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contrato: { update: jest.fn() },
      cliente: { update: jest.fn() },
      servicioContratado: { updateMany: jest.fn() },
    };
    const prisma = {
      factura: { findUnique: jest.fn().mockResolvedValue(invoice) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { get: jest.fn() } as unknown as ConfigService,
    );

    const result = await service.registerPayment(paymentDto, cobranzas);

    expect(result.reactivatedServiceIds).toEqual([]);
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.updateMany).not.toHaveBeenCalled();
  });

  it('reactiva por pago solo el servicio previamente Suspendido del contrato Suspendido', async () => {
    const invoice = {
      idFactura: 80,
      idContrato: 30,
      monto: 20000,
      estado: 'Pendiente',
      pagos: [],
      contrato: {
        idContrato: 30,
        idEmpresa: 1,
        estado: 'Suspendido',
        cliente: { idCliente: 10 },
        servicios: [
          {
            idServicio: 55,
            estadoOperativo: 'Suspendido',
            datosTecnicos: null,
            fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
            ordenes: [{ idOt: 20 }],
          },
          {
            idServicio: 56,
            estadoOperativo: 'Pendiente Instalacion',
            datosTecnicos: null,
            fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
            ordenes: [],
          },
        ],
      },
    };
    const tx = {
      pago: { create: jest.fn().mockResolvedValue({ idPago: 101 }) },
      factura: {
        update: jest.fn().mockResolvedValue({ ...invoice, estado: 'Pagada' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contrato: { update: jest.fn().mockResolvedValue({ idContrato: 30, estado: 'Activo' }) },
      cliente: { update: jest.fn().mockResolvedValue({ idCliente: 10, estado: 'Activo' }) },
      servicioContratado: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const audit = { record: jest.fn() };
    const prisma = {
      factura: { findUnique: jest.fn().mockResolvedValue(invoice) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { get: jest.fn() } as unknown as ConfigService,
    );

    const result = await service.registerPayment(paymentDto, cobranzas);

    expect(result.reactivatedServiceIds).toEqual([55]);
    expect(tx.servicioContratado.updateMany).toHaveBeenCalledWith({
      where: { idServicio: { in: [55] }, estadoOperativo: 'Suspendido' },
      data: { estadoOperativo: 'Activo' },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'REACTIVAR_SERVICIO_POR_PAGO',
      valorNuevo: expect.objectContaining({ serviciosReactivados: [55] }),
    }));
  });

  it('no reactiva un servicio Suspendido sin instalacion ni marca historica', async () => {
    const invoice = {
      idFactura: 80,
      idContrato: 30,
      monto: 20000,
      estado: 'Pendiente',
      pagos: [],
      contrato: {
        idContrato: 30,
        idEmpresa: 1,
        estado: 'Suspendido',
        cliente: { idCliente: 10, importadoMasivo: false },
        servicios: [{
          idServicio: 55,
          estadoOperativo: 'Suspendido',
          datosTecnicos: null,
          fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
          ordenes: [],
        }],
      },
    };
    const tx = {
      pago: { create: jest.fn().mockResolvedValue({ idPago: 101 }) },
      factura: {
        update: jest.fn().mockResolvedValue({ ...invoice, estado: 'Pagada' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contrato: { update: jest.fn() },
      cliente: { update: jest.fn() },
      servicioContratado: { updateMany: jest.fn() },
    };
    const prisma = {
      factura: { findUnique: jest.fn().mockResolvedValue(invoice) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { get: jest.fn() } as unknown as ConfigService,
    );

    const result = await service.registerPayment(paymentDto, cobranzas);

    expect(result.reactivatedServiceIds).toEqual([]);
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza una factura sin Cliente y no intenta activar servicios', async () => {
    const prisma = {
      factura: {
        findUnique: jest.fn().mockResolvedValue({
          idFactura: 80,
          estado: 'Pendiente',
          pagos: [],
          contrato: { idContrato: 30, idEmpresa: 1, estado: 'Firmado', cliente: null, servicios: [] },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new BillingService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { get: jest.fn() } as unknown as ConfigService,
    );

    await expect(service.registerPayment(paymentDto, cobranzas)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
