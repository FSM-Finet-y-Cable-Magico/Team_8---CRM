import { Module } from '@nestjs/common';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { PendingFacturacionClIssuer } from './pending-facturacion-cl.issuer';
import { TAX_DOCUMENT_ISSUER } from './tax-document-issuer.types';

@Module({
  providers: [
    FacturacionClConfigService,
    PendingFacturacionClIssuer,
    { provide: TAX_DOCUMENT_ISSUER, useExisting: PendingFacturacionClIssuer },
  ],
  exports: [TAX_DOCUMENT_ISSUER],
})
export class TaxDocumentIssuanceModule {}
