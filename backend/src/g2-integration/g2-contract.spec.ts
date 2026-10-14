import { ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BillingReadService } from '../billing/billing-read.service';
import { G2ConfirmedPaymentDto, G2InvoiceQueryDto, G2WifiResultDto } from './g2-integration.dto';
import { G2IntegrationService } from './g2-integration.service';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
// Mismo pipe global que main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const accept = <T>(metatype: new () => T, value: unknown, type: 'body' | 'query' = 'body') =>
  pipe.transform(value, { type, metatype }) as Promise<T>;
// Lo que viaja por HTTP: fechas y decimales ya serializados.
const overHttp = (value: unknown) => JSON.parse(JSON.stringify(value));

/** Réplica del esquema con que G2 valida la respuesta (finet-clientes, g8-integracion.service.ts, `respuestaFacturas`). */
function readAsG2(json: { items?: unknown } | null) {
  const optional = (value: unknown, type: string) => value === undefined || value === null || typeof value === type;
  if (!json || !Array.isArray(json.items)) throw new Error('G2 descarta la respuesta: falta items en la raíz');
  return json.items.map((item: Record<string, unknown>) => {
    if (typeof item.idFactura !== 'number' || typeof item.saldoExigible !== 'number'
      || !optional(item.fechaVencimientoEfectiva, 'string') || !optional(item.aceptaPagos, 'boolean')) {
      throw new Error('G2 descarta la respuesta: una factura no cumple su esquema');
    }
    return {
      idFactura: item.idFactura,
      saldoExigible: item.saldoExigible,
      fechaVencimientoEfectiva: item.fechaVencimientoEfectiva ?? null,
      aceptaPagos: item.aceptaPagos ?? null,
    };
  });
}

// La factura del ejemplo del §2: 19.990 con un pago de 5.000 y prórroga aprobada al 15-10.
const invoiceRow = (overrides: Record<string, unknown> = {}) => ({
  idFactura: 101, idContrato: 456, periodoMes: 10, periodoAnio: 2026, monto: new Prisma.Decimal('19990.00'),
  fechaEmision: new Date('2026-10-01'), fechaLimitePago: new Date('2026-10-10'), estado: 'Pendiente',
  tipoDocumento: null, folioExterno: null,
  pagos: [{ idPago: 1, monto: new Prisma.Decimal('5000.00'), fechaPago: new Date('2026-10-05T12:00:00Z'), pasarela: 'Caja', codigoTransaccion: null }],
  prorrogasPago: [{ nuevaFecha: new Date('2026-10-15'), estado: 'APROBADA' }],
  contrato: { idContrato: 456, idEmpresa: 1, idCliente: 123, estado: 'Activo', diaVencimiento: 10,
    cliente: { idCliente: 123, idEmpresa: 1, nombreCompleto: 'Cliente de ejemplo', rut: '11111111-1' },
    plan: { nombreComercial: 'Plan de ejemplo' } },
  ...overrides,
});

function invoicesService(rows: unknown[]) {
  const prisma = {
    factura: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(rows.length) },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  // Billing real: el saldo y el vencimiento salen de su lógica única, no del test.
  const service = new G2IntegrationService(prisma as never, new BillingReadService(prisma as never), {} as never, {} as never);
  return { service, prisma };
}

describe('contrato G8 ↔ G2 (respuesta complementaria del 02-10-2026)', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-10-08T15:00:00Z') }); });
  afterAll(() => { jest.useRealTimers(); });

  describe('GET invoices (§2)', () => {
    it('la consulta de G2 por cliente produce la respuesta de referencia y G2 la puede leer', async () => {
      const { service } = invoicesService([invoiceRow()]);
      const query = await accept(G2InvoiceQueryDto, { id_empresa: '1', id_cliente: '123' }, 'query');
      const body = overHttp(await service.invoices(query));
      const [{ fechaLimitePago, ...expected }] = fixture('invoices-response.json').items;

      expect(body).not.toHaveProperty('success');
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject(expected);
      expect(body.items[0].fechaLimitePago.slice(0, 10)).toBe(fechaLimitePago);
      expect(readAsG2(body)).toEqual([{ idFactura: 101, saldoExigible: 14990, fechaVencimientoEfectiva: '2026-10-15', aceptaPagos: true }]);
    });

    it('la consulta de G2 por contrato se limita a esa empresa y contrato', async () => {
      const { service, prisma } = invoicesService([]);
      const query = await accept(G2InvoiceQueryDto, { id_empresa: '2', id_contrato: '456' }, 'query');
      expect(readAsG2(overHttp(await service.invoices(query)))).toEqual([]);
      expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { contrato: { is: expect.objectContaining({ idEmpresa: 2, idContrato: 456 }) } },
      }));
    });

    it('G2 puede leer la respuesta aunque una factura no tenga monto', async () => {
      const { service } = invoicesService([invoiceRow(), invoiceRow({ idFactura: 102, monto: null, pagos: [], prorrogasPago: [] })]);
      const query = await accept(G2InvoiceQueryDto, { id_empresa: '1', id_cliente: '123' }, 'query');
      const read = readAsG2(overHttp(await service.invoices(query)));
      expect(read[1]).toEqual({ idFactura: 102, saldoExigible: 0, fechaVencimientoEfectiva: '2026-10-10', aceptaPagos: false });
      expect(read.reduce((total, invoice) => total + invoice.saldoExigible, 0)).toBe(14990);
    });
  });

  describe('POST wifi-result (§12)', () => {
    it('el request de referencia pasa la validación sin cambios', async () => {
      const request = fixture('wifi-result-request.json');
      await expect(accept(G2WifiResultDto, request)).resolves.toEqual(request);
    });
  });

  describe('POST payments (§4)', () => {
    it('el request de referencia pasa la validación y la respuesta cumple el formato', async () => {
      const request = fixture('payments-request.json');
      const dto = await accept(G2ConfirmedPaymentDto, request);
      expect(dto).toEqual(request);

      const billing = { registerIntegrationPayment: jest.fn().mockResolvedValue({
        payment: { idPago: 9001, idFactura: 101, idCliente: 123, monto: new Prisma.Decimal('14990.00'), fechaPago: new Date(request.fecha_pago),
          pasarela: request.pasarela, codigoTransaccion: request.codigo_transaccion, codigoAutorizacion: request.codigo_autorizacion },
        paidInFull: true, saldoPendiente: 0, reactivatedServiceIds: [], duplicate: false,
      }) };
      const billingRead = { detailForCompany: jest.fn().mockResolvedValue({ idFactura: 101, saldo: 0, saldoExigible: 0, estadoCalculado: 'Pagada' }) };
      const service = new G2IntegrationService({} as never, billingRead as never, billing as never, {} as never);
      const body = overHttp(await service.registerPayment(dto));
      const { data: { fecha_pago, ...expected } } = fixture('payments-response.json');

      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(expected);
      expect(new Date(body.data.fecha_pago).getTime()).toBe(new Date(fecha_pago).getTime());
    });
  });

  describe('GET tax-document (§10)', () => {
    it('una boleta emitida produce la respuesta de referencia', async () => {
      const expected = fixture('tax-document-response.json');
      const prisma = {
        pago: { findUnique: jest.fn().mockResolvedValue({ idPago: 9001, idCliente: 123,
          factura: { contrato: { idEmpresa: 1, cliente: { idCliente: 123, idEmpresa: 1 } } } }) },
        taxPaymentJob: { findUnique: jest.fn().mockResolvedValue({ idEmpresa: 1, estado: 'PROCESADO' }) },
        taxEmissionIntent: { findMany: jest.fn().mockResolvedValue([{ ambiente: 'production', estado: 'GENERADO', tipoDte: 39, folio: '123456',
          fechaEnvio: new Date('2026-10-02T18:20:00Z'), emailEstado: 'ENVIADO', artefactoUrl: expected.data.documento_url, artefactoEstado: 'DISPONIBLE' }]) },
      };
      const service = new G2IntegrationService(prisma as never, {} as never, {} as never, {} as never);
      expect(overHttp(await service.paymentTaxDocument(9001, 1))).toMatchObject(expected);
    });
  });
});
