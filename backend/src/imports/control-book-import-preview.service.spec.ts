import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ControlBookImportPreviewService } from './control-book-import-preview.service';

const admin: AuthUser = {
  idUsuario: 1,
  idEmpresa: 1,
  email: 'admin@example.test',
  nombreCompleto: 'Administrador sintético',
  roles: ['Administrador'],
};

function harness() {
  const prisma = {
    cliente: { findMany: jest.fn().mockResolvedValue([{ rut: '11111111-1' }]) },
    prospecto: { findMany: jest.fn().mockResolvedValue([]) },
    plan: { findMany: jest.fn().mockResolvedValue([{ nombreComercial: 'Plan Prueba' }]) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ControlBookImportPreviewService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

async function xlsxFile(
  sheetName: string,
  rows: ExcelJS.CellValue[][],
): Promise<Express.Multer.File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fieldname: 'file',
    originalname: 'libro-control-sintetico.xlsx',
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('ControlBookImportPreviewService', () => {
  it('reconoce AGOSTO sin encabezado RUT, serial Excel, RUT con/sin puntos y duplicado sin persistir', async () => {
    const file = await xlsxFile('AGOSTO', [
      ['FECHA DE PAGO', '', 'NOMBRE', 'NOMBRE PLAN', 'TELEFONOS', 'OBSERVACIONES'],
      [45000, '11.111.111-1', 'Persona Sintética Uno', 'Plan Prueba', '9 1111 1111', 'Dato controlado'],
      [new Date('2026-09-25T00:00:00.000Z'), '11111111-1', 'Persona Sintética Dos', 'Plan Prueba', '56911111111', 'Duplicado sintético'],
      [45001, '12.345.670-K', 'Persona Sintética Tres', 'Plan Desconocido', 977923789, { error: '#REF!' }],
    ]);
    const { service, prisma, audit } = harness();

    const result = await service.preview(file, admin, 1, 'AGOSTO');

    expect(result).toMatchObject({
      formatVersion: 'FINET_LIBRO_CONTROL_V1',
      sheetName: 'AGOSTO',
      sheetKind: 'OPERACION_VIGENTE',
      headerRow: 1,
      totalRows: 3,
      validRut: 3,
      duplicates: 1,
      existingRecords: 2,
      unknownPlans: 1,
      invalidDates: 0,
      ambiguousFields: 1,
      persisted: false,
    });
    expect(result.detectedColumns).toContain('rut');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ issues: expect.arrayContaining(['DUPLICADO_ARCHIVO']) }),
      expect.objectContaining({ issues: expect.arrayContaining(['PLAN_DESCONOCIDO', 'TELEFONO_REQUIERE_REVISION', 'FORMULA_REF_INVALIDA']) }),
    ]));
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ idEmpresa: 1 }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'IMPORT_PREVIEW_LIBRO_CONTROL',
      valorNuevo: expect.objectContaining({ persisted: false }),
    }));
    expect(prisma).not.toHaveProperty('cliente.create');
    expect(prisma).not.toHaveProperty('pago');
  });

  it('detecta encabezado y clasifica la hoja histórica sin crear clientes activos', async () => {
    const file = await xlsxFile('clientes que se fueron', [
      [],
      ['Referencia histórica'],
      ['RUT', 'NOMBRE', 'PLAN', 'FECHA INSTALACION'],
      ['12.345.670-K', 'Persona Histórica Sintética', 'Plan Prueba', 45000],
    ]);
    const { service } = harness();

    const result = await service.preview(file, admin, 1, 'clientes que se fueron');

    expect(result).toMatchObject({ sheetKind: 'HISTORICA_BAJAS', headerRow: 3, totalRows: 1, persisted: false });
  });

  it('marca RUT, fecha y monto inválidos y rechaza otra empresa para usuario no administrador', async () => {
    const file = await xlsxFile('AGOSTO', [
      ['', '', 'NOMBRE', 'MONTO BOLETA/ FACT', 'EMISION'],
      ['', '11.111.111-2', 'Persona Inválida Sintética', 'monto?', 123],
    ]);
    const { service } = harness();
    const result = await service.preview(file, admin, 1, 'AGOSTO');
    expect(result).toMatchObject({ invalidRut: 1, invalidDates: 1, invalidAmounts: 1, persisted: false });

    await expect(service.preview(file, { ...admin, roles: ['Comercial'] }, 2, 'AGOSTO'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});