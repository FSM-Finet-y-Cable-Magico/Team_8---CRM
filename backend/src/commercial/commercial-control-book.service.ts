import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { hasRole, isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { invoiceBalance } from '../billing/invoice-balance';
import {
  ChangePaymentConditionDto,
  CommercialEventDto,
  ControlBookQueryDto,
  CreateAdditionalChargeDto,
  CreateAgreementDto,
  CreateExtensionDto,
  CreateNonContractingLeadDto,
} from './commercial.dto';
import { CommercialStatusService } from './commercial-status.service';

const ACTIVE_AGREEMENT_STATES = ['APROBADO', 'ACTIVO'];
const ACTIVE_EXTENSION_STATES = ['APROBADA'];
const CLOSED_INVOICE_STATES = ['Pagada', 'Anulada'];
const EXPORT_COLUMNS = {
  rut: 'RUT', nombre: 'Nombre', telefono: 'Teléfono', email: 'Correo', direccion: 'Dirección',
  idServicio: 'Servicio', estadoServicio: 'Estado servicio', numeroContrato: 'Contrato', plan: 'Plan', zona: 'Zona',
  tipoDocumento: 'Tipo documento', numeroDocumento: 'Folio', fechaEmision: 'Emisión', fechaVencimiento: 'Vencimiento original',
  fechaVencimientoEfectiva: 'Vencimiento efectivo', montoDocumento: 'Monto', totalPagado: 'Total pagado', saldoPendiente: 'Saldo pendiente',
  saldoFavor: 'Saldo a favor', diasAtraso: 'Días atraso', estadoComercial: 'Estado comercial', ultimaGestion: 'Última gestión',
  fechaUltimaGestion: 'Fecha gestión', responsableUltimaGestion: 'Responsable', accionSugerida: 'Acción sugerida',
  convenioActivo: 'Convenio activo', prorrogaActiva: 'Prórroga activa', diaPago: 'Día pago', fechaInstalacion: 'Fecha instalación',
  fechaCorte: 'Fecha corte comercial', avisoRetiro: 'Aviso retiro', retiroPendiente: 'Retiro pendiente',
  formaPago: 'Forma último pago', codigoTransaccion: 'Voucher/transacción', valorRecibido: 'Valor recibido',
  cargosPendientes: 'Cargos pendientes de facturación', observacionRelevante: 'Observación',
} as const;

type ExportColumn = keyof typeof EXPORT_COLUMNS;

@Injectable()
export class CommercialControlBookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly statusService: CommercialStatusService,
    private readonly config: ConfigService,
  ) {}

  async customerHistory(idCliente: number, requestedCompany: number | undefined, user: AuthUser) {
    this.assertViewer(user);
    const idEmpresa = this.queryCompany(requestedCompany, user);
    const customer = await this.prisma.cliente.findFirst({
      where: { idCliente, idEmpresa },
      select: {
        idCliente: true,
        contratos: { where: { idEmpresa }, select: {
          idContrato: true, direccionInstalacion: true, numeroContratoExterno: true, plan: { select: { nombreComercial: true } },
          facturas: { orderBy: [{ periodoAnio: 'desc' }, { periodoMes: 'desc' }, { idFactura: 'desc' }], include: {
            pagos: { select: { idPago: true, monto: true, fechaPago: true, pasarela: true, codigoTransaccion: true }, orderBy: [{ fechaPago: 'desc' }, { idPago: 'desc' }] },
            prorrogasPago: { where: { idEmpresa, estado: 'APROBADA' } },
          } },
        } },
        eventosGestionComercial: { where: { idEmpresa }, include: { responsable: { select: { nombreCompleto: true } } } },
        conveniosPago: { where: { idEmpresa }, include: { responsable: { select: { nombreCompleto: true } }, aprobador: { select: { nombreCompleto: true } }, cuotas: { orderBy: { numero: 'asc' } } } },
        prorrogasPago: { where: { idEmpresa }, include: { responsable: { select: { nombreCompleto: true } } } },
        cambiosCondicionPago: { where: { idEmpresa }, include: { responsable: { select: { nombreCompleto: true } } } },
        cargosAdicionales: { where: { idEmpresa }, include: { responsable: { select: { nombreCompleto: true } } } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado en la empresa seleccionada');
    const date = (value: Date) => value.toISOString();
    type Movement = {
      key: string; tipo: string; fecha: string; fechaRegistro: string; detalle: string | null; estado: string | null;
      responsable: string | null; idContrato: number | null; idFactura: number | null; canal?: string; monto?: number;
      fechaOriginal?: string; nuevaFecha?: string; valorAnterior?: string; valorNuevo?: string;
      fechaAprobacion?: string | null; aprobador?: string | null;
      cuotas?: Array<{ numero: number; monto: number; fechaVencimiento: string; estado: string; fechaPago: string | null }>;
    };
    const movements: Movement[] = [
      ...customer.eventosGestionComercial.map(e => ({ key: `event-${e.idEvento}`, tipo: e.tipo, fecha: date(e.fecha), fechaRegistro: date(e.createdAt), detalle: e.observacion, estado: e.estadoGestion, canal: e.canal, responsable: e.responsable.nombreCompleto, idContrato: e.idContrato, idFactura: e.idFactura })),
      ...customer.conveniosPago.map(c => ({ key: `agreement-${c.idConvenio}`, tipo: 'CONVENIO', fecha: date(c.fechaRegistro), fechaRegistro: date(c.fechaRegistro), detalle: c.condiciones, estado: c.estado, monto: Number(c.montoComprometido), responsable: c.responsable.nombreCompleto, idContrato: c.idContrato, idFactura: c.idFactura,
        fechaAprobacion: c.fechaAprobacion ? date(c.fechaAprobacion) : null, aprobador: c.aprobador?.nombreCompleto ?? null,
        cuotas: c.cuotas.map(q => ({ numero: q.numero, monto: Number(q.monto), fechaVencimiento: date(q.fechaVencimiento), estado: q.estado, fechaPago: q.fechaPago ? date(q.fechaPago) : null })),
      })),
      ...customer.prorrogasPago.map(p => ({ key: `extension-${p.idProrroga}`, tipo: 'PRORROGA', fecha: date(p.fechaRegistro), fechaRegistro: date(p.fechaRegistro), detalle: p.motivo, estado: p.estado, responsable: p.responsable.nombreCompleto, idContrato: p.idContrato, idFactura: p.idFactura, fechaOriginal: date(p.fechaOriginal), nuevaFecha: date(p.nuevaFecha) })),
      ...customer.cambiosCondicionPago.map(c => ({ key: `condition-${c.idCambio}`, tipo: c.tipoCambio, fecha: date(c.fechaRegistro), fechaRegistro: date(c.fechaRegistro), detalle: c.justificacion, estado: null, responsable: c.responsable.nombreCompleto, idContrato: c.idContrato, idFactura: c.idFactura, valorAnterior: c.valorAnterior, valorNuevo: c.valorNuevo })),
      ...customer.cargosAdicionales.map(c => ({ key: `charge-${c.idCargo}`, tipo: `CARGO_${c.tipo}`, fecha: date(c.fecha), fechaRegistro: date(c.fechaRegistro), detalle: c.observacion, estado: c.estado, monto: Number(c.monto), responsable: c.responsable.nombreCompleto, idContrato: c.idContrato, idFactura: null })),
    ];
    const invoices = customer.contratos.flatMap(contract => contract.facturas.map(invoice => {
      const balance = invoiceBalance(invoice);
      return {
        idFactura: invoice.idFactura, idContrato: contract.idContrato, plan: contract.plan?.nombreComercial ?? null,
        periodoMes: invoice.periodoMes, periodoAnio: invoice.periodoAnio, tipoDocumento: invoice.tipoDocumento, folio: invoice.folioExterno,
        fechaEmision: invoice.fechaEmision ? date(invoice.fechaEmision) : null, fechaVencimiento: date(invoice.fechaLimitePago),
        fechaVencimientoEfectiva: balance.fechaVencimientoEfectiva, monto: balance.monto, pagado: balance.pagado,
        saldo: balance.saldoExigible, estado: balance.estadoCalculado,
        pagos: invoice.pagos.map(p => ({ idPago: p.idPago, monto: Number(p.monto), fecha: date(p.fechaPago), medio: p.pasarela, referencia: p.codigoTransaccion })),
      };
    })).sort((a, b) => b.periodoAnio - a.periodoAnio || b.periodoMes - a.periodoMes || b.idFactura - a.idFactura);
    const contexts = new Map(customer.contratos.map(c => [c.idContrato, [c.plan?.nombreComercial, c.direccionInstalacion, c.numeroContratoExterno].filter(Boolean).join(' · ')]));
    movements.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.fechaRegistro.localeCompare(a.fechaRegistro) || a.key.localeCompare(b.key));
    return { idCliente,
      invoices: invoices.map(i => ({ ...i, contexto: contexts.get(i.idContrato) ?? null })),
      movements: movements.map(m => ({ ...m, contexto: m.idContrato ? contexts.get(m.idContrato) ?? null : null })),
    };
  }

  async list(query: ControlBookQueryDto, user: AuthUser) {
    this.assertViewer(user);
    const allRows = await this.loadRows({ idEmpresa: query.idEmpresa, page: 1, pageSize: 30 }, user);
    const rows = this.filterRows(allRows, query);
    this.sortRows(rows, query.sort ?? 'diasAtraso', query.order ?? 'desc');
    const page = query.page || 1;
    const pageSize = query.pageSize || 30;
    const totalRows = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    const invoiceSummary = new Map<number, { saldo: number; vencida: boolean; convenio: boolean; prorroga: boolean }>();
    rows.forEach((row) => {
      if (row.idFactura === null) return;
      invoiceSummary.set(row.idFactura, {
        saldo: row.saldoPendiente ?? 0,
        vencida: (row.diasAtraso ?? 0) > 0,
        convenio: row.convenioActivo,
        prorroga: row.prorrogaActiva,
      });
    });

    return {
      items,
      dashboard: {
        customerCount: new Set(allRows.map(r => r.idCliente)).size,
        overdueCustomerCount: new Set(allRows.filter(r => (r.diasAtraso ?? 0) > 0).map(r => r.idCliente)).size,
        overdueInvoiceCount: new Set(allRows.filter(r => (r.diasAtraso ?? 0) > 0 && r.idFactura !== null).map(r => r.idFactura)).size,
        totalDebt: this.money([...new Map(allRows.filter(r => r.idFactura !== null).map(r => [r.idFactura, r.saldoPendiente ?? 0])).values()].reduce((sum, amount) => sum + amount, 0)),
      },
      pagination: { page, pageSize, totalRows, totalPages },
      summary: {
        totalRows,
        totalDebt: this.money([...invoiceSummary.values()].reduce((sum, row) => sum + row.saldo, 0)),
        overdueCount: [...invoiceSummary.values()].filter((row) => row.vencida).length,
        agreementsCount: [...invoiceSummary.values()].filter((row) => row.convenio).length,
        extensionsCount: [...invoiceSummary.values()].filter((row) => row.prorroga).length,
      },
      filterOptions: {
        plans: this.uniqueOptions(rows, 'idPlan', 'plan'),
        zones: this.uniqueOptions(rows, 'idZona', 'zona'),
        commercialStatuses: [...new Set(rows.map((row) => row.estadoComercial))].sort(),
        serviceStatuses: [...new Set(rows.map((row) => row.estadoServicio).filter(Boolean))].sort(),
      },
      filtersApplied: this.appliedFilters(query),
    };
  }

  async export(query: ControlBookQueryDto, format: 'csv' | 'xlsx', user: AuthUser) {
    this.assertViewer(user);
    if (!['csv', 'xlsx'].includes(format)) throw new BadRequestException('Formato de exportación no soportado');
    const rows = await this.loadRows(query, user);
    const columns = this.exportColumns(query.columns);
    const exportRows = rows.map((row) => Object.fromEntries(columns.map((key) => [EXPORT_COLUMNS[key], row[key]])));
    let buffer: Buffer;
    let contentType: string;

    if (format === 'csv') {
      const header = columns.map((key) => EXPORT_COLUMNS[key]);
      const lines = [header, ...exportRows.map((row) => Object.values(row))]
        .map((values) => values.map((value) => this.csvValue(value)).join(','));
      buffer = Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
      contentType = 'text/csv; charset=utf-8';
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Libro Control');
      sheet.columns = columns.map((key) => ({ header: EXPORT_COLUMNS[key], key, width: this.columnWidth(key) }));
      rows.forEach((row) => sheet.addRow(Object.fromEntries(columns.map((key) => [key, row[key]]))));
      sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: Math.min(5, columns.length) }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF247C68' } };
      columns.forEach((key, index) => {
        const column = sheet.getColumn(index + 1);
        if (['montoDocumento', 'totalPagado', 'saldoPendiente', 'saldoFavor', 'valorRecibido', 'cargosPendientes'].includes(key)) column.numFmt = '#,##0.00';
        if (['rut', 'telefono', 'codigoTransaccion'].includes(key)) column.numFmt = '@';
      });
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'EXPORTAR_LIBRO_CONTROL',
      entidadAfectada: 'libro_control_comercial',
      valorNuevo: { formato: format, filas: rows.length, filtros: this.appliedFilters(query), columnas: columns },
    });
    return { buffer, contentType, filename: `libro-control-${todayDateOnly()}.${format}` };
  }

  async registerEvent(dto: CommercialEventDto, user: AuthUser) {
    this.assertWriter(user);
    const customer = await this.customer(dto.idCliente);
    const companyId = this.requireCompany(customer.idEmpresa);
    this.assertCompany(companyId, user);
    const [service, contract, invoice] = await Promise.all([
      dto.idServicio ? this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } }) : null,
      dto.idContrato ? this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } }) : null,
      dto.idFactura ? this.prisma.factura.findUnique({ where: { idFactura: dto.idFactura }, include: { pagos: true, contrato: true, prorrogasPago: { where: { estado: { in: ACTIVE_EXTENSION_STATES } }, orderBy: { nuevaFecha: 'desc' }, take: 1 } } }) : null,
    ]);
    if ((dto.idServicio && !service) || (dto.idContrato && !contract) || (dto.idFactura && !invoice)) throw new NotFoundException('La relación indicada no existe');
    if (service && dto.idContrato && service.idContrato !== dto.idContrato) throw new BadRequestException('El servicio no corresponde al contrato');
    if (invoice && dto.idContrato && invoice.idContrato !== dto.idContrato) throw new BadRequestException('La factura no corresponde al contrato');
    if (invoice && service && service.idContrato !== invoice.idContrato) throw new BadRequestException('El servicio no corresponde a la factura');
    this.assertRelated(customer.idCliente, companyId, service, contract, invoice);

    if (dto.tipo === 'ULTIMO_AVISO_CORTE') {
      if (!invoice) throw new BadRequestException('El último aviso requiere una factura');
      const status = this.invoiceStatus(invoice);
      if (CLOSED_INVOICE_STATES.includes(invoice.estado) || !status.saldoPendiente || status.saldoPendiente <= 0) throw new BadRequestException('La deuda ya se encuentra pagada');
      if (!status.diasAtraso) throw new BadRequestException('El último aviso requiere deuda vencida');
    }
    if (dto.tipo === 'AVISO_PREVIO_RETIRO' && (!service || !dto.observacion?.trim())) {
      throw new BadRequestException('El aviso de retiro requiere servicio y observación');
    }

    const event = await this.prisma.eventoGestionComercial.create({ data: {
      idEmpresa: companyId,
      idCliente: customer.idCliente,
      idServicio: service?.idServicio,
      idContrato: contract?.idContrato ?? invoice?.idContrato,
      idFactura: invoice?.idFactura,
      tipo: dto.tipo,
      canal: dto.canal,
      fecha: this.dateTime(dto.fecha, 'fecha'),
      observacion: dto.observacion?.trim() || null,
      idUsuarioResponsable: user.idUsuario,
    } });
    await this.audit.record({ idUsuario: user.idUsuario, accion: dto.tipo === 'ULTIMO_AVISO_CORTE' ? 'REGISTRAR_ULTIMO_AVISO' : dto.tipo === 'AVISO_PREVIO_RETIRO' ? 'REGISTRAR_AVISO_RETIRO' : 'REGISTRAR_GESTION_COMERCIAL', entidadAfectada: 'evento_gestion_comercial', idEntidadAfectada: event.idEvento, valorNuevo: { idCliente: customer.idCliente, idFactura: invoice?.idFactura, idServicio: service?.idServicio, tipo: dto.tipo, canal: dto.canal } });
    return event;
  }

  async createAgreement(dto: CreateAgreementDto, user: AuthUser) {
    this.assertWriter(user);
    const invoice = await this.debtInvoice(dto.idFactura);
    const customer = invoice.contrato?.cliente;
    if (!customer || customer.idCliente !== dto.idCliente) throw new BadRequestException('La factura no corresponde al cliente');
    const companyId = this.requireCompany(invoice.contrato?.idEmpresa ?? customer.idEmpresa);
    this.assertCompany(companyId, user);
    if (dto.idContrato && dto.idContrato !== invoice.idContrato) throw new BadRequestException('El contrato no corresponde a la factura');
    if (dto.idServicio) {
      const service = await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } });
      if (!service || service.idCliente !== customer.idCliente || service.idEmpresa !== companyId || service.idContrato !== invoice.idContrato) {
        throw new BadRequestException('El servicio no corresponde a la factura, cliente o empresa');
      }
    }
    if (!dto.condiciones.trim()) throw new BadRequestException('Las condiciones del convenio son obligatorias');
    if (dto.cantidadCuotas !== dto.cuotas.length) throw new BadRequestException('La cantidad de cuotas no coincide con el detalle');
    const numbers = dto.cuotas.map((item) => item.numero).sort((a, b) => a - b);
    if (numbers.some((value, index) => value !== index + 1)) throw new BadRequestException('Las cuotas deben numerarse correlativamente');
    const totalInstallments = this.money(dto.cuotas.reduce((sum, item) => sum + item.monto, 0));
    if (Math.abs(totalInstallments - this.money(dto.montoComprometido)) > 0.009) throw new BadRequestException('La suma de cuotas no coincide con el monto comprometido');
    const status = this.invoiceStatus(invoice);
    if (!status.saldoPendiente || dto.montoComprometido > status.saldoPendiente) throw new BadRequestException('El monto comprometido supera la deuda vigente');
    const start = this.dateOnly(dto.fechaInicio, 'fechaInicio');
    dto.cuotas.forEach((item) => { if (this.dateOnly(item.fechaVencimiento, 'fechaVencimiento') < start) throw new BadRequestException('Las cuotas no pueden vencer antes del inicio'); });

    const agreement = await this.prisma.convenioPago.create({
      data: {
        idEmpresa: companyId, idCliente: customer.idCliente, idFactura: invoice.idFactura,
        idContrato: invoice.idContrato, idServicio: dto.idServicio,
        montoComprometido: dto.montoComprometido, cantidadCuotas: dto.cantidadCuotas,
        condiciones: dto.condiciones.trim(), fechaInicio: start, estado: 'PENDIENTE', idUsuarioResponsable: user.idUsuario,
        cuotas: { create: dto.cuotas.map((item) => ({ numero: item.numero, monto: item.monto, fechaVencimiento: this.dateOnly(item.fechaVencimiento, 'fechaVencimiento') })) },
      }, include: { cuotas: true },
    });
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'CREAR_CONVENIO_PAGO', entidadAfectada: 'convenio_pago', idEntidadAfectada: agreement.idConvenio, valorNuevo: { idCliente: customer.idCliente, idFactura: invoice.idFactura, montoComprometido: dto.montoComprometido, cantidadCuotas: dto.cantidadCuotas, estado: agreement.estado } });
    return agreement;
  }

  async approveAgreement(idConvenio: number, user: AuthUser) {
    if (!isAdministrator(user.roles)) throw new ForbiddenException('Solo un administrador puede aprobar convenios');
    const agreement = await this.prisma.convenioPago.findUnique({
      where: { idConvenio },
      include: { factura: { include: { pagos: true, prorrogasPago: { where: { estado: { in: ACTIVE_EXTENSION_STATES } }, orderBy: { nuevaFecha: 'desc' }, take: 1 } } } },
    });
    if (!agreement) throw new NotFoundException('Convenio no encontrado');
    this.assertCompany(agreement.idEmpresa, user);
    if (agreement.estado !== 'PENDIENTE') throw new BadRequestException('Solo se pueden aprobar convenios pendientes');
    if (!agreement.factura || CLOSED_INVOICE_STATES.includes(agreement.factura.estado) || !this.invoiceStatus(agreement.factura).saldoPendiente || Number(agreement.montoComprometido) > this.invoiceStatus(agreement.factura).saldoPendiente!) {
      throw new BadRequestException('El convenio ya no tiene deuda vigente para aprobar');
    }
    const updated = await this.prisma.convenioPago.update({ where: { idConvenio }, data: { estado: 'APROBADO', idUsuarioAprobador: user.idUsuario, fechaAprobacion: new Date() }, include: { cuotas: true } });
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'APROBAR_CONVENIO_PAGO', entidadAfectada: 'convenio_pago', idEntidadAfectada: idConvenio, valorAnterior: { estado: agreement.estado }, valorNuevo: { estado: updated.estado } });
    return updated;
  }

  async createExtension(dto: CreateExtensionDto, user: AuthUser) {
    this.assertWriter(user);
    const invoice = await this.debtInvoice(dto.idFactura);
    const customer = invoice.contrato?.cliente;
    if (!customer) throw new BadRequestException('La factura no tiene cliente');
    const companyId = this.requireCompany(invoice.contrato?.idEmpresa ?? customer.idEmpresa);
    this.assertCompany(companyId, user);
    if (!dto.motivo.trim()) throw new BadRequestException('El motivo de la prórroga es obligatorio');
    const newDate = this.dateOnly(dto.nuevaFecha, 'nuevaFecha');
    const latest = invoice.prorrogasPago[0]?.nuevaFecha ?? invoice.fechaLimitePago;
    if (newDate <= latest) throw new BadRequestException('La nueva fecha debe ser posterior a la fecha vigente');
    const extension = await this.prisma.prorrogaPago.create({ data: { idEmpresa: companyId, idCliente: customer.idCliente, idContrato: invoice.idContrato, idFactura: invoice.idFactura, fechaOriginal: invoice.fechaLimitePago, nuevaFecha: newDate, motivo: dto.motivo.trim(), estado: 'APROBADA', idUsuarioResponsable: user.idUsuario } });
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'CREAR_PRORROGA', entidadAfectada: 'prorroga_pago', idEntidadAfectada: extension.idProrroga, valorNuevo: { idFactura: invoice.idFactura, fechaOriginal: invoice.fechaLimitePago, nuevaFecha: newDate, motivo: dto.motivo.trim() } });
    return extension;
  }

  async changePaymentCondition(dto: ChangePaymentConditionDto, user: AuthUser) {
    this.assertWriter(user);
    if (!dto.justificacion.trim()) throw new BadRequestException('La justificación es obligatoria');
    const customer = await this.customer(dto.idCliente);
    const companyId = this.requireCompany(customer.idEmpresa);
    this.assertCompany(companyId, user);
    if (dto.tipoCambio === 'DIA_PAGO') {
      if (!dto.idContrato) throw new BadRequestException('El cambio de día requiere contrato');
      const contract = await this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } });
      if (!contract || contract.idCliente !== customer.idCliente || contract.idEmpresa !== companyId) throw new BadRequestException('Contrato incompatible con el cliente o empresa');
      const newDay = Number(dto.valorNuevo);
      if (!Number.isInteger(newDay) || newDay < 1 || newDay > 28) throw new BadRequestException('El día de pago debe estar entre 1 y 28');
      const result = await this.prisma.$transaction(async (tx) => {
        const change = await tx.cambioCondicionPago.create({ data: { idEmpresa: companyId, idCliente: customer.idCliente, idContrato: contract.idContrato, tipoCambio: dto.tipoCambio, valorAnterior: String(contract.diaVencimiento), valorNuevo: String(newDay), justificacion: dto.justificacion.trim(), idUsuarioResponsable: user.idUsuario } });
        await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { diaVencimiento: newDay } });
        return change;
      });
      await this.auditCondition(result.idCambio, user, dto, String(contract.diaVencimiento), String(newDay));
      return result;
    }

    if (!dto.idFactura) throw new BadRequestException('La fecha comprometida requiere factura');
    const invoice = await this.debtInvoice(dto.idFactura);
    if ((dto.idContrato && dto.idContrato !== invoice.idContrato) || invoice.contrato?.cliente?.idCliente !== customer.idCliente || invoice.contrato.idEmpresa !== companyId) throw new BadRequestException('Factura incompatible con el cliente o empresa');
    const newDate = this.dateOnly(dto.valorNuevo, 'valorNuevo');
    const currentDate = invoice.prorrogasPago[0]?.nuevaFecha ?? invoice.fechaLimitePago;
    if (newDate <= currentDate) throw new BadRequestException('La fecha comprometida debe ser posterior a la vigente');
    const result = await this.prisma.$transaction(async (tx) => {
      const change = await tx.cambioCondicionPago.create({ data: { idEmpresa: companyId, idCliente: customer.idCliente, idContrato: invoice.idContrato, idFactura: invoice.idFactura, tipoCambio: dto.tipoCambio, valorAnterior: currentDate.toISOString().slice(0, 10), valorNuevo: dto.valorNuevo, justificacion: dto.justificacion.trim(), idUsuarioResponsable: user.idUsuario } });
      const extension = await tx.prorrogaPago.create({ data: { idEmpresa: companyId, idCliente: customer.idCliente, idContrato: invoice.idContrato, idFactura: invoice.idFactura, fechaOriginal: invoice.fechaLimitePago, nuevaFecha: newDate, motivo: dto.justificacion.trim(), estado: 'APROBADA', idUsuarioResponsable: user.idUsuario } });
      return { change, extension };
    });
    await this.auditCondition(result.change.idCambio, user, dto, currentDate.toISOString().slice(0, 10), dto.valorNuevo);
    return result;
  }

  async createAdditionalCharge(dto: CreateAdditionalChargeDto, user: AuthUser) {
    this.assertWriter(user);
    const customer = await this.customer(dto.idCliente);
    const companyId = this.requireCompany(customer.idEmpresa);
    this.assertCompany(companyId, user);
    const [contract, service] = await Promise.all([
      dto.idContrato ? this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } }) : null,
      dto.idServicio ? this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } }) : null,
    ]);
    if ((dto.idServicio && !service) || (dto.idContrato && !contract)) throw new NotFoundException('La relación indicada no existe');
    if (service && dto.idContrato && service.idContrato !== dto.idContrato) throw new BadRequestException('El servicio no corresponde al contrato');
    this.assertRelated(customer.idCliente, companyId, service, contract, null);
    const charge = await this.prisma.cargoAdicional.create({ data: { idEmpresa: companyId, idCliente: customer.idCliente, idContrato: contract?.idContrato, idServicio: service?.idServicio, tipo: dto.tipo, monto: dto.monto, fecha: this.dateOnly(dto.fecha, 'fecha'), estado: 'PENDIENTE_FACTURACION', afectaSaldo: false, observacion: dto.observacion?.trim() || null, idUsuarioResponsable: user.idUsuario } });
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'CREAR_CARGO_ADICIONAL', entidadAfectada: 'cargo_adicional', idEntidadAfectada: charge.idCargo, valorNuevo: { idCliente: customer.idCliente, tipo: dto.tipo, monto: dto.monto, estado: charge.estado, afectaSaldo: false } });
    return charge;
  }

  async createNonContractingLead(dto: CreateNonContractingLeadDto, user: AuthUser) {
    this.assertWriter(user);
    const idEmpresa = this.resolveWriteCompany(dto.idEmpresa, user);
    const rut = validateRut(dto.rut);
    if (!rut.valid || !rut.normalized) throw new BadRequestException(rut.reason ?? 'RUT inválido');
    const phone = this.normalizePhone(dto.telefono);
    const [client, prospect] = await Promise.all([
      this.prisma.cliente.findFirst({ where: { idEmpresa, rut: rut.normalized } }),
      this.prisma.prospecto.findFirst({ where: { idEmpresa, rut: rut.normalized } }),
    ]);
    if (client || prospect) throw new BadRequestException('El RUT ya existe en la empresa');
    const lead = await this.prisma.prospecto.create({ data: { idEmpresa, idUsuarioComercial: user.idUsuario, rut: rut.normalized, nombreCompleto: dto.nombreCompleto.trim(), email: dto.email.trim().toLowerCase(), telefono: phone, direccion: dto.direccion.trim(), comuna: dto.comuna.trim(), region: dto.region.trim(), estadoPipeline: 'Fuera pipeline', clasificacionComercial: 'INTERESADO_NO_CONTRATANTE', disponibleRemarketing: true, origenContacto: 'Interesado no contratante', fechaCreacion: new Date() } });
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'REGISTRAR_INTERESADO_NO_CONTRATANTE', entidadAfectada: 'prospecto', idEntidadAfectada: lead.idProspecto, valorNuevo: { idEmpresa, clasificacionComercial: lead.clasificacionComercial, disponibleRemarketing: true } });
    return lead;
  }

  async expiringPlans(days: number | undefined, requestedCompany: number | undefined, user: AuthUser) {
    this.assertViewer(user);
    const horizon = Number.isInteger(days) && Number(days) >= 1 && Number(days) <= 90 ? Number(days) : this.expiryAlertDays();
    const company = this.queryCompany(requestedCompany, user);
    const today = this.dateOnly(todayDateOnly(), 'hoy');
    const limit = new Date(today); limit.setUTCDate(limit.getUTCDate() + horizon);
    const invoices = await this.prisma.factura.findMany({
      where: { estado: { notIn: CLOSED_INVOICE_STATES }, fechaLimitePago: { lte: limit }, ...(company ? { contrato: { is: { idEmpresa: company, cliente: { is: { idEmpresa: company } } } } } : {}) },
      include: { pagos: true, prorrogasPago: { where: { estado: { in: ACTIVE_EXTENSION_STATES } }, orderBy: { nuevaFecha: 'desc' }, take: 1 }, contrato: { include: { cliente: true, plan: true } } },
      orderBy: { fechaLimitePago: 'asc' }, take: 500,
    });
    const items = invoices.flatMap((invoice) => {
      const status = this.invoiceStatus(invoice);
      if (!status.saldoPendiente || status.fechaVencimientoEfectiva > limit) return [];
      return [{ idFactura: invoice.idFactura, idContrato: invoice.idContrato, idCliente: invoice.contrato?.idCliente,
        cliente: invoice.contrato?.cliente?.nombreCompleto ?? 'Cliente sin nombre', plan: invoice.contrato?.plan?.nombreComercial ?? null,
        fechaVencimiento: status.fechaVencimientoEfectiva.toISOString().slice(0, 10),
        diasRestantes: Math.ceil((status.fechaVencimientoEfectiva.getTime() - today.getTime()) / 86_400_000) }];
    });
    return { diasAnticipacion: horizon, count: items.length, items };
  }

  private async loadRows(query: ControlBookQueryDto, user: AuthUser) {
    const company = this.queryCompany(query.idEmpresa, user);
    const customers = await this.prisma.cliente.findMany({
      where: { idEmpresa: company },
      include: {
        direcciones: { orderBy: [{ esPrincipal: 'desc' }, { idDireccion: 'asc' }] },
        servicios: { where: { idEmpresa: company }, include: { direccion: true, zonaPago: true }, orderBy: { idServicio: 'asc' } },
        eventosGestionComercial: { where: { idEmpresa: company }, include: { responsable: { select: { nombreCompleto: true } } }, orderBy: [{ fecha: 'desc' }, { idEvento: 'desc' }] },
        cargosAdicionales: { where: { idEmpresa: company, estado: 'PENDIENTE_FACTURACION' } },
        contratos: {
          where: { idEmpresa: company }, orderBy: { idContrato: 'asc' },
          include: {
            plan: true, zonaPago: true,
            cambiosCondicionPago: { where: { idEmpresa: company, tipoCambio: 'FECHA_COMPROMETIDA' }, orderBy: { fechaRegistro: 'desc' }, take: 1 },
            facturas: { orderBy: { idFactura: 'desc' }, include: {
              pagos: { orderBy: { fechaPago: 'desc' } },
              conveniosPago: { where: { idEmpresa: company, estado: { in: ACTIVE_AGREEMENT_STATES } }, orderBy: { fechaRegistro: 'desc' }, take: 1 },
              prorrogasPago: { where: { idEmpresa: company, estado: { in: ACTIVE_EXTENSION_STATES } }, orderBy: { nuevaFecha: 'desc' }, take: 1 },
            } },
          },
        },
      },
      orderBy: { idCliente: 'asc' },
    });
    const observations = customers.length ? await this.prisma.observacionOperativa.findMany({
      where: { idEmpresa: company, idCliente: { in: customers.map((customer) => customer.idCliente) } },
      orderBy: [{ fechaCreacion: 'desc' }, { idObservacion: 'desc' }],
    }) : [];
    const observationByCustomer = new Map<number, string>();
    observations.forEach((item) => { if (item.idCliente && !observationByCustomer.has(item.idCliente)) observationByCustomer.set(item.idCliente, item.observacion); });
    type Customer = (typeof customers)[number];
    type Contract = Customer['contratos'][number];
    type Service = Customer['servicios'][number];
    type Invoice = Contract['facturas'][number];
    const project = (customer: Customer, contract: Contract | null, services: Service[], invoice: Invoice | null) => {
      const service = services.length === 1 ? services[0] : null;
      const events = customer.eventosGestionComercial.filter((event) =>
        (event.idFactura === null || event.idFactura === invoice?.idFactura) &&
        (event.idContrato === null || event.idContrato === contract?.idContrato) &&
        (event.idServicio === null || services.some((item) => item.idServicio === event.idServicio)));
      const lastEvent = events[0] ?? null;
      const lastNotice = events.find((event) => event.tipo === 'ULTIMO_AVISO_CORTE');
      const withdrawal = events.find((event) => event.tipo === 'AVISO_PREVIO_RETIRO');
      const extension = invoice?.prorrogasPago[0] ?? null;
      const status = invoice ? this.statusService.calculate({ monto: invoice.monto === null ? null : Number(invoice.monto), totalPagado: invoice.pagos.reduce((sum, payment) => sum + Number(payment.monto), 0), fechaVencimiento: invoice.fechaLimitePago, nuevaFechaProrroga: extension?.nuevaFecha, convenioActivo: invoice.conveniosPago.length > 0, ultimoAviso: Boolean(lastNotice), retiroPendiente: Boolean(withdrawal), umbralUltimoAvisoDias: this.cutDays() }) : {
        montoDocumento: null, totalPagado: null, saldoPendiente: null, saldoFavor: null, fechaVencimientoEfectiva: null,
        diasAtraso: null, estadoComercial: 'SIN_FACTURAS', accionSugerida: 'Registrar contacto con el cliente',
      };
      const lastPayment = invoice?.pagos[0] ?? null;
      const charges = customer.cargosAdicionales.filter((charge) => contract ? charge.idContrato === contract.idContrato : service ? charge.idContrato === null && charge.idServicio === service.idServicio : charge.idContrato === null && charge.idServicio === null);
      return {
        rowId: invoice ? `${customer.idCliente}-${contract!.idContrato}-${invoice.idFactura}` : `${customer.idCliente}-${contract?.idContrato ?? 'sin-contrato'}-${service?.idServicio ?? 'sin-servicio'}-sin-factura`,
        idEmpresa: customer.idEmpresa, idCliente: customer.idCliente, rut: customer.rut, nombre: customer.nombreCompleto,
        telefono: customer.telefono, email: customer.email, direccion: service?.direccion?.direccionCompleta ?? contract?.direccionInstalacion ?? customer.direcciones[0]?.direccionCompleta ?? null,
        idServicio: service?.idServicio ?? null, serviciosRelacionados: services.map((item) => item.idServicio), estadoServicio: service?.estadoOperativo ?? (services.length > 1 ? 'Múltiples servicios' : null),
        idContrato: contract?.idContrato ?? null, numeroContrato: contract ? contract.numeroContratoExterno ?? String(contract.idContrato) : null, idPlan: contract?.idPlan ?? null,
        plan: contract?.plan?.nombreComercial ?? null, nombrePlan: contract?.plan?.nombreComercial ?? null,
        idZona: service?.idZonaPago ?? contract?.idZonaPago ?? null, zona: service?.zonaPago?.nombreZona ?? contract?.zonaPago?.nombreZona ?? null,
        idFactura: invoice?.idFactura ?? null, tipoDocumento: invoice?.tipoDocumento ?? null, numeroDocumento: invoice ? invoice.folioExterno ?? String(invoice.idFactura) : null,
        fechaEmision: invoice?.fechaEmision?.toISOString().slice(0, 10) ?? null, fechaVencimiento: invoice?.fechaLimitePago.toISOString().slice(0, 10) ?? null,
        fechaVencimientoEfectiva: status.fechaVencimientoEfectiva?.toISOString().slice(0, 10) ?? null, estadoDocumento: invoice?.estado ?? 'SIN_FACTURAS',
        montoDocumento: status.montoDocumento, totalPagado: status.totalPagado, saldoPendiente: status.saldoPendiente, saldoFavor: status.saldoFavor,
        diasAtraso: status.diasAtraso, estadoComercial: status.estadoComercial, ultimaGestion: lastEvent?.tipo ?? null,
        fechaUltimaGestion: lastEvent?.fecha.toISOString() ?? null, responsableUltimaGestion: lastEvent?.responsable.nombreCompleto ?? null,
        accionSugerida: status.accionSugerida, convenioActivo: Boolean(invoice?.conveniosPago.length), prorrogaActiva: Boolean(extension),
        ultimoAviso: Boolean(lastNotice),
        diaPago: contract?.diaVencimiento ?? null, cambioFecha: contract?.cambiosCondicionPago[0]?.valorNuevo ?? null,
        fechaInstalacion: service?.fechaCreacion?.toISOString().slice(0, 10) ?? null, fechaCorte: contract?.fechaSuspension?.toISOString().slice(0, 10) ?? null,
        estadoCorte: contract?.estado === 'Suspendido' ? 'SUSPENDIDO_COMERCIAL' : null, fechaReactivacion: null,
        avisoRetiro: Boolean(withdrawal), retiroPendiente: Boolean(withdrawal), observacionRelevante: observationByCustomer.get(customer.idCliente) ?? null,
        ultimoPago: lastPayment?.fechaPago.toISOString().slice(0, 10) ?? null, formaPago: lastPayment?.pasarela ?? null,
        codigoTransaccion: lastPayment?.codigoTransaccion ?? null, valorRecibido: lastPayment ? Number(lastPayment.monto) : null,
        cargosPendientes: this.money(charges.reduce((sum, charge) => sum + Number(charge.monto), 0)),
      };
    };
    let rows = customers.flatMap((customer) => {
      const contractRows = customer.contratos.flatMap((contract) => {
        const services = customer.servicios.filter((service) => service.idContrato === contract.idContrato);
        return contract.facturas.length ? contract.facturas.map((invoice) => project(customer, contract, services, invoice)) : [project(customer, contract, services, null)];
      });
      const unlinkedServices = customer.servicios.filter((service) => !customer.contratos.some((contract) => contract.idContrato === service.idContrato));
      const serviceRows = unlinkedServices.map((service) => project(customer, null, [service], null));
      return contractRows.length || serviceRows.length ? [...contractRows, ...serviceRows] : [project(customer, null, [], null)];
    });
    rows = this.filterRows(rows, query);
    this.sortRows(rows, query.sort ?? 'diasAtraso', query.order ?? 'desc');
    return rows;
  }

  private filterRows<T extends Record<string, unknown>>(rows: T[], query: ControlBookQueryDto) {
    const search = this.normalize(query.search ?? '');
    return rows.filter((row) => {
      if (search && !['rut', 'nombre', 'telefono', 'numeroContrato', 'numeroDocumento'].some((key) => this.normalize(row[key]).includes(search))) return false;
      if (query.estadoComercial && row.estadoComercial !== query.estadoComercial) return false;
      if (query.estadoServicio && row.estadoServicio !== query.estadoServicio) return false;
      if (query.idZona && row.idZona !== query.idZona) return false;
      if (query.idPlan && row.idPlan !== query.idPlan) return false;
      if (query.fechaVencimientoDesde && (!row.fechaVencimiento || String(row.fechaVencimiento) < query.fechaVencimientoDesde)) return false;
      if (query.fechaVencimientoHasta && (!row.fechaVencimiento || String(row.fechaVencimiento) > query.fechaVencimientoHasta)) return false;
      if (query.conDeuda !== undefined && (Number(row.saldoPendiente ?? 0) > 0) !== query.conDeuda) return false;
      if (query.vencido !== undefined && (Number(row.diasAtraso ?? 0) > 0) !== query.vencido) return false;
      if (query.conConvenio !== undefined && Boolean(row.convenioActivo) !== query.conConvenio) return false;
      if (query.conProrroga !== undefined && Boolean(row.prorrogaActiva) !== query.conProrroga) return false;
      if (query.conUltimoAviso !== undefined && Boolean(row.ultimoAviso) !== query.conUltimoAviso) return false;
      if (query.retiroPendiente !== undefined && Boolean(row.retiroPendiente) !== query.retiroPendiente) return false;
      if (query.diasAtrasoMin !== undefined && (row.diasAtraso === null || Number(row.diasAtraso) < query.diasAtrasoMin)) return false;
      if (query.diasAtrasoMax !== undefined && (row.diasAtraso === null || Number(row.diasAtraso) > query.diasAtrasoMax)) return false;
      return true;
    });
  }

  private sortRows(rows: Array<Record<string, unknown>>, sort: string, order: 'asc' | 'desc') {
    const keys: Record<string, string> = { nombre: 'nombre', saldo: 'saldoPendiente', diasAtraso: 'diasAtraso', fechaVencimiento: 'fechaVencimientoEfectiva', ultimaGestion: 'fechaUltimaGestion' };
    const key = keys[sort];
    if (!key) throw new BadRequestException('Ordenamiento no permitido');
    const direction = order === 'asc' ? 1 : -1;
    rows.sort((left, right) => String(left[key] ?? '').localeCompare(String(right[key] ?? ''), 'es', { numeric: true }) * direction);
  }

  private invoiceStatus(invoice: { monto: Prisma.Decimal | null; pagos: Array<{ monto: Prisma.Decimal }>; fechaLimitePago: Date; prorrogasPago: Array<{ nuevaFecha: Date }> }) {
    return this.statusService.calculate({ monto: invoice.monto === null ? null : Number(invoice.monto), totalPagado: invoice.pagos.reduce((sum, payment) => sum + Number(payment.monto), 0), fechaVencimiento: invoice.fechaLimitePago, nuevaFechaProrroga: invoice.prorrogasPago[0]?.nuevaFecha, umbralUltimoAvisoDias: this.cutDays() });
  }

  private debtInvoice(idFactura: number) {
    return this.prisma.factura.findUnique({ where: { idFactura }, include: { pagos: true, contrato: { include: { cliente: true } }, prorrogasPago: { where: { estado: { in: ACTIVE_EXTENSION_STATES } }, orderBy: { nuevaFecha: 'desc' }, take: 1 } } }).then((invoice) => { if (!invoice) throw new NotFoundException('Factura no encontrada'); if (CLOSED_INVOICE_STATES.includes(invoice.estado) || !this.invoiceStatus(invoice).saldoPendiente) throw new BadRequestException('La factura no tiene deuda vigente'); return invoice; });
  }

  private async customer(idCliente: number) {
    const customer = await this.prisma.cliente.findUnique({ where: { idCliente } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  private assertRelated(idCliente: number, idEmpresa: number, service: { idCliente: number; idEmpresa: number | null } | null, contract: { idCliente: number | null; idEmpresa: number | null } | null, invoice: { contrato: { idCliente: number | null; idEmpresa: number | null } | null } | null) {
    if (service && (service.idCliente !== idCliente || service.idEmpresa !== idEmpresa)) throw new BadRequestException('Servicio incompatible con el cliente o empresa');
    if (contract && (contract.idCliente !== idCliente || contract.idEmpresa !== idEmpresa)) throw new BadRequestException('Contrato incompatible con el cliente o empresa');
    if (invoice && (!invoice.contrato || invoice.contrato.idCliente !== idCliente || invoice.contrato.idEmpresa !== idEmpresa)) throw new BadRequestException('Factura incompatible con el cliente o empresa');
  }

  private auditCondition(id: number, user: AuthUser, dto: ChangePaymentConditionDto, previous: string, next: string) {
    return this.audit.record({ idUsuario: user.idUsuario, accion: 'CAMBIAR_CONDICION_PAGO', entidadAfectada: 'cambio_condicion_pago', idEntidadAfectada: id, valorAnterior: { valor: previous }, valorNuevo: { tipoCambio: dto.tipoCambio, valor: next, justificacion: dto.justificacion.trim() } });
  }

  private assertViewer(user: AuthUser) {
    if (!isAdministrator(user.roles) && !hasRole(user.roles, 'Comercial') && !hasRole(user.roles, 'Soporte')) throw new ForbiddenException('No tienes permiso para consultar Libro Control');
  }

  private assertWriter(user: AuthUser) {
    if (!isAdministrator(user.roles) && !hasRole(user.roles, 'Comercial')) throw new ForbiddenException('No tienes permiso para gestionar cobranza comercial');
  }

  private assertCompany(idEmpresa: number, user: AuthUser) {
    if (!isAdministrator(user.roles) && user.idEmpresa !== idEmpresa) throw new ForbiddenException('El registro pertenece a otra empresa');
  }

  private queryCompany(requested: number | undefined, user: AuthUser) {
    if (!isAdministrator(user.roles)) {
      if (!user.idEmpresa) throw new BadRequestException('El usuario no tiene empresa asociada');
      if (requested && requested !== user.idEmpresa) throw new ForbiddenException('No puedes consultar otra empresa');
      return user.idEmpresa;
    }
    const company = requested ?? user.idEmpresa;
    if (!company) throw new BadRequestException('Debe seleccionar una empresa para Libro Control');
    return company;
  }

  private resolveWriteCompany(requested: number | undefined, user: AuthUser) {
    const company = isAdministrator(user.roles) ? requested ?? user.idEmpresa : user.idEmpresa;
    if (!company) throw new BadRequestException('Debe indicar empresa');
    if (!isAdministrator(user.roles) && requested && requested !== company) throw new ForbiddenException('No puedes registrar datos en otra empresa');
    return company;
  }

  private requireCompany(value: number | null | undefined) {
    if (!value) throw new BadRequestException('El registro no tiene empresa asociada');
    return value;
  }

  private dateOnly(value: string, field: string) {
    const parsed = parseDateOnly(value);
    if (!parsed) throw new BadRequestException(`${field} no es una fecha válida`);
    return parsed;
  }

  private dateTime(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} no es una fecha válida`);
    return parsed;
  }

  private normalizePhone(value: string) {
    const digits = value.replace(/[^0-9]/g, '');
    if (/^569\d{8}$/.test(digits)) return `+${digits}`;
    if (/^9\d{8}$/.test(digits)) return `+56${digits}`;
    throw new BadRequestException('El teléfono debe ser un móvil chileno válido');
  }

  private normalize(value: unknown) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private exportColumns(value?: string) {
    if (!value?.trim()) return Object.keys(EXPORT_COLUMNS) as ExportColumn[];
    const columns = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
    if (!columns.length || columns.some((item) => !(item in EXPORT_COLUMNS))) throw new BadRequestException('La selección de columnas contiene valores no permitidos');
    return columns as ExportColumn[];
  }

  private csvValue(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private columnWidth(key: ExportColumn) {
    return ['nombre', 'direccion', 'observacionRelevante', 'accionSugerida'].includes(key) ? 32 : 18;
  }

  private appliedFilters(query: ControlBookQueryDto) {
    return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== null));
  }

  private uniqueOptions(rows: Array<Record<string, unknown>>, idKey: string, labelKey: string) {
    const options = new Map<number, string>();
    rows.forEach((row) => {
      const id = Number(row[idKey]);
      const label = String(row[labelKey] ?? '').trim();
      if (Number.isInteger(id) && id > 0 && label) options.set(id, label);
    });
    return [...options].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  private cutDays() {
    const value = Number(this.config.get('BILLING_CUT_DAYS') ?? 5);
    return Number.isInteger(value) && value > 0 ? value : 5;
  }

  private expiryAlertDays() {
    const value = Number(this.config.get('COMMERCIAL_PLAN_EXPIRY_ALERT_DAYS') ?? 7);
    return Number.isInteger(value) && value >= 1 && value <= 90 ? value : 7;
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
