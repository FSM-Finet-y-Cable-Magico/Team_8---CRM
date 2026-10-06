import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { BillingReadService } from '../billing/billing-read.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { G2ConfirmedPaymentDto, G2InvoiceQueryDto, G2WifiResult, G2WifiResultDto } from './g2-integration.dto';

const WIFI_CATEGORY = 'CAMBIO_CREDENCIALES_WIFI';
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
    return this.billingRead.invoicesForCompany({
      rut,
      idCliente: query.id_cliente,
      idContrato: query.id_contrato,
      search: query.search,
      estado: query.estado,
      page: query.page,
      pageSize: query.page_size,
    }, query.id_empresa);
  }

  invoiceDetail(idFactura: number, idEmpresa: number) {
    return this.billingRead.detailForCompany(idFactura, idEmpresa);
  }

  registerPayment(dto: G2ConfirmedPaymentDto) {
    return this.billing.registerIntegrationPayment({
      idFactura: dto.id_factura,
      monto: dto.monto,
      fechaPago: dto.fecha_pago,
      codigoAutorizacion: dto.codigo_autorizacion.trim(),
      codigoTransaccion: dto.codigo_transaccion.trim(),
      pasarela: dto.pasarela.trim(),
    }, dto.id_empresa);
  }

  async paymentReceipt(idPago: number, idEmpresa: number) {
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

  async registerWifiResult(idTicket: number, dto: G2WifiResultDto) {
    if (idTicket !== dto.id_ticket) throw new BadRequestException('El id_ticket de la ruta no coincide con el payload');
    const technicalResult = dto.resultado_tecnico.trim();
    if (!technicalResult) throw new BadRequestException('El resultado tecnico saneado es obligatorio');
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
      id_ticket: dto.id_ticket,
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
      await tx.$queryRaw`SELECT id_ticket FROM ticket WHERE id_ticket = ${idTicket} FOR UPDATE`;
      const repeated = await tx.integracionResultadoWifiG2.findUnique({ where: { requestId: normalized.request_id } });
      if (repeated) {
        if (repeated.payloadHash !== payloadHash) throw new ConflictException('El request_id WiFi ya fue recibido con un payload diferente');
        return { row: repeated, duplicate: true };
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
        valorAnterior: { estado: ticket.estado },
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
      resultado_tecnico: row.resultadoTecnico,
      estado_ticket: row.estadoTicketResultante,
      fecha_recepcion: row.fechaRecepcion,
      duplicate,
    };
  }
}
