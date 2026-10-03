import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

const commercial: AuthUser = {
  idUsuario: 7,
  idEmpresa: 1,
  email: 'cobranzas@example.test',
  nombreCompleto: 'Cobranzas Test',
  roles: ['Comercial'],
};

const paymentDto = { idFactura: 80, monto: 20_000, pasarela: 'Caja local' };

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    idFactura: 80,
    idContrato: 30,
    monto: new Prisma.Decimal(20_000),
    estado: 'Pendiente',
    fechaLimitePago: new Date('2026-09-10T00:00:00.000Z'),
    pagos: [],
    prorrogasPago: [],
    contrato: {
      idContrato: 30,
      idCliente: 10,
      idEmpresa: 1,
      estado: 'Suspendido',
      cliente: { idCliente: 10, idEmpresa: 1, estado: 'Suspendido', importadoMasivo: false },
      servicios: [{
        idServicio: 55,
        idEmpresa: 1,
        estadoOperativo: 'Suspendido',
        datosTecnicos: null,
        fechaCreacion: new Date('2026-09-20T00:00:00.000Z'),
        ordenes: [{ idOt: 20 }],
      }],
    },
    ...overrides,
  };
}

function harness(currentInvoice: ReturnType<typeof invoice> | null, otherInvoices: unknown[] = []) {
  const tx = {
    factura: {
      findUnique: jest.fn().mockResolvedValue(currentInvoice),
      findMany: jest.fn().mockResolvedValue(otherInvoices),
      update: jest.fn().mockResolvedValue({ ...currentInvoice, estado: 'Pagada' }),
    },
    pago: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ idPago: 101, monto: new Prisma.Decimal(20_000) }),
    },
    contrato: { update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    cliente: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    servicioContratado: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    { get: jest.fn() } as unknown as ConfigService,
  );
  return { service, prisma, tx, audit };
}

describe('BillingService lifecycle de pago', () => {
  it('persists tax work inside the transaction, then dispatches after commit; provider failure preserves payment', async()=>{
    const {prisma,tx,audit}=harness(invoice());const events:string[]=[];
    prisma.$transaction.mockImplementation(async callback=>{events.push('BEGIN');const result=await callback(tx);events.push('COMMIT');return result;});
    const issuer={getReadiness:jest.fn(),enqueuePayment:jest.fn(async()=>{events.push('OUTBOX');}),processPayment:jest.fn(async()=>{events.push('PROVIDER');throw new Error('FAKE_PROVIDER_FAILURE');})};
    const service=new BillingService(prisma as unknown as PrismaService,audit as unknown as AuditService,{} as ConfigService,issuer);
    const result=await service.registerPayment({...paymentDto,monto:5000},commercial);
    expect(events).toEqual(['BEGIN','OUTBOX','COMMIT','PROVIDER']);expect(result).toMatchObject({payment:{idPago:101},saldoPendiente:15000,taxDocument:{state:'PENDIENTE'}});
    expect(issuer.enqueuePayment).toHaveBeenCalledWith(tx,expect.objectContaining({idPago:101,monto:'5000.00',idEmpresa:1}));
  });
  it('does not dispatch after financial rollback',async()=>{
    const {prisma,tx,audit}=harness(invoice());audit.record.mockRejectedValue(new Error('FAKE_ROLLBACK'));
    const issuer={getReadiness:jest.fn(),enqueuePayment:jest.fn(),processPayment:jest.fn()};
    const service=new BillingService(prisma as unknown as PrismaService,audit as unknown as AuditService,{} as ConfigService,issuer);
    await expect(service.registerPayment({...paymentDto,monto:5000},commercial)).rejects.toThrow('FAKE_ROLLBACK');
    expect(tx.pago.create).toHaveBeenCalled();expect(issuer.processPayment).not.toHaveBeenCalled();
  });
  it('G2 duplicate confirmation does not enqueue another fiscal job',async()=>{
    const {prisma,tx,audit}=harness(invoice());const date=new Date('2026-10-01T10:00:00Z');
    tx.pago.findUnique.mockResolvedValue({idPago:101,idFactura:80,idCliente:10,monto:new Prisma.Decimal(5000),fechaPago:date,pasarela:'QA',codigoAutorizacion:'QA-AUTH',codigoTransaccion:'QA-TX'} as never);
    const issuer={getReadiness:jest.fn(),enqueuePayment:jest.fn(),processPayment:jest.fn().mockResolvedValue({state:'GENERADO'})};
    const service=new BillingService(prisma as unknown as PrismaService,audit as unknown as AuditService,{} as ConfigService,issuer);
    expect(await service.registerIntegrationPayment({idFactura:80,monto:5000,pasarela:'QA',fechaPago:date.toISOString(),codigoTransaccion:'QA-TX',codigoAutorizacion:'QA-AUTH'},1)).toMatchObject({duplicate:true});
    expect(tx.pago.create).not.toHaveBeenCalled();expect(issuer.enqueuePayment).not.toHaveBeenCalled();expect(issuer.processPayment).toHaveBeenCalledWith(101);
  });
  it('registra pago parcial sin cerrar ni reactivar', async () => {
    const { service, tx, audit } = harness(invoice());
    const result = await service.registerPayment({ ...paymentDto, monto: 5_000 }, commercial);

    expect(result).toMatchObject({ paidInFull: false, saldoPendiente: 15_000, reactivatedServiceIds: [] });
    expect(tx.factura.update).not.toHaveBeenCalled();
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'REGISTRAR_PAGO',
      valorNuevo: expect.objectContaining({ saldoAnterior: 20_000, saldoNuevo: 15_000 }),
    }), tx);
  });

  it('no convierte un pago de contrato firmado en activación inicial', async () => {
    const current = invoice({ contrato: {
      ...invoice().contrato,
      estado: 'Firmado',
      cliente: { idCliente: 10, idEmpresa: 1, estado: 'Activo', importadoMasivo: false },
      servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Pendiente Instalacion', datosTecnicos: null,
        fechaCreacion: new Date('2026-09-20T00:00:00.000Z'), ordenes: [] }],
    } });
    const { service, tx } = harness(current);
    const result = await service.registerPayment(paymentDto, commercial);

    expect(result.reactivatedServiceIds).toEqual([]);
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.updateMany).not.toHaveBeenCalled();
  });

  it('reactiva solo el servicio suspendido e instalado al pagar la última deuda vencida', async () => {
    const current = invoice({ contrato: {
      ...invoice().contrato,
      servicios: [
        ...invoice().contrato.servicios,
        { idServicio: 56, idEmpresa: 1, estadoOperativo: 'Pendiente Instalacion', datosTecnicos: null,
          fechaCreacion: new Date('2026-09-20T00:00:00.000Z'), ordenes: [] },
      ],
    } });
    const { service, tx, audit } = harness(current);
    const result = await service.registerPayment(paymentDto, commercial);

    expect(result.reactivatedServiceIds).toEqual([55]);
    expect(tx.servicioContratado.updateMany).toHaveBeenCalledWith({
      where: { idServicio: { in: [55] }, idContrato: 30, idEmpresa: 1, estadoOperativo: 'Suspendido' },
      data: { estadoOperativo: 'Activo' },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'REACTIVAR_SERVICIO_POR_PAGO' }), tx);
  });

  it('no reactiva si queda otra factura vencida con saldo en la misma empresa', async () => {
    const other = invoice({ idFactura: 81, monto: new Prisma.Decimal(10_000), pagos: [{ monto: new Prisma.Decimal(2_000) }] });
    const { service, tx } = harness(invoice(), [other]);
    const result = await service.registerPayment(paymentDto, commercial);

    expect(result.reactivatedServiceIds).toEqual([]);
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.updateMany).not.toHaveBeenCalled();
  });

  it('ignora como deuda una factura antigua cuyo saldo ya está pagado', async () => {
    const other = invoice({ idFactura: 81, monto: new Prisma.Decimal(10_000), pagos: [{ monto: new Prisma.Decimal(10_000) }] });
    const { service } = harness(invoice(), [other]);
    const result = await service.registerPayment(paymentDto, commercial);

    expect(result.reactivatedServiceIds).toEqual([55]);
  });

  it('rechaza sobrepago, factura sin cliente, empresa ajena y rol sin permiso antes de insertar', async () => {
    const overpay = harness(invoice());
    await expect(overpay.service.registerPayment({ ...paymentDto, monto: 20_000.01 }, commercial)).rejects.toBeInstanceOf(BadRequestException);
    expect(overpay.tx.pago.create).not.toHaveBeenCalled();

    const noCustomer = harness(invoice({ contrato: { ...invoice().contrato, cliente: null } }));
    await expect(noCustomer.service.registerPayment(paymentDto, commercial)).rejects.toBeInstanceOf(NotFoundException);

    const otherCompany = harness(invoice({ contrato: { ...invoice().contrato, idEmpresa: 2,
      cliente: { idCliente: 10, idEmpresa: 2, estado: 'Suspendido', importadoMasivo: false } } }));
    await expect(otherCompany.service.registerPayment(paymentDto, commercial)).rejects.toBeInstanceOf(BadRequestException);

    const support = { ...commercial, roles: ['Soporte'] };
    const forbidden = harness(invoice());
    await expect(forbidden.service.registerPayment(paymentDto, support)).rejects.toBeInstanceOf(ForbiddenException);
    expect(forbidden.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { ...paymentDto, codigoAutorizacion: 'AUTH-1', codigoTransaccion: 'TX-1' },
    { ...paymentDto, fechaPago: '2026-10-01T10:00:00.000Z', codigoTransaccion: 'TX-1' },
    { ...paymentDto, fechaPago: '2026-10-01T10:00:00.000Z', codigoAutorizacion: 'AUTH-1' },
    { ...paymentDto, fechaPago: '2026-10-01T10:00:00.000Z', codigoAutorizacion: '   ', codigoTransaccion: 'TX-1' },
  ])('pago S2S G2 exige fecha, autorización y transacción', async (invalidPayment) => {
    const { service } = harness(invoice());
    await expect(service.registerIntegrationPayment(invalidPayment, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pago S2S G2 persiste metadatos obligatorios y la fecha informada', async () => {
    const { service, tx, audit } = harness(invoice());
    await service.registerIntegrationPayment({
      ...paymentDto,
      fechaPago: '2026-10-01T10:00:00.000Z',
      codigoAutorizacion: 'AUTH-1',
      codigoTransaccion: 'TX-1',
    }, 1);
    expect(tx.pago.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      fechaPago: new Date('2026-10-01T10:00:00.000Z'),
      codigoAutorizacion: 'AUTH-1',
      codigoTransaccion: 'TX-1',
      comprobanteEstado: 'PENDIENTE',
    }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'REGISTRAR_PAGO_G2', idUsuario: null }), tx);
  });

  it('retry exacto de pago S2S devuelve duplicate sin insertar', async () => {
    const { service, tx } = harness(invoice({ pagos: [{ monto: new Prisma.Decimal(20_000) }] }));
    tx.pago.findUnique.mockResolvedValue({
      idPago: 101, idFactura: 80, idCliente: 10, monto: new Prisma.Decimal(20_000),
      fechaPago: new Date('2026-10-01T10:00:00.000Z'), pasarela: 'Caja local',
      codigoTransaccion: 'TX-1', codigoAutorizacion: 'AUTH-1', comprobantePdfUrl: null, comprobanteEstado: 'PENDIENTE',
    });
    await expect(service.registerIntegrationPayment({
      ...paymentDto,
      fechaPago: '2026-10-01T10:00:00.000Z',
      codigoAutorizacion: 'AUTH-1',
      codigoTransaccion: 'TX-1',
    }, 1)).resolves.toMatchObject({ duplicate: true });
    expect(tx.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza reutilizar codigo_transaccion con contenido incompatible', async () => {
    const { service, tx } = harness(invoice({ pagos: [{ monto: new Prisma.Decimal(10_000) }] }));
    tx.pago.findUnique.mockResolvedValue({
      idPago: 101, idFactura: 80, idCliente: 10, monto: new Prisma.Decimal(10_000),
      fechaPago: new Date('2026-10-01T10:00:00.000Z'), pasarela: 'Caja local',
      codigoTransaccion: 'TX-1', codigoAutorizacion: 'AUTH-1', comprobantePdfUrl: null, comprobanteEstado: 'PENDIENTE',
    });
    await expect(service.registerIntegrationPayment({
      ...paymentDto,
      monto: 5_000,
      fechaPago: '2026-10-01T10:00:00.000Z',
      codigoAutorizacion: 'AUTH-1',
      codigoTransaccion: 'TX-1',
    }, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pago.create).not.toHaveBeenCalled();
  });

  it.each([
    ['sobrepago', invoice(), 20_000.01, 1],
    ['más de dos decimales', invoice(), 10.001, 1],
    ['factura cerrada', invoice({ estado: 'Anulada' }), 5_000, 1],
    ['factura de otra empresa', invoice({ contrato: { ...invoice().contrato, idEmpresa: 2,
      cliente: { idCliente: 10, idEmpresa: 2, estado: 'Suspendido', importadoMasivo: false } } }), 5_000, 1],
  ])('pago S2S rechaza %s', async (_caseName, currentInvoice, monto, idEmpresa) => {
    const { service, tx } = harness(currentInvoice);
    await expect(service.registerIntegrationPayment({
      ...paymentDto,
      monto,
      fechaPago: '2026-10-01T10:00:00.000Z',
      codigoAutorizacion: 'AUTH-1',
      codigoTransaccion: 'TX-1',
    }, idEmpresa)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pago.create).not.toHaveBeenCalled();
  });
});

describe('BillingService avisos y suspensión', () => {
  it('registra aviso simulado como notificación, evento funcional y auditoría atómica', async () => {
    const current = invoice();
    const tx = {
      cliente: { findUnique: jest.fn().mockResolvedValue(current.contrato.cliente) },
      factura: { findUnique: jest.fn().mockResolvedValue(current) },
      plantillaNotificacion: {
        findFirst: jest.fn().mockResolvedValue({ idPlantilla: 5, canal: 'Sistema' }),
        create: jest.fn(),
      },
      logNotificacion: { create: jest.fn().mockResolvedValue({ idNotificacion: 9n, idCliente: 10, canal: 'Sistema' }) },
      eventoGestionComercial: { create: jest.fn().mockResolvedValue({ idEvento: 44 }) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new BillingService(prisma as unknown as PrismaService, audit as unknown as AuditService,
      { get: jest.fn().mockReturnValue('mock') } as unknown as ConfigService);

    const result = await service.sendNotification({ idCliente: 10, idFactura: 80, tipo: 'Preventiva' }, commercial);

    expect(result.idNotificacion).toBe('9');
    expect(tx.plantillaNotificacion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ idEmpresa: 1 }),
    }));
    expect(tx.eventoGestionComercial.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      idEmpresa: 1, idCliente: 10, idFactura: 80, tipo: 'AVISO_PREVENTIVO', estadoGestion: 'REGISTRADO',
    }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entidadAfectada: 'evento_gestion_comercial' }), tx);
  });

  it('impide último aviso antes del vencimiento efectivo de una prórroga', async () => {
    const current = invoice({ prorrogasPago: [{ nuevaFecha: new Date('2026-10-10'), estado: 'APROBADA' }] });
    const tx = { cliente: { findUnique: jest.fn().mockResolvedValue(current.contrato.cliente) }, factura: { findUnique: jest.fn().mockResolvedValue(current) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new BillingService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService,
      { get: jest.fn() } as unknown as ConfigService);

    await expect(service.sendNotification({ idCliente: 10, idFactura: 80, tipo: 'Ultimo aviso' }, commercial)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no suspende mientras una prórroga aprobada mantiene la factura vigente', async () => {
    const current = invoice({ prorrogasPago: [{ nuevaFecha: new Date('2026-10-10'), estado: 'APROBADA' }] });
    const contract = { ...current.contrato, facturas: [current] };
    const tx = { contrato: { findUnique: jest.fn().mockResolvedValue(contract), update: jest.fn() }, cliente: { updateMany: jest.fn() },
      servicioContratado: { updateMany: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new BillingService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService,
      { get: jest.fn().mockReturnValue(5) } as unknown as ConfigService);

    await expect(service.suspendContract(30, commercial)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contrato.update).not.toHaveBeenCalled();
  });
});
