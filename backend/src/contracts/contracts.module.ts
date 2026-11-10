import { MailModule } from '../mail/mail.module';
import { ESignatureService } from './e-signature.service';
import { ContractSignatureController, PublicSignatureController, SignaturePublicGuard } from './e-signature.controller';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { G3IntegrationModule } from '../g3-integration/g3-integration.module';
import { PlanChangeProcessor } from './plan-change.processor';

@Module({
  imports: [AuditModule, ServicesModule, G3IntegrationModule, MailModule],
  controllers: [ContractsController, ContractSignatureController, PublicSignatureController],
  providers: [ContractsService, PlanChangeProcessor, ESignatureService, SignaturePublicGuard],
})
export class ContractsModule {}
