import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, REPORT_MIN_DATE, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';

type ReportFormat = 'csv' | 'xlsx';
type ReportType = 'clientes' | 'prospectos' | 'tickets' | 'inventario';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async export(
    type: ReportType,
    format: ReportFormat,
    currentUser: AuthUser,
    scope = 'consolidado',
    dateFrom?: string,
    dateTo?: string,
  ) {
    const period = this.reportPeriod(dateFrom, dateTo);
    const rows = await this.rows(type, currentUser, scope, period);
    const buffer = format === 'csv' ? this.csv(rows) : await this.xlsx(rows, type);

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

  private async rows(
    type: ReportType,
    currentUser: AuthUser,
    scope: string,
    period?: { gte?: Date; lte?: Date },
  ) {
    const where = this.companyScope(currentUser, scope);

    if (type === 'clientes') {
      const rows = await this.prisma.cliente.findMany({
        where: { ...where, ...(period ? { fechaCreacion: period } : {}) },
        orderBy: { fechaCreacion: 'desc' },
      });
      return rows.map((row) => ({
        id: row.idCliente,
        rut: row.rut,
        nombre: row.nombreCompleto,
        email: row.email,
        telefono: row.telefono,
        estado: row.estado,
        empresa: row.idEmpresa,
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

    if (type === 'inventario') {
      const rows = await this.prisma.unidadEquipo.findMany({
        where: { ...where, ...(period ? { fechaAdquisicion: period } : {}) },
        orderBy: { idUnidad: 'desc' },
      });
      return rows.map((row) => ({
        id: row.idUnidad,
        serie: row.numeroSerie,
        modelo: row.modelo,
        estado: row.estado,
        cliente_instalado: row.idClienteInstalado,
        bodega: row.idBodegaActual,
        empresa: row.idEmpresa,
      }));
    }

    throw new BadRequestException('Reporte no soportado');
  }

  private csv(rows: Record<string, unknown>[]) {
    if (!rows.length) {
      return Buffer.from('', 'utf8');
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.csvValue(row[header])).join(',')),
    ];

    return Buffer.from(lines.join('\n'), 'utf8');
  }

  private async xlsx(rows: Record<string, unknown>[], type: string) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type);
    const headers = rows[0] ? Object.keys(rows[0]) : ['sin_datos'];

    sheet.columns = headers.map((header) => ({ header, key: header, width: 24 }));
    rows.forEach((row) => sheet.addRow(row));

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private csvValue(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);

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
