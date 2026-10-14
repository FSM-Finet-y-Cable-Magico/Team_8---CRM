import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { G2IntegrationService } from './g2-integration.service';

function setup(estado = 'En progreso') {
  let stored: any = null;
  const ticket = { idTicket: 50, idEmpresa: 1, idCliente: 10, idServicio: 70, idCategoria: 5, estado };
  const wifi = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    create: jest.fn().mockImplementation(({ data }) => {
      stored = { idResultado: 1n, ...data, fechaRecepcion: new Date('2026-10-01T12:00:00Z') };
      return Promise.resolve(stored);
    }),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id_ticket: 50, estado }]),
    ticket: { update: jest.fn().mockResolvedValue({ ...ticket, estado: 'Resuelto' }) },
    integracionResultadoWifiG2: wifi,
  };
  const prisma = {
    ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
    categoriaFalla: { findUnique: jest.fn().mockResolvedValue({ idCategoria: 5, nombre: 'CAMBIO_CREDENCIALES_WIFI' }) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 70, idEmpresa: 1, idCliente: 10 }) },
    integracionResultadoWifiG2: wifi,
    pago: { findUnique: jest.fn() },
    taxPaymentJob: { findUnique: jest.fn().mockResolvedValue(null) },
    taxEmissionIntent: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const billingRead = { invoicesForCompany: jest.fn(), detailForCompany: jest.fn() };
  const billing = { registerIntegrationPayment: jest.fn().mockResolvedValue({
    payment: { idPago: 9001, idFactura: 80, idCliente: 10, monto: '15000', fechaPago: new Date('2026-10-01T10:00:00.000Z'),
      pasarela: 'Portal G2', codigoTransaccion: 'TX-1', codigoAutorizacion: 'AUTH-1', comprobantePdfUrl: null, comprobanteEstado: 'PENDIENTE' },
    paidInFull: true, saldoPendiente: 0, reactivatedServiceIds: [], duplicate: false,
  }) };
  billingRead.detailForCompany.mockResolvedValue({ idFactura: 80, saldo: 0, saldoExigible: 0, estadoCalculado: 'Pagada' });
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

// Request de referencia de la respuesta complementaria de G8 (02-10-2026, §12), tal como lo envía G2.
const g2WifiBody = {
  request_id: '47fa3f36-9f27-4a77-a3e0-0f602c080426',
  trace_id: 'd80359ef-8999-46d8-80e6-699215f783c2',
  id_empresa: 1,
  resultado: 'REQUIERE_ATENCION_MANUAL' as const,
  detalle_saneado: 'Solicitud registrada para atención por técnico.',
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

  it('sin page ni page_size junta todas las páginas y responde items en la raíz', async () => {
    const { service, billingRead } = setup();
    const pageOf = (page: number, ids: number[]) => ({
      items: ids.map(idFactura => ({ idFactura, saldoExigible: 1000 })),
      pagination: { page, pageSize: 100, totalRows: 5, totalPages: 3 },
    });
    billingRead.invoicesForCompany
      .mockResolvedValueOnce(pageOf(1, [1, 2]))
      .mockResolvedValueOnce(pageOf(2, [3, 4]))
      .mockResolvedValueOnce(pageOf(3, [5]));
    const result = await service.invoices({ id_empresa: 1, id_cliente: 10 });
    expect(result.items.map(item => item.idFactura)).toEqual([1, 2, 3, 4, 5]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 5, totalRows: 5, totalPages: 1 });
    expect(billingRead.invoicesForCompany).toHaveBeenCalledTimes(3);
    expect(billingRead.invoicesForCompany).toHaveBeenNthCalledWith(3, expect.objectContaining({ idCliente: 10, page: 3, pageSize: 100 }), 1);
  });

  it('con page explícito consulta solo esa página', async () => {
    const { service, billingRead } = setup();
    billingRead.invoicesForCompany.mockResolvedValue({ items: [], pagination: { page: 2, pageSize: 20, totalRows: 45, totalPages: 3 } });
    await expect(service.invoices({ id_empresa: 1, id_cliente: 10, page: 2 })).resolves.toMatchObject({ pagination: { page: 2, totalPages: 3 } });
    expect(billingRead.invoicesForCompany).toHaveBeenCalledTimes(1);
    expect(billingRead.invoicesForCompany).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }), 1);
  });

  it('una factura sin monto se entrega con saldoExigible numérico en cero', async () => {
    const { service, billingRead } = setup();
    billingRead.invoicesForCompany.mockResolvedValue({
      items: [{ idFactura: 9, saldoExigible: null, aceptaPagos: false, estadoCalculado: 'Sin monto' }],
      pagination: { page: 1, pageSize: 100, totalRows: 1, totalPages: 1 },
    });
    const result = await service.invoices({ id_empresa: 1, id_cliente: 10 });
    expect(result.items).toEqual([{ idFactura: 9, saldoExigible: 0, aceptaPagos: false, estadoCalculado: 'Sin monto' }]);
    billingRead.detailForCompany.mockResolvedValue({ idFactura: 9, saldoExigible: null });
    await expect(service.invoiceDetail(9, 1)).resolves.toMatchObject({ saldoExigible: 0 });
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

  it('responde el pago con el formato { success, data } y conserva las claves anteriores', async () => {
    const { service, billingRead } = setup();
    const result = await service.registerPayment({
      request_id: '550e8400-e29b-41d4-a716-446655440000', id_empresa: 1, id_factura: 80, monto: 15000,
      fecha_pago: '2026-10-01T10:00:00.000Z', codigo_autorizacion: 'AUTH-1', codigo_transaccion: 'TX-1', pasarela: 'PORTAL_G2',
    });
    expect(result).toMatchObject({ success: true, duplicate: false, paidInFull: true, payment: { idPago: 9001 } });
    expect(result.data).toEqual({
      id_pago: 9001, id_factura: 80, monto: 15000, fecha_pago: new Date('2026-10-01T10:00:00.000Z'),
      codigo_autorizacion: 'AUTH-1', codigo_transaccion: 'TX-1', request_id: '550e8400-e29b-41d4-a716-446655440000',
      duplicado: false, saldo: 0, saldo_exigible: 0, estado_factura: 'Pagada',
    });
    expect(billingRead.detailForCompany).toHaveBeenCalledWith(80, 1);
  });

  it('un pago parcial duplicado informa duplicado y el saldo vigente de Billing', async () => {
    const { service, billing, billingRead } = setup();
    billing.registerIntegrationPayment.mockResolvedValue({
      payment: { idPago: 9001, idFactura: 80, monto: '5000', fechaPago: new Date('2026-10-01T10:00:00.000Z'), codigoTransaccion: 'TX-1', codigoAutorizacion: 'AUTH-1' },
      paidInFull: false, saldoPendiente: 10000, reactivatedServiceIds: [], duplicate: true,
    });
    billingRead.detailForCompany.mockResolvedValue({ idFactura: 80, saldo: 10000, saldoExigible: 10000, estadoCalculado: 'Vencida' });
    const result = await service.registerPayment({
      id_empresa: 1, id_factura: 80, monto: 5000, fecha_pago: '2026-10-01T10:00:00.000Z',
      codigo_autorizacion: 'AUTH-1', codigo_transaccion: 'TX-1', pasarela: 'PORTAL_G2',
    });
    expect(result.data).toMatchObject({ monto: 5000, request_id: null, duplicado: true, saldo: 10000, saldo_exigible: 10000, estado_factura: 'Vencida' });
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

  it('acepta el body de G2: detalle_saneado y el ticket solo en la ruta', async () => {
    const { service, tx } = setup('abierto');
    await expect(service.registerWifiResult(50, g2WifiBody)).resolves.toMatchObject({
      id_ticket: 50, resultado: 'REQUIERE_ATENCION_MANUAL', estado_ticket: 'Escalado', duplicate: false,
      detalle_saneado: g2WifiBody.detalle_saneado,
    });
    expect(tx.ticket.update).toHaveBeenCalledWith({ where: { idTicket: 50 }, data: { estado: 'Escalado', fechaCierre: null } });
    expect(tx.integracionResultadoWifiG2.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestId: g2WifiBody.request_id, idTicket: 50, resultadoTecnico: g2WifiBody.detalle_saneado, estadoTicketResultante: 'Escalado',
    }) });
  });

  it('un ticket Escalado se resuelve cuando llega APLICADO', async () => {
    const { service } = setup('Escalado');
    await expect(service.registerWifiResult(50, { ...g2WifiBody, resultado: 'APLICADO' })).resolves.toMatchObject({ estado_ticket: 'Resuelto', exito: true });
  });

  it.each(['Resuelto', 'Cerrado', 'cerrado', 'Anulado'])('responde 409 sin tocar un ticket %s', async (estado) => {
    const { service, tx } = setup(estado);
    await expect(service.registerWifiResult(50, g2WifiBody)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ticket.update).not.toHaveBeenCalled();
    expect(tx.integracionResultadoWifiG2.create).not.toHaveBeenCalled();
  });

  it('el reintento con el mismo request_id responde el original aunque el ticket ya esté cerrado', async () => {
    const first = setup('abierto');
    const original = await first.service.registerWifiResult(50, { ...g2WifiBody, resultado: 'APLICADO' });
    const { service, tx, prisma } = setup('Resuelto');
    const stored = { idResultado: 1n, requestId: original.request_id, traceId: original.trace_id, idEmpresa: 1, idTicket: 50,
      payloadHash: first.tx.integracionResultadoWifiG2.create.mock.calls[0][0].data.payloadHash, exito: true,
      resultadoTecnico: g2WifiBody.detalle_saneado, estadoTicketResultante: 'Resuelto', fechaRecepcion: new Date('2026-10-01T12:00:00Z') };
    // El primer intento se confirma entre la lectura previa y el bloqueo del ticket.
    prisma.integracionResultadoWifiG2.findUnique.mockResolvedValueOnce(null).mockResolvedValue(stored);
    await expect(service.registerWifiResult(50, { ...g2WifiBody, resultado: 'APLICADO' })).resolves.toMatchObject({ duplicate: true, estado_ticket: 'Resuelto' });
    expect(tx.ticket.update).not.toHaveBeenCalled();
  });

  it('rechaza un detalle ausente, contradictorio o un id_ticket que no coincide con la ruta', async () => {
    const { service } = setup();
    const { detalle_saneado: _detalle, ...sinDetalle } = g2WifiBody;
    await expect(service.registerWifiResult(50, sinDetalle)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerWifiResult(50, { ...g2WifiBody, resultado_tecnico: 'Otro texto' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerWifiResult(50, { ...g2WifiBody, id_ticket: 51 })).rejects.toBeInstanceOf(BadRequestException);
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

  describe('documento tributario del pago (§10)', () => {
    const payment = { idPago: 3, idCliente: 10, factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 10, idEmpresa: 1 } } } };
    const intent = {
      ambiente: 'production', estado: 'GENERADO', tipoDte: 39, folio: '123456', fechaEnvio: new Date('2026-10-02T18:20:00Z'),
      emailEstado: 'ENVIADO', artefactoUrl: 'https://www.facturacion.cl/sistema/descargar.php?id=abc', artefactoEstado: 'DISPONIBLE',
    };
    const withPayment = () => {
      const context = setup();
      context.prisma.pago.findUnique.mockResolvedValue(payment);
      return context;
    };
    const pending = { tipo_documento: null, folio: null, fecha_emision: null, email_estado: 'PENDIENTE', documento_url: null };

    it('oculta por existencia el pago de otra empresa sin consultar la emisión', async () => {
      const { service, prisma } = withPayment();
      await expect(service.paymentTaxDocument(3, 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.taxEmissionIntent.findMany).not.toHaveBeenCalled();
    });

    it('entrega boleta generada con folio, fecha y enlace de descarga', async () => {
      const { service, prisma } = withPayment();
      prisma.taxEmissionIntent.findMany.mockResolvedValue([intent]);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toEqual({ success: true, data: {
        id_pago: 3, estado: 'GENERADO', motivo: null, tipo_documento: 'BOLETA', folio: '123456',
        fecha_emision: '2026-10-02', email_estado: 'ENVIADO', documento_url: intent.artefactoUrl,
      } });
      expect(prisma.taxEmissionIntent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 1, businessKey: 'PAYMENT:3' } }));
    });

    it('una factura generada sin PDF verificado o con enlace ajeno no entrega documento_url', async () => {
      const { service, prisma } = withPayment();
      prisma.taxEmissionIntent.findMany.mockResolvedValue([{ ...intent, tipoDte: 33, artefactoEstado: 'PENDIENTE' }]);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toMatchObject({ data: { estado: 'GENERADO', tipo_documento: 'FACTURA', folio: '123456', documento_url: null } });
      prisma.taxEmissionIntent.findMany.mockResolvedValue([{ ...intent, artefactoUrl: 'https://files.example.test/3.pdf' }]);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toMatchObject({ data: { estado: 'GENERADO', documento_url: null } });
    });

    it.each(['EN_PROCESO', 'FALLIDO', 'RESULTADO_INDETERMINADO'])('informa %s sin folio ni enlace', async (estado) => {
      const { service, prisma } = withPayment();
      prisma.taxEmissionIntent.findMany.mockResolvedValue([{ ...intent, estado, folio: null, emailEstado: 'PENDIENTE' }]);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toEqual({ success: true, data: { id_pago: 3, estado, motivo: null, ...pending } });
    });

    it('un documento de sandbox nunca se entrega', async () => {
      const { service, prisma } = withPayment();
      prisma.taxPaymentJob.findUnique.mockResolvedValue({ idEmpresa: 1, estado: 'PROCESADO' });
      prisma.taxEmissionIntent.findMany.mockResolvedValue([{ ...intent, ambiente: 'sandbox' }]);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toEqual({ success: true, data: { id_pago: 3, estado: 'PENDIENTE', motivo: 'EMISION_NO_HABILITADA', ...pending } });
    });

    it.each([
      [{ idEmpresa: 1, estado: 'DATOS_REQUERIDOS' }, 'DATOS_INCOMPLETOS'],
      [{ idEmpresa: 1, estado: 'PENDIENTE' }, null],
      [null, 'EMISION_NO_HABILITADA'],
    ])('sin emisión distingue el motivo del trabajo %j', async (job, motivo) => {
      const { service, prisma } = withPayment();
      prisma.taxPaymentJob.findUnique.mockResolvedValue(job);
      await expect(service.paymentTaxDocument(3, 1)).resolves.toEqual({ success: true, data: { id_pago: 3, estado: 'PENDIENTE', motivo, ...pending } });
    });
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
