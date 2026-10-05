import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { validateRut } from '../rut/rut.util';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClTestCredentials } from './facturacion-cl-read-client';

export const PAYMENT_TAX_POLICY = 'PER_PAYMENT_V1';
export type PaymentTaxProfile = {
  idEmpresa: number; approved: true; issuerRut: string; defaultDocumentType: 'BOLETA' | 'FACTURA';
  receipt: { tipoDte: 39 | 41; encoding: 'latin1' | 'utf8'; serviceIndicator: 1 | 2 | 3 };
  invoice?: { tipoDte: 33 | 34; vatRate?: string; folioFrom: string; folioTo: string };
};

// Observed in the provider's API PRUEBAS credential fields. This is a sandbox
// access identity, never a substitute for a customer's fiscal identity.
export function sandboxIssuerRut(value:string): string | null {
  if (value?.trim() === '1-9') return '1-9';
  const checked=validateRut(value); return checked.valid ? checked.normalized : null;
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && required.every(key => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
}
export function parsePaymentTaxProfiles(raw?: string): PaymentTaxProfile[] {
  const fail = () => { throw new Error('FACTURACION_CL_PROFILES_INVALID'); };
  let rows: unknown;
  try { rows = JSON.parse(raw?.trim() || '[]'); } catch { return fail(); }
  if (!Array.isArray(rows)) return fail();
  const seen = new Set<number>();
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return fail();
    const p = row as PaymentTaxProfile;
    if (!exactKeys(row, ['idEmpresa', 'approved', 'issuerRut', 'defaultDocumentType', 'receipt'], ['invoice']) ||
        !Number.isSafeInteger(p.idEmpresa) || p.idEmpresa < 1 || seen.has(p.idEmpresa) || p.approved !== true ||
        typeof p.issuerRut !== 'string' || !sandboxIssuerRut(p.issuerRut) || !['BOLETA','FACTURA'].includes(p.defaultDocumentType) ||
        !p.receipt || !exactKeys(p.receipt, ['tipoDte','encoding','serviceIndicator']) ||
        ![39,41].includes(p.receipt.tipoDte) || !['latin1','utf8'].includes(p.receipt.encoding) || ![1,2,3].includes(p.receipt.serviceIndicator)) return fail();
    if (p.invoice && (!exactKeys(p.invoice, ['tipoDte','folioFrom','folioTo'], ['vatRate']) || ![33,34].includes(p.invoice.tipoDte) ||
        ![p.invoice.folioFrom,p.invoice.folioTo].every(folio => typeof folio === 'string' && /^[1-9]\d{0,9}$/.test(folio)) ||
        BigInt(p.invoice.folioFrom) > BigInt(p.invoice.folioTo) ||
        (p.invoice.tipoDte === 33 ? typeof p.invoice.vatRate !== 'string' || !/^\d{1,2}(\.\d{1,2})?$/.test(p.invoice.vatRate) || Number(p.invoice.vatRate) <= 0 : p.invoice.vatRate !== undefined))) return fail();
    if (p.defaultDocumentType === 'FACTURA' && !p.invoice) return fail();
    if (p.invoice && !validateRut(p.issuerRut).valid) return fail();
    seen.add(p.idEmpresa);
    return { ...p, issuerRut: sandboxIssuerRut(p.issuerRut)!, receipt: { ...p.receipt }, ...(p.invoice ? { invoice: { ...p.invoice } } : {}) };
  });
}

@Injectable()
export class FacturacionClPaymentConfig {
  readonly profiles: PaymentTaxProfile[];
  constructor(private readonly env: ConfigService, readonly base: FacturacionClConfigService) {
    this.profiles = parsePaymentTaxProfiles(env.get<string>('FACTURACION_CL_PROFILES'));
  }
  profile(idEmpresa: number) { return this.profiles.find(p => p.idEmpresa === idEmpresa); }
  profileHash(profile: PaymentTaxProfile) {
    return createHash('sha256').update(JSON.stringify(profile)).digest('hex');
  }
  credentials(idEmpresa: number): FacturacionClTestCredentials {
    const company = this.base.snapshot().companies.find(c => c.idEmpresa === idEmpresa);
    const profile = this.profile(idEmpresa);
    if (!company || company.environment !== 'sandbox' || !profile) throw new Error('TEST_CREDENTIALS_MISSING');
    let credentials: FacturacionClTestCredentials;
    try { credentials = JSON.parse(this.env.get<string>(`FACTURACION_CL_${company.alias}_SANDBOX_CREDENTIALS`) || 'null'); }
    catch { throw new Error('TEST_CREDENTIALS_MISSING'); }
    if (!credentials || Object.keys(credentials).sort().join(',') !== 'clave,rut,usuario' ||
        ![credentials.usuario,credentials.rut,credentials.clave].every(v => typeof v === 'string' && Boolean(v.trim())) ||
        sandboxIssuerRut(credentials.rut) !== profile.issuerRut) throw new Error('TEST_CREDENTIALS_MISSING');
    return credentials;
  }
  deliveryEnabled() { return this.env.get<string>('FACTURACION_CL_DELIVERY_ENABLED')?.trim().toLowerCase() === 'true'; }
}
