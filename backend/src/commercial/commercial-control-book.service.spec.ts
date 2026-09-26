import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialControlBookService } from './commercial-control-book.service';
import { CommercialStatusService } from './commercial-status.service';

const admin: AuthUser = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Admin Test', roles: ['Administrador'] };
const commercial: AuthUser = { ...admin, idUsuario: 2, nombreCompleto: 'Comercial Test', roles: ['Comercial'] };
const support: AuthUser = { ...admin, idUsuario: 3, nombreCompleto: 'Soporte Test', roles: ['Soporte'] };

function invoiceFixture(overrides: Record<string, unknown> = {}) {
  return {
    idFactura: 30, idContrato: 20, periodoMes: 9, periodoAnio: 2026, monto: new Prisma.Decimal(10000), fechaEmision: new Date('2026-09-01'),
    fechaLimitePago: new Date('2026-09-10'), estado: 'Pendiente', tipoDocumento: 'BOLETA', folioExterno: 'F-30',
    pagos: [{ idPago: 1, monto: new Prisma.Decimal(4000), fechaPago: new Date('2026-09-05'), pasarela: 'Transferencia', codigoTransaccion: 'TX-1' }],
    eventosGestionComercial: [], conveniosPago: [], prorrogasPago: [],
    contrato: {
      idContrato: 20, idCliente: 10, idEmpresa: 1, idPlan: 5, idZonaPago: 7, diaVencimiento: 10, estado: 'Activo', fechaSuspension: null,
      numeroContratoExterno: 'C-20', direccionInstalacion: 'Dirección sintética', cliente: { idCliente: 10, idEmpresa: 1, rut: '11111111-1', nombreCompleto: 'Cliente Sintético', telefono: '+56911111111', email: 'test@example.test' },
      plan: { nombreComercial: 'Plan Prueba' }, zonaPago: { nombreZona: 'Zona Prueba' },
      servicios: [{ idServicio: 40, idZonaPago: 7, estadoOperativo: 'Activo', fechaCreacion: new Date('2026-01-01'), direccion: { direccionCompleta: 'Dirección sintética' }, zonaPago: { nombreZona: 'Zona Prueba' } }],
      cambiosCondicionPago: [], cargosAdicionales: [],
    },
    ...overrides,
  };
}

function harness(invoice = invoiceFixture()) {
  const basePrisma = {
    factura: { findMany: jest.fn().mockResolvedValue([invoice]), findUnique: jest.fn().mockResolvedValue(invoice) },
    observacionOperativa: { findMany: jest.fn().mockResolvedValue([{ idCliente: 10, observacion: 'Observación sintética' }]) },
    cliente: { findUnique: jest.fn().mockResolvedValue(invoice.contrato?.cliente), findFirst: jest.fn().mockResolvedValue(null) },
    prospecto: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ idProspecto: 90, clasificacionComercial: 'INTERESADO_NO_CONTRATANTE' }) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 40, idCliente: 10, idEmpresa: 1, idContrato: 20 }) },
    contrato: { findUnique: jest.fn().mockResolvedValue({ idContrato: 20, idCliente: 10, idEmpresa: 1, diaVencimiento: 10 }), update: jest.fn() },
    eventoGestionComercial: { create: jest.fn().mockResolvedValue({ idEvento: 1 }) },
    convenioPago: { create: jest.fn().mockResolvedValue({ idConvenio: 1, estado: 'PENDIENTE', cuotas: [{ numero: 1 }] }), findUnique: jest.fn(), update: jest.fn() },
    prorrogaPago: { create: jest.fn().mockResolvedValue({ idProrroga: 1 }) },
    cambioCondicionPago: { create: jest.fn().mockResolvedValue({ idCambio: 1 }) },
    cargoAdicional: { create: jest.fn().mockResolvedValue({ idCargo: 1, estado: 'PENDIENTE_FACTURACION' }) },
    plan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    ...basePrisma,
    $transaction: jest.fn(async (callback: (tx: typeof basePrisma) => unknown) => callback(basePrisma)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CommercialControlBookService(prisma as unknown as PrismaService, audit as unknown as AuditService, new CommercialStatusService(), new ConfigService({ BILLING_CUT_DAYS: 5, COMMERCIAL_PLAN_EXPIRY_ALERT_DAYS: 7 }));
  return { service, prisma, audit };
}

describe('CommercialControlBookService', () => {
  it('proyecta factura parcial, estado, última observación, filtros y paginación', async () => {
    const { service } = harness();
    const result = await service.list({ page: 1, pageSize: 10, search: '11111111', conDeuda: true }, commercial);
    expect(result.items[0]).toMatchObject({ idCliente: 10, idFactura: 30, saldoPendiente: 6000, estadoComercial: 'DEUDA_VENCIDA', observacionRelevante: 'Observación sintética' });
    expect(result.pagination).toMatchObject({ totalRows: 1, totalPages: 1 });
    expect(result.summary.totalDebt).toBe(6000);
  });

  it.each([
    [{ search: 'sin coincidencia' }, 0], [{ conDeuda: false }, 0], [{ estadoComercial: 'AL_DIA' }, 0], [{ diasAtrasoMin: 1 }, 1],
  ])('aplica filtro %j', async (filter, expected) => {
    const result = await harness().service.list({ page: 1, pageSize: 30, ...filter }, commercial);
    expect(result.pagination.totalRows).toBe(expected);
  });

  it('aplica alcance multiempresa y rechaza orden arbitrario', async () => {
    const { service, prisma } = harness();
    await service.list({ page: 1, pageSize: 30, idEmpresa: 1 }, commercial);
    expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ contrato: { is: { idEmpresa: 1 } } }) }));
    await expect(service.list({ page: 1, pageSize: 30, sort: 'DROP TABLE' } as never, commercial)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list({ page: 1, pageSize: 30 }, { ...support, roles: ['Terreno'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mantiene una empresa concreta para administrador y exige selección si no tiene empresa', async () => {
    const ownCompany = harness();
    await ownCompany.service.list({ page: 1, pageSize: 30 }, admin);
    expect(ownCompany.prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contrato: { is: { idEmpresa: 1 } } }),
    }));
    await expect(harness().service.list(
      { page: 1, pageSize: 30 },
      { ...admin, idEmpresa: null },
    )).rejects.toThrow('seleccionar una empresa');
  });
  it('exporta CSV filtrado y XLSX válido con RUT como texto', async () => {
    const service = harness().service;
    const csv = await service.export({ page: 1, pageSize: 30, columns: 'rut,nombre,saldoPendiente' }, 'csv', commercial);
    expect(csv.buffer.toString('utf8')).toContain('RUT,Nombre,Saldo pendiente');
    const xlsx = await service.export({ page: 1, pageSize: 30, columns: 'rut,montoDocumento,fechaVencimientoEfectiva' }, 'xlsx', commercial);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets[0].getCell('A2').value).toBe('11111111-1');
    expect(workbook.worksheets[0].getCell('B2').value).toBe(10000);
  });

  it('crea convenio con deuda, cuotas coherentes y auditoría', async () => {
    const { service, prisma, audit } = harness();
    const result = await service.createAgreement({ idCliente: 10, idFactura: 30, montoComprometido: 6000, cantidadCuotas: 2, condiciones: 'Dos cuotas mensuales', fechaInicio: '2026-09-25', cuotas: [{ numero: 1, monto: 3000, fechaVencimiento: '2026-09-25' }, { numero: 2, monto: 3000, fechaVencimiento: '2026-10-25' }] }, commercial);
    expect(result.cuotas).toHaveLength(1); expect(prisma.convenioPago.create).toHaveBeenCalled(); expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_CONVENIO_PAGO' }));
  });

  it.each([
    [{ montoComprometido: 7000, cantidadCuotas: 1, cuotas: [{ numero: 1, monto: 7000, fechaVencimiento: '2026-09-25' }] }, 'supera la deuda'],
    [{ montoComprometido: 6000, cantidadCuotas: 2, cuotas: [{ numero: 1, monto: 2000, fechaVencimiento: '2026-09-25' }, { numero: 2, monto: 2000, fechaVencimiento: '2026-10-25' }] }, 'no coincide'],
  ])('rechaza convenio inválido', async (changes, message) => {
    await expect(harness().service.createAgreement({ idCliente: 10, idFactura: 30, condiciones: 'Condiciones válidas', fechaInicio: '2026-09-25', ...changes } as never, commercial)).rejects.toThrow(message);
  });

  it('crea prórroga posterior sin sobrescribir vencimiento original', async () => {
    const { service, prisma } = harness();
    await service.createExtension({ idFactura: 30, nuevaFecha: '2026-10-10', motivo: 'Compromiso comercial' }, commercial);
    expect(prisma.prorrogaPago.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fechaOriginal: new Date('2026-09-10'), nuevaFecha: new Date('2026-10-10') }) }));
    await expect(service.createExtension({ idFactura: 30, nuevaFecha: '2026-09-01', motivo: 'Fecha inválida' }, commercial)).rejects.toThrow('posterior');
  });

  it('cambia día de pago con historial y rango 1-28', async () => {
    const { service, prisma } = harness();
    await service.changePaymentCondition({ idCliente: 10, idContrato: 20, tipoCambio: 'DIA_PAGO', valorNuevo: '15', justificacion: 'Solicitud comercial' }, commercial);
    expect(prisma.cambioCondicionPago.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valorAnterior: '10', valorNuevo: '15' }) }));
    await expect(service.changePaymentCondition({ idCliente: 10, idContrato: 20, tipoCambio: 'DIA_PAGO', valorNuevo: '31', justificacion: 'Solicitud comercial' }, commercial)).rejects.toThrow('entre 1 y 28');
  });

  it.each(['REPOSICION', 'RECONEXION', 'RETIRO'])('registra cargo %s separado de Pago', async (tipo) => {
    const { service, prisma } = harness();
    await service.createAdditionalCharge({ idCliente: 10, idContrato: 20, tipo, monto: 1500, fecha: '2026-09-25' }, commercial);
    expect(prisma.cargoAdicional.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo, afectaSaldo: false, estado: 'PENDIENTE_FACTURACION' }) }));
    expect(prisma).not.toHaveProperty('pago.create');
  });

  it('registra último aviso solo con deuda vencida y aviso retiro con servicio', async () => {
    const { service, prisma } = harness();
    await service.registerEvent({ idCliente: 10, idFactura: 30, tipo: 'ULTIMO_AVISO_CORTE', canal: 'TELEFONO', fecha: '2026-09-25T12:00:00.000Z' }, commercial);
    await service.registerEvent({ idCliente: 10, idServicio: 40, tipo: 'AVISO_PREVIO_RETIRO', canal: 'WHATSAPP', fecha: '2026-09-25T12:00:00.000Z', observacion: 'Registro manual sintético' }, commercial);
    expect(prisma.eventoGestionComercial.create).toHaveBeenCalledTimes(2);
    await expect(service.registerEvent({ idCliente: 10, tipo: 'AVISO_PREVIO_RETIRO', canal: 'TELEFONO', fecha: '2026-09-25T12:00:00.000Z' }, commercial)).rejects.toThrow('servicio y observación');
  });

  it('registra interesado fuera del pipeline y no crea Cliente', async () => {
    const { service, prisma } = harness();
    await service.createNonContractingLead({ idEmpresa: 1, nombreCompleto: 'Interesado Sintético', rut: '11.111.111-1', email: 'lead@example.test', telefono: '9 1111 1111', direccion: 'Dirección prueba', comuna: 'Comuna prueba', region: 'Región prueba' }, commercial);
    expect(prisma.prospecto.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clasificacionComercial: 'INTERESADO_NO_CONTRATANTE', disponibleRemarketing: true, estadoPipeline: 'Fuera pipeline' }) }));
    expect(prisma.cliente).not.toHaveProperty('create');
  });

  it('solo administrador aprueba convenio', async () => {
    const { service, prisma } = harness();
    prisma.convenioPago.findUnique.mockResolvedValue({ idConvenio: 1, idEmpresa: 1, estado: 'PENDIENTE', factura: invoiceFixture() }); prisma.convenioPago.update.mockResolvedValue({ idConvenio: 1, estado: 'APROBADO', cuotas: [] });
    await expect(service.approveAgreement(1, commercial)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.approveAgreement(1, admin)).estado).toBe('APROBADO');
    prisma.convenioPago.findUnique.mockResolvedValue({ idConvenio: 2, idEmpresa: 1, estado: 'PENDIENTE', factura: invoiceFixture({ pagos: [{ idPago: 3, monto: new Prisma.Decimal(10000), fechaPago: new Date('2026-09-25'), pasarela: 'Transferencia', codigoTransaccion: 'TX-3' }] }) });
    await expect(service.approveAgreement(2, admin)).rejects.toThrow('deuda vigente');
  });
});

describe('CommercialControlBookService - reglas complementarias', () => {
  it('busca por nombre, ordena con whitelist y pagina en servidor', async () => {
    const { service } = harness();
    const first = await service.list({ page: 1, pageSize: 1, search: 'cliente sintético', sort: 'nombre', order: 'asc' }, commercial);
    const second = await service.list({ page: 2, pageSize: 1, search: 'cliente sintético', sort: 'nombre', order: 'asc' }, commercial);
    expect(first.pagination).toMatchObject({ totalRows: 1, totalPages: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(0);
  });

  it('rechaza factura inexistente, empresa incompatible y servicio ajeno al crear convenio', async () => {
    const missing = harness();
    missing.prisma.factura.findUnique.mockResolvedValue(null);
    const dto = { idCliente: 10, idFactura: 30, montoComprometido: 6000, cantidadCuotas: 1, condiciones: 'Una cuota', fechaInicio: '2026-09-25', cuotas: [{ numero: 1, monto: 6000, fechaVencimiento: '2026-09-25' }] };
    await expect(missing.service.createAgreement(dto, commercial)).rejects.toThrow('Factura no encontrada');

    const otherInvoice = invoiceFixture();
    otherInvoice.contrato = { ...otherInvoice.contrato, idEmpresa: 2, cliente: { ...otherInvoice.contrato.cliente, idEmpresa: 2 } };
    await expect(harness(otherInvoice).service.createAgreement(dto, commercial)).rejects.toBeInstanceOf(ForbiddenException);

    const wrongService = harness();
    wrongService.prisma.servicioContratado.findUnique.mockResolvedValue({ idServicio: 41, idCliente: 99, idEmpresa: 1, idContrato: 20 });
    await expect(wrongService.service.createAgreement({ ...dto, idServicio: 41 }, commercial)).rejects.toThrow('servicio no corresponde');
  });

  it('rechaza textos obligatorios vacíos y escritura sin permiso', async () => {
    const { service } = harness();
    await expect(service.createExtension({ idFactura: 30, nuevaFecha: '2026-10-10', motivo: '   ' }, commercial)).rejects.toThrow('motivo');
    await expect(service.changePaymentCondition({ idCliente: 10, idContrato: 20, tipoCambio: 'DIA_PAGO', valorNuevo: '15', justificacion: '   ' }, commercial)).rejects.toThrow('justificación');
    await expect(service.createAgreement({ idCliente: 10, idFactura: 30, montoComprometido: 6000, cantidadCuotas: 1, condiciones: '   ', fechaInicio: '2026-09-25', cuotas: [{ numero: 1, monto: 6000, fechaVencimiento: '2026-09-25' }] }, commercial)).rejects.toThrow('condiciones');
    await expect(service.createAdditionalCharge({ idCliente: 10, tipo: 'OTRO', monto: 1, fecha: '2026-09-25' }, support)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('audita prórroga, cambio de pago y cargo adicional', async () => {
    const extension = harness();
    await extension.service.createExtension({ idFactura: 30, nuevaFecha: '2026-10-10', motivo: 'Compromiso comercial' }, commercial);
    expect(extension.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_PRORROGA' }));

    const paymentDay = harness();
    await paymentDay.service.changePaymentCondition({ idCliente: 10, idContrato: 20, tipoCambio: 'DIA_PAGO', valorNuevo: '15', justificacion: 'Solicitud comercial' }, commercial);
    expect(paymentDay.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CAMBIAR_CONDICION_PAGO' }));

    const charge = harness();
    await charge.service.createAdditionalCharge({ idCliente: 10, tipo: 'OTRO', monto: 1000, fecha: '2026-09-25' }, commercial);
    expect(charge.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_CARGO_ADICIONAL' }));
  });

  it('rechaza último aviso pagado e interesado con RUT o teléfono inválido', async () => {
    const paidInvoice = invoiceFixture({ pagos: [{ idPago: 2, monto: new Prisma.Decimal(10000), fechaPago: new Date('2026-09-20'), pasarela: 'Transferencia', codigoTransaccion: 'TX-2' }] });
    await expect(harness(paidInvoice).service.registerEvent({ idCliente: 10, idFactura: 30, tipo: 'ULTIMO_AVISO_CORTE', canal: 'EMAIL', fecha: '2026-09-25T12:00:00.000Z' }, commercial)).rejects.toThrow('pagada');

    const { service } = harness();
    const baseLead = { idEmpresa: 1, nombreCompleto: 'Interesado Sintético', email: 'lead@example.test', direccion: 'Dirección prueba', comuna: 'Comuna prueba', region: 'Región prueba' };
    await expect(service.createNonContractingLead({ ...baseLead, rut: '11.111.111-2', telefono: '9 1111 1111' }, commercial)).rejects.toThrow();
    await expect(service.createNonContractingLead({ ...baseLead, rut: '11.111.111-1', telefono: '12345678' }, commercial)).rejects.toThrow('teléfono');
  });

  it('aplica umbral configurable a alertas, incluye vencidas y aísla empresa', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const upcomingDate = new Date(today);
    upcomingDate.setUTCDate(upcomingDate.getUTCDate() + 3);
    const overdueDate = new Date(today);
    overdueDate.setUTCDate(overdueDate.getUTCDate() - 2);
    const upcoming = invoiceFixture({ fechaLimitePago: upcomingDate });
    const overdue = invoiceFixture({ idFactura: 31, fechaLimitePago: overdueDate });
    const { service, prisma } = harness();
    prisma.factura.findMany.mockResolvedValue([upcoming, overdue]);

    const result = await service.expiringPlans(undefined, 1, commercial);
    expect(result).toMatchObject({ diasAnticipacion: 7, count: 2 });
    expect(result.items.map((item) => item.diasRestantes)).toEqual(expect.arrayContaining([3, -2]));
    expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contrato: { is: { idEmpresa: 1 } }, fechaLimitePago: expect.objectContaining({ lte: expect.any(Date) }) }),
    }));
    await expect(service.expiringPlans(7, 2, commercial)).rejects.toBeInstanceOf(ForbiddenException);

    prisma.factura.findMany.mockResolvedValue([]);
    await expect(service.expiringPlans(7, 1, commercial)).resolves.toMatchObject({ count: 0, items: [] });
    jest.useRealTimers();
  });
});