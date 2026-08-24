import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialControlQueryDto } from './dto/commercial-control-query.dto';
import { CreateCommercialEventDto } from './dto/create-commercial-event.dto';
import { CommercialState } from './commercial-control.types';

const CLOSED_INVOICE_STATES = ['Pagada', 'Anulada'];
const MOROSITY_DEFAULT_DAYS = 5;

const invoiceInclude = Prisma.validator<Prisma.FacturaInclude>()({
  pagos: true,
  contrato: {
    include: {
      cliente: {
        include: {
          empresa: true,
          direcciones: {
            orderBy: [{ esPrincipal: 'desc' }, { idDireccion: 'asc' }],
            take: 3,
          },
        },
      },
      plan: true,
      zonaPago: true,
      servicios: {
        include: {
          direccion: true,
          zonaPago: true,
        },
        orderBy: { idServicio: 'asc' },
      },
    },
  },
});

type InvoiceRow = Prisma.FacturaGetPayload<{ include: typeof invoiceInclude }>;
type CommercialEvent = Prisma.EventoGestionComercialGetPayload<Record<string, never>>;

@Injectable()
export class CommercialControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async list(query: CommercialControlQueryDto, currentUser: AuthUser) {
    const companyFilter = this.companyScope(currentUser, query.scope ?? 'consolidado', query.empresaId);
    const [periodoAnio, periodoMes] = this.parsePeriod(query.periodo);
    const invoices = await this.prisma.factura.findMany({
      where: {
        ...(periodoAnio && periodoMes ? { periodoAnio, periodoMes } : {}),
        ...(companyFilter.idEmpresa || query.zonaPagoId
          ? {
              contrato: {
                is: {
                  ...(companyFilter.idEmpresa ? { idEmpresa: companyFilter.idEmpresa } : {}),
                  ...(query.zonaPagoId
                    ? {
                        OR: [
                          { idZonaPago: query.zonaPagoId },
                          { servicios: { some: { idZonaPago: query.zonaPagoId } } },
                        ],
                      }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: invoiceInclude,
      orderBy: [{ fechaLimitePago: 'asc' }, { idFactura: 'asc' }],
      take: 500,
    });

    const validInvoices = invoices.filter((invoice) => invoice.contrato?.cliente);
    if (!validInvoices.length) {
      return [];
    }

    const events = await this.findRelatedEvents(validInvoices, companyFilter.idEmpresa);
    const users = await this.findEventUsers(events);
    const search = query.search?.trim().toLowerCase();

    return validInvoices
      .map((invoice) => this.toCommercialControlRow(invoice, events, users))
      .filter((row) => {
        if (search) {
          const text = [row.clienteNombre, row.rut, row.telefono]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!text.includes(search)) {
            return false;
          }
        }

        if (query.estadoComercial && row.estadoComercial !== query.estadoComercial) {
          return false;
        }

        if (query.vencidosOnly && !(row.saldoPendiente > 0 && row.diasAtraso > 0)) {
          return false;
        }

        if (query.responsableId && row.ultimoEventoResponsableId !== query.responsableId) {
          return false;
        }

        return true;
      });
  }

  async createEvent(dto: CreateCommercialEventDto, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente: dto.idCliente },
      include: {
        contratos: { select: { idContrato: true, idEmpresa: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    this.assertCustomerAccess(customer, currentUser);

    let idEmpresa = customer.idEmpresa ?? currentUser.idEmpresa ?? null;

    if (dto.idContrato) {
      const contract = await this.prisma.contrato.findUnique({
        where: { idContrato: dto.idContrato },
        select: { idContrato: true, idCliente: true, idEmpresa: true },
      });
      if (!contract || contract.idCliente !== dto.idCliente) {
        throw new BadRequestException('El contrato no pertenece al cliente informado');
      }
      this.assertCompanyAccess(contract.idEmpresa, currentUser);
      idEmpresa = contract.idEmpresa ?? idEmpresa;
    }

    if (dto.idFactura) {
      const invoice = await this.prisma.factura.findUnique({
        where: { idFactura: dto.idFactura },
        include: { contrato: { select: { idContrato: true, idCliente: true, idEmpresa: true } } },
      });
      if (!invoice?.contrato || invoice.contrato.idCliente !== dto.idCliente) {
        throw new BadRequestException('La factura no pertenece al cliente informado');
      }
      if (dto.idContrato && invoice.contrato.idContrato !== dto.idContrato) {
        throw new BadRequestException('La factura no pertenece al contrato informado');
      }
      this.assertCompanyAccess(invoice.contrato.idEmpresa, currentUser);
      idEmpresa = invoice.contrato.idEmpresa ?? idEmpresa;
    }

    if (dto.idServicio) {
      const service = await this.prisma.servicioContratado.findUnique({
        where: { idServicio: dto.idServicio },
        select: { idServicio: true, idCliente: true, idContrato: true, idEmpresa: true },
      });
      if (!service || service.idCliente !== dto.idCliente) {
        throw new BadRequestException('El servicio no pertenece al cliente informado');
      }
      if (dto.idContrato && service.idContrato && service.idContrato !== dto.idContrato) {
        throw new BadRequestException('El servicio no pertenece al contrato informado');
      }
      this.assertCompanyAccess(service.idEmpresa, currentUser);
      idEmpresa = service.idEmpresa ?? idEmpresa;
    }

    if (dto.idPago) {
      const payment = await this.prisma.pago.findUnique({
        where: { idPago: dto.idPago },
        include: { factura: { include: { contrato: { select: { idCliente: true, idEmpresa: true } } } } },
      });
      const paymentCustomerId = payment?.idCliente ?? payment?.factura?.contrato?.idCliente ?? null;
      if (!payment || paymentCustomerId !== dto.idCliente) {
        throw new BadRequestException('El pago no pertenece al cliente informado');
      }
      this.assertCompanyAccess(payment.factura?.contrato?.idEmpresa ?? idEmpresa, currentUser);
    }

    const created = await this.prisma.eventoGestionComercial.create({
      data: {
        idCliente: dto.idCliente,
        idContrato: dto.idContrato,
        idFactura: dto.idFactura,
        idPago: dto.idPago,
        idServicio: dto.idServicio,
        idUsuario: currentUser.idUsuario,
        idEmpresa,
        tipoEvento: dto.tipoEvento,
        canal: dto.canal,
        estado: dto.estado,
        mensajeGenerado: dto.mensajeGenerado?.trim() || undefined,
        respuestaCliente: dto.respuestaCliente?.trim() || undefined,
        observacion: dto.observacion?.trim() || undefined,
        montoRelacionado: dto.montoRelacionado,
        fechaCompromiso: dto.fechaCompromiso ? parseDateOnly(dto.fechaCompromiso) : undefined,
        metadataJson: dto.metadataJson === undefined ? undefined : (dto.metadataJson as Prisma.InputJsonValue),
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_EVENTO_GESTION_COMERCIAL',
      entidadAfectada: 'evento_gestion_comercial',
      idEntidadAfectada: Number(created.idEvento),
      valorNuevo: {
        idEvento: created.idEvento.toString(),
        idCliente: created.idCliente,
        idContrato: created.idContrato,
        idFactura: created.idFactura,
        idServicio: created.idServicio,
        tipoEvento: created.tipoEvento,
        canal: created.canal,
        estado: created.estado,
      },
    });

    return this.serializeEvent(created);
  }

  private toCommercialControlRow(
    invoice: InvoiceRow,
    events: CommercialEvent[],
    users: Map<number, string>,
  ) {
    const contract = invoice.contrato;
    const customer = contract?.cliente;

    if (!contract || !customer) {
      throw new Error('Factura sin cliente o contrato asociado');
    }

    const service = this.primaryService(invoice);
    const rowEvents = this.eventsForInvoice(invoice, events);
    const activeEvents = rowEvents.filter((event) => event.estado !== 'ANULADO');
    const latestEvent = rowEvents[0] ?? null;
    const invoiceAmount = Number(invoice.monto ?? 0);
    const paid = this.paidAmount(invoice.pagos);
    const balance = Math.max(0, invoiceAmount - paid);
    const daysLate = invoice.fechaLimitePago < this.todayDate()
      ? this.daysBetween(invoice.fechaLimitePago, this.todayDate())
      : 0;
    const state = this.calculateCommercialState(invoice, balance, daysLate, activeEvents);
    const avisoPago = this.latestEventDate(activeEvents, ['AVISO_PAGO']);
    const avisoCorte = this.latestEventDate(activeEvents, ['AVISO_CORTE']);
    const avisoRetiro = this.latestEventDate(activeEvents, ['AVISO_RETIRO', 'RETIRO_SOLICITADO']);

    return {
      idCliente: customer.idCliente,
      idContrato: contract.idContrato,
      idFactura: invoice.idFactura,
      idServicio: service?.idServicio ?? null,
      clienteNombre: customer.nombreCompleto,
      rut: customer.rut,
      telefono: customer.telefono,
      email: customer.email,
      empresa: customer.empresa?.nombre ?? null,
      plan: contract.plan?.nombreComercial ?? null,
      zonaPago: contract.zonaPago?.nombreZona ?? service?.zonaPago?.nombreZona ?? null,
      direccionServicio: service?.direccion?.direccionCompleta ?? customer.direcciones[0]?.direccionCompleta ?? null,
      periodo: `${invoice.periodoAnio}-${String(invoice.periodoMes).padStart(2, '0')}`,
      montoFacturado: invoiceAmount,
      montoPagado: paid,
      saldoPendiente: balance,
      fechaEmision: this.formatDateOnly(invoice.fechaEmision),
      fechaVencimiento: this.formatDateOnly(invoice.fechaLimitePago),
      diasAtraso: daysLate,
      estadoFactura: invoice.estado,
      estadoCliente: customer.estado,
      estadoContrato: contract.estado,
      estadoServicio: service?.estadoOperativo ?? null,
      estadoComercial: state,
      ultimoEventoTipo: latestEvent?.tipoEvento ?? null,
      ultimoEventoFecha: latestEvent ? latestEvent.fechaEvento.toISOString() : null,
      ultimoEventoResponsable: latestEvent?.idUsuario ? users.get(latestEvent.idUsuario) ?? null : null,
      ultimoEventoResponsableId: latestEvent?.idUsuario ?? null,
      fechaAvisoPago: avisoPago,
      fechaAvisoCorte: avisoCorte,
      fechaAvisoRetiro: avisoRetiro,
      puedeEnviarAvisoPago: balance > 0 && !avisoPago && state !== 'CORTADO' && state !== 'RETIRADO',
      puedeEnviarAvisoCorte: balance > 0 && daysLate >= this.morosityDays() && !avisoCorte && state !== 'RETIRADO',
      puedeRegistrarRetiro: balance > 0 && ['MOROSO', 'AVISO_CORTE_ENVIADO', 'CORTADO'].includes(state),
      puedeRegistrarPago: balance > 0,
      accionSugerida: this.suggestAction(state, balance),
    };
  }

  private calculateCommercialState(
    invoice: InvoiceRow,
    balance: number,
    daysLate: number,
    events: CommercialEvent[],
  ): CommercialState {
    if (this.hasEvent(events, 'RETIRO_REGISTRADO')) {
      return 'RETIRADO';
    }
    if (this.hasEvent(events, 'RETIRO_SOLICITADO') || this.hasEvent(events, 'AVISO_RETIRO')) {
      return 'RETIRO_PROGRAMADO';
    }
    if (this.hasEvent(events, 'CORTE_REGISTRADO')) {
      return 'CORTADO';
    }
    if (this.hasEvent(events, 'PRORROGA_REGISTRADA')) {
      return 'PRORROGA';
    }
    if (this.hasEvent(events, 'CONVENIO_REGISTRADO')) {
      return 'CONVENIO';
    }
    if (this.hasEvent(events, 'AVISO_CORTE')) {
      return 'AVISO_CORTE_ENVIADO';
    }
    if (this.hasEvent(events, 'AVISO_PAGO')) {
      return 'AVISO_PAGO_ENVIADO';
    }
    if (this.hasEvent(events, 'REACTIVACION_REGISTRADA')) {
      return 'REACTIVACION_PENDIENTE';
    }
    if (balance <= 0) {
      return invoice.estado === 'Pagada' || this.hasEvent(events, 'PAGO_REGISTRADO') ? 'REGULARIZADO' : 'AL_DIA';
    }
    if (daysLate <= 0) {
      return 'POR_VENCER';
    }

    return daysLate >= this.morosityDays() ? 'MOROSO' : 'VENCIDO';
  }

  private async findRelatedEvents(invoices: InvoiceRow[], idEmpresa?: number) {
    const customerIds = [...new Set(invoices.map((invoice) => invoice.contrato?.cliente?.idCliente).filter(Boolean) as number[])];
    const contractIds = [...new Set(invoices.map((invoice) => invoice.contrato?.idContrato).filter(Boolean) as number[])];
    const invoiceIds = [...new Set(invoices.map((invoice) => invoice.idFactura))];
    const serviceIds = [
      ...new Set(
        invoices
          .flatMap((invoice) => invoice.contrato?.servicios.map((service) => service.idServicio) ?? [])
          .filter(Boolean),
      ),
    ];

    return this.prisma.eventoGestionComercial.findMany({
      where: {
        ...(idEmpresa ? { idEmpresa } : {}),
        OR: [
          { idCliente: { in: customerIds } },
          { idContrato: { in: contractIds } },
          { idFactura: { in: invoiceIds } },
          { idServicio: { in: serviceIds } },
        ],
      },
      orderBy: [{ fechaEvento: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  private async findEventUsers(events: CommercialEvent[]) {
    const userIds = [...new Set(events.map((event) => event.idUsuario).filter(Boolean) as number[])];

    if (!userIds.length) {
      return new Map<number, string>();
    }

    const users = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: userIds } },
      select: { idUsuario: true, nombreCompleto: true },
    });

    return new Map(users.map((user) => [user.idUsuario, user.nombreCompleto]));
  }

  private eventsForInvoice(invoice: InvoiceRow, events: CommercialEvent[]) {
    const serviceIds = invoice.contrato?.servicios.map((service) => service.idServicio) ?? [];
    const contractId = invoice.contrato?.idContrato ?? null;
    const customerId = invoice.contrato?.cliente?.idCliente ?? null;

    return events.filter((event) => (
      event.idFactura === invoice.idFactura ||
      (event.idFactura === null && event.idContrato === contractId) ||
      (event.idFactura === null && event.idServicio !== null && serviceIds.includes(event.idServicio)) ||
      (
        event.idFactura === null &&
        event.idContrato === null &&
        event.idServicio === null &&
        event.idCliente === customerId
      )
    ));
  }

  private primaryService(invoice: InvoiceRow) {
    const services = invoice.contrato?.servicios ?? [];

    return services.find((service) => service.idContrato === invoice.idContrato) ?? services[0] ?? null;
  }

  private latestEventDate(events: CommercialEvent[], types: string[]) {
    return events.find((event) => types.includes(event.tipoEvento))?.fechaEvento.toISOString() ?? null;
  }

  private hasEvent(events: CommercialEvent[], type: string) {
    return events.some((event) => event.tipoEvento === type);
  }

  private suggestAction(state: CommercialState, balance: number) {
    if (balance <= 0) {
      return state === 'REACTIVACION_PENDIENTE' ? 'Revisar reactivacion' : 'Sin accion pendiente';
    }

    const suggestions: Record<CommercialState, string> = {
      AL_DIA: 'Sin accion pendiente',
      POR_VENCER: 'Monitorear vencimiento',
      VENCIDO: 'Registrar aviso de pago',
      MOROSO: 'Registrar aviso de corte',
      AVISO_PAGO_ENVIADO: 'Esperar respuesta o registrar aviso de corte',
      AVISO_CORTE_ENVIADO: 'Registrar respuesta o corte',
      CORTE_PROGRAMADO: 'Dar seguimiento a corte',
      CORTADO: 'Registrar pago o retiro',
      RETIRO_PROGRAMADO: 'Registrar retiro',
      RETIRADO: 'Sin accion pendiente',
      CONVENIO: 'Dar seguimiento al convenio',
      PRORROGA: 'Dar seguimiento a la prorroga',
      REACTIVACION_PENDIENTE: 'Revisar reactivacion',
      REGULARIZADO: 'Sin accion pendiente',
    };

    return suggestions[state];
  }

  private paidAmount(payments: Array<{ monto: Prisma.Decimal }>) {
    return payments.reduce((total, payment) => total + Number(payment.monto), 0);
  }

  private parsePeriod(period?: string): [number | null, number | null] {
    if (!period) {
      return [null, null];
    }

    const [year, month] = period.split('-').map(Number);
    return [year, month];
  }

  private todayDate() {
    const today = todayDateOnly();
    const parsed = parseDateOnly(today);

    if (!parsed) {
      throw new BadRequestException('No se pudo resolver la fecha actual');
    }

    return parsed;
  }

  private daysBetween(from: Date, to: Date) {
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  }

  private morosityDays() {
    const value = Number(this.configService.get('BILLING_CUT_DAYS') ?? MOROSITY_DEFAULT_DAYS);
    return Number.isInteger(value) && value > 0 ? value : MOROSITY_DEFAULT_DAYS;
  }

  private formatDateOnly(date?: Date | null) {
    return date ? date.toISOString().slice(0, 10) : null;
  }

  private serializeEvent(event: CommercialEvent) {
    return {
      ...event,
      idEvento: event.idEvento.toString(),
      montoRelacionado: event.montoRelacionado === null ? null : Number(event.montoRelacionado),
    };
  }

  private companyScope(currentUser: AuthUser, scope: string, empresaId?: number): { idEmpresa?: number } {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

    if (empresaId) {
      return { idEmpresa: empresaId };
    }

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }

  private assertCustomerAccess(
    customer: { idEmpresa: number | null; contratos: Array<{ idEmpresa: number | null }> },
    currentUser: AuthUser,
  ) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (
      !currentUser.idEmpresa ||
      (customer.idEmpresa !== currentUser.idEmpresa &&
        !customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa))
    ) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }
  }

  private assertCompanyAccess(idEmpresa: number | null | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }
}
