type Receiver = { rut: string; name: string; giro: string; address: string; comuna: string; city: string };
type Item = { description: string; quantity: string; unitPrice: string; amount: string };
type CommonDocument = { folio: string; issueDate: string; receiver: Receiver; items: Item[]; total: string };
export type InvoiceDocumentInput = CommonDocument & {
  tipoDte: 33 | 34; issuerRut: string; net: string; exempt: string; vat: string; vatRate?: string; paymentForm: 1 | 2 | 3;
};
export type ReceiptDocumentInput = CommonDocument & {
  tipoDte: 39 | 41; encoding: 'latin1' | 'utf8'; serviceIndicator: 1 | 2 | 3;
  periodFrom?: string; periodTo?: string; dueDate?: string;
};
export type BuiltTaxDocument = { bytes: Buffer; formato: 1 | 2; tipoDte: 33 | 34 | 39 | 41; folio: string };

function fail(): never { throw new Error('DTE_INPUT_INVALID_OR_UNSUPPORTED'); }
function text(value: string, max: number, txt = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
      (txt && /;|->|<-/u.test(value))) fail();
  return value;
}
function date(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail();
  return value;
}
function amount(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,14})$/.test(value)) fail();
  return BigInt(value);
}
function decimal(value: string, places: number): bigint {
  if (typeof value !== 'string' || !new RegExp(`^(0|[1-9]\\d{0,11})(\\.\\d{1,${places}})?$`).test(value)) fail();
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
function rut(value: string): string {
  if (typeof value !== 'string' || !/^\d{6,8}-[0-9K]$/.test(value)) fail();
  // Structural check only; no inferred or substituted tax identity.
  return value;
}
function common(input: CommonDocument, txt: boolean) {
  if (typeof input.folio !== 'string' || !/^[1-9]\d{0,9}$/.test(input.folio)) fail();
  date(input.issueDate); rut(input.receiver.rut);
  text(input.receiver.name, txt ? 40 : 100, txt); text(input.receiver.giro, 40, txt);
  text(input.receiver.address, 60, txt); text(input.receiver.comuna, 20, txt); text(input.receiver.city, 20, txt);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > (txt ? 1000 : 60) || amount(input.total) <= 0n) fail();
  let sum = 0n;
  for (const item of input.items) {
    text(item.description, 80, txt);
    const product = decimal(item.quantity, 6) * decimal(item.unitPrice, 2);
    if (product <= 0n || product % 100000000n !== 0n || product / 100000000n !== amount(item.amount)) fail();
    sum += amount(item.amount);
  }
  return sum;
}
function xml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function encode(value: string, encoding: 'latin1' | 'utf8') {
  if (encoding === 'latin1' && [...value].some(character => character.codePointAt(0)! > 255)) fail();
  return Buffer.from(value, encoding);
}

/** Minimal subset: no discounts, mixed tax treatment, inferred VAT, email or automatic folio. */
export function buildInvoiceDocument(input: InvoiceDocumentInput): BuiltTaxDocument {
  if (![33, 34].includes(input.tipoDte) || ![1, 2, 3].includes(input.paymentForm)) fail();
  rut(input.issuerRut);
  const sum = common(input, false);
  const net = amount(input.net), exempt = amount(input.exempt), vat = amount(input.vat);
  if (net + exempt + vat !== amount(input.total)) fail();
  if (input.tipoDte === 34 ? net !== 0n || vat !== 0n || exempt !== sum : exempt !== 0n || net !== sum || vat <= 0n) fail();
  if (input.tipoDte === 33 && (typeof input.vatRate !== 'string' || !/^\d{1,2}(\.\d{1,2})?$/.test(input.vatRate))) fail();
  // Validate an explicitly supplied rate; do not infer a rate or rounding policy.
  if (input.tipoDte === 33 && net * decimal(input.vatRate!, 2) !== vat * 10000n) fail();
  if (input.tipoDte === 34 && input.vatRate !== undefined) fail();
  const node = (key: string, value: string) => `<${key}>${xml(value)}</${key}>`;
  const receiver = input.receiver;
  const content = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<DTE><Documento><Encabezado><IdDoc>` +
    node('TipoDTE', String(input.tipoDte)) + node('Folio', input.folio) + node('FchEmis', input.issueDate) + node('FmaPago', String(input.paymentForm)) +
    '</IdDoc><Emisor>' + node('RUTEmisor', input.issuerRut) + '</Emisor><Receptor>' +
    node('RUTRecep', receiver.rut) + node('RznSocRecep', receiver.name) + node('GiroRecep', receiver.giro) +
    node('DirRecep', receiver.address) + node('CmnaRecep', receiver.comuna) + node('CiudadRecep', receiver.city) +
    '</Receptor><Totales>' + (input.tipoDte === 33 ? node('MntNeto', input.net) + node('TasaIVA', input.vatRate!) + node('IVA', input.vat) : node('MntExe', input.exempt)) +
    node('MntTotal', input.total) + '</Totales></Encabezado>' + input.items.map((item, index) => '<Detalle>' +
      node('NroLinDet', String(index + 1)) + (input.tipoDte === 34 ? node('IndExe', '1') : '') +
      node('NmbItem', item.description) + node('QtyItem', item.quantity) + node('PrcItem', item.unitPrice) + node('MontoItem', item.amount) + '</Detalle>').join('') +
    '</Documento></DTE>\n';
  return { bytes: encode(content, 'latin1'), formato: 2, tipoDte: input.tipoDte, folio: input.folio };
}

export function buildReceiptDocument(input: ReceiptDocumentInput): BuiltTaxDocument {
  if (![39, 41].includes(input.tipoDte) || !['latin1', 'utf8'].includes(input.encoding) || ![1, 2, 3].includes(input.serviceIndicator)) fail();
  if (common(input, true) !== amount(input.total)) fail();
  if (input.serviceIndicator === 1 || input.serviceIndicator === 2) {
    date(input.periodFrom!); date(input.periodTo!);
    if (input.periodFrom! > input.periodTo!) fail();
    if (input.serviceIndicator === 2) date(input.dueDate!);
  } else if (input.periodFrom || input.periodTo) fail();
  if (input.dueDate) date(input.dueDate);
  const receiver = input.receiver;
  // Preserve all 16 positions; leave Email empty to avoid provider-triggered delivery.
  const header = [input.tipoDte, input.folio, input.issueDate, input.serviceIndicator, input.tipoDte === 39 ? '0' : '',
    input.periodFrom ?? '', input.periodTo ?? '', input.dueDate ?? '', receiver.rut, '', receiver.name,
    receiver.giro, receiver.address, receiver.comuna, receiver.city, ''];
  const totals = ['0', input.tipoDte === 41 ? input.total : '0', '0', input.total, '0', input.total, '0', input.total];
  const detail = input.items.map((item, index) => [index + 1, '', item.description, input.tipoDte === 41 ? 1 : 0,
    item.quantity, item.unitPrice, input.tipoDte === 41 ? item.amount : '0', item.amount, '', '', '', '0', '0'].join(';') + ';');
  const content = `->Boleta<-\r\n${header.join(';')};\r\n->BoletaTotales<-\r\n${totals.join(';')};\r\n->BoletaDetalle<-\r\n${detail.join('\r\n')}\r\n`;
  return { bytes: encode(content, input.encoding), formato: 1, tipoDte: input.tipoDte, folio: input.folio };
}
