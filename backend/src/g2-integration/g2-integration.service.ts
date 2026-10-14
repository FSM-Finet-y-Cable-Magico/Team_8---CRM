import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { BillingReadService } from '../billing/billing-read.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { validateFacturacionClArtifactUrl } from '../tax-document-issuance/facturacion-cl-artifacts.client';
import { G2ConfirmedPaymentDto, G2InvoiceQueryDto, G2WifiResult, G2WifiResultDto } from './g2-integration.dto';

const WIFI_CATEGORY = 'CAMBIO_CREDENCIALES_WIFI';
// G2 crea los tickets con 'abierto' en minúscula: se compara normalizado.
const OPEN_TICKET_STATES = ['abierto', 'en progreso', 'escalado'];
const G2_PAGE_SIZE = 100;
type InvoiceQuery = Parameters<BillingReadService['invoicesForCompany']>[0];
// G2 valida saldoExigible como número: una factura sin monto no es cobrable.
const withNumericBalance = <T extends { saldoExigible: number | null }>(invoice: T) =>
  ({ ...invoice, saldoExigible: invoice.saldoExigible ?? 0 });
const FORBIDDEN_RESULT = /(?:-----BEGIN[\s\S]*?PRIVATE[ _-]?KEY-----|\b(?:password|passwd|contrasena|contraseña|plaintext|ciphertext)\b|\bprivate[ _-]?key\b|\btoken\s+smart\s*olt\b|\bcredenciales?\s+t[eé]cnicas?\b|\b(?:api[ _-]?key|token|secret)\s*[:=]\s*\S|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/iu;

@Injectable()
export class G2IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingRead: BillingReadService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  invoices(query: G2InvoiceQueryDto) {
    const identifiers = [query.rut, query.id_cliente, query.id_contrato].filter(value => value !== undefined);
    if (identifiers.length !== 1) {
      throw new BadRequestException('Debe indicar exactamente uno de rut, id_cliente o id_contrato');
    }
    let rut: string | undefined;
    if (query.rut !== undefined) {
      const result = validateRut(query.rut);
      if (!result.valid || !result.normalized) throw new BadRequestException(result.reason ?? 'RUT invalido');
      rut = result.normalized;
    }
    const filters = {
      rut,
      idCliente: query.id_cliente,
      idContrato: query.id_contrato,
      search: query.search,
      estado: query.estado,
    };
    // G2 no pagina: sin page ni page_size recibe todas las facturas en una respuesta.
    return query.page === undefined && query.page_size === undefined
      ? this.allInvoices(filters, query.id_empresa)
      : this.invoicePage({ ...filters, page: query.page ?? 1, pageSize: query.page_size ?? 20 }, query.id_empresa);
  }

  private async invoicePage(query: InvoiceQuery, idEmpresa: number) {
    const result = await this.billingRead.invoicesForCompany(query, idEmpresa);
    return { ...result, items: result.items.map(withNumericBalance) };
  }

  private async allInvoices(filters: Omit<InvoiceQuery, 'page' | 'pageSize'>, idEmpresa: number) {
    const first = await this.invoicePage({ ...filters, page: 1, pageSize: G2_PAGE_SIZE }, idEmpresa);
    const items = [...first.items];
    for (let page = 2; page <= first.pagination.totalPages; page++) {
      items.push(...(await this.invoicePage({ ...filters, page, pageSize: G2_PAGE_SIZE }, idEmpresa)).items);
    }
    return { items, pagination: { page: 1, pageSize: items.length, totalRows: items.length, totalPages: 1 } };
  }

  async invoiceDetail(idFactura: number, idEmpresa: number) {
    return withNumericBalance(await this.billingRead.detailForCompany(idFactura, idEmpresa));
  }

  async registerPayment(dto: G2ConfirmedPaymentDto) {
    const result = await this.billing.registerIntegrationPayment({
      idFactura: dto.id_factura,
      monto: dto.monto,
      fechaPago: dto.fecha_pago,
      codigoAutorizacion: dto.codigo_autorizacion.trim(),
      codigoTransaccion: dto.codigo_transaccion.trim(),
      pasarela: dto.pasarela.trim(),
    }, dto.id_empresa);
    // Saldo y estado posteriores al pago salen de la lógica única de Billing.
    const invoice = await this.invoiceDetail(dto.id_factura, dto.id_empresa);
    const { payment } = result;
    // Respuesta complementaria G8 → G2 (02-10-2026, §4); las claves anteriores se conservan.
    return { ...result, success: true, data: {
      id_pago: payment.idPago,
      id_factura: dto.id_factura,
      monto: Number(payment.monto),
      fecha_pago: payment.fechaPago,
      codigo_autorizacion: payment.codigoAutorizacion,
      codigo_transaccion: payment.codigoTransaccion,
      request_id: dto.request_id?.trim() || null,
      duplicado: result.duplicate,
      saldo: invoice.saldo,
      saldo_exigible: invoice.saldoExigible,
      estado_factura: invoice.estadoCalculado,
    } };
  }

  private async paymentInCompany(idPago: number, idEmpresa: number) {
    const payment = await this.prisma.pago.findUnique({
      where: { idPago },
      include: { factura: { include: { contrato: { include: { cliente: true } } } } },
    });
    const contract = payment?.factura?.contrato;
    const customer = contract?.cliente;
    if (!payment || !contract || !customer) throw new NotFoundException('Pago o cliente asociado no encontrado');
    if (contract.idEmpresa !== idEmpresa || customer.idEmpresa !== idEmpresa || payment.idCliente !== customer.idCliente) {
      throw new NotFoundException('Pago o cliente asociado no encontrado');
    }
    return payment;
  }

  async paymentReceipt(idPago: number, idEmpresa: number) {
    const payment = await this.paymentInCompany(idPago, idEmpresa);
    const state = payment.comprobanteEstado;
    if (!['PENDIENTE', 'GENERADO', 'FALLIDO'].includes(state)) throw new BadRequestException('Estado de comprobante invalido');
    let redirectUrl: string | undefined;
    if (state === 'GENERADO') {
      try {
        const url = new URL(payment.comprobantePdfUrl ?? '');
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password
          || host === 'localhost' || host === '::1' || /^127\./.test(host)) throw new Error('unsafe');
        redirectUrl = url.toString();
      } catch {
        throw new BadRequestException('El comprobante generado no tiene una URL HTTPS segura');
      }
    }
    return {
      id_pago: payment.idPago,
      id_cliente: payment.idCliente,
      comprobante_estado: state,
      disponible: state === 'GENERADO',
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    };
  }

  /** Respuesta complementaria G8 → G2 (02-10-2026, §10). Solo lee lo que dejó la emisión tributaria. */
  async paymentTaxDocument(idPago: number, idEmpresa: number) {
    await this.paymentInCompany(idPago, idEmpresa);
    const [job, intents] = await Promise.all([
      this.prisma.taxPaymentJob.findUnique({ where: { idPago }, select: { idEmpresa: true, estado: true } }),
      this.prisma.taxEmissionIntent.findMany({
        where: { idEmpresa, businessKey: `PAYMENT:${idPago}` },
        select: { ambiente: true, estado: true, tipoDte: true, folio: true, fechaEnvio: true,
          emailEstado: true, artefactoUrl: true, artefactoEstado: true },
      }),
    ]);
    // Un documento de sandbox no es una boleta válida: nunca se entrega a G2.
    const issued = intents.find(intent => intent.ambiente === 'production');
    const generated = issued?.estado === 'GENERADO' ? issued : undefined;
    let documentoUrl: string | null = null;
    if (generated?.artefactoEstado === 'DISPONIBLE' && generated.artefactoUrl) {
      try { documentoUrl = validateFacturacionClArtifactUrl(generated.artefactoUrl); } catch { documentoUrl = null; }
    }
    const ownJob = job?.idEmpresa === idEmpresa ? job : undefined;
    const motivo = issued ? null
      : ownJob?.estado === 'DATOS_REQUERIDOS' ? 'DATOS_INCOMPLETOS'
      : ownJob?.estado === 'PENDIENTE' && !intents.length ? null
      : 'EMISION_NO_HABILITADA';
    return { success: true, data: {
      id_pago: idPago,
      estado: issued?.estado ?? 'PENDIENTE',
      motivo,
      tipo_documento: generated ? ([39, 41].includes(generated.tipoDte) ? 'BOLETA' : 'FACTURA') : null,
      folio: generated?.folio ?? null,
      fecha_emision: generated?.fechaEnvio?.toISOString().slice(0, 10) ?? null,
      email_estado: issued?.emailEstado ?? 'PENDIENTE',
      documento_url: documentoUrl,
    } };
  }

  async registerWifiResult(idTicket: number, dto: G2WifiResultDto) {
    if (dto.id_ticket !== undefined && idTicket !== dto.id_ticket) {
      throw new BadRequestException('El id_ticket de la ruta no coincide con el payload');
    }
    const detail = dto.detalle_saneado?.trim(), legacy = dto.resultado_tecnico?.trim();
    if (detail && legacy && detail !== legacy) throw new BadRequestException('detalle_saneado y resultado_tecnico no coinciden');
    const technicalResult = detail || legacy;
    if (!technicalResult) throw new BadRequestException('El detalle saneado es obligatorio');
    if ([technicalResult, dto.request_id, dto.trace_id].some(value => value && FORBIDDEN_RESULT.test(value))) {
      throw new BadRequestException('El resultado tecnico contiene material secreto o credenciales');
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    if (ticket.idEmpresa !== dto.id_empresa) throw new BadRequestException('El ticket no pertenece a la empresa autorizada');
    if (!ticket.idServicio || !ticket.idCliente) throw new BadRequestException('El ticket debe estar asociado a cliente y servicio');
    const [category, service] = await Promise.all([
      this.prisma.categoriaFalla.findUnique({ where: { idCategoria: ticket.idCategoria } }),
      this.prisma.servicioContratado.findUnique({ where: { idServicio: ticket.idServicio } }),
    ]);
    if (!category || category.nombre !== WIFI_CATEGORY) throw new BadRequestException(`El ticket debe usar la categoria ${WIFI_CATEGORY}`);
    if (!service || service.idEmpresa !== dto.id_empresa || service.idCliente !== ticket.idCliente) {
      throw new BadRequestException('El servicio del ticket no pertenece al cliente y empresa autorizados');
    }
    if (dto.id_servicio !== undefined && dto.id_servicio !== ticket.idServicio) {
      throw new BadRequestException('El id_servicio no coincide con el servicio asociado al ticket');
    }

    const applied = dto.resultado === 'APLICADO';
    const normalized = {
      id_ticket: idTicket,
      id_empresa: dto.id_empresa,
      id_servicio: dto.id_servicio ?? null,
      resultado_tecnico: technicalResult,
      resultado: dto.resultado,
      request_id: dto.request_id.trim(),
      trace_id: dto.trace_id?.trim() || null,
    };
    const payloadHash = createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
    const existing = await this.prisma.integracionResultadoWifiG2.findUnique({ where: { requestId: normalized.request_id } });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new ConflictException('El request_id WiFi ya fue recibido con un payload diferente');
      return this.presentWifiResult(existing, true, dto.resultado);
    }

    const resultingState = applied ? 'Resuelto' : 'Escalado';
    const created = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ estado: string }>>`SELECT id_ticket, estado FROM ticket WHERE id_ticket = ${idTicket} FOR UPDATE`;
      const repeated = await tx.integracionResultadoWifiG2.findUnique({ where: { requestId: normalized.request_id } });
      if (repeated) {
        if (repeated.payloadHash !== payloadHash) throw new ConflictException('El request_id WiFi ya fue recibido con un payload diferente');
        return { row: repeated, duplicate: true };
      }
      if (!OPEN_TICKET_STATES.includes(locked?.estado?.trim().toLowerCase() ?? '')) {
        throw new ConflictException('El ticket ya está resuelto o cerrado y no admite un resultado WiFi');
      }
      await tx.ticket.update({ where: { idTicket }, data: { estado: resultingState, fechaCierre: applied ? new Date() : null } });
      const row = await tx.integracionResultadoWifiG2.create({
        data: {
          requestId: normalized.request_id,
          traceId: normalized.trace_id,
          idEmpresa: dto.id_empresa,
          idTicket,
          payloadHash,
          exito: applied,
          resultadoTecnico: technicalResult,
          estadoTicketResultante: resultingState,
        },
      });
      await this.audit.record({
        accion: 'RECIBIR_RESULTADO_WIFI_G2',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorAnterior: { estado: locked.estado },
        valorNuevo: {
          idEmpresa: dto.id_empresa,
          requestId: normalized.request_id,
          traceId: normalized.trace_id,
          estado: resultingState,
          resultado: dto.resultado,
          idServicio: ticket.idServicio,
          payloadHash,
        },
      }, tx);
      return { row, duplicate: false };
    });
    return this.presentWifiResult(created.row, created.duplicate, dto.resultado);
  }

  private presentWifiResult(row: {
    idResultado: bigint;
    requestId: string;
    traceId: string | null;
    idEmpresa: number;
    idTicket: number;
    exito: boolean;
    resultadoTecnico: string;
    estadoTicketResultante: string;
    fechaRecepcion: Date;
  }, duplicate: boolean, resultado: G2WifiResult) {
    return {
      id_resultado: row.idResultado.toString(),
      request_id: row.requestId,
      trace_id: row.traceId,
      id_empresa: row.idEmpresa,
      id_ticket: row.idTicket,
      resultado,
      exito: row.exito,
      detalle_saneado: row.resultadoTecnico,
      resultado_tecnico: row.resultadoTecnico,
      estado_ticket: row.estadoTicketResultante,
      fecha_recepcion: row.fechaRecepcion,
      duplicate,
    };
  }
}
