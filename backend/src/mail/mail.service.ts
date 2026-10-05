import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { MailDeliveryError, smtpSettings, validSmtpAddress } from './smtp.config';

export { MailDeliveryError } from './smtp.config';
export type QuoteEmail = { to: string; prospectName: string; companyName: string; pdf: Buffer; filename: string };
export type TaxDocumentEmail = { to: string; customerName: string; tipoDte: number; folio: string; idPago: number; pdf: Buffer; filename: string; deliveryKey?: string };
export type MailDeliveryResult = { status: 'sent' | 'not_configured' | 'simulated'; messageId?: string };
type Message = { to: string; subject: string; text: string; pdf?: Buffer; filename?: string; deliveryKey?: string };

@Injectable()
export class MailService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  private mode() {
    const mode=this.config.get<string>('MAIL_PROVIDER')?.trim() || 'smtp';
    if (!['smtp','disabled','mock'].includes(mode)) throw new MailDeliveryError('MAIL_PROVIDER_INVALID',true,false);
    return mode;
  }
  onModuleInit() { if(this.mode()==='smtp')smtpSettings(this.config); } // No startup network traffic.
  isConfigured() { return this.mode()==='mock' || this.mode()==='smtp' && smtpSettings(this.config)!==null; }

  async verifyConnection() {
    if(this.mode()==='disabled')return {status:'not_configured' as const};
    if(this.mode()==='mock')return {status:'simulated' as const};
    const settings = smtpSettings(this.config);
    if (!settings) return { status: 'not_configured' as const };
    const transport = createTransport(settings.options);
    try {
      await transport.verify();
      return { status: 'ready' as const, mode: settings.mode, authenticated: Boolean(settings.options.auth) };
    } catch (error) { throw MailDeliveryError.fromSmtp(error, true); }
    finally { transport.close(); }
  }

  sendQuote(message: QuoteEmail): Promise<MailDeliveryResult> {
    return this.sendMessage({ ...message, subject: `Cotizacion de servicio - ${message.companyName}`,
      text: `Hola ${message.prospectName},\n\nAdjuntamos la cotizacion solicitada para ${message.companyName}.\n\nSaludos,\nCRM FiNet` });
  }

  sendTaxDocument(message: TaxDocumentEmail): Promise<MailDeliveryResult> {
    if (![33,34,39,41].includes(message.tipoDte) || !/^[1-9]\d{0,9}$/.test(message.folio)) {
      return Promise.reject(new MailDeliveryError('TAX_EMAIL_DOCUMENT_INVALID', true, false));
    }
    const name = [39,41].includes(message.tipoDte) ? 'Boleta' : 'Factura';
    return this.sendMessage({ ...message, subject: `${name} electronica ${message.folio}`,
      text: `Hola ${message.customerName},\n\nAdjuntamos ${name.toLowerCase()} electronica ${message.folio}, correspondiente al pago ${message.idPago}.\n\nSaludos,\nCRM FiNet` });
  }

  sendTest(to: string) {
    return this.sendMessage({ to, subject: 'Prueba SMTP del CRM',
      text: 'Mensaje de prueba de la conexion SMTP del CRM. No es un cobro, cotizacion ni documento tributario.' });
  }

  private async sendMessage(message: Message): Promise<MailDeliveryResult> {
    if(this.mode()==='disabled')return {status:'not_configured'};
    if(this.mode()==='mock') {
      if(!validSmtpAddress(message.to))throw new MailDeliveryError('SMTP_RECIPIENT_INVALID',true,false);
      if(message.pdf && (message.pdf.length>5*1024*1024 || message.pdf.subarray(0,5).toString('ascii')!=='%PDF-' ||
        !/^[a-zA-Z0-9._-]+\.pdf$/.test(message.filename ?? '') || (message.filename?.length ?? 0)>120))throw new MailDeliveryError('TAX_EMAIL_DOCUMENT_INVALID',true,false);
      return {status:'simulated'};
    }
    const settings = smtpSettings(this.config);
    if (!settings) return { status: 'not_configured' };
    if (!settings.validAddress(message.to)) throw new MailDeliveryError('SMTP_RECIPIENT_INVALID', true, false);
    if (message.pdf && (message.pdf.length > 5*1024*1024 || message.pdf.subarray(0,5).toString('ascii') !== '%PDF-' ||
        !/^[a-zA-Z0-9._-]+\.pdf$/.test(message.filename ?? '') || (message.filename?.length ?? 0) > 120)) {
      throw new MailDeliveryError('TAX_EMAIL_DOCUMENT_INVALID', true, false);
    }
    const transport = createTransport(settings.options);
    try {
      // Preflight never sends DATA. Its failures are confirmed safe to retry.
      try { await transport.verify(); } catch (error) { throw MailDeliveryError.fromSmtp(error, true); }
      const messageId = message.deliveryKey
        ? `<${createHash('sha256').update(message.deliveryKey).digest('hex')}@${settings.from.split('@')[1]}>`
        : undefined;
      try {
        const result = await transport.sendMail({
          from: { address: settings.from, name: settings.fromName }, to: { address: message.to, name: '' },
          envelope: { from: settings.from, to: [message.to] }, subject: message.subject, text: message.text,
          messageId, disableFileAccess: true, disableUrlAccess: true,
          attachments: message.pdf ? [{ filename: message.filename!, content: message.pdf, contentType: 'application/pdf' }] : [],
        });
        // SMTP acceptance is not proof of inbox delivery. QUIT is not a second acceptance barrier.
        if (!result.accepted?.length || result.rejected?.length) throw new MailDeliveryError('SMTP_RESULT_UNCERTAIN', false, false);
        return { status: 'sent', messageId: result.messageId };
      } catch (error) { throw error instanceof MailDeliveryError ? error : MailDeliveryError.fromSmtp(error, false); }
    } finally { transport.close(); }
  }
}
