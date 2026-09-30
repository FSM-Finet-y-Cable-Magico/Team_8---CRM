import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingReadService } from './billing-read.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule],
  controllers: [BillingController],
  providers: [BillingService, BillingReadService],
})
export class BillingModule {}
