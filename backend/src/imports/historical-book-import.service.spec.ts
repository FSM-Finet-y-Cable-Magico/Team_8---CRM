import ExcelJS from 'exceljs';
import { parseHistoricalBook } from './historical-book-file';
import { HistoricalBookImportService } from './historical-book-import.service';

const user = { idUsuario: 1, idEmpresa: 1, roles: ['Administrador'], email: null, nombreCompleto: 'QA' };
const headers = Array.from({ length: 70 }, () => '');
Object.assign(headers, { 3: 'NOMBRE', 4: 'DEUDA PENDIENTE', 8: 'NOMBRE PLAN', 13: 'ESTADO ENVIO/ RESPUESTA CLIENTE', 17: 'ESTADO',
  24: 'NOMBRE PLAN', 58: 'OBSERVACIONES', 59: 'DIRECCIONES', 60: 'TELEFONOS', 61: 'CORREO ELECTRONICO', 62: 'CORREO SUBIDO A FACTURACION', 68: '11', 69: '2026' });
const quoted = (row: string[]) => row.map(value => /[,"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',');
const sourceRow = (overrides: Record<number, string> = {}) => {
  const row = Array.from({ length: 70 }, () => '');
  Object.assign(row, { 2: '11.111.111-1', 3: 'Persona QA', 4: '-526', 8: 'Plan antiguo sin catálogo', 13: '2 ticket Azul', 17: 'FALSE', 59: 'Calle QA 100', 60: '9 1234 5678', ...overrides });
  return row;
};
const file = (rows: string[][], delimiter = ',') => ({ originalname: 'historico.csv', buffer: Buffer.from([headers, ...rows].map(row => delimiter === ',' ? quoted(row) : row.join(delimiter)).join('\n')) } as Express.Multer.File);
function harness() {
  let state = { customers: [] as any[], notes: [] as any[], addresses: [] as any[], audit: [] as any[] };
  let failAudit = false;
  const db: any = {
    empresa: { findUnique: jest.fn(async () => ({ idEmpresa: 1 })) },
    cliente: {
      findMany: jest.fn(async ({ where }) => state.customers.filter(row => where.rut.in.includes(row.rut))),
      create: jest.fn(async ({ data }) => { const row = { ...data, idCliente: state.customers.length + 10, contratos: [], servicios: [] }; state.customers.push(row); return row; }),
      update: jest.fn(() => { throw Error('Existing customers must not be overwritten'); }),
    },
    prospecto: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), create: jest.fn(() => { throw Error('Never create a prospect'); }) },
    observacionOperativa: {
      findMany: jest.fn(async () => state.notes),
      findFirst: jest.fn(async ({ where }) => state.notes.find(row => row.idEmpresa === where.idEmpresa && row.observacion.startsWith(where.observacion.startsWith)) ?? null),
      create: jest.fn(async ({ data }) => { state.notes.push(data); return data; }),
    },
    direccionServicio: { create: jest.fn(async ({ data }) => { state.addresses.push(data); return data; }) },
    logAuditoria: { create: jest.fn(async ({ data }) => { if (failAudit) throw Error('AUDIT_FAILED'); state.audit.push(data); }) },
    $queryRaw: jest.fn(async () => []),
  };
  let queue = Promise.resolve();
  db.$transaction = jest.fn((work: (tx: any) => Promise<unknown>) => {
    const task = queue.then(async () => { const before = structuredClone(state); try { return await work(db); } catch (error) { state = before; throw error; } });
    queue = task.then(() => undefined, () => undefined); return task;
  });
  return { db, service: new HistoricalBookImportService(db), state: () => state, failAudit: () => { failAudit = true; } };
}

describe('Importación segura del Libro de control histórico', () => {
  it('lee encabezados vacíos/repetidos y no interpreta FALSE como baja ni tickets de envío como soporte', async () => {
    const parsed = (await parseHistoricalBook(file([sourceRow()])))!;
    expect(parsed.rows[0]).toMatchObject({ rut: '11111111-1', email: null, phone: '+56912345678', errors: [] });
    const h = harness();
    const result = await h.service.import(parsed, user, 1);
    expect(result).toMatchObject({ importedRows: 1, createdCustomers: 1, importedServices: 0, importedTickets: 0 });
    expect(h.state().customers[0]).toMatchObject({ estado: 'Activo', importadoMasivo: true });
    expect(h.state().notes[0].observacion).toContain('2 ticket Azul');
    expect(h.state().notes[0].observacion).toContain('-526');
    expect(h.state().notes[0].observacion).toContain('FALSE');
    expect(h.state().notes[0].observacion).toContain('Plan antiguo sin catálogo');
    expect(h.db.prospecto.create).not.toHaveBeenCalled();
    expect(h.state().audit[0].valorNuevo.movimientosExternos).toBe(false);
  });

  it('desenvuelve CSV dentro del Excel y repara dos correos partidos sin perder ninguno', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('LIBRO CONTROL');
    sheet.addRow([quoted(headers)]);
    const row = sourceRow({ 61: 'uno@example.invalid' });
    sheet.addRow([quoted(row.slice(0, 62)), quoted(['dos@example.invalid', ...row.slice(62)])]);
    const parsed = (await parseHistoricalBook({ originalname: 'libro.csv.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as Express.Multer.File))!;
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].email).toBe('uno@example.invalid');
    expect(parsed.rows[0].values[61]).toContain('dos@example.invalid');
    expect(parsed.rows[0].warnings.join(' ')).toContain('reconstruida');
  });

  it('aísla RUT inválidos e identidades contradictorias sin corregir verificadores ni bloquear a los demás', async () => {
    const parsed = (await parseHistoricalBook(file([sourceRow(), sourceRow({ 3: 'Otra identidad' }), sourceRow({ 2: '11111111-2' }), sourceRow({ 2: '25307395-0' })])))!;
    const h = harness();
    const preview = await h.service.preview(parsed, user, 1);
    expect(preview).toMatchObject({ totalRows: 4, readyRows: 1, rejectedRows: 3, persisted: false });
    expect(h.db.$transaction).not.toHaveBeenCalled();
    const result = await h.service.import(parsed, user, 1);
    expect(result).toMatchObject({ importedRows: 1, rejectedRows: 3 });
    expect(h.state().customers).toHaveLength(1);
  });

  it('admite celdas vacías finales en Excel y conserva fórmulas originales sin ejecutarlas', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('LIBRO CONTROL');
    sheet.addRow(headers);
    sheet.addRow(sourceRow().slice(0, 61));
    sheet.getCell(2, 5).value = { formula: 'SUM(1,2)', result: 3 };
    sheet.getCell(2, 59).value = { formula: 'UNSUPPORTED()' };
    const parsed = (await parseHistoricalBook({ originalname: 'libro.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as Express.Multer.File))!;
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].values[4]).toBe('3');
    expect(parsed.rows[0].originalCells[4]).toContain('SUM(1,2)');
    expect(parsed.rows[0].values[58]).toBe('=UNSUPPORTED()');
    expect(parsed.rows[0].warnings.join(' ')).toContain('sin ejecutarlas');
  });

  it('reintentar o renombrar un archivo no duplica clientes ni antecedentes', async () => {
    const parsed = (await parseHistoricalBook(file([sourceRow()])))!;
    const h = harness();
    await h.service.import(parsed, user, 1);
    expect(await h.service.import(parsed, user, 1)).toMatchObject({ importedRows: 0, skippedRows: 1 });
    expect(h.state().customers).toHaveLength(1);
    expect(h.state().notes).toHaveLength(1);
    expect(h.state().audit).toHaveLength(1);
  });

  it('agrega historial al cliente existente sin cambiar deuda, estado o contactos y bloquea otra empresa', async () => {
    const h = harness();
    h.state().customers.push({ idCliente: 3, rut: '11111111-1', nombreCompleto: 'Persona QA', idEmpresa: 1, estado: 'Suspendido', contratos: [], servicios: [] });
    const parsed = (await parseHistoricalBook(file([sourceRow()])))!;
    expect(await h.service.import(parsed, user, 1)).toMatchObject({ createdCustomers: 0, reusedCustomers: 1 });
    expect(h.state().customers[0].estado).toBe('Suspendido');
    expect(h.db.cliente.update).not.toHaveBeenCalled();
    h.state().customers[0].idEmpresa = 2;
    expect(await h.service.preview(parsed, user, 1)).toMatchObject({ readyRows: 0, rejectedRows: 1 });
  });

  it('un fallo de auditoría revierte toda la fila y permite reintentar sin un cliente huérfano', async () => {
    const h = harness(); h.failAudit();
    const result = await h.service.import((await parseHistoricalBook(file([sourceRow()])))!, user, 1);
    expect(result).toMatchObject({ status: 'fallida', importedRows: 0, rejectedRows: 1 });
    expect(h.state().customers).toHaveLength(0);
    expect(h.state().notes).toHaveLength(0);
    expect(h.state().addresses).toHaveLength(0);
  });

  it('reconoce 1500 clientes en CSV con punto y coma consultando identidades por lote', async () => {
    const rut = (body: number) => { const digits = String(body); let sum = 0; [...digits].reverse().forEach((digit, i) => { sum += Number(digit) * (2 + i % 6); }); const check = 11 - sum % 11; return `${digits}-${check === 11 ? '0' : check === 10 ? 'K' : check}`; };
    const parsed = (await parseHistoricalBook(file(Array.from({ length: 1500 }, (_, i) => sourceRow({ 2: rut(20000000 + i), 3: `Persona QA ${i}` })), ';')))!;
    const h = harness();
    expect(await h.service.preview(parsed, user, 1)).toMatchObject({ totalRows: 1500, readyRows: 1500, rejectedRows: 0 });
    expect(h.db.cliente.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.prospecto.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });
});
