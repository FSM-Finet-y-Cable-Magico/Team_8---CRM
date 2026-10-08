import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { MessagingService } from '../messaging/messaging.service';
import { TemplateKey } from '../messaging/outbound-messaging.port';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { throwZoneNameConflict } from '../common/zone-name-conflict';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { hasRole, isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { canActivateService } from '../services/service-activation.policy';
import { TAX_DOCUMENT_ISSUER, TaxDocumentIssuer } from '../tax-document-issuance/tax-document-issuer.types';
import { CreatePaymentZoneDto } from './dto/create-payment-zone.dto';
import { CreateZoneRuleDto } from './dto/create-zone-rule.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { SendBillingNotificationDto } from './dto/send-billing-notification.dto';
import { UpdatePaymentZoneDto } from './dto/update-payment-zone.dto';

import { APPROVED_EXTENSIONS, CLOSED_INVOICE_STATES, invoiceBalance } from './invoice-balance';
const CRM_ACTIVATION_FLOW_START = new Date('2026-09-12T15:00:00.000Z');

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Optional() @Inject(TAX_DOCUMENT_ISSUER) private readonly taxIssuer?: TaxDocumentIssuer,
    @Optional() private readonly messaging?: MessagingService,
  ) {}

  async overview(currentUser: AuthUser, scope = 'consolidado') {
    const rows = await this.overdueInvoiceRows(currentUser, scope);
    const cutDays = this.cutDays();
    const scheduledCuts = rows.filter((row) => row.diasAtraso >= cutDays);
    const companyFilter = this.companyScope(currentUser, scope);
    const notificationCustomerIds = companyFilter.idEmpresa
      ? await this.prisma.cliente.findMany({
          where: {
            idEmpresa: companyFilter.idEmpresa,
          },
          select: { idCliente: true },
        })
      : [];
    const notifications = await this.prisma.logNotificacion.findMany({
      select: {idNotificacion:true,idCliente:true,idPlantilla:true,canal:true,fechaEnvio:true,estadoEnvio:true},
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
    this.assertBillingWriter(currentUser);
    const company = this.companyScope(currentUser, scope);
    return this.billingTransaction(async tx => {
      const contracts = await tx.contrato.findMany({ where: { ...company, estado: { in: ['Activo', 'Moroso'] } },
        include: { cliente: true, facturas: { include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS } } } });
      let updatedContracts = 0, updatedCustomers = 0;
      const affected = new Map<number, number>();
      for (const contract of contracts) {
        if (!contract.idEmpresa || contract.cliente?.idEmpresa !== contract.idEmpresa) continue;
        const state = contract.facturas.some(invoice => invoiceBalance(invoice).diasAtraso > 0) ? 'Moroso' : 'Activo';
        if (contract.estado !== state) {
          await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { estado: state } }); updatedContracts++;
        }
        affected.set(contract.cliente.idCliente, contract.idEmpresa);
      }
      for (const [idCliente, idEmpresa] of affected) {
        const debts = await tx.factura.findMany({ where: { contrato: { is: { idCliente, idEmpresa } }, estado: { notIn: CLOSED_INVOICE_STATES } },
          include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS } });
        const state = debts.some(invoice => invoiceBalance(invoice).diasAtraso > 0) ? 'Moroso' : 'Activo';
        const result = await tx.cliente.updateMany({ where: { idCliente, idEmpresa, estado: state === 'Moroso' ? 'Activo' : 'Moroso' }, data: { estado: state } });
        updatedCustomers += result.count;
      }
      await this.auditService.record({
        idUsuario: currentUser.idUsuario, accion: 'ETIQUETAR_CLIENTE_MOROSO', entidadAfectada: 'cliente',
        valorNuevo: { scope, idEmpresa: company.idEmpresa ?? null, updatedCustomers, updatedContracts, contratosEvaluados: contracts.length },
      }, tx);
      return { updatedCustomers, updatedContracts };
    });
  }

  async sendNotification(dto: SendBillingNotificationDto, currentUser: AuthUser) {
    this.assertBillingWriter(currentUser);
    const correlationId=dto.correlationId ?? randomUUID();
    const result = await this.billingTransaction(async tx => {
      const customer = await tx.cliente.findUnique({ where: { idCliente: dto.idCliente } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      this.assertCompanyAccess(customer.idEmpresa, currentUser);
      if (!customer.idEmpresa) throw new BadRequestException('El cliente no tiene empresa');
      const invoice = dto.idFactura ? await tx.factura.findUnique({
        where: { idFactura: dto.idFactura }, include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS, contrato: true },
      }) : null;
      if (dto.idFactura && (!invoice || invoice.contrato?.idCliente !== customer.idCliente || invoice.contrato.idEmpresa !== customer.idEmpresa)) {
        throw new BadRequestException('La factura no corresponde al cliente y empresa');
      }
      if (invoice && !invoiceBalance(invoice).aceptaPagos) throw new BadRequestException('La factura no tiene saldo cobrable');
      if (dto.tipo === 'Ultimo aviso' && (!invoice || invoiceBalance(invoice).diasAtraso === 0)) {
        throw new BadRequestException('El último aviso requiere una factura vencida con saldo');
      }
      const template = await this.notificationTemplate(dto.tipo, customer.idEmpresa, tx);
      const type:TemplateKey=dto.tipo==='Preventiva'?'AVISO_PREVENTIVO':'ULTIMO_AVISO_CORTE';
      const external=this.notificationMode()==='provider';
      if(external && !this.messaging)throw new BadRequestException('El proveedor de notificaciones no esta disponible');
      const status = this.notificationMode() === 'disabled' ? 'Desactivado' : 'Simulado';
      const prepared = external ? await this.messaging!.enqueue(tx,{idEmpresa:customer.idEmpresa,idCliente:customer.idCliente,
        destinationPhone:customer.telefono ?? '',templateKey:type,locale:this.messaging!.config.company(customer.idEmpresa)?.templates[type]?.locale ?? '',
        variables:{customer_name:customer.nombreCompleto,invoice_id:invoice ? String(invoice.idFactura) : '',balance:invoice ? String(invoiceBalance(invoice).saldo) : ''},correlationId},template.idPlantilla) : null;
      const notification = prepared?.notification ?? await tx.logNotificacion.create({ select:{idNotificacion:true,estadoEnvio:true},data: {
        idCliente: customer.idCliente, idPlantilla: template.idPlantilla, canal: template.canal, fechaEnvio: new Date(), estadoEnvio: status,
      } });
      if(prepared?.duplicate)return {idNotificacion:notification.idNotificacion.toString(),estadoEnvio:notification.estadoEnvio,plantilla:template};
      // Functional commercial event is distinct from the technical audit entry.
      const event = await tx.eventoGestionComercial.create({ data: {
        idEmpresa: customer.idEmpresa, idCliente: customer.idCliente, idContrato: invoice?.idContrato,
        idFactura: invoice?.idFactura, tipo: dto.tipo === 'Preventiva' ? 'AVISO_PREVENTIVO' : 'ULTIMO_AVISO_CORTE',
        canal: external ? 'WHATSAPP' : 'OTRO', fecha: new Date(), estadoGestion: 'REGISTRADO',
        observacion: `Aviso ${(notification.estadoEnvio ?? status).toLowerCase()}; no acredita entrega externa.`, idUsuarioResponsable: currentUser.idUsuario,
      } });
      await this.auditService.record({
        idUsuario: currentUser.idUsuario, accion: dto.tipo === 'Preventiva' ? 'ENVIAR_AVISO_COBRO_PREVENTIVO' : 'ENVIAR_ULTIMO_AVISO_CORTE',
        entidadAfectada: 'evento_gestion_comercial', idEntidadAfectada: event.idEvento,
        valorNuevo: { idEmpresa: customer.idEmpresa, idCliente: customer.idCliente, idFactura: dto.idFactura ?? null,
          idNotificacion: notification.idNotificacion.toString(), tipo: dto.tipo, modo: this.notificationMode(), estadoEnvio: notification.estadoEnvio ?? status },
      }, tx);
      return { idNotificacion: notification.idNotificacion.toString(), estadoEnvio:notification.estadoEnvio, plantilla: template };
    });
    if(this.notificationMode()==='provider' && this.messaging) {
      try {await this.messaging.dispatch(BigInt(result.idNotificacion));}catch{/* The persisted intent is recovered independently. */}
    }
    return result;
  }

  async suspendContract(idContrato: number, currentUser: AuthUser) {
    this.assertBillingWriter(currentUser);
    return this.billingTransaction(async tx => {
      const contract = await tx.contrato.findUnique({ where: { idContrato }, include: {
        cliente: true, facturas: { include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS } },
      } });
      if (!contract?.cliente) throw new NotFoundException('Contrato no encontrado');
      this.assertCompanyAccess(contract.idEmpresa, currentUser);
      if (!contract.idEmpresa || contract.cliente.idEmpresa !== contract.idEmpresa) throw new BadRequestException('Cliente y contrato deben pertenecer a la misma empresa');
      if (!['Activo', 'Moroso', 'Suspendido'].includes(contract.estado)) throw new BadRequestException('El estado del contrato no permite suspensión comercial');
      const overdue = contract.facturas.filter(invoice => invoiceBalance(invoice).diasAtraso >= this.cutDays());
      if (!overdue.length) throw new BadRequestException('No existen facturas con saldo que cumplan los días de corte');
      const result = await tx.contrato.update({ where: { idContrato }, data: { estado: 'Suspendido', fechaSuspension: this.todayDate() } });
      await tx.cliente.updateMany({ where: { idCliente: contract.cliente.idCliente, idEmpresa: contract.idEmpresa, estado: { not: 'Baja' } }, data: { estado: 'Suspendido' } });
      await tx.servicioContratado.updateMany({ where: { idContrato, idEmpresa: contract.idEmpresa, estadoOperativo: 'Activo' }, data: { estadoOperativo: 'Suspendido' } });
      await this.auditService.record({
        idUsuario: currentUser.idUsuario, accion: 'SUSPENDER_SERVICIO_NO_PAGO', entidadAfectada: 'contrato', idEntidadAfectada: idContrato,
        valorAnterior: { estado: contract.estado }, valorNuevo: { idEmpresa: contract.idEmpresa, estado: 'Suspendido', facturasVencidas: overdue.map(i => i.idFactura) },
      }, tx);
      return result;
    });
  }

  async registerIntegrationPayment(dto: RegisterPaymentDto, idEmpresa: number) {
    if (!dto.fechaPago || !dto.codigoAutorizacion?.trim() || !dto.codigoTransaccion?.trim()) {
      throw new BadRequestException('El pago confirmado requiere fecha, codigo de autorizacion y codigo de transaccion');
    }
    const principal: AuthUser = {
      idUsuario: 0,
      idEmpresa,
      email: null,
      nombreCompleto: 'Integracion G2',
      roles: [],
    };
    try {
      return await this.registerPayment(dto, principal, { idEmpresa });
    } catch (error) {
      if (error instanceof ConflictException && error.message === 'La referencia de pago ya está registrada') {
        return this.registerPayment(dto, principal, { idEmpresa });
      }
      throw error;
    }
  }

  async registerPayment(dto: RegisterPaymentDto, currentUser: AuthUser, integration?: { idEmpresa: number }) {
    if (!integration) this.assertBillingWriter(currentUser);
    if (!Number.isFinite(dto.monto) || dto.monto <= 0 || dto.monto > 99999999.99 || new Prisma.Decimal(dto.monto).decimalPlaces() > 2) throw new BadRequestException('Monto inválido: positivo y máximo dos decimales');
    if (!dto.pasarela.trim()) throw new BadRequestException('Debe indicar el medio de pago');
    const paymentDate = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    if (Number.isNaN(paymentDate.getTime())) throw new BadRequestException('Fecha de pago invalida');
    const result = await this.billingTransaction(async tx => {
      // Read inside Serializable: concurrent partial payments cannot reuse a stale balance.
      const invoice = await tx.factura.findUnique({ where: { idFactura: dto.idFactura }, include: {
        pagos: true, prorrogasPago: APPROVED_EXTENSIONS,
        contrato: { include: { cliente: true, servicios: { select: {
          idServicio: true, idEmpresa: true, estadoOperativo: true, datosTecnicos: true, fechaCreacion: true,
          ordenes: { where: { tipoOt: 'Instalacion', estado: 'Completada' }, select: { idOt: true }, take: 1 },
        } } } },
      } });
      if (!invoice?.contrato?.cliente) throw new NotFoundException('Factura no encontrada');
      const contract = invoice.contrato, customer = contract.cliente!;
      if (integration) {
        if (contract.idEmpresa !== integration.idEmpresa) throw new BadRequestException('La factura no pertenece a la empresa autorizada');
      } else {
        this.assertCompanyAccess(contract.idEmpresa, currentUser);
      }
      if (!contract.idEmpresa || customer.idEmpresa !== contract.idEmpresa) throw new BadRequestException('Cliente y contrato deben pertenecer a la misma empresa');
      if (integration && dto.codigoTransaccion) {
        const existing = await tx.pago.findUnique({
          where: { codigoTransaccion: dto.codigoTransaccion.trim() },
          select: {
            idPago: true, idFactura: true, idCliente: true, monto: true, fechaPago: true,
            pasarela: true, codigoTransaccion: true, codigoAutorizacion: true,
            comprobantePdfUrl: true, comprobanteEstado: true,
          },
        });
        if (existing) {
          const same = existing.idFactura === invoice.idFactura
            && existing.idCliente === customer.idCliente
            && new Prisma.Decimal(existing.monto).eq(dto.monto)
            && existing.fechaPago.getTime() === paymentDate.getTime()
            && existing.pasarela === dto.pasarela.trim()
            && existing.codigoAutorizacion === dto.codigoAutorizacion?.trim();
          if (!same) throw new ConflictException('El codigo de transaccion ya existe con datos diferentes');
          const currentBalance = invoiceBalance(invoice);
          return {
            payment: existing,
            paidInFull: currentBalance.saldo === 0,
            saldoPendiente: currentBalance.saldo,
            reactivatedServiceIds: [],
            duplicate: true,
          };
        }
      }
      const balance = invoiceBalance(invoice);
      if (!balance.aceptaPagos) throw new BadRequestException('La factura está cerrada o no tiene saldo cobrable');
      if (new Prisma.Decimal(dto.monto).gt(balance.saldo!)) throw new BadRequestException('El pago supera el saldo pendiente');
      const payment = await tx.pago.create({ data: {
        idFactura: invoice.idFactura, idCliente: customer.idCliente, monto: dto.monto, fechaPago: paymentDate,
        codigoTransaccion: dto.codigoTransaccion?.trim() || undefined, pasarela: dto.pasarela.trim(),
        codigoAutorizacion: dto.codigoAutorizacion?.trim() || undefined,
        comprobantePdfUrl: dto.comprobantePdfUrl?.trim() || undefined,
        comprobanteEstado: dto.comprobantePdfUrl?.trim() ? 'GENERADO' : 'PENDIENTE',
      }, select: {
        idPago: true, idFactura: true, idCliente: true, monto: true, fechaPago: true,
        pasarela: true, codigoTransaccion: true, codigoAutorizacion: true,
        comprobantePdfUrl: true, comprobanteEstado: true,
      } });
      const remaining = new Prisma.Decimal(balance.saldo!).minus(dto.monto);
      const paidInFull = remaining.isZero();
      let reactivatedServiceIds: number[] = [];
      if (paidInFull) {
        await tx.factura.update({ where: { idFactura: invoice.idFactura }, data: { estado: 'Pagada' } });
        const otherInvoices = await tx.factura.findMany({ where: {
          idFactura: { not: invoice.idFactura }, estado: { notIn: CLOSED_INVOICE_STATES },
          contrato: { is: { idCliente: customer.idCliente, idEmpresa: contract.idEmpresa } },
        }, include: { pagos: true, prorrogasPago: APPROVED_EXTENSIONS } });
        const pendingOverdue = otherInvoices.some(row => invoiceBalance(row).diasAtraso > 0);
        if (!pendingOverdue) {
          reactivatedServiceIds = contract.servicios.filter(service => service.idEmpresa === contract.idEmpresa && canActivateService({
            intent: 'COMMERCIAL_PAYMENT_REACTIVATION', targetStatus: 'Activo', currentStatus: service.estadoOperativo,
            contractStatus: contract.estado, installationCompleted: service.ordenes.length > 0,
            historicalImport: customer.importadoMasivo === true || this.isHistoricalService(service.datosTecnicos, service.fechaCreacion), serviceExists: true,
          })).map(service => service.idServicio);
          if (reactivatedServiceIds.length || contract.estado === 'Moroso') {
            await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { estado: 'Activo', fechaSuspension: null } });
          }
          if (reactivatedServiceIds.length) await tx.servicioContratado.updateMany({
            where: { idServicio: { in: reactivatedServiceIds }, idContrato: contract.idContrato, idEmpresa: contract.idEmpresa, estadoOperativo: 'Suspendido' },
            data: { estadoOperativo: 'Activo' },
          });
          const otherSuspended = await tx.contrato.findFirst({ where: {
            idCliente: customer.idCliente, idEmpresa: contract.idEmpresa, estado: 'Suspendido',
          }, select: { idContrato: true } });
          if (!otherSuspended && (reactivatedServiceIds.length || customer.estado === 'Moroso')) await tx.cliente.updateMany({
            where: { idCliente: customer.idCliente, idEmpresa: contract.idEmpresa, estado: { in: ['Moroso', 'Suspendido'] } }, data: { estado: 'Activo' },
          });
        }
      }
      await this.auditService.record({
        idUsuario: integration ? null : currentUser.idUsuario,
        accion: integration ? 'REGISTRAR_PAGO_G2' : 'REGISTRAR_PAGO', entidadAfectada: 'pago', idEntidadAfectada: payment.idPago,
        valorNuevo: { idEmpresa: contract.idEmpresa, idFactura: invoice.idFactura, idCliente: customer.idCliente,
          monto: dto.monto, saldoAnterior: balance.saldo, saldoNuevo: remaining.toNumber(), pagadaCompleta: paidInFull, serviciosReactivados: reactivatedServiceIds },
      }, tx);
      if (reactivatedServiceIds.length) await this.auditService.record({
        idUsuario: integration ? null : currentUser.idUsuario, accion: 'REACTIVAR_SERVICIO_POR_PAGO', entidadAfectada: 'contrato', idEntidadAfectada: contract.idContrato,
        valorAnterior: { estadoContrato: contract.estado }, valorNuevo: { estadoContrato: 'Activo', serviciosReactivados: reactivatedServiceIds },
      }, tx);
      if (this.taxIssuer?.enqueuePayment) {
        const technical = customer.datosTecnicos;
        const giro = technical && typeof technical === 'object' && !Array.isArray(technical) && typeof technical.giroTributario === 'string' ? technical.giroTributario : '';
        await this.taxIssuer.enqueuePayment(tx, { idEmpresa:contract.idEmpresa, idFactura:invoice.idFactura,idPago:payment.idPago,
          idCliente:customer.idCliente,monto:new Prisma.Decimal(dto.monto).toFixed(2),periodoMes:invoice.periodoMes,periodoAnio:invoice.periodoAnio,
          fechaLimitePago:invoice.fechaLimitePago,tipoDocumento:invoice.tipoDocumento,folioExterno:invoice.folioExterno,
          receiver:{rut:customer.rut ?? '',name:customer.nombreCompleto,giro,address:contract.direccionInstalacion ?? '',
            comuna:contract.comunaInstalacion ?? '',city:contract.ciudadInstalacion ?? '',email:customer.email} });
      }
      return { payment, paidInFull, saldoPendiente: remaining.toNumber(), reactivatedServiceIds, duplicate: false };
    });
    // Transaction has committed. Provider/SMTP failure must never undo or mask the payment.
    if (!this.taxIssuer?.processPayment) return result;
    let taxDocument: unknown;
    try { taxDocument = await this.taxIssuer.processPayment(result.payment.idPago); }
    catch { taxDocument = { state:'PENDIENTE', code:'TAX_POST_COMMIT_PROCESSING_PENDING' }; }
    return { ...result, taxDocument };
  }

  private async billingTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'P2034' && attempt < 2) continue;
        if (code === 'P2034') throw new ConflictException('La cobranza cambió durante la operación; actualiza y vuelve a intentar');
        if (code === 'P2002') throw new ConflictException('La referencia de pago ya está registrada');
        throw error;
      }
    }
    throw new ConflictException('No fue posible completar la operación');
  }

  private isHistoricalService(value: Prisma.JsonValue | null, createdAt: Date | null) {
    const origin = value && typeof value === 'object' && !Array.isArray(value)
      ? String((value as Record<string, unknown>).origen ?? '')
      .trim()
      .toLocaleLowerCase('es-CL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      : '';

    return origin.includes('histor') || (createdAt !== null && createdAt < CRM_ACTIVATION_FLOW_START);
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
    this.assertBillingWriter(currentUser);
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    if (!dto.nombreZona.trim()) throw new BadRequestException('El nombre de zona es obligatorio');
    const created = await this.prisma.zonaPago.create({
      data: {
        idEmpresa,
        nombreZona: dto.nombreZona.trim(),
        comuna: dto.comuna?.trim() || null,
        descripcion: dto.descripcion?.trim() || null,
        diaVencimientoSugerido: dto.diaVencimientoSugerido,
        activo: dto.activo ?? true,
      },
    }).catch(throwZoneNameConflict);

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
    this.assertBillingWriter(currentUser);
    const zone = await this.getZoneOrThrow(idZonaPago, currentUser);
    if (dto.nombreZona !== undefined && !dto.nombreZona.trim()) throw new BadRequestException('El nombre de zona es obligatorio');
    const updated = await this.prisma.zonaPago.update({
      where: { idZonaPago },
      data: {
        nombreZona: dto.nombreZona === undefined ? undefined : dto.nombreZona.trim(),
        comuna: dto.comuna === undefined ? undefined : dto.comuna.trim() || null,
        descripcion: dto.descripcion === undefined ? undefined : dto.descripcion.trim() || null,
        diaVencimientoSugerido: dto.diaVencimientoSugerido,
        activo: dto.activo,
      },
    }).catch(throwZoneNameConflict);

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
    this.assertBillingWriter(currentUser);
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

    const fechaInicio = dto.fechaInicio ? parseDateOnly(dto.fechaInicio) : null;
    const fechaFin = dto.fechaFin ? parseDateOnly(dto.fechaFin) : null;
    if ((dto.fechaInicio && !fechaInicio) || (dto.fechaFin && !fechaFin)) throw new BadRequestException('Vigencia inválida');
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha de fin');
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
          fechaInicio,
          fechaFin,
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
        fechaInicio: created.fechaInicio?.toISOString().slice(0, 10) ?? null,
        fechaFin: created.fechaFin?.toISOString().slice(0, 10) ?? null,
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
        prorrogasPago: APPROVED_EXTENSIONS,
        contrato: {
          include: {
            cliente: { include: { empresa: true } },
            plan: true,
          },
        },
      },
      orderBy: { fechaLimitePago: 'asc' },
          });

    return invoices
      .filter((invoice) => invoice.contrato?.cliente && invoice.contrato.idEmpresa === invoice.contrato.cliente.idEmpresa && invoiceBalance(invoice).diasAtraso > 0)
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
          diasAtraso: invoiceBalance(invoice).diasAtraso,
          fechaVencimientoEfectiva: invoiceBalance(invoice).fechaVencimientoEfectiva,
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

  private async notificationTemplate(
    type: SendBillingNotificationDto['tipo'],
    idEmpresa: number,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const tipoEvento = type === 'Preventiva' ? 'COBRO_PREVENTIVO' : 'ULTIMO_AVISO_CORTE';
    const existing = await client.plantillaNotificacion.findFirst({
      where: { tipoEvento, canal: 'Sistema', activa: true, idEmpresa },
      orderBy: { idPlantilla: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return client.plantillaNotificacion.create({
      data: {
        tipoEvento,
        canal: 'Sistema',
        contenidoTexto:
          type === 'Preventiva'
            ? 'Aviso preventivo de cobranza registrado por CRM.'
            : 'Ultimo aviso previo al corte registrado por CRM.',
        activa: true,
        idEmpresa,
      },
    });
  }

  private async getZoneOrThrow(idZonaPago: number, currentUser: AuthUser) {
    const zone = await this.prisma.zonaPago.findUnique({ where: { idZonaPago } });

    if (!zone) {
      throw new NotFoundException('Zona de pago no encontrada');
    }

    this.assertCompanyAccess(zone.idEmpresa, currentUser);

    return zone;
  }

  private paidAmount(payments: Array<{ monto: Prisma.Decimal }>) {
    return payments.reduce((total, payment) => total.plus(payment.monto), new Prisma.Decimal(0)).toNumber();
  }

  private todayDate() {
    const today = todayDateOnly();
    const parsed = parseDateOnly(today);

    if (!parsed) {
      throw new BadRequestException('No se pudo resolver la fecha actual');
    }

    return parsed;
  }

  private cutDays() {
    const value = Number(this.configService.get('BILLING_CUT_DAYS') ?? 5);
    return Number.isInteger(value) && value > 0 ? value : 5;
  }

  private notificationMode() {
    const mode = (this.configService.get<string>('BILLING_NOTIFICATION_MODE') ?? 'mock').trim().toLowerCase();
    return ['disabled', 'mock', 'provider'].includes(mode) ? mode : 'mock';
  }

  private assertBillingWriter(user: AuthUser) {
    if (!isAdministrator(user.roles) && !hasRole(user.roles, 'Comercial')) throw new ForbiddenException('Sin permiso para gestionar facturación');
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
