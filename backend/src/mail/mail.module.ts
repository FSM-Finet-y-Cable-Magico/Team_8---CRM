import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { TAX_DOCUMENT_DELIVERY } from './tax-document-delivery.port';

@Module({
  providers: [MailService, { provide: TAX_DOCUMENT_DELIVERY, useExisting: MailService }],
  exports: [MailService, TAX_DOCUMENT_DELIVERY],
})
export class MailModule {}
