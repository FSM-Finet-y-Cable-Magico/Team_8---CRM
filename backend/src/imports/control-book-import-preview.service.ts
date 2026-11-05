import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';

const FORMAT_VERSION = 'FINET_LIBRO_CONTROL_V1';
const HEADER_MAP: Record<string, string> = {
  'FECHA DE PAGO': 'fechaPago', RUT: 'rut', NOMBRE: 'nombre', 'DEUDA PENDIENTE': 'deuda',
  'PRORROGA/CONVENIO': 'prorrogaConvenio', 'CAMBIO FECHA': 'cambioFecha', PLAN: 'plan', 'NOMBRE PLAN': 'nombrePlan',
  'MONTO BOLETA/ FACT': 'montoDocumento', 'MONTO BOLETA /FACT': 'montoDocumento', 'BOLETA O FACTURA': 'tipoDocumento',
  EMISION: 'fechaEmision', 'DIA PAGO': 'diaPago', ESTADO: 'estado', ZONA: 'zona', RETIRO: 'retiro',
  OBSERVACIONES: 'observaciones', DIRECCIONES: 'direccion', TELEFONOS: 'telefono', 'CORREO ELECTRONICO': 'email',
  'FECHA INSTALACION': 'fechaInstalacion', 'FECHA CORTE': 'fechaCorte', 'FORMA DE PAGO': 'formaPago',
  'VALOR RECIBIDO': 'valorRecibido', SALDO: 'saldo', 'NUMERO VOUCHER': 'numeroVoucher',
};

@Injectable()
export class ControlBookImportPreviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async preview(file: Express.Multer.File | undefined, user: AuthUser, requestedCompany?: number, requestedSheet?: string) {
    if (!file) throw new BadRequestException('Archivo no informado');
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('El preview de Libro Control requiere un archivo XLSX');
    const idEmpresa = this.company(requestedCompany, user);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = requestedSheet ? workbook.getWorksheet(requestedSheet) : workbook.getWorksheet('AGOSTO') ?? workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El archivo no contiene hojas');
    const { rowNumber: headerRow, columns } = this.detectHeaders(sheet);
    if (!columns.has('rut')) throw new BadRequestException('No fue posible identificar la columna RUT mediante FINET_LIBRO_CONTROL_V1');

    const rawRows: Array<{ rowNumber: number; rut: string; plan: string; issues: string[] }> = [];
    const seen = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const rawRut = this.value(row.getCell(columns.get('rut') ?? 2));
      const rawName = columns.has('nombre') ? this.value(row.getCell(columns.get('nombre') ?? 0)) : '';
      if (!rawRut && !rawName) return;
      const issues: string[] = [];
      const rut = validateRut(rawRut);
      if (!rut.valid || !rut.normalized) issues.push('RUT_INVALIDO');
      else if (seen.has(rut.normalized)) issues.push('DUPLICADO_ARCHIVO');
      else seen.add(rut.normalized);
      const phoneColumn = columns.get('telefono');
      if (phoneColumn && this.phoneNeedsReview(row.getCell(phoneColumn).value)) issues.push('TELEFONO_REQUIERE_REVISION');
      for (const field of ['fechaPago', 'fechaEmision', 'fechaInstalacion', 'fechaCorte']) {
        const column = columns.get(field);
        if (column && !this.validContextDate(row.getCell(column).value)) issues.push(`FECHA_INVALIDA_${field.toUpperCase()}`);
      }
      for (const field of ['deuda', 'montoDocumento', 'valorRecibido', 'saldo']) {
        const column = columns.get(field);
        if (column && !this.validOptionalAmount(row.getCell(column).value)) issues.push(`MONTO_INVALIDO_${field.toUpperCase()}`);
      }
      row.eachCell((cell) => { if (this.value(cell).includes('#REF!') && !issues.includes('FORMULA_REF_INVALIDA')) issues.push('FORMULA_REF_INVALIDA'); });
      rawRows.push({ rowNumber, rut: rut.normalized ?? '', plan: columns.has('nombrePlan') ? this.value(row.getCell(columns.get('nombrePlan') ?? 0)) : columns.has('plan') ? this.value(row.getCell(columns.get('plan') ?? 0)) : '', issues });
    });

    const validRuts = rawRows.map((row) => row.rut).filter(Boolean);
    const [existingCustomers, existingProspects, plans] = await Promise.all([
      validRuts.length ? this.prisma.cliente.findMany({ where: { idEmpresa, rut: { in: validRuts } }, select: { rut: true } }) : [],
      validRuts.length ? this.prisma.prospecto.findMany({ where: { idEmpresa, rut: { in: validRuts } }, select: { rut: true } }) : [],
      this.prisma.plan.findMany({ where: { idEmpresa, activo: true }, select: { nombreComercial: true } }),
    ]);
    const existing = new Set([...existingCustomers, ...existingProspects].map((item) => item.rut).filter(Boolean));
    const planNames = new Set(plans.map((item) => this.normalize(item.nombreComercial)));
    const rows = rawRows.map((row) => {
      const issues = [...row.issues];
      const existingRecord = row.rut ? existing.has(row.rut) : false;
      const recognizedPlan = row.plan ? planNames.has(this.normalize(row.plan)) : false;
      if (row.plan && !recognizedPlan) issues.push('PLAN_DESCONOCIDO');
      return { rowNumber: row.rowNumber, status: issues.length ? 'REQUIERE_REVISION' : 'RECONOCIDA', existingRecord, recognizedPlan, issues };
    });
    const result = {
      formatVersion: FORMAT_VERSION,
      sheetName: sheet.name,
      sheetKind: this.normalize(sheet.name) === 'clientes que se fueron' ? 'HISTORICA_BAJAS' : this.normalize(sheet.name) === 'agosto' ? 'OPERACION_VIGENTE' : 'AUXILIAR_DESCONOCIDA',
      headerRow,
      detectedColumns: [...columns.keys()],
      totalRows: rows.length,
      recognizedRows: rows.filter((row) => row.status === 'RECONOCIDA').length,
      validRut: rawRows.filter((row) => Boolean(row.rut)).length,
      invalidRut: rows.filter((row) => row.issues.includes('RUT_INVALIDO')).length,
      duplicates: rows.filter((row) => row.issues.includes('DUPLICADO_ARCHIVO')).length,
      existingRecords: rows.filter((row) => row.existingRecord).length,
      unknownRecords: rows.filter((row) => !row.existingRecord).length,
      recognizedPlans: rows.filter((row) => row.recognizedPlan).length,
      unknownPlans: rows.filter((row) => row.issues.includes('PLAN_DESCONOCIDO')).length,
      invalidDates: rows.filter((row) => row.issues.some((issue) => issue.startsWith('FECHA_INVALIDA'))).length,
      invalidAmounts: rows.filter((row) => row.issues.some((issue) => issue.startsWith('MONTO_INVALIDO'))).length,
      ambiguousFields: rows.filter((row) => row.issues.includes('TELEFONO_REQUIERE_REVISION')).length,
      errors: rows.filter((row) => row.issues.length).slice(0, 200),
      persisted: false,
    };
    await this.audit.record({ idUsuario: user.idUsuario, accion: 'IMPORT_PREVIEW_LIBRO_CONTROL', entidadAfectada: 'libro_control_comercial', valorNuevo: { idEmpresa, formatVersion: FORMAT_VERSION, sheetName: sheet.name, totalRows: result.totalRows, recognizedRows: result.recognizedRows, persisted: false } });
    return result;
  }

  private detectHeaders(sheet: ExcelJS.Worksheet) {
    let best = { rowNumber: 1, score: -1, columns: new Map<string, number>() };
    for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
      const columns = new Map<string, number>();
      sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, column) => {
        const mapped = HEADER_MAP[this.header(this.value(cell))];
        if (mapped && !columns.has(mapped)) columns.set(mapped, column);
      });
      if (!columns.has('rut') && sheet.name.toUpperCase() === 'AGOSTO' && rowNumber === 1) columns.set('rut', 2);
      if (columns.size > best.score) best = { rowNumber, score: columns.size, columns };
    }
    return best;
  }

  private value(cell: ExcelJS.Cell) {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') return value.text.trim();
      if ('result' in value && value.result !== undefined) return String(value.result).trim();
      if ('error' in value) return String(value.error);
      if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
    }
    return String(value).trim();
  }

  private phoneNeedsReview(value: ExcelJS.CellValue) {
    if (typeof value === 'number') return true;
    const text = String(value ?? '').trim();
    if (!text) return false;
    if (/e[+-]?\d+/i.test(text)) return true;
    const digits = text.replace(/\D/g, '');
    return !(/^9\d{8}$/.test(digits) || /^569\d{8}$/.test(digits));
  }

  private validContextDate(value: ExcelJS.CellValue) {
    if (value === null || value === undefined || value === '') return true;
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === 'number') return Number.isInteger(value) && value >= 20_000 && value <= 80_000;
    const text = String(value).trim();
    if (!text) return true;
    return !Number.isNaN(new Date(text).getTime());
  }

  private validOptionalAmount(value: ExcelJS.CellValue) {
    if (value === null || value === undefined || value === '') return true;
    const normalized = String(value).replace(/[$.\s]/g, '').replace(',', '.');
    return Number.isFinite(Number(normalized));
  }

  private company(requested: number | undefined, user: AuthUser) {
    const idEmpresa = isAdministrator(user.roles) ? requested ?? user.idEmpresa : user.idEmpresa;
    if (!idEmpresa) throw new BadRequestException('Debe indicar empresa');
    if (!isAdministrator(user.roles) && requested && requested !== idEmpresa) throw new BadRequestException('No puedes previsualizar datos de otra empresa');
    return idEmpresa;
  }

  private header(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
