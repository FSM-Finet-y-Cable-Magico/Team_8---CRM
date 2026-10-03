import { Module } from '@nestjs/common';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClIssuer } from './facturacion-cl.issuer';
import { FacturacionClPaymentConfig } from './facturacion-cl-payment.config';
import { TaxDocumentIssuanceController } from './tax-document-issuance.controller';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { TAX_DOCUMENT_ISSUER } from './tax-document-issuer.types';

@Module({
  imports: [MailModule, AuditModule],
  controllers: [TaxDocumentIssuanceController],
  providers: [
    FacturacionClConfigService,
    FacturacionClPaymentConfig,
    FacturacionClIssuer,
    { provide: TAX_DOCUMENT_ISSUER, useExisting: FacturacionClIssuer },
  ],
  exports: [TAX_DOCUMENT_ISSUER],
})
export class TaxDocumentIssuanceModule {}
