import { ConfigService } from '@nestjs/config';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

export class MailDeliveryError extends Error {
  constructor(readonly code: string, readonly confirmedNotAccepted: boolean, readonly retryable: boolean) { super(code); }
  static fromSmtp(error: unknown, preflight: boolean) {
    const data = error as { code?: string; command?: string; responseCode?: number; message?: string };
    const code = data?.code ?? 'UNKNOWN';
    const rejection = ['EENVELOPE','EMESSAGE','EAUTH'].includes(code) && Number(data.responseCode) >= 400 && Number(data.responseCode) < 600;
    const notAccepted = preflight || rejection;
    const tlsRejected = code === 'ETLS' || /certificate|self.signed|tls|ssl|hostname/i.test(data?.message ?? '');
    const temporary = !tlsRejected && (rejection ? Number(data.responseCode) < 500 : ['ECONNECTION','ESOCKET','EDNS','ETIMEDOUT'].includes(code));
    const publicCode = notAccepted ? (temporary ? 'SMTP_TEMPORARY_NOT_ACCEPTED' : 'SMTP_NOT_ACCEPTED') : 'SMTP_RESULT_UNCERTAIN';
    // Never preserve raw responses: providers may echo addresses or authentication details.
    return new MailDeliveryError(publicCode, notAccepted, notAccepted && temporary);
  }
}

export function validSmtpAddress(value: string) {
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(value) || value.length > 254) return false;
  const [local, domain] = value.split('@');
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
    domain.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

export function smtpSettings(config: ConfigService) {
  const value = (name: string) => config.get<string>(name)?.trim() || undefined;
  const fail = (): never => { throw new MailDeliveryError('SMTP_CONFIG_INVALID', true, false); };
  const bool = (name: string, fallback: boolean) => {
    const raw = value(name)?.toLowerCase();
    if (raw === undefined) return fallback;
    if (!['true','false','1','0','yes','no','si'].includes(raw)) return fail();
    return ['true','1','yes','si'].includes(raw);
  };
  const host = value('SMTP_HOST');
  if (!host) return null;
  if (!/^(?:[a-zA-Z0-9.-]+|::1)$/.test(host)) fail();
  const from = value('SMTP_FROM') ?? value('SMTP_USER');
  if (!from || !validSmtpAddress(from)) fail();
  const user = value('SMTP_USER'), password = config.get<string>('SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) fail();
  const secure = bool('SMTP_SECURE', false), startTls = bool('SMTP_STARTTLS', !secure);
  const port = Number(value('SMTP_PORT') ?? (secure ? 465 : 587));
  const timeout = Number(value('SMTP_TIMEOUT_MS') ?? 15000);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeout) || timeout < 100 || timeout > 60000 ||
      (port === 465 && !secure) || (port === 587 && secure) || !bool('SMTP_REJECT_UNAUTHORIZED', true)) fail();
  const plaintext = !secure && !startTls;
  const local = ['localhost','127.0.0.1','::1','mailpit'].includes(host.toLowerCase());
  if (plaintext && (!local || value('NODE_ENV') === 'production' || !bool('SMTP_ALLOW_INSECURE_LOCAL', false))) fail();
  if (plaintext && user) fail();
  const name = value('SMTP_HELO') ?? 'crm-finet.local', fromName = value('SMTP_FROM_NAME') ?? 'CRM FiNet';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(name) || /[\r\n]/.test(fromName)) fail();
  const servername = value('SMTP_TLS_SERVERNAME') ?? host;
  if (!/^[a-zA-Z0-9.-]+$/.test(servername) && servername !== '::1') fail();
  const options: SMTPTransport.Options = { host, port, secure, name, requireTLS: !secure && startTls, ignoreTLS: plaintext,
    connectionTimeout: timeout, greetingTimeout: timeout, socketTimeout: timeout, dnsTimeout: timeout,
    logger: false, debug: false, pool: false, disableFileAccess: true, disableUrlAccess: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername,
      ...(value('SMTP_TLS_CA') ? { ca: value('SMTP_TLS_CA')!.replace(/\\n/g,'\n') } : {}) },
    ...(user && password ? { auth: { user, pass: password } } : {}),
  };
  return { options, from: from!, fromName, validAddress: validSmtpAddress, mode: plaintext ? 'local_plaintext' : secure ? 'tls' : 'starttls' };
}
