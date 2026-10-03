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
import { G1IntegrationModule } from '../g1-integration/g1-integration.module';

@Module({
  imports: [AuditModule, G1IntegrationModule, IntegrationAuthModule],
  controllers: [G3IntegrationController, G3CanonicalWebhookController, ServiceWithdrawalController],
  providers: [
    HttpG3IntegrationClient,
    { provide: G3_INTEGRATION_CLIENT, useExisting: HttpG3IntegrationClient },
    InstallationActivationService,
    G3ClosureProcessor,
    InstallationIntegrationService,
    ServiceWithdrawalService,
  ],
  exports: [InstallationIntegrationService, G3ClosureProcessor],
})
export class G3IntegrationModule {}
