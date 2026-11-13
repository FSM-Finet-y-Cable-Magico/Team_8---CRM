import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { MailDeliveryError, smtpCompanies, smtpSettings, validSmtpAddress } from './smtp.config';

export { MailDeliveryError } from './smtp.config';
export type QuoteEmail = { idEmpresa?: number; to: string; prospectName: string; companyName: string; pdf: Buffer; filename: string };
export type TaxDocumentEmail = { idEmpresa?: number; to: string; customerName: string; tipoDte: number; folio: string; idPago: number; pdf: Buffer; filename: string; deliveryKey?: string };
export type MailDeliveryResult = { status: 'sent' | 'not_configured' | 'simulated'; messageId?: string };
type Message = { idEmpresa?: number; to: string; subject: string; text: string; html?: string; pdf?: Buffer; filename?: string; deliveryKey?: string };

function contractEmail(title: string, content: string, action = '') {
  return `<html lang="es"><body style="margin:0;background:#f3f7f5;font-family:Arial,sans-serif;color:#253c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="100%" style="max-width:580px;background:#fff;border:1px solid #dfe9e3;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:36px"><p style="color:#237c68;font-size:12px;letter-spacing:1px">GESTIÓN DE CONTRATOS</p><h1 style="font-size:26px;line-height:1.3">${title}</h1><p style="font-size:15px;line-height:1.8;color:#52685e">${content}</p>${action}<p style="margin-top:32px;padding-top:20px;border-top:1px solid #e4ece7;color:#718278;font-size:12px;line-height:1.6">Este mensaje corresponde a su proceso de contratación. Si no reconoce esta solicitud, comuníquese con la empresa antes de continuar.</p></td></tr></table></td></tr></table></body></html>`;
}

@Injectable()
export class MailService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  private mode() {
    const mode=this.config.get<string>('MAIL_PROVIDER')?.trim() || 'smtp';
    if (!['smtp','disabled','mock'].includes(mode)) throw new MailDeliveryError('MAIL_PROVIDER_INVALID',true,false);
    return mode;
  }
  onModuleInit() {
    if (this.mode() !== 'smtp') return;
    const companies = smtpCompanies(this.config);
    if (companies.length) for (const company of companies) smtpSettings(this.config, company.idEmpresa);
    else smtpSettings(this.config);
  } // No startup network traffic.
  isConfigured(idEmpresa?: number) {
    if (this.mode() === 'disabled') return false;
    const companies = smtpCompanies(this.config);
    if ((companies.length || idEmpresa !== undefined) && !companies.some(company => company.idEmpresa === idEmpresa)) return false;
    return this.mode() === 'mock' || smtpSettings(this.config, idEmpresa) !== null;
  }

  async verifyConnection(idEmpresa?: number) {
    if(this.mode()==='disabled')return {status:'not_configured' as const};
    if (!this.isConfigured(idEmpresa)) return {status:'not_configured' as const};
    if(this.mode()==='mock')return {status:'simulated' as const};
    const settings = smtpSettings(this.config, idEmpresa);
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
      text: `Hola ${message.prospectName},\n\nAdjuntamos la cotizacion solicitada para ${message.companyName}.` });
  }

  sendTaxDocument(message: TaxDocumentEmail): Promise<MailDeliveryResult> {
    if (![33,34,39,41].includes(message.tipoDte) || !/^[1-9]\d{0,9}$/.test(message.folio)) {
      return Promise.reject(new MailDeliveryError('TAX_EMAIL_DOCUMENT_INVALID', true, false));
    }
    const name = [39,41].includes(message.tipoDte) ? 'Boleta' : 'Factura';
    return this.sendMessage({ ...message, subject: `${name} electronica ${message.folio}`,
      text: `Hola ${message.customerName},\n\nAdjuntamos ${name.toLowerCase()} electronica ${message.folio}, correspondiente al pago ${message.idPago}.` });
  }

  sendSignatureInvitation(message: { idEmpresa: number; to: string; link: string }) {
    const link = message.link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return this.sendMessage({ ...message, subject: 'Su contrato está disponible para revisión y firma',
      text: 'Estimado/a cliente:\n\nSu contrato está disponible para revisión. Acceda al enlace personal, descargue el documento y revise sus condiciones antes de aceptar y firmar. El enlace tiene una vigencia de 48 horas y es de uso exclusivo del titular; no lo comparta.\n\nRevisar y firmar contrato: ' + message.link,
      html: contractEmail('Su contrato está listo', 'Estimado/a cliente:<br><br>Le invitamos a revisar su contrato. Podrá descargar el documento, leer sus condiciones y registrar su firma desde una misma página.<br><br>Este enlace personal estará disponible durante 48 horas. Por su privacidad, no lo comparta.', `<p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#237c68;color:#fff;padding:16px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Revisar y firmar contrato</a></p>`) });
  }

  sendSignatureCode(message: { idEmpresa: number; to: string; code: string }) {
    if (!/^\d{6}$/.test(message.code)) throw new MailDeliveryError('SIGNATURE_CODE_INVALID', true, false);
    return this.sendMessage({ ...message, subject: 'Código para firmar tu contrato',
      text: 'Tu código de firma es: ' + message.code + '. Vence en 10 minutos. No lo compartas. Si no solicitaste la firma, contacta a la empresa.' });
  }

  sendSignedContract(message: { idEmpresa: number; to: string; pdf: Buffer; filename: string }) {
    return this.sendMessage({ ...message, subject: 'Confirmación de firma de su contrato',
      text: 'Estimado/a cliente:\n\nSu firma se ha registrado correctamente. Adjuntamos su contrato firmado junto con la constancia de aceptación mediante firma electrónica simple. Le recomendamos descargar y conservar una copia para futuras consultas.\n\nGracias por su confianza.',
      html: contractEmail('Contrato firmado correctamente', 'Estimado/a cliente:<br><br>Confirmamos que su firma se ha registrado correctamente.<br><br>Encontrará adjunto su <strong>contrato firmado y la constancia de aceptación</strong>. Le recomendamos descargar el archivo y conservar una copia para futuras consultas.<br><br>Gracias por su confianza.') });
  }

  sendTest(to: string, idEmpresa?: number) {
    return this.sendMessage({ to, idEmpresa, subject: 'Prueba SMTP del CRM',
      text: 'Mensaje de prueba de la conexion SMTP del CRM. No es un cobro, cotizacion ni documento tributario.' });
  }

  private async sendMessage(message: Message): Promise<MailDeliveryResult> {
    if(this.mode()==='disabled' || !this.isConfigured(message.idEmpresa))return {status:'not_configured'};
    if(this.mode()==='mock') {
      if(!validSmtpAddress(message.to))throw new MailDeliveryError('SMTP_RECIPIENT_INVALID',true,false);
      if(message.pdf && (message.pdf.length>5*1024*1024 || message.pdf.subarray(0,5).toString('ascii')!=='%PDF-' ||
        !/^[a-zA-Z0-9._-]+\.pdf$/.test(message.filename ?? '') || (message.filename?.length ?? 0)>120))throw new MailDeliveryError('TAX_EMAIL_DOCUMENT_INVALID',true,false);
      return {status:'simulated'};
    }
    const settings = smtpSettings(this.config, message.idEmpresa);
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
          envelope: { from: settings.from, to: [message.to] }, subject: message.subject, text: `${message.text}\n\nSaludos,\n${settings.fromName}`,
          html: message.html, messageId, disableFileAccess: true, disableUrlAccess: true,
          attachments: message.pdf ? [{ filename: message.filename!, content: message.pdf, contentType: 'application/pdf' }] : [],
        });
        // SMTP acceptance is not proof of inbox delivery. QUIT is not a second acceptance barrier.
        if (!result.accepted?.length || result.rejected?.length) throw new MailDeliveryError('SMTP_RESULT_UNCERTAIN', false, false);
        return { status: 'sent', messageId: result.messageId };
      } catch (error) { throw error instanceof MailDeliveryError ? error : MailDeliveryError.fromSmtp(error, false); }
    } finally { transport.close(); }
  }
}
