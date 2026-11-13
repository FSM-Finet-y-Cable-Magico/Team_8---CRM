import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationAuthModule } from '../integration-auth/integration-auth.module';
import { G3ClosureProcessor } from './g3-closure.processor';
import { G3CanonicalWebhookController, G3IntegrationController, ServiceWithdrawalController } from './g3-integration.controller';
import { G3_INTEGRATION_CLIENT } from './g3-integration.types';
import { HttpG3IntegrationClient } from './http-g3-integration.client';
import { InstallationActivationService } from './installation-activation.service';
import { InstallationIntegrationService } from './installation-integration.service';
import { ServiceWithdrawalService } from './service-withdrawal.service';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { WithdrawalTrackingProcessor } from './withdrawal-tracking.processor';
import { G3_WITHDRAWAL_CLIENT, HttpG3WithdrawalClient } from './http-g3-withdrawal.client';
import { TicketsModule } from '../tickets/tickets.module';
import { G1IntegrationModule } from '../g1-integration/g1-integration.module';
import { InstallationHistoryController } from './installation-history.controller';
import { InstallationHistoryService } from './installation-history.service';

@Module({
  imports: [AuditModule, G1IntegrationModule, IntegrationAuthModule, TicketsModule],
  controllers: [G3IntegrationController, G3CanonicalWebhookController, ServiceWithdrawalController, InstallationHistoryController],
  providers: [
    InstallationHistoryService,
    HttpG3IntegrationClient,
    { provide: G3_INTEGRATION_CLIENT, useExisting: HttpG3IntegrationClient },
    InstallationActivationService,
    G3ClosureProcessor,
    InstallationIntegrationService,
    ServiceWithdrawalService,
    HttpG3WithdrawalClient,
    { provide: G3_WITHDRAWAL_CLIENT, useExisting: HttpG3WithdrawalClient },
    WithdrawalWorkflowService,
    // Follow-up every 5 minutes; disabled unless WITHDRAWAL_TRACKING_ENABLED=true.
    WithdrawalTrackingProcessor,
  ],
  exports: [InstallationIntegrationService, G3ClosureProcessor],
})
export class G3IntegrationModule {}
