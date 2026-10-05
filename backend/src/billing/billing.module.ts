import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { AuditModule } from '../audit/audit.module';
import { TaxDocumentIssuanceModule } from '../tax-document-issuance/tax-document-issuance.module';
import { BillingReadService } from './billing-read.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule, TaxDocumentIssuanceModule, MessagingModule],
  controllers: [BillingController],
  providers: [BillingService, BillingReadService],
  exports: [BillingService, BillingReadService],
})
export class BillingModule {}
