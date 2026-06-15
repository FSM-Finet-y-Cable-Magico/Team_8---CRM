import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';

type RawRow = Record<string, unknown>;

type NormalizedImportRow = {
  rowNumber: number;
  rut: string;
  nombreCompleto: string;
  email?: string;
  telefono: string;
  direccion: string;
  estado?: string;
  tipoRegistro: 'cliente' | 'prospecto';
};

type RejectedRow = {
  rowNumber: number;
  rut?: string;
  reason: string;
};

const MAX_REJECTION_RATE = 0.3;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async importClients(file: Express.Multer.File | undefined, currentUser: AuthUser, requestedCompanyId?: number) {
    if (!file) {
      throw new BadRequestException('Archivo no informado');
    }

    const idEmpresa = this.resolveCompanyId(currentUser, requestedCompanyId);
    const rows = await this.parseFile(file);

    if (!rows.length) {
      throw new BadRequestException('El archivo no contiene filas');
    }

    const totalRows = rows.length;
    const { normalized: normalizedRows, rejected: structuralRejected } = this.normalizeRows(rows);
    const rejected: RejectedRow[] = [...structuralRejected];
    const validRows: NormalizedImportRow[] = [];
    const seenRut = new Set<string>();

    for (const row of normalizedRows) {
      const rutValidation = validateRut(row.rut);

      if (!rutValidation.valid || !rutValidation.normalized) {
        rejected.push({ rowNumber: row.rowNumber, rut: row.rut, reason: rutValidation.reason ?? 'RUT invalido' });
        continue;
      }

      if (seenRut.has(rutValidation.normalized)) {
        rejected.push({ rowNumber: row.rowNumber, rut: rutValidation.normalized, reason: 'RUT duplicado en archivo' });
        continue;
      }

      seenRut.add(rutValidation.normalized);

      const duplicateClient = await this.prisma.cliente.findUnique({ where: { rut: rutValidation.normalized } });
      const duplicateProspect = await this.prisma.prospecto.findFirst({ where: { rut: rutValidation.normalized } });

      if (duplicateClient || duplicateProspect) {
        rejected.push({ rowNumber: row.rowNumber, rut: rutValidation.normalized, reason: 'RUT ya existe en base de datos' });
        continue;
      }

      validRows.push({ ...row, rut: rutValidation.normalized });
    }

    const rejectionRate = rejected.length / totalRows;

    if (rejectionRate > MAX_REJECTION_RATE) {
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'IMPORTACION_CLIENTES_FALLIDA',
        entidadAfectada: 'cliente',
        valorNuevo: { total: totalRows, rechazadas: rejected.length, rejectionRate },
      });

      return {
        status: 'fallida',
        totalRows,
        importedRows: 0,
        rejectedRows: rejected.length,
        rejectionRate,
        errors: rejected,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        if (row.tipoRegistro === 'cliente') {
          await tx.cliente.create({
            data: {
              idEmpresa,
              rut: row.rut,
              nombreCompleto: row.nombreCompleto,
              email: row.email,
              telefono: row.telefono,
              estado: row.estado ?? 'Activo',
              importadoMasivo: true,
            },
          });
        } else {
          await tx.prospecto.create({
            data: {
              idEmpresa,
              idUsuarioComercial: currentUser.idUsuario,
              rut: row.rut,
              nombreCompleto: row.nombreCompleto,
              email: row.email,
              telefono: row.telefono,
              direccion: row.direccion,
              estadoPipeline: row.estado ?? 'Prospecto Nuevo',
              fechaCreacion: new Date(),
            },
          });
        }
      }
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'IMPORTACION_CLIENTES',
      entidadAfectada: 'cliente',
      valorNuevo: {
        total: totalRows,
        importadas: validRows.length,
        rechazadas: rejected.length,
        idEmpresa,
      },
    });

    return {
      status: 'completada',
      totalRows,
      importedRows: validRows.length,
      rejectedRows: rejected.length,
      rejectionRate,
      errors: rejected,
    };
  }

  private async parseFile(file: Express.Multer.File): Promise<RawRow[]> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      return parse(file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as RawRow[];
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const firstSheet = workbook.worksheets[0];

      if (!firstSheet) {
        throw new BadRequestException('El archivo Excel no contiene hojas');
      }

      const headerValues = firstSheet.getRow(1).values;
      const headers = (Array.isArray(headerValues) ? headerValues.slice(1) : [])
        .map((header) => this.excelCellValue(header as ExcelJS.CellValue).trim())
        .filter(Boolean);
      const rows: RawRow[] = [];

      firstSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return;
        }

        const rawRow: RawRow = {};

        headers.forEach((header, index) => {
          rawRow[header] = this.excelCellValue(row.getCell(index + 1).value);
        });

        rows.push(rawRow);
      });

      return rows;
    }

    throw new BadRequestException('El archivo debe ser CSV, XLS o XLSX');
  }

  private excelCellValue(value: ExcelJS.CellValue) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }

      if ('result' in value && value.result !== undefined) {
        return String(value.result);
      }

      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text).join('');
      }
    }

    return String(value);
  }

  private normalizeRows(rows: RawRow[]): { normalized: NormalizedImportRow[]; rejected: RejectedRow[] } {
    const normalized: NormalizedImportRow[] = [];
    const rejected: RejectedRow[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const rut = this.value(row, ['rut', 'RUT']);
      const nombreCompleto =
        this.value(row, ['nombre_completo', 'nombreCompleto', 'Nombre Completo']) ||
        [this.value(row, ['nombre', 'Nombre']), this.value(row, ['apellido', 'Apellido'])].filter(Boolean).join(' ');
      const email = this.value(row, ['email', 'correo', 'Correo']);
      const telefono = this.value(row, ['telefono', 'celular', 'Celular']);
      const direccion = this.value(row, ['direccion', 'direccion_fisica', 'Direccion']);
      const tipoRegistro = this.value(row, ['tipo_registro', 'tipo', 'Tipo']).toLowerCase();
      const estado = this.value(row, ['estado', 'Estado']);

      if (!rut || !nombreCompleto || !telefono || !direccion) {
        rejected.push({
          rowNumber,
          rut: rut || undefined,
          reason: 'Faltan campos obligatorios (rut, nombre/nombre_completo, telefono/celular y direccion)',
        });
        return;
      }

      normalized.push({
        rowNumber,
        rut,
        nombreCompleto,
        email: email || undefined,
        telefono,
        direccion,
        estado: estado || undefined,
        tipoRegistro: tipoRegistro === 'cliente' ? 'cliente' : 'prospecto',
      });
    });

    return { normalized, rejected };
  }

  private value(row: RawRow, aliases: string[]) {
    for (const alias of aliases) {
      const foundKey = Object.keys(row).find((key) => key.trim().toLowerCase() === alias.trim().toLowerCase());
      const value = foundKey ? row[foundKey] : undefined;

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private resolveCompanyId(currentUser: AuthUser, requestedCompanyId?: number) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requestedCompanyId ?? currentUser.idEmpresa;

      if (!idEmpresa) {
        throw new BadRequestException('Debe indicar empresa para la importacion');
      }

      return idEmpresa;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return currentUser.idEmpresa;
  }
}
