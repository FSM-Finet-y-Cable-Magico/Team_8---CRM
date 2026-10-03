import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { G2IntegrationService } from './g2-integration.service';

function setup() {
  let stored: any = null;
  const ticket = { idTicket: 50, idEmpresa: 1, idCliente: 10, idServicio: 70, idCategoria: 5, estado: 'En progreso' };
  const wifi = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    create: jest.fn().mockImplementation(({ data }) => {
      stored = { idResultado: 1n, ...data, fechaRecepcion: new Date('2026-10-01T12:00:00Z') };
      return Promise.resolve(stored);
    }),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id_ticket: 50 }]),
    ticket: { update: jest.fn().mockResolvedValue({ ...ticket, estado: 'Resuelto' }) },
    integracionResultadoWifiG2: wifi,
  };
  const prisma = {
    ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
    categoriaFalla: { findUnique: jest.fn().mockResolvedValue({ idCategoria: 5, nombre: 'CAMBIO_CREDENCIALES_WIFI' }) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 70, idEmpresa: 1, idCliente: 10 }) },
    integracionResultadoWifiG2: wifi,
    pago: { findUnique: jest.fn() },
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const billingRead = { invoicesForCompany: jest.fn(), detailForCompany: jest.fn() };
  const billing = { registerIntegrationPayment: jest.fn().mockResolvedValue({ duplicate: false }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new G2IntegrationService(prisma as never, billingRead as never, billing as never, audit as never), prisma, tx, billingRead, billing, audit };
}

const wifiDto = {
  id_ticket: 50,
  id_empresa: 1,
  id_servicio: 70,
  resultado_tecnico: 'Cambio de credenciales confirmado por el proveedor',
  resultado: 'APLICADO' as const,
  request_id: 'wifi-g2-0001',
  trace_id: 'trace-0001',
};

describe('integración S2S G2', () => {
  it('normaliza el RUT y reutiliza BillingReadService con scope de empresa', async () => {
    const { service, billingRead } = setup();
    billingRead.invoicesForCompany.mockResolvedValue({ items: [] });
    await service.invoices({ id_empresa: 1, rut: '11.111.111-1', page: 1, page_size: 20 });
    expect(billingRead.invoicesForCompany).toHaveBeenCalledWith(expect.objectContaining({ rut: '11111111-1', pageSize: 20 }), 1);
  });

  it.each([
    [{ id_empresa: 1, id_cliente: 10, page: 1, page_size: 20 }, { idCliente: 10 }],
    [{ id_empresa: 2, id_contrato: 30, page: 1, page_size: 20 }, { idContrato: 30 }],
  ])('admite identificación exacta por cliente o contrato', async (query, expected) => {
    const { service, billingRead } = setup();
    billingRead.invoicesForCompany.mockResolvedValue({ items: [] });
    await service.invoices(query);
    expect(billingRead.invoicesForCompany).toHaveBeenCalledWith(expect.objectContaining(expected), query.id_empresa);
  });

  it('impide lectura masiva y rechaza RUT inválido o identidades ambiguas', async () => {
    const { service, billingRead } = setup();
    expect(() => service.invoices({ id_empresa: 1, page: 1, page_size: 20 })).toThrow(BadRequestException);
    expect(() => service.invoices({ id_empresa: 1, rut: '11.111.111-2', page: 1, page_size: 20 })).toThrow(BadRequestException);
    expect(() => service.invoices({ id_empresa: 1, rut: '11.111.111-1', id_cliente: 10, page: 1, page_size: 20 })).toThrow(BadRequestException);
    expect(billingRead.invoicesForCompany).not.toHaveBeenCalled();
  });

  it('delega el detalle con el mismo scope de empresa', async () => {
    const { service, billingRead } = setup();
    billingRead.detailForCompany.mockResolvedValue({ idFactura: 80, saldoExigible: 15000, fechaVencimientoEfectiva: '2026-10-10' });
    await expect(service.invoiceDetail(80, 2)).resolves.toMatchObject({ saldoExigible: 15000 });
    expect(billingRead.detailForCompany).toHaveBeenCalledWith(80, 2);
  });

  it('envía los cuatro datos contractuales obligatorios al registro de pago', async () => {
    const { service, billing } = setup();
    await service.registerPayment({
      id_empresa: 1, id_factura: 80, monto: 15000, fecha_pago: '2026-10-01T10:00:00.000Z',
      codigo_autorizacion: 'AUTH-1', codigo_transaccion: 'TX-1', pasarela: 'Portal G2',
    });
    expect(billing.registerIntegrationPayment).toHaveBeenCalledWith(expect.objectContaining({
      idFactura: 80, monto: 15000, fechaPago: '2026-10-01T10:00:00.000Z',
      codigoAutorizacion: 'AUTH-1', codigoTransaccion: 'TX-1',
    }), 1);
  });

  it('registra resultado WiFi saneado y resuelve el Ticket de forma atómica', async () => {
    const { service, tx, audit } = setup();
    await expect(service.registerWifiResult(50, wifiDto)).resolves.toMatchObject({ estado_ticket: 'Resuelto', duplicate: false });
    expect(tx.ticket.update).toHaveBeenCalledWith({ where: { idTicket: 50 }, data: { estado: 'Resuelto', fechaCierre: expect.any(Date) } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'RECIBIR_RESULTADO_WIFI_G2' }), tx);
  });

  it('el retry exacto WiFi es idempotente y no vuelve a actualizar el Ticket', async () => {
    const { service, tx } = setup();
    await service.registerWifiResult(50, wifiDto);
    tx.ticket.update.mockClear();
    await expect(service.registerWifiResult(50, wifiDto)).resolves.toMatchObject({ duplicate: true });
    expect(tx.ticket.update).not.toHaveBeenCalled();
  });

  it('rechaza el mismo request_id WiFi con datos distintos', async () => {
    const { service } = setup();
    await service.registerWifiResult(50, wifiDto);
    await expect(service.registerWifiResult(50, { ...wifiDto, resultado: 'ERROR_TECNICO' })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    `pass${'word'} SuperSecreto`,
    'plaintext',
    'ciphertext=abc123',
    'token SmartOLT abc123',
    'credenciales técnicas adjuntas',
    'token=abc123',
    `-----BEGIN ${'PRIVATE'} KEY-----`,
  ])('rechaza material secreto en el resultado técnico: %s', async (resultado_tecnico) => {
    const { service } = setup();
    await expect(service.registerWifiResult(50, { ...wifiDto, resultado_tecnico })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['REQUIERE_ATENCION_MANUAL', 'ERROR_TECNICO'] as const)('%s deja el Ticket Escalado', async (resultado) => {
    const { service, tx } = setup();
    await expect(service.registerWifiResult(50, { ...wifiDto, resultado, request_id: `wifi-${resultado}` }))
      .resolves.toMatchObject({ resultado, estado_ticket: 'Escalado', exito: false });
    expect(tx.ticket.update).toHaveBeenCalledWith({ where: { idTicket: 50 }, data: { estado: 'Escalado', fechaCierre: null } });
  });

  it('rechaza empresa o servicio que no correlacionan con el Ticket', async () => {
    const company = setup();
    await expect(company.service.registerWifiResult(50, { ...wifiDto, id_empresa: 2 })).rejects.toBeInstanceOf(BadRequestException);
    const service = setup();
    await expect(service.service.registerWifiResult(50, { ...wifiDto, id_servicio: 71 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo entrega una URL HTTPS cuando el comprobante está GENERADO', async () => {
    const { service, prisma } = setup();
    prisma.pago.findUnique.mockResolvedValue({
      idPago: 3, idCliente: 10, comprobanteEstado: 'GENERADO', comprobantePdfUrl: 'https://files.example.test/r/3.pdf',
      factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 10, idEmpresa: 1 } } },
    });
    await expect(service.paymentReceipt(3, 1)).resolves.toMatchObject({ comprobante_estado: 'GENERADO', redirect_url: 'https://files.example.test/r/3.pdf' });
  });

  it('un comprobante pendiente devuelve metadata sin inventar archivo', async () => {
    const { service, prisma } = setup();
    prisma.pago.findUnique.mockResolvedValue({
      idPago: 3, idCliente: 10, comprobanteEstado: 'PENDIENTE', comprobantePdfUrl: null,
      factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 10, idEmpresa: 1 } } },
    });
    await expect(service.paymentReceipt(3, 1)).resolves.toEqual({
      id_pago: 3, id_cliente: 10, comprobante_estado: 'PENDIENTE', disponible: false,
    });
  });

  it('un comprobante FALLIDO no expone URL aunque exista un valor legado', async () => {
    const { service, prisma } = setup();
    prisma.pago.findUnique.mockResolvedValue({
      idPago: 3, idCliente: 10, comprobanteEstado: 'FALLIDO', comprobantePdfUrl: 'https://files.example.test/r/3.pdf',
      factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 10, idEmpresa: 1 } } },
    });
    await expect(service.paymentReceipt(3, 1)).resolves.toEqual({
      id_pago: 3, id_cliente: 10, comprobante_estado: 'FALLIDO', disponible: false,
    });
  });

  it('oculta por existencia un comprobante de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.pago.findUnique.mockResolvedValue({
      idPago: 3, idCliente: 10, comprobanteEstado: 'PENDIENTE', comprobantePdfUrl: null,
      factura: { contrato: { idEmpresa: 2, cliente: { idCliente: 10, idEmpresa: 2 } } },
    });
    await expect(service.paymentReceipt(3, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza rutas locales y URLs no seguras de comprobante', async () => {
    const { service, prisma } = setup();
    prisma.pago.findUnique.mockResolvedValue({
      idPago: 3, idCliente: 10, comprobanteEstado: 'GENERADO', comprobantePdfUrl: 'http://localhost/tmp/3.pdf',
      factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 10, idEmpresa: 1 } } },
    });
    await expect(service.paymentReceipt(3, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
