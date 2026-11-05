import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { IntegrationAuthModule } from '../integration-auth/integration-auth.module';
import { G2IntegrationController } from './g2-integration.controller';
import { G2IntegrationService } from './g2-integration.service';

@Module({
  imports: [AuditModule, BillingModule, IntegrationAuthModule],
  controllers: [G2IntegrationController],
  providers: [G2IntegrationService],
})
export class G2IntegrationModule {}
