import { join } from 'node:path';
import PDFDocument from 'pdfkit';

const QUOTE_DATE_FORMAT = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short',
});
const QUOTE_DAY_FORMAT = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'long',
});
const CLP_FORMAT = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
});
const INK = '#293a35';
const MUTED = '#61726b';
const ACCENT = '#147e70';
const RULE = '#b9cec5';
const PAGE_MARGIN = 48;

export type QuotePdfData = {
  codigo: string | null;
  fechaEnvio: Date | null;
  prospecto: {
    nombreCompleto: string | null;
    rut: string | null;
    email: string | null;
    telefono?: string | null;
    direccion: string | null;
    comuna?: string | null;
    region?: string | null;
    empresa?: { nombre: string; rutEmpresa?: string | null } | null;
    usuarioComercial?: { nombreCompleto: string } | null;
  } | null;
  plan: {
    nombreComercial: string;
    tipoPlan: string;
    tipoCliente: string;
    descripcion?: string | null;
    velocidadMbps: number | null;
    precioMensual: { toString(): string };
  } | null;
};

type QuoteBrand = { logo?: string };

export function resolveQuoteBrand(companyName?: string | null): QuoteBrand {
  const normalized = (companyName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/cable\s*magico/.test(normalized)) {
    return { logo: join(__dirname, 'assets', 'cable-magico.png') };
  }
  if (/finet/.test(normalized)) {
    return { logo: join(__dirname, 'assets', 'finet.png') };
  }
  return {};
}

function clean(value: string | null | undefined) {
  const result = value?.trim();
  return result || '—';
}

function formatPrice(value: { toString(): string }) {
  const amount = Number(value.toString());
  return Number.isFinite(amount) ? CLP_FORMAT.format(amount) : '—';
}

export function renderQuotePdfBuffer(quote: QuotePdfData): Promise<Buffer> {
  if (!quote.prospecto || !quote.plan) throw new Error('Cotizacion incompleta');

  const prospect = quote.prospecto;
  const plan = quote.plan;
  const companyName = clean(prospect.empresa?.nombre);
  const brand = resolveQuoteBrand(prospect.empresa?.nombre);
  const price = formatPrice(plan.precioMensual);
  const issueDate = quote.fechaEnvio ?? new Date();
  const issueDateLong = QUOTE_DAY_FORMAT.format(issueDate);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, compress: true });
    const chunks: Buffer[] = [];
    doc.info.Title = `Cotización ${quote.codigo ?? ''} · ${companyName}`;
    doc.info.Subject = 'Cotización de plan y servicio';
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const columnGap = 30;
    const columnWidth = (contentWidth - columnGap) / 2;
    const rightColumnX = PAGE_MARGIN + columnWidth + columnGap;

    const field = (label: string, value: string, x: number, y: number, width: number) => {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text(label, x, y, { width, align: 'left' });
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(value, x, y + 13, { width, lineGap: 1, align: 'left' });
      return doc.heightOfString(value, { width });
    };

    // Header mirrors the supplied company quote sheets while keeping the
    // recipient, provider, and plan values sourced from the CRM record.
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5)
      .text(`N.º ${clean(quote.codigo)}`, PAGE_MARGIN, 38, { width: contentWidth - 110 });
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(19)
      .text('COTIZACIÓN', PAGE_MARGIN, 56, { width: contentWidth - 110 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
      .text(issueDateLong, PAGE_MARGIN, 114, { width: contentWidth, align: 'right' });
    if (brand.logo) doc.image(brand.logo, doc.page.width - PAGE_MARGIN - 104, 27, { fit: [104, 84], align: 'right', valign: 'center' });
    doc.y = 126;

    const headingY = 136;
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11)
      .text('Datos del cliente', PAGE_MARGIN, headingY, { width: columnWidth, align: 'left' });
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11)
      .text('Empresa prestadora', rightColumnX, headingY, { width: columnWidth, align: 'left' });
    doc.y = headingY + 28;
    const customerFields = [
      ['Nombre o razón social', clean(prospect.nombreCompleto)],
      ['RUT del cliente', clean(prospect.rut)],
      ['Correo electrónico', clean(prospect.email)],
      ['Teléfono', clean(prospect.telefono)],
      ['Dirección del servicio', [prospect.direccion, prospect.comuna, prospect.region].filter(value => value?.trim()).join(', ') || '—'],
    ] as const;
    const providerFields = [
      ['Razón social', companyName],
      ['RUT del emisor', clean(prospect.empresa?.rutEmpresa)],
      ['Ejecutivo comercial', clean(prospect.usuarioComercial?.nombreCompleto)],
      ['Fecha de emisión', QUOTE_DATE_FORMAT.format(issueDate)],
    ] as const;
    let customerY = doc.y;
    let providerY = customerY;
    for (let i = 0; i < Math.max(customerFields.length, providerFields.length); i += 1) {
      const customer = customerFields[i];
      const provider = providerFields[i];
      const customerHeight = customer ? field(customer[0], customer[1], PAGE_MARGIN, customerY, columnWidth) : 0;
      const providerHeight = provider ? field(provider[0], provider[1], rightColumnX, providerY, columnWidth) : 0;
      customerY += Math.max(32, customerHeight + 20);
      providerY += Math.max(32, providerHeight + 20);
    }
    doc.y = Math.max(customerY, providerY) + 2;

    doc.y += 20;
    const tableTop = doc.y;
    const columns = [
      { label: 'Cant.', x: PAGE_MARGIN, width: 34, align: 'center' as const },
      { label: 'Servicio / plan', x: PAGE_MARGIN + 44, width: contentWidth - 44 - 178, align: 'left' as const },
      { label: 'Cobro', x: PAGE_MARGIN + contentWidth - 178, width: 76, align: 'left' as const },
      { label: 'Importe', x: PAGE_MARGIN + contentWidth - 95, width: 95, align: 'right' as const },
    ];
    doc.moveTo(PAGE_MARGIN, tableTop).lineTo(PAGE_MARGIN + contentWidth, tableTop).strokeColor(RULE).lineWidth(0.8).stroke();
    columns.forEach(column => doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8)
      .text(column.label, column.x, tableTop + 8, { width: column.width, align: column.align }));
    const headerBottom = tableTop + 25;
    doc.moveTo(PAGE_MARGIN, headerBottom).lineTo(PAGE_MARGIN + contentWidth, headerBottom).strokeColor(RULE).lineWidth(0.5).stroke();
    const itemDescription = plan.descripcion?.trim();
    doc.fillColor(INK).font('Helvetica').fontSize(9).text('1', columns[0].x, headerBottom + 13, { width: columns[0].width, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(9.5).text(plan.nombreComercial, columns[1].x, headerBottom + 11, { width: columns[1].width, align: 'left' });
    const planNameHeight = doc.heightOfString(plan.nombreComercial, { width: columns[1].width });
    let rowHeight = Math.max(42, planNameHeight + 20);
    if (itemDescription) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(itemDescription, columns[1].x, headerBottom + 13 + planNameHeight, { width: columns[1].width, align: 'left' });
      rowHeight = Math.max(rowHeight, planNameHeight + doc.heightOfString(itemDescription, { width: columns[1].width }) + 22);
    }
    doc.fillColor(INK).font('Helvetica').fontSize(8.5).text('Mensual', columns[2].x, headerBottom + 15, { width: columns[2].width, align: 'left' });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(price, columns[3].x, headerBottom + 13, { width: columns[3].width, align: 'right' });
    const rowBottom = headerBottom + rowHeight;
    doc.moveTo(PAGE_MARGIN, rowBottom).lineTo(PAGE_MARGIN + contentWidth, rowBottom).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
      .text('Mensualidad del servicio (CLP)', PAGE_MARGIN + 8, rowBottom + 13, { width: contentWidth - 145, align: 'left' });
    doc.fontSize(13).text(price, PAGE_MARGIN + contentWidth - 132, rowBottom + 10, { width: 124, align: 'right' });
    const totalBottom = rowBottom + 38;
    doc.moveTo(PAGE_MARGIN, totalBottom).lineTo(PAGE_MARGIN + contentWidth, totalBottom).strokeColor(ACCENT).lineWidth(1).stroke();
    doc.y = totalBottom + 20;

    const details = [
      ['Tipo de plan', clean(plan.tipoPlan)],
      ['Tipo de cliente', clean(plan.tipoCliente)],
      ['Velocidad', plan.velocidadMbps == null ? '—' : `${plan.velocidadMbps} Mbps`],
    ];
    const detailGap = 16;
    const detailWidth = (contentWidth - detailGap * 2) / 3;
    const detailTop = doc.y;
    details.forEach((entry, index) => field(entry[0], entry[1], PAGE_MARGIN + index * (detailWidth + detailGap), detailTop, detailWidth));
    doc.y = detailTop + 39;

    doc.moveTo(PAGE_MARGIN, doc.y + 3).lineTo(PAGE_MARGIN + contentWidth, doc.y + 3).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.y += 18;
    const signatureY = Math.max(doc.y + 54, 734);
    const signatureGap = 68;
    const signatureWidth = (contentWidth - signatureGap) / 2;
    [
      { x: PAGE_MARGIN, name: clean(prospect.nombreCompleto), label: 'Aceptación del cliente' },
      { x: PAGE_MARGIN + signatureWidth + signatureGap, name: clean(prospect.usuarioComercial?.nombreCompleto), label: 'Validación comercial' },
    ].forEach(signature => {
      doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(signature.name, signature.x, signatureY, { width: signatureWidth, align: 'left' });
      doc.moveTo(signature.x, signatureY + 16).lineTo(signature.x + signatureWidth, signatureY + 16).strokeColor(MUTED).lineWidth(0.5).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(signature.label, signature.x, signatureY + 21, { width: signatureWidth });
    });

    const footerY = 775;
    doc.moveTo(PAGE_MARGIN, footerY).lineTo(PAGE_MARGIN + contentWidth, footerY).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
      .text(`Cotización emitida por ${companyName} · ${QUOTE_DATE_FORMAT.format(issueDate)} (Chile)`, PAGE_MARGIN, footerY + 9, { width: contentWidth - 35 });
    doc.text('1 / 1', PAGE_MARGIN + contentWidth - 30, footerY + 9, { width: 30, align: 'right' });
    doc.end();
  });
}
