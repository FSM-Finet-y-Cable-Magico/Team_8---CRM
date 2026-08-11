import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentZoneDto } from './dto/create-payment-zone.dto';
import { CreateZoneRuleDto } from './dto/create-zone-rule.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { SendBillingNotificationDto } from './dto/send-billing-notification.dto';
import { UpdatePaymentZoneDto } from './dto/update-payment-zone.dto';

const CLOSED_INVOICE_STATES = ['Pagada', 'Anulada'];

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async overview(currentUser: AuthUser, scope = 'consolidado') {
    const rows = await this.overdueInvoiceRows(currentUser, scope);
    const cutDays = this.cutDays();
    const scheduledCuts = rows.filter((row) => row.diasAtraso >= cutDays);
    const companyFilter = this.companyScope(currentUser, scope);
    const notificationCustomerIds = companyFilter.idEmpresa
      ? await this.prisma.cliente.findMany({
          where: {
            OR: [
              { idEmpresa: companyFilter.idEmpresa },
              { contratos: { some: { idEmpresa: companyFilter.idEmpresa } } },
            ],
          },
          select: { idCliente: true },
        })
      : [];
    const notifications = await this.prisma.logNotificacion.findMany({
      where: companyFilter.idEmpresa
        ? { idCliente: { in: notificationCustomerIds.map((customer) => customer.idCliente) } }
        : {},
      orderBy: { fechaEnvio: 'desc' },
      take: 50,
    });

    return {
      fechaCorteCalculo: todayDateOnly(),
      reglaCorteDias: cutDays,
      modoNotificacion: this.notificationMode(),
      metricas: {
        clientesMorosos: new Set(rows.map((row) => row.cliente.idCliente)).size,
        facturasVencidas: rows.length,
        clientesProgramadosCorte: new Set(scheduledCuts.map((row) => row.cliente.idCliente)).size,
      },
      morosos: rows,
      cortesProgramados: scheduledCuts,
      notificaciones: notifications.map((row) => ({
        ...row,
        idNotificacion: row.idNotificacion.toString(),
      })),
    };
  }

  async refreshDelinquency(currentUser: AuthUser, scope = 'consolidado') {
    const rows = await this.overdueInvoiceRows(currentUser, scope);
    const customerIds = [...new Set(rows.map((row) => row.cliente.idCliente))];
    const contractIds = [...new Set(rows.map((row) => row.contrato.idContrato))];

    if (!customerIds.length) {
      return { updatedCustomers: 0, updatedContracts: 0 };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const customers = await tx.cliente.updateMany({
        where: {
          idCliente: { in: customerIds },
          estado: { notIn: ['Baja', 'Suspendido'] },
        },
        data: { estado: 'Moroso' },
      });
      const contracts = await tx.contrato.updateMany({
        where: {
          idContrato: { in: contractIds },
          estado: { notIn: ['Baja', 'Suspendido'] },
        },
        data: { estado: 'Moroso' },
      });

      return { customers, contracts };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ETIQUETAR_CLIENTE_MOROSO',
      entidadAfectada: 'cliente',
      valorNuevo: {
        scope,
        clientes: customerIds,
        contratos: contractIds,
        facturasVencidas: rows.map((row) => row.idFactura),
      },
    });

    return {
      updatedCustomers: result.customers.count,
      updatedContracts: result.contracts.count,
    };
  }

  async sendNotification(dto: SendBillingNotificationDto, currentUser: AuthUser) {
    const customer = await this.getCustomerOrThrow(dto.idCliente, currentUser);
    const template = await this.notificationTemplate(dto.tipo);
    const status = this.notificationMode() === 'disabled' ? 'Desactivado' : 'Simulado';
    const notification = await this.prisma.logNotificacion.create({
      data: {
        idCliente: customer.idCliente,
        idPlantilla: template.idPlantilla,
        canal: template.canal,
        fechaEnvio: new Date(),
        estadoEnvio: status,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: dto.tipo === 'Preventiva' ? 'ENVIAR_AVISO_COBRO_PREVENTIVO' : 'ENVIAR_ULTIMO_AVISO_CORTE',
      entidadAfectada: 'log_notificacion',
      idEntidadAfectada: Number(notification.idNotificacion),
      valorNuevo: {
        idCliente: customer.idCliente,
        idFactura: dto.idFactura,
        tipo: dto.tipo,
        modo: this.notificationMode(),
        estadoEnvio: status,
      },
    });

    return {
      ...notification,
      idNotificacion: notification.idNotificacion.toString(),
      plantilla: template,
    };
  }

  async suspendContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.prisma.contrato.findUnique({
      where: { idContrato },
      include: {
        cliente: true,
        facturas: { include: { pagos: true } },
      },
    });

    if (!contract || !contract.cliente) {
      throw new NotFoundException('Contrato no encontrado');
    }

    this.assertCompanyAccess(contract.idEmpresa, currentUser);

    const overdue = contract.facturas.some(
      (invoice) =>
        invoice.fechaLimitePago < this.todayDate() &&
        !CLOSED_INVOICE_STATES.includes(invoice.estado) &&
        !this.isInvoicePaid(invoice),
    );

    if (!overdue) {
      throw new BadRequestException('No existen facturas vencidas impagas para suspender el servicio');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedContract = await tx.contrato.update({
        where: { idContrato },
        data: {
          estado: 'Suspendido',
          fechaSuspension: this.todayDate(),
        },
      });

      await tx.cliente.update({
        where: { idCliente: contract.cliente?.idCliente ?? 0 },
        data: { estado: 'Suspendido' },
      });

      await tx.servicioContratado.updateMany({
        where: { idContrato },
        data: { estadoOperativo: 'Suspendido' },
      });

      return updatedContract;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'SUSPENDER_SERVICIO_NO_PAGO',
      entidadAfectada: 'contrato',
      idEntidadAfectada: idContrato,
      valorAnterior: { estado: contract.estado },
      valorNuevo: {
        estado: 'Suspendido',
        idCliente: contract.cliente.idCliente,
        facturasVencidas: contract.facturas.map((invoice) => invoice.idFactura),
      },
    });

    return result;
  }

  async registerPayment(dto: RegisterPaymentDto, currentUser: AuthUser) {
    const invoice = await this.prisma.factura.findUnique({
      where: { idFactura: dto.idFactura },
      include: {
        pagos: true,
        contrato: {
          include: {
            cliente: true,
          },
        },
      },
    });

    if (!invoice || !invoice.contrato || !invoice.contrato.cliente) {
      throw new NotFoundException('Factura no encontrada');
    }

    this.assertCompanyAccess(invoice.contrato.idEmpresa, currentUser);

    if (CLOSED_INVOICE_STATES.includes(invoice.estado)) {
      throw new BadRequestException('La factura ya se encuentra cerrada y no acepta pagos adicionales');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.pago.create({
        data: {
          idFactura: invoice.idFactura,
          idCliente: invoice.contrato?.cliente?.idCliente,
          monto: dto.monto,
          fechaPago: new Date(),
          codigoTransaccion: dto.codigoTransaccion?.trim() || undefined,
          pasarela: dto.pasarela.trim(),
          comprobantePdfUrl: dto.comprobantePdfUrl?.trim() || undefined,
        },
      });
      const totalPaid = this.paidAmount(invoice.pagos) + dto.monto;
      const invoiceAmount = Number(invoice.monto ?? 0);
      const paidInFull = invoiceAmount > 0 && totalPaid >= invoiceAmount;

      if (paidInFull) {
        await tx.factura.update({
          where: { idFactura: invoice.idFactura },
          data: { estado: 'Pagada' },
        });

        const pendingOverdue = await tx.factura.findFirst({
          where: {
            idContrato: invoice.idContrato,
            idFactura: { not: invoice.idFactura },
            estado: { notIn: CLOSED_INVOICE_STATES },
            fechaLimitePago: { lt: this.todayDate() },
          },
        });

        if (!pendingOverdue) {
          await tx.contrato.update({
            where: { idContrato: invoice.contrato?.idContrato ?? 0 },
            data: { estado: 'Activo', fechaSuspension: null },
          });
          await tx.cliente.update({
            where: { idCliente: invoice.contrato?.cliente?.idCliente ?? 0 },
            data: { estado: 'Activo' },
          });
          await tx.servicioContratado.updateMany({
            where: { idContrato: invoice.contrato?.idContrato },
            data: { estadoOperativo: 'Activo' },
          });
        }
      }

      return { payment, paidInFull };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_PAGO_SOLO_LECTURA',
      entidadAfectada: 'pago',
      idEntidadAfectada: result.payment.idPago,
      valorNuevo: {
        idFactura: invoice.idFactura,
        idCliente: invoice.contrato.cliente.idCliente,
        monto: dto.monto,
        pagadaCompleta: result.paidInFull,
      },
    });

    return result;
  }

  zones(currentUser: AuthUser, scope = 'consolidado') {
    return this.prisma.zonaPago.findMany({
      where: this.companyScope(currentUser, scope),
      include: {
        empresa: true,
        precios: {
          include: { plan: true },
          orderBy: { idPlanZonaPrecio: 'desc' },
          take: 20,
        },
      },
      orderBy: { nombreZona: 'asc' },
    });
  }

  async createZone(dto: CreatePaymentZoneDto, currentUser: AuthUser) {
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const created = await this.prisma.zonaPago.create({
      data: {
        idEmpresa,
        nombreZona: dto.nombreZona.trim(),
        comuna: dto.comuna?.trim() || null,
        descripcion: dto.descripcion?.trim() || null,
        diaVencimientoSugerido: dto.diaVencimientoSugerido,
        activo: dto.activo ?? true,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_ZONA_PAGO',
      entidadAfectada: 'zona_pago',
      idEntidadAfectada: created.idZonaPago,
      valorNuevo: {
        idEmpresa,
        nombreZona: created.nombreZona,
        diaVencimientoSugerido: created.diaVencimientoSugerido,
      },
    });

    return created;
  }

  async updateZone(idZonaPago: number, dto: UpdatePaymentZoneDto, currentUser: AuthUser) {
    const zone = await this.getZoneOrThrow(idZonaPago, currentUser);
    const updated = await this.prisma.zonaPago.update({
      where: { idZonaPago },
      data: {
        nombreZona: dto.nombreZona === undefined ? undefined : dto.nombreZona.trim(),
        comuna: dto.comuna === undefined ? undefined : dto.comuna.trim() || null,
        descripcion: dto.descripcion === undefined ? undefined : dto.descripcion.trim() || null,
        diaVencimientoSugerido: dto.diaVencimientoSugerido,
        activo: dto.activo,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ZONA_PAGO',
      entidadAfectada: 'zona_pago',
      idEntidadAfectada: idZonaPago,
      valorAnterior: {
        nombreZona: zone.nombreZona,
        comuna: zone.comuna,
        diaVencimientoSugerido: zone.diaVencimientoSugerido,
        activo: zone.activo,
      },
      valorNuevo: {
        nombreZona: updated.nombreZona,
        comuna: updated.comuna,
        diaVencimientoSugerido: updated.diaVencimientoSugerido,
        activo: updated.activo,
      },
    });

    return updated;
  }

  zoneRules(currentUser: AuthUser, scope = 'consolidado') {
    const companyFilter = this.companyScope(currentUser, scope);

    return this.prisma.planZonaPrecio.findMany({
      where: companyFilter.idEmpresa
        ? { zonaPago: { is: { idEmpresa: companyFilter.idEmpresa } } }
        : {},
      include: {
        plan: { include: { empresa: true } },
        zonaPago: { include: { empresa: true } },
      },
      orderBy: { idPlanZonaPrecio: 'desc' },
      take: 150,
    });
  }

  async createZoneRule(dto: CreateZoneRuleDto, currentUser: AuthUser) {
    const [plan, zone] = await Promise.all([
      this.prisma.plan.findUnique({ where: { idPlan: dto.idPlan } }),
      this.prisma.zonaPago.findUnique({ where: { idZonaPago: dto.idZonaPago } }),
    ]);

    if (!plan || !zone) {
      throw new BadRequestException('Plan o zona de pago inexistente');
    }

    this.assertCompanyAccess(plan.idEmpresa, currentUser);
    this.assertCompanyAccess(zone.idEmpresa, currentUser);

    if (plan.idEmpresa && zone.idEmpresa && plan.idEmpresa !== zone.idEmpresa) {
      throw new BadRequestException('El plan y la zona pertenecen a empresas distintas');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.activo !== false) {
        await tx.planZonaPrecio.updateMany({
          where: { idPlan: dto.idPlan, idZonaPago: dto.idZonaPago, activo: true },
          data: { activo: false },
        });
      }

      return tx.planZonaPrecio.create({
        data: {
          idPlan: dto.idPlan,
          idZonaPago: dto.idZonaPago,
          precioMensual: dto.precioMensual,
          valorInstalacion: dto.valorInstalacion,
          activo: dto.activo ?? true,
        },
        include: { plan: true, zonaPago: true },
      });
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_REGLA_PRECIO_ZONA',
      entidadAfectada: 'plan_zona_precio',
      idEntidadAfectada: created.idPlanZonaPrecio,
      valorNuevo: {
        idPlan: created.idPlan,
        idZonaPago: created.idZonaPago,
        precioMensual: Number(created.precioMensual),
        valorInstalacion: created.valorInstalacion ? Number(created.valorInstalacion) : null,
      },
    });

    return created;
  }

  private async overdueInvoiceRows(currentUser: AuthUser, scope: string) {
    const companyFilter = this.companyScope(currentUser, scope);
    const invoices = await this.prisma.factura.findMany({
      where: {
        estado: { notIn: CLOSED_INVOICE_STATES },
        fechaLimitePago: { lt: this.todayDate() },
        ...(companyFilter.idEmpresa
          ? { contrato: { is: { idEmpresa: companyFilter.idEmpresa } } }
          : {}),
      },
      include: {
        pagos: true,
        contrato: {
          include: {
            cliente: { include: { empresa: true } },
            plan: true,
          },
        },
      },
      orderBy: { fechaLimitePago: 'asc' },
      take: 150,
    });

    return invoices
      .filter((invoice) => invoice.contrato?.cliente && !this.isInvoicePaid(invoice))
      .map((invoice) => {
        const cliente = invoice.contrato?.cliente;
        const contrato = invoice.contrato;

        if (!cliente || !contrato) {
          throw new Error('Factura sin cliente o contrato asociado');
        }

        return {
          idFactura: invoice.idFactura,
          idContrato: contrato.idContrato,
          monto: Number(invoice.monto ?? 0),
          pagado: this.paidAmount(invoice.pagos),
          saldo: Math.max(0, Number(invoice.monto ?? 0) - this.paidAmount(invoice.pagos)),
          fechaLimitePago: invoice.fechaLimitePago.toISOString().slice(0, 10),
          diasAtraso: this.daysBetween(invoice.fechaLimitePago, this.todayDate()),
          estadoFactura: invoice.estado,
          cliente: {
            idCliente: cliente.idCliente,
            rut: cliente.rut,
            nombreCompleto: cliente.nombreCompleto,
            telefono: cliente.telefono,
            email: cliente.email,
            estado: cliente.estado,
            empresa: cliente.empresa?.nombre ?? null,
          },
          contrato: {
            idContrato: contrato.idContrato,
            estado: contrato.estado,
            plan: contrato.plan?.nombreComercial ?? null,
          },
        };
      });
  }

  private async notificationTemplate(type: SendBillingNotificationDto['tipo']) {
    const tipoEvento = type === 'Preventiva' ? 'COBRO_PREVENTIVO' : 'ULTIMO_AVISO_CORTE';
    const existing = await this.prisma.plantillaNotificacion.findFirst({
      where: { tipoEvento, canal: 'Sistema', activa: true },
      orderBy: { idPlantilla: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.plantillaNotificacion.create({
      data: {
        tipoEvento,
        canal: 'Sistema',
        contenidoTexto:
          type === 'Preventiva'
            ? 'Aviso preventivo de cobranza registrado por CRM.'
            : 'Ultimo aviso previo al corte registrado por CRM.',
        activa: true,
      },
    });
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        contratos: { select: { idEmpresa: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (
      !isAdministrator(currentUser.roles) &&
      customer.idEmpresa !== currentUser.idEmpresa &&
      !customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa)
    ) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return customer;
  }

  private async getZoneOrThrow(idZonaPago: number, currentUser: AuthUser) {
    const zone = await this.prisma.zonaPago.findUnique({ where: { idZonaPago } });

    if (!zone) {
      throw new NotFoundException('Zona de pago no encontrada');
    }

    this.assertCompanyAccess(zone.idEmpresa, currentUser);

    return zone;
  }

  private isInvoicePaid(invoice: { monto: Prisma.Decimal | null; pagos: Array<{ monto: Prisma.Decimal }> }) {
    const invoiceAmount = Number(invoice.monto ?? 0);
    return invoiceAmount > 0 && this.paidAmount(invoice.pagos) >= invoiceAmount;
  }

  private paidAmount(payments: Array<{ monto: Prisma.Decimal }>) {
    return payments.reduce((total, payment) => total + Number(payment.monto), 0);
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

  private cutDays() {
    const value = Number(this.configService.get('BILLING_CUT_DAYS') ?? 5);
    return Number.isInteger(value) && value > 0 ? value : 5;
  }

  private notificationMode() {
    const mode = (this.configService.get<string>('BILLING_NOTIFICATION_MODE') ?? 'mock').trim().toLowerCase();
    return ['disabled', 'mock', 'provider'].includes(mode) ? mode : 'mock';
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requestedCompanyId ?? currentUser.idEmpresa;

      if (!idEmpresa) {
        throw new BadRequestException('Debe indicar empresa');
      }

      return idEmpresa;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    if (requestedCompanyId && requestedCompanyId !== currentUser.idEmpresa) {
      throw new BadRequestException('No puedes administrar zonas de otra empresa');
    }

    return currentUser.idEmpresa;
  }

  private companyScope(currentUser: AuthUser, scope: string): { idEmpresa?: number } {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
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
}
