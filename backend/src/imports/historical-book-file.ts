import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { validateRut } from '../rut/rut.util';

export const historicalText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const header = (value: string) => historicalText(value).toUpperCase();
const emailPattern = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;
const cellText = (value: ExcelJS.CellValue): string => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return value.result !== undefined ? cellText(value.result) : `=${'formula' in value ? value.formula : value.sharedFormula}`;
    if ('error' in value) return value.error;
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
    return '';
  }
  return String(value).trim();
};

export type HistoricalBookRow = {
  rowNumber: number; rut: string; name: string; email: string | null; phone: string | null; address: string;
  headers: string[]; values: string[]; originalCells: string[]; errors: string[]; warnings: string[]; fingerprint: string;
};
export type HistoricalBookFile = { version: 'LIBRO_CONTROL_HISTORICO_V2'; sheet: string; rows: HistoricalBookRow[] };

export async function readImportMatrix(file: Express.Multer.File, requestedSheet?: string) {
  if (!file.buffer.length || file.buffer.length > 5 * 1024 * 1024) throw new BadRequestException('El archivo debe contener datos y no superar 5 MB');
  if (/\.csv$/i.test(file.originalname)) {
    let text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(file.buffer).replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0];
    const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
    try {
      const rows = parse(text, { bom: true, delimiter, skip_empty_lines: true, relax_column_count: true, trim: true }) as string[][];
      if (rows.length > 10001) throw new BadRequestException('El máximo por archivo es 10.000 filas');
      return { sheet: 'CSV', matrix: rows, originalMatrix: rows };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('El CSV tiene comillas o separadores incompletos; guarda nuevamente el archivo como CSV UTF-8 o XLSX');
    }
  }
  if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Selecciona un archivo CSV o XLSX');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer as never); } catch { throw new BadRequestException('El archivo no es un Excel XLSX válido'); }
  const sheet = requestedSheet ? workbook.getWorksheet(requestedSheet) : workbook.getWorksheet('LIBRO CONTROL') ?? workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('La hoja solicitada no existe');
  if (sheet.rowCount > 10001) throw new BadRequestException('El máximo por archivo es 10.000 filas');
  const matrix: string[][] = [];
  const originalMatrix: string[][] = [];
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    matrix.push(Array.from({ length: row.cellCount }, (_, column) => cellText(row.getCell(column + 1).value)));
    originalMatrix.push(Array.from({ length: row.cellCount }, (_, column) => {
      const value = row.getCell(column + 1).value;
      return value != null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    }));
  }
  return { sheet: sheet.name, matrix, originalMatrix };
}

export async function parseHistoricalBook(file: Express.Multer.File, requestedSheet?: string): Promise<HistoricalBookFile | null> {
  const source = await readImportMatrix(file, requestedSheet);
  let matrix = source.matrix;
  let embedded = false;
  const csvLine = (line: string) => (parse(line, { relax_column_count: true, trim: true }) as string[][])[0] ?? [];
  if (matrix[0]?.[0]?.includes('DEUDA PENDIENTE') && matrix[0][0].includes(',')) {
    embedded = true;
    try { matrix = matrix.map(row => row.length ? csvLine(row[0] || '') : []); }
    catch { throw new BadRequestException('Hay una fila de CSV con comillas incompletas dentro del Excel'); }
  }
  const headerIndex = matrix.slice(0, 20).findIndex(row => {
    const names = row.map(header);
    return names.includes('NOMBRE') && names.includes('DEUDA PENDIENTE') && names.includes('NOMBRE PLAN') && names.includes('DIRECCIONES') && names.includes('TELEFONOS');
  });
  if (headerIndex < 0) return null;
  const headers = matrix[headerIndex];
  const names = headers.map(header);
  const index = (name: string) => names.indexOf(name);
  const legacyLayout = index('NOMBRE') === 3 && index('DIRECCIONES') === 59 && index('TELEFONOS') === 60;
  const rutColumn = index('RUT') >= 0 ? index('RUT') : legacyLayout ? 2 : -1;
  if (rutColumn < 0) throw new BadRequestException('La planilla no identifica la columna RUT; no es seguro deducir identidades');
  const rows: HistoricalBookRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    let values = [...matrix[i]];
    if (!values.some(value => value.trim())) continue;
    const errors: string[] = [], warnings: string[] = [];
    // Excel omits unassigned trailing cells; CSV needs explicit delimiters.
    if (!embedded && /\.xlsx$/i.test(file.originalname)) {
      if (values.length < headers.length) values.push(...Array<string>(headers.length - values.length).fill(''));
      else if (values.slice(headers.length).every(value => !value)) values = values.slice(0, headers.length);
    }
    if (!embedded && legacyLayout && values.length === headers.length + 1 && emailPattern.test(values[61] ?? '') && emailPattern.test(values[62] ?? '')) {
      values = [...values.slice(0, 61), `${values[61]}; ${values[62]}`, ...values.slice(63)];
      warnings.push('Dos correos separados por una coma sin comillas reconstruidos como un único campo');
    }
    if (embedded && source.matrix[i]?.slice(1).some(Boolean)) {
      const fragments = source.matrix[i].slice(1).filter(Boolean);
      const rest = fragments.length === 1 ? csvLine(fragments[0]) : [];
      // Known malformed source: two email addresses split into adjacent Excel cells.
      // Merge only when the resulting width and BOTH addresses prove the repair.
      if (legacyLayout && values.length === 62 && emailPattern.test(values[61]) && emailPattern.test(rest[0] ?? '') && values.length + rest.length - 1 === headers.length) {
        values = [...values.slice(0, 61), `${values[61]}; ${rest[0]}`, ...rest.slice(1)];
        warnings.push('Fila dividida entre celdas reconstruida; ambos correos se conservan en el historial');
      } else errors.push('La fila está dividida entre celdas y no se puede reconstruir con certeza');
    }
    if (values.length !== headers.length) errors.push(`La fila tiene ${values.length} columnas y el encabezado ${headers.length}`);
    const get = (name: string) => values[index(name)]?.trim() ?? '';
    const validation = validateRut(values[rutColumn] ?? '');
    if (!validation.valid || !validation.normalized) errors.push('RUT inválido: no se corrige automáticamente el dígito verificador');
    const name = get('NOMBRE');
    if (!name || name.length > 120) errors.push('Nombre ausente o superior a 120 caracteres');
    const emails = get('CORREO ELECTRONICO').split(/[;,\s]+/).filter(Boolean);
    const validEmails = emails.filter(value => value.length <= 120 && emailPattern.test(value));
    if (emails.length > 1) warnings.push('Varios correos: se usa el primero válido y se conservan todos en el historial');
    if (emails.some(value => !emailPattern.test(value))) warnings.push('Correo no válido conservado solo como antecedente');
    const rawPhone = get('TELEFONOS');
    const digits = rawPhone.replace(/\D/g, '');
    const phone = /^9\d{8}$/.test(digits) ? `+56${digits}` : /^569\d{8}$/.test(digits) ? `+${digits}` : null;
    if (rawPhone && !phone) warnings.push('Teléfono ambiguo conservado solo como antecedente');
    if (!validEmails.length) warnings.push('Sin correo válido; no impide registrar al cliente histórico');
    if (!get('DIRECCIONES')) warnings.push('Sin dirección; no se inventa una ubicación');
    if (get('DIRECCIONES').length > 200) warnings.push('Dirección extensa conservada íntegra en el historial, sin recortarla');
    if (values.some(value => /#REF!|#VALUE!|#DIV\/0!|#N\/A/.test(value))) warnings.push('Hay fórmulas con error: se conservan sin convertirlas en importes');
    if (values.some(value => value.startsWith('='))) warnings.push('Hay fórmulas sin resultado calculado: se conservan sin ejecutarlas');
    const fingerprint = createHash('sha256').update(JSON.stringify({ headers, values })).digest('hex');
    rows.push({ rowNumber: i + 1, rut: validation.valid ? validation.normalized! : '', name, email: validEmails[0] ?? null, phone, address: get('DIRECCIONES'), headers, values,
      originalCells: source.originalMatrix[i], errors, warnings, fingerprint });
  }
  const byRut = new Map<string, HistoricalBookRow[]>();
  for (const row of rows) if (row.rut) byRut.set(row.rut, [...byRut.get(row.rut) ?? [], row]);
  for (const group of byRut.values()) if (new Set(group.map(row => historicalText(row.name))).size > 1) {
    group.forEach(row => row.errors.push('El mismo RUT aparece con nombres distintos: requiere resolver la identidad antes de importar'));
  }
  return { version: 'LIBRO_CONTROL_HISTORICO_V2', sheet: source.sheet, rows };
}
