import { buildInvoiceDocument, buildReceiptDocument, InvoiceDocumentInput, ReceiptDocumentInput } from './facturacion-cl-document-builder';

const receiver = { rut: '11111111-1', name: 'RECEPTOR FICTICIO', giro: 'PRUEBA', address: 'CALLE FICTICIA', comuna: 'PRUEBA', city: 'PRUEBA' };
const invoice: InvoiceDocumentInput = {
  tipoDte: 33, folio: '126', issueDate: '2026-10-03', issuerRut: '11111111-1', receiver,
  items: [{ description: 'SERVICIO FICTICIO', quantity: '1', unitPrice: '10000', amount: '10000' }],
  net: '10000', exempt: '0', vat: '1900', vatRate: '19', total: '11900', paymentForm: 1,
};
const receipt: ReceiptDocumentInput = {
  tipoDte: 39, folio: '126', issueDate: '2026-10-03', receiver,
  items: [{ description: 'SERVICIO FICTICIO', quantity: '1', unitPrice: '11900', amount: '11900' }],
  total: '11900', encoding: 'utf8', serviceIndicator: 3,
};

describe('FacturacionCl document builders (offline, unapproved for emission)', () => {
  it('builds invoice XML with the documented root and Latin1 encoding', () => {
    const document = buildInvoiceDocument({ ...invoice, receiver: { ...receiver, name: 'PRUEBA & "Peña" <FICTICIA>' } });
    const xml = document.bytes.toString('latin1');
    expect(document).toMatchObject({ formato: 2, tipoDte: 33, folio: '126' });
    expect(xml).toContain('encoding="ISO-8859-1"');
    expect(xml).toContain('<DTE><Documento><Encabezado>');
    expect(xml).toContain('PRUEBA &amp; &quot;Peña&quot; &lt;FICTICIA&gt;');
    expect(xml).toContain('<MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal>');
    expect(xml).not.toContain('CorreoRecep');
  });
  it('builds exempt invoice separately without deriving tax treatment', () => {
    const document = buildInvoiceDocument({ ...invoice, tipoDte: 34, net: '0', exempt: '10000', vat: '0', vatRate: undefined, total: '10000' });
    expect(document.bytes.toString('latin1')).toContain('<MntExe>10000</MntExe><MntTotal>10000</MntTotal>');
    expect(document.bytes.toString('latin1')).toContain('<IndExe>1</IndExe>');
  });
  it('builds the receipt with 16 header and 13 detail positions and an empty email', () => {
    const document = buildReceiptDocument(receipt);
    const lines = document.bytes.toString('utf8').trimEnd().split('\r\n');
    expect(document).toMatchObject({ formato: 1, tipoDte: 39 });
    expect(lines[0]).toBe('->Boleta<-');
    expect(lines[1].split(';')).toHaveLength(17);
    expect(lines[1].split(';')[15]).toBe('');
    expect(lines[2]).toBe('->BoletaTotales<-');
    expect(lines[3]).toBe('0;0;0;11900;0;11900;0;11900;');
    expect(lines[4]).toBe('->BoletaDetalle<-');
    expect(lines[5].split(';')).toHaveLength(14);
    expect(lines).not.toContain('');
  });
  it('builds an exempt receipt with exempt amounts in their documented positions', () => {
    const lines = buildReceiptDocument({ ...receipt, tipoDte: 41 }).bytes.toString('utf8').split('\r\n');
    expect(lines[3]).toBe('0;11900;0;11900;0;11900;0;11900;');
    expect(lines[5].split(';')[3]).toBe('1');
    expect(lines[5].split(';')[6]).toBe('11900');
  });
  it.each(['2026-02-30', '2026-13-01', '03-10-2026'])('rejects invalid date %s', issueDate => {
    expect(() => buildInvoiceDocument({ ...invoice, issueDate })).toThrow('DTE_INPUT_INVALID_OR_UNSUPPORTED');
  });
  it('rejects totals/line mismatch, fractional peso rounding, mixed and unapproved extensions', () => {
    expect(() => buildInvoiceDocument({ ...invoice, total: '11901' })).toThrow();
    expect(() => buildInvoiceDocument({ ...invoice, exempt: '1', total: '11901' })).toThrow();
    expect(() => buildInvoiceDocument({ ...invoice, items: [{ ...invoice.items[0], quantity: '0.333333' }] })).toThrow();
    expect(() => buildReceiptDocument({ ...receipt, total: '12000' })).toThrow();
  });
  it('rejects folio guessing, unsupported encoding and lossy Latin1 conversion', () => {
    expect(() => buildInvoiceDocument({ ...invoice, folio: '0' })).toThrow();
    expect(() => buildReceiptDocument({ ...receipt, encoding: undefined as never })).toThrow();
    expect(() => buildInvoiceDocument({ ...invoice, receiver: { ...receiver, name: 'PRUEBA 😀' } })).toThrow();
  });
  it('rejects VAT inconsistent with the supplied rate even when net plus VAT equals total', () => {
    expect(() => buildInvoiceDocument({ ...invoice, vat: '1800', total: '11800' })).toThrow('DTE_INPUT_INVALID_OR_UNSUPPORTED');
  });
  it.each(['FICTICIO;CAMPO', 'FICTICIO\n->Boleta<-', 'FICTICIO\u0000'])('rejects TXT injection', description => {
    expect(() => buildReceiptDocument({ ...receipt, items: [{ ...receipt.items[0], description }] })).toThrow();
  });
  it('requires dates for periodic receipts without selecting a service indicator by default', () => {
    expect(() => buildReceiptDocument({ ...receipt, serviceIndicator: 2 })).toThrow();
    expect(() => buildReceiptDocument({ ...receipt, serviceIndicator: 2, periodFrom: '2026-09-01', periodTo: '2026-09-30', dueDate: '2026-10-15' })).not.toThrow();
  });
  it('enforces the separate detail limits for invoice and receipt', () => {
    expect(() => buildInvoiceDocument({ ...invoice, items: Array.from({ length: 61 }, () => invoice.items[0]) })).toThrow();
    expect(() => buildReceiptDocument({ ...receipt, items: Array.from({ length: 1001 }, () => receipt.items[0]) })).toThrow();
  });
});
