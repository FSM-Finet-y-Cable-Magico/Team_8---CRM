import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('Etapa 5 - fronteras de CU-86', () => {
  const service = source('src/external-tax-documents/external-tax-documents.service.ts');
  const controller = source('src/external-tax-documents/external-tax-documents.controller.ts');
  const schema = source('prisma/schema.prisma');
  const migration = source('prisma/migrations/20260927120000_i3_external_tax_documents/migration.sql');
  const frontend = source('../frontend/src/features/billing/ExternalTaxDocumentsPanel.tsx');
  const pendingIssuer = source('src/tax-document-issuance/pending-facturacion-cl.issuer.ts');

  it('no contiene cliente HTTP, fetch ni descarga de URL', () => {
    expect(service).not.toMatch(/\bfetch\s*\(|HttpService|axios|download|request\s*\(/i);
  });

  it('no implementa emisión ni conexión SII', () => {
    expect(service + controller + frontend).not.toMatch(/emitir boleta|emitir factura|enviar al SII|timbrar|firmarDte|SII.*request/i);
  });

  it('mantiene el adapter pendiente aislado de CU-86 y sin cliente HTTP', () => {
    expect(service + controller).not.toMatch(/FacturacionCl|FACTURACION_CL_|BillingDocumentProvider|TaxDocumentProvider/);
    expect(pendingIssuer).toContain('PENDIENTE_CONTRATO_FACTURACION_CL');
    expect(pendingIssuer).not.toMatch(/\bfetch\s*\(|HttpService|axios|Authorization|https?:\/\//i);
  });

  it('no expone operación DELETE', () => {
    expect(controller).not.toMatch(/@Delete|\.delete\s*\(/);
  });

  it('protege todo el controlador para Administrador', () => {
    expect(controller).toContain('@Roles(...ACCESS_ROLES.VIEW_EXTERNAL_TAX_DOCUMENTS)');
    expect(controller).toContain('@Roles(...ACCESS_ROLES.MANAGE_EXTERNAL_TAX_DOCUMENTS)');
  });

  it('la respuesta no selecciona credenciales ni secretos de usuario', () => {
    expect(service).not.toMatch(/passwordHash|integrationSecret|apiKey|tokenTransaccional/);
  });

  it('la interfaz solo ofrece registro, corrección y anulación de metadata', () => {
    expect(frontend).toContain('Registrar metadata');
    expect(frontend).toContain('Corregir');
    expect(frontend).toContain('Anular');
    expect(frontend).not.toMatch(/Emitir boleta|Emitir factura|Enviar al SII/);
  });

  it('mantiene Factura y Pago separados del documento externo', () => {
    expect(schema).toMatch(/model Factura[\s\S]*?model Pago[\s\S]*?model DocumentoTributarioExterno/);
    expect(schema).toContain('fuente');
    expect(schema).toContain('@default("EXTERNO_MANUAL")');
  });

  it('la migración es aditiva y no destructiva', () => {
    expect(migration).toContain('CREATE TABLE "documento_tributario_externo"');
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE.+RENAME)\b/im);
  });

  it('la migración limita tipo, estado, fuente y montos', () => {
    expect(migration).toContain("'BOLETA', 'FACTURA'");
    expect(migration).toContain("'REGISTRADO', 'ANULADO'");
    expect(migration).toContain("'EXTERNO_MANUAL'");
    expect(migration).toContain('"monto_total" >= 0');
  });

  it('la unicidad está acotada por empresa y normalización', () => {
    expect(migration).toContain('("id_empresa", "tipo_documento", "emisor_normalizado", "folio_normalizado")');
  });
});
