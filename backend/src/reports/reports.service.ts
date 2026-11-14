import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, REPORT_MIN_DATE, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialControlBookService, CONTROL_BOOK_REPORT_COLUMNS } from '../commercial/commercial-control-book.service';
import { ControlBookQueryDto } from '../commercial/commercial.dto';

type ReportFormat = 'csv' | 'xlsx';
type ReportType = 'clientes' | 'prospectos' | 'tickets' | 'inventario' | 'libro-control' | 'cobranza' | 'materiales';
type ReportRow = Record<string, unknown>;
type ReportTable = { name: string; rows: ReportRow[] };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly controlBook?: CommercialControlBookService,
  ) {}

  async export(
    type: ReportType,
    format: ReportFormat,
    currentUser: AuthUser,
    scope = 'consolidado',
    dateFrom?: string,
    dateTo?: string,
  ) {
    if (!['csv', 'xlsx'].includes(format)) throw new BadRequestException('Formato de reporte no soportado');
    const period = this.reportPeriod(dateFrom, dateTo);
    const tables = type === 'libro-control' || type === 'cobranza'
      ? await this.bookTables(currentUser, scope, dateFrom, dateTo)
      : type === 'inventario' ? await this.inventoryTables(currentUser, scope, period)
        : [{ name: type, rows: await this.rows(type, currentUser, scope, period) }];
    const rows = tables.flatMap(table => table.rows.map(row => tables.length > 1 ? { sección: table.name, ...row } : row));
    const buffer = format === 'csv' ? this.csv(rows) : await this.xlsxTables(tables);

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'EXPORTAR_REPORTE',
      entidadAfectada: 'reporte',
      valorNuevo: { type, format, scope, dateFrom, dateTo, rows: rows.length },
    });

    return {
      buffer,
      contentType:
        format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `reporte-${type}.${format}`,
    };
  }

  private async bookTables(user: AuthUser, scope: string, from?: string, to?: string): Promise<ReportTable[]> {
    if (!this.controlBook) throw new BadRequestException('El Libro de control no está disponible');
    const companies = await this.prisma.empresa.findMany({ where: this.companyScope(user, scope), orderBy: { idEmpresa: 'asc' } });
    const overview: ReportRow[] = [], movements: ReportRow[] = [], payments: ReportRow[] = [];
    const inPeriod = (value: string | null | undefined) => !from && !to || Boolean(value && (!from || value.slice(0, 10) >= from) && (!to || value.slice(0, 10) <= to));
    for (const company of companies) {
      const query = Object.assign(new ControlBookQueryDto(), { idEmpresa: company.idEmpresa });
      const rows = await this.controlBook.reportRows(query, user);
      rows.forEach(row => overview.push({
        Empresa: company.nombre,
        ...Object.fromEntries(Object.entries(CONTROL_BOOK_REPORT_COLUMNS).map(([key, title]) => [title, row[key as keyof typeof row]])),
      }));
      const customers = [...new Map(rows.map(row => [row.idCliente, row])).values()];
      // Bound concurrency; histories use the same company/identity rules as the on-screen book.
      for (let offset = 0; offset < customers.length; offset += 4) {
        const batch = customers.slice(offset, offset + 4);
        const histories = await Promise.all(batch.map(row => this.controlBook!.customerHistory(row.idCliente, company.idEmpresa, user)));
        histories.forEach((history, index) => {
          const customer = batch[index];
          const identity = { Empresa: company.nombre, Cliente: customer.nombre, RUT: customer.rut };
          history.movements.filter(row => inPeriod(row.fecha)).forEach(row => movements.push({
            ...identity, Tipo: row.tipo, Fecha: row.fecha, 'Fecha registro': row.fechaRegistro, Contrato: row.idContrato, Factura: row.idFactura,
            Estado: row.estado, Responsable: row.responsable, Canal: row.canal, Monto: row.monto, Detalle: row.detalle,
            'Fecha original': row.fechaOriginal, 'Nueva fecha': row.nuevaFecha, 'Valor anterior': row.valorAnterior, 'Valor nuevo': row.valorNuevo,
            Aprobador: row.aprobador, 'Fecha aprobación': row.fechaAprobacion, Cuotas: row.cuotas ? JSON.stringify(row.cuotas) : null,
          }));
          history.invoices.forEach(invoice => invoice.pagos.filter(payment => inPeriod(payment.fecha)).forEach(payment => payments.push({
            ...identity, Contrato: invoice.idContrato, Factura: invoice.idFactura, Plan: invoice.plan, Pago: payment.idPago,
            Fecha: payment.fecha, Monto: payment.monto, Medio: payment.medio, Referencia: payment.referencia,
          })));
        });
      }
    }
    return [{ name: 'Libro de control', rows: overview }, { name: 'Gestiones', rows: movements }, { name: 'Pagos', rows: payments }];
  }

  private async inventoryTables(user: AuthUser, scope: string, period?: { gte?: Date; lte?: Date }): Promise<ReportTable[]> {
    const where = this.companyScope(user, scope);
    const [units, types, warehouses, companies, movements] = await Promise.all([
      this.prisma.unidadEquipo.findMany({ where, orderBy: { idUnidad: 'desc' } }),
      this.prisma.tipoEquipo.findMany({ where }),
      this.prisma.bodega.findMany({ where }),
      this.prisma.empresa.findMany({ where }),
      this.prisma.movimientoInventario.findMany({ where: {
        ...('idEmpresa' in where ? { OR: [{ idEmpresaOrigen: where.idEmpresa }, { idEmpresaDestino: where.idEmpresa }] } : {}),
        ...(period ? { fecha: period } : {}),
      }, orderBy: { fecha: 'desc' } }),
    ]);
    const stocks = warehouses.length ? await this.prisma.stockConsumible.findMany({ where: { idBodega: { in: warehouses.map(row => row.idBodega) } } }) : [];
    const ids = [...new Set(units.map(row => row.idClienteInstalado).filter((id): id is number => id !== null))];
    const customers = ids.length ? await this.prisma.cliente.findMany({ where: { idCliente: { in: ids } }, select: { idCliente: true, nombreCompleto: true, rut: true } }) : [];
    const typeMap = new Map(types.map(row => [row.idTipoEquipo, row]));
    const warehouseMap = new Map(warehouses.map(row => [row.idBodega, row]));
    const companyMap = new Map(companies.map(row => [row.idEmpresa, row.nombre]));
    const customerMap = new Map(customers.map(row => [row.idCliente, row]));
    const source = 'Registro disponible en CRM; pendiente consolidación con Inventario y Bodega';
    const snapshot = new Date().toISOString();
    const summary = companies.map(company => {
      const own = units.filter(row => row.idEmpresa === company.idEmpresa);
      return { Empresa: company.nombre, 'Unidades registradas': own.length,
        'En bodega': own.filter(row => row.estado === 'En bodega').length,
        'Asignadas a técnico': own.filter(row => row.estado === 'Asignado a técnico').length,
        'Instaladas en cliente': own.filter(row => row.estado === 'Instalado en cliente').length,
        'En revisión': own.filter(row => row.estado === 'En revisión').length,
        'En préstamo externo': own.filter(row => row.estado === 'En préstamo externo').length,
        'Dadas de baja': own.filter(row => row.estado === 'Dado de baja').length,
        'Otros estados': own.filter(row => !['En bodega', 'Asignado a técnico', 'Instalado en cliente', 'En revisión', 'En préstamo externo', 'Dado de baja'].includes(row.estado)).length,
        'Clientes con equipo': new Set(own.map(row => row.idClienteInstalado).filter(id => id !== null)).size,
        'Movimientos del período': movements.filter(row => row.idEmpresaOrigen === company.idEmpresa || row.idEmpresaDestino === company.idEmpresa).length,
        Fuente: source, 'Fecha consulta': snapshot };
    });
    return [{ name: 'Resumen inventario', rows: summary }, { name: 'Unidades', rows: units.map(row => ({
      Empresa: row.idEmpresa ? companyMap.get(row.idEmpresa) ?? row.idEmpresa : null, Unidad: row.idUnidad, Serie: row.numeroSerie,
      Tipo: row.idTipoEquipo ? typeMap.get(row.idTipoEquipo)?.nombre ?? row.idTipoEquipo : null,
      Categoría: row.idTipoEquipo ? typeMap.get(row.idTipoEquipo)?.categoria : null, Modelo: row.modelo, Estado: row.estado,
      Disponibilidad: row.estado === 'En bodega' && !row.idClienteInstalado && !row.idServicio ? 'En bodega sin asignación registrada; reserva por confirmar en Inventario y Bodega' : 'Verificar estado y asignación en Inventario y Bodega',
      Cliente: row.idClienteInstalado ? customerMap.get(row.idClienteInstalado)?.nombreCompleto ?? row.idClienteInstalado : null,
      'RUT cliente': row.idClienteInstalado ? customerMap.get(row.idClienteInstalado)?.rut : null, Servicio: row.idServicio,
      Bodega: row.idBodegaActual ? warehouseMap.get(row.idBodegaActual)?.nombre ?? row.idBodegaActual : null,
      'Fecha adquisición': row.fechaAdquisicion?.toISOString().slice(0, 10), 'Vencimiento garantía': row.fechaVencGarantia?.toISOString().slice(0, 10),
      Diagnóstico: row.diagnosticoTecnico, Fuente: source, 'Fecha consulta': snapshot,
    })) }, { name: 'Consumibles', rows: stocks.map(row => ({
      Empresa: row.idBodega ? companyMap.get(warehouseMap.get(row.idBodega)?.idEmpresa ?? 0) : null,
      Tipo: row.idTipoEquipo ? typeMap.get(row.idTipoEquipo)?.nombre ?? row.idTipoEquipo : null,
      Bodega: row.idBodega ? warehouseMap.get(row.idBodega)?.nombre ?? row.idBodega : null,
      'Cantidad disponible registrada': row.cantidadDisponible === null ? null : Number(row.cantidadDisponible),
      'Umbral mínimo': row.umbralMinimo === null ? null : Number(row.umbralMinimo),
      'Bajo mínimo': row.cantidadDisponible === null || row.umbralMinimo === null ? 'Sin información' : Number(row.cantidadDisponible) < Number(row.umbralMinimo) ? 'Sí' : 'No',
      Fuente: source, 'Fecha consulta': snapshot,
    })) }, { name: 'Movimientos inventario', rows: movements.map(row => ({
      Movimiento: row.idMovimiento.toString(), Fecha: row.fecha?.toISOString(), Tipo: row.tipoMovimiento,
      Unidad: row.idUnidad, 'Tipo equipo': row.idTipoEquipo ? typeMap.get(row.idTipoEquipo)?.nombre ?? row.idTipoEquipo : null,
      Cantidad: row.cantidad === null ? null : Number(row.cantidad),
      'Empresa origen': row.idEmpresaOrigen ? companyMap.get(row.idEmpresaOrigen) ?? row.idEmpresaOrigen : null,
      'Empresa destino': row.idEmpresaDestino ? companyMap.get(row.idEmpresaDestino) ?? row.idEmpresaDestino : null,
      'Bodega origen': row.idBodegaOrigen ? warehouseMap.get(row.idBodegaOrigen)?.nombre ?? row.idBodegaOrigen : null,
      'Bodega destino': row.idBodegaDestino ? warehouseMap.get(row.idBodegaDestino)?.nombre ?? row.idBodegaDestino : null,
      Referencia: row.referenciaId, Fuente: source,
    })) }];
  }

  private async rows(
    type: ReportType,
    currentUser: AuthUser,
    scope: string,
    period?: { gte?: Date; lte?: Date },
  ) {
    const where = this.companyScope(currentUser, scope);

    if (type === 'clientes') {
      const idEmpresa = 'idEmpresa' in where ? where.idEmpresa : undefined;
      const companyFilter = idEmpresa ? { idEmpresa } : {};
      const rows = await this.prisma.cliente.findMany({
        where: idEmpresa ? { OR: [{ idEmpresa }, { contratos: { some: { idEmpresa } } }] } : {},
        orderBy: { fechaCreacion: 'desc' },
        include: {
          empresa: true,
          contratos: { where: companyFilter, include: { plan: true }, orderBy: { fechaInicio: 'desc' } },
          servicios: { where: companyFilter, select: { tipoServicio: true, estadoOperativo: true } },
          direcciones: { where: idEmpresa ? { servicios: { some: { idEmpresa } } } : {}, orderBy: [{ esPrincipal: 'desc' }, { idDireccion: 'asc' }], take: 1 },
        },
      });
      const companies = await this.prisma.empresa.findMany({ where: companyFilter });
      const names = new Map(companies.map(company => [company.idEmpresa, company.nombre]));
      const join = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].join(' · ');
      return rows.map((row) => ({
        RUT: row.rut,
        Cliente: row.nombreCompleto,
        Correo: row.email,
        Teléfono: row.telefono,
        Dirección: row.direcciones[0]?.direccionCompleta ?? join(row.contratos.map(contract => contract.direccionInstalacion)),
        Comuna: row.direcciones[0]?.comuna ?? join(row.contratos.map(contract => contract.comunaInstalacion)),
        Empresa: join([...(row.idEmpresa && (!idEmpresa || row.idEmpresa === idEmpresa) ? [names.get(row.idEmpresa)] : []), ...row.contratos.map(contract => contract.idEmpresa ? names.get(contract.idEmpresa) : null)]),
        Plan: join(row.contratos.map(contract => contract.plan && (!idEmpresa || contract.plan.idEmpresa === idEmpresa) ? contract.plan.nombreComercial : null)),
        Servicio: join(row.servicios.map(service => service.tipoServicio)),
        'Estado cliente': idEmpresa ? null : row.estado,
        'Estado servicio': join(row.servicios.map(service => service.estadoOperativo)),
        'Estado contrato': join(row.contratos.map(contract => contract.estado)),
        'Fecha registro': row.fechaCreacion?.toISOString() ?? null,
      }));
    }

    if (type === 'prospectos') {
      const rows = await this.prisma.prospecto.findMany({
        where: { ...where, ...(period ? { fechaCreacion: period } : {}) },
        orderBy: { fechaCreacion: 'desc' },
      });
      return rows.map((row) => ({
        id: row.idProspecto,
        rut: row.rut,
        nombre: row.nombreCompleto,
        estado: row.estadoPipeline,
        motivo_perdida: row.motivoPerdida,
        tiempo_conversion_dias: row.tiempoConversionDias,
        empresa: row.idEmpresa,
      }));
    }

    if (type === 'tickets') {
      const rows = await this.prisma.ticket.findMany({
        where: { ...where, ...(period ? { fechaCreacion: period } : {}) },
        orderBy: { fechaCreacion: 'desc' },
      });
      return rows.map((row) => ({
        id: row.idTicket,
        cliente: row.idCliente,
        categoria: row.idCategoria,
        prioridad: row.prioridad,
        estado: row.estado,
        seguimiento: row.codigoSeguimiento,
        empresa: row.idEmpresa,
      }));
    }

    if (type === 'materiales') {
      const orders = await this.prisma.ordenTrabajo.findMany({
        where,
        select: { idOt: true, idEmpresa: true, tipoOt: true, fechaCompletada: true, fechaProgramada: true },
        take: 1000,
      });
      const orderById = new Map(orders.map((order) => [order.idOt, order]));
      const rows = orders.length
        ? await this.prisma.usoMaterialOt.findMany({
            where: { idOt: { in: orders.map((order) => order.idOt) } },
            orderBy: { idUso: 'desc' },
          })
        : [];
      const typeIds = [...new Set(rows.map((row) => row.idTipoEquipo).filter((id): id is number => Boolean(id)))];
      const types = typeIds.length ? await this.prisma.tipoEquipo.findMany({ where: { idTipoEquipo: { in: typeIds } } }) : [];
      const typeById = new Map(types.map((type) => [type.idTipoEquipo, type]));

      return rows.map((row) => {
        const order = row.idOt ? orderById.get(row.idOt) : null;

        return {
          uso: row.idUso,
          orden: row.idOt,
          empresa: order?.idEmpresa,
          tipo_trabajo: order?.tipoOt,
          fecha_ot: order?.fechaCompletada?.toISOString() ?? order?.fechaProgramada?.toISOString().slice(0, 10),
          material: row.idTipoEquipo ? typeById.get(row.idTipoEquipo)?.nombre ?? row.idTipoEquipo : null,
          unidad: row.idUnidad,
          cantidad: Number(row.cantidad),
        };
      });
    }

    throw new BadRequestException('Reporte no soportado');
  }

  private csv(rows: Record<string, unknown>[]) {
    if (!rows.length) {
      return Buffer.from('', 'utf8');
    }

    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.csvValue(row[header])).join(',')),
    ];

    return Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
  }

  private async xlsxTables(tables: ReportTable[]) {
    const workbook = new ExcelJS.Workbook();
    for (const table of tables) {
      const sheet = workbook.addWorksheet(table.name.slice(0, 31));
      const headers = [...new Set(table.rows.flatMap(row => Object.keys(row)))];
      sheet.columns = (headers.length ? headers : ['Sin registros']).map(header => ({ header, key: header, width: 24 }));
      table.rows.forEach(row => sheet.addRow(row));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF247C68' } };
      if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private csvValue(value: unknown) {
    const raw = value === null || value === undefined ? '' : String(value);
    const text = typeof value === 'string' && /^[=+@\t\r-]/.test(raw) ? `'${raw}` : raw;

    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  private reportPeriod(dateFrom?: string, dateTo?: string) {
    const from = this.parseDate(dateFrom, false);
    const to = this.parseDate(dateTo, true);

    if (from && to && from > to) {
      throw new BadRequestException('El inicio del periodo no puede ser posterior al termino');
    }

    if (!from && !to) {
      return undefined;
    }

    return {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  private parseDate(value: string | undefined, endOfDay: boolean) {
    if (!value) {
      return undefined;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('El periodo debe usar el formato AAAA-MM-DD');
    }

    const parsedDate = parseDateOnly(value);

    if (!parsedDate) {
      throw new BadRequestException('El periodo informado no es valido');
    }

    if (value < REPORT_MIN_DATE) {
      throw new BadRequestException(`El periodo no puede ser anterior a ${REPORT_MIN_DATE}`);
    }

    if (value > todayDateOnly()) {
      throw new BadRequestException('El periodo del reporte no puede incluir fechas futuras');
    }

    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }

  private companyScope(currentUser: AuthUser, scope: string) {
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
