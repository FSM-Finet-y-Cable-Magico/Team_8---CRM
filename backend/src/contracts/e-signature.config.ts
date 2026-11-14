import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { smtpSettings } from '../mail/smtp.config';

export const SIGNATURE_CONSENT = 'He leído el contrato y acepto sus condiciones. Autorizo registrar mi aceptación desde este enlace personal como firma electrónica simple. Podré descargar el contrato firmado y su constancia.';
// Couple the version to the exact text: an already-open page cannot accept revised wording silently.
export const SIGNATURE_CONSENT_VERSION = 'fes-correo-v1-' + createHash('sha256').update(SIGNATURE_CONSENT).digest('hex').slice(0, 16);
export const DEMO_SIGNATURE_CONSENT = 'He revisado el PDF y acepto registrar mi aceptación para esta demostración.';
export const DEMO_SIGNATURE_CONSENT_VERSION = 'demo-enlace-v1-' + createHash('sha256').update(DEMO_SIGNATURE_CONSENT).digest('hex').slice(0, 16);
export function signatureSettings(config: ConfigService) {
  const flag = config.get<string>('CONTRACT_SIGNATURE_ENABLED') ?? 'false';
  if (!['true', 'false'].includes(flag)) throw new Error('CONTRACT_SIGNATURE_FLAG_INVALID');
  if (flag !== 'true') return null;
  const production = config.get<string>('NODE_ENV') === 'production';
  let url: URL;
  try { url = new URL(config.get<string>('CONTRACT_SIGNATURE_PUBLIC_URL') ?? ''); }
  catch { throw new Error('CONTRACT_SIGNATURE_PUBLIC_URL_INVALID'); }
  if ((url.protocol !== 'https:' && !(config.get<string>('NODE_ENV') === 'test'
      && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('CONTRACT_SIGNATURE_PUBLIC_URL_INVALID');
  }
  const secret = config.get<string>('CONTRACT_SIGNATURE_OTP_SECRET') ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error('CONTRACT_SIGNATURE_OTP_SECRET_INVALID');
  let companies: number[];
  try { companies = JSON.parse(config.get<string>('CONTRACT_SIGNATURE_COMPANIES') ?? '[]'); }
  catch { throw new Error('CONTRACT_SIGNATURE_COMPANIES_INVALID'); }
  if (!Array.isArray(companies) || !companies.length || companies.some(n => !Number.isSafeInteger(n) || n < 1)
      || new Set(companies).size !== companies.length) throw new Error('CONTRACT_SIGNATURE_COMPANIES_INVALID');
  if (production && (config.get<string>('CONTRACT_SIGNATURE_LEGAL_APPROVED') !== 'true'
      || config.get<string>('CONTRACT_SIGNATURE_EVIDENCE_BACKUP_CONFIRMED') !== 'true'
      || config.get<string>('MAIL_PROVIDER') !== 'smtp')) throw new Error('CONTRACT_SIGNATURE_ACTIVATION_NOT_APPROVED');
  const test = config.get<string>('NODE_ENV') === 'test';
  const demoFlag = config.get<string>('CONTRACT_SIGNATURE_DEMO_WITHOUT_CODE') ?? 'false';
  if (!['true', 'false'].includes(demoFlag)) throw new Error('CONTRACT_SIGNATURE_DEMO_FLAG_INVALID');
  const demo = demoFlag === 'true';
  if (demo) {
    const database = URL.parse(config.get<string>('DATABASE_URL') ?? '');
    if (!test || !['localhost', '127.0.0.1'].includes(url.hostname)
      || !database || database.protocol !== 'postgresql:'
      || !['localhost', '127.0.0.1', 'finet-firma-qa-db'].includes(database.hostname)
      || !/^\/(?:finet_firma_qa|qa_contract_signature_[a-f0-9]{32})$/.test(database.pathname)) {
      throw new Error('CONTRACT_SIGNATURE_DEMO_ISOLATION_REQUIRED');
    }
    const mailProvider = config.get<string>('MAIL_PROVIDER');
    if (mailProvider !== 'mock' && (mailProvider !== 'smtp' || companies.some(company => {
      const smtp = smtpSettings(config, company);
      return !smtp || smtp.mode !== 'local_plaintext' || smtp.options.port !== 1025
        || !['mailpit', 'localhost', '127.0.0.1'].includes(smtp.options.host ?? '');
    }))) {
      throw new Error('CONTRACT_SIGNATURE_DEMO_MAIL_REQUIRED');
    }
  }
  return { url: url.origin, secret, companies, test, demo };
}
export function requireSignatureSettings(config: ConfigService) {
  const settings = signatureSettings(config);
  if (!settings) throw new NotFoundException('Función no disponible');
  return settings;
}
