import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { G3ClosureProcessor } from './g3-closure.processor';
import { G3IntegrationController, ServiceWithdrawalController } from './g3-integration.controller';
import { G3_INTEGRATION_CLIENT } from './g3-integration.types';
import { G3WebhookGuard, G3_WEBHOOK_AUTHENTICATOR, PendingG3WebhookAuthenticator } from './g3-webhook.guard';
import { HttpG3IntegrationClient } from './http-g3-integration.client';
import { InstallationActivationService } from './installation-activation.service';
import { InstallationIntegrationService } from './installation-integration.service';
import { ServiceWithdrawalService } from './service-withdrawal.service';
import { G1IntegrationModule } from '../g1-integration/g1-integration.module';

@Module({
  imports: [AuditModule, G1IntegrationModule],
  controllers: [G3IntegrationController, ServiceWithdrawalController],
  providers: [
    HttpG3IntegrationClient,
    { provide: G3_INTEGRATION_CLIENT, useExisting: HttpG3IntegrationClient },
    PendingG3WebhookAuthenticator,
    { provide: G3_WEBHOOK_AUTHENTICATOR, useExisting: PendingG3WebhookAuthenticator },
    G3WebhookGuard,
    InstallationActivationService,
    G3ClosureProcessor,
    InstallationIntegrationService,
    ServiceWithdrawalService,
  ],
  exports: [InstallationIntegrationService, G3ClosureProcessor, G3WebhookGuard, G3_WEBHOOK_AUTHENTICATOR],
})
export class G3IntegrationModule {}
