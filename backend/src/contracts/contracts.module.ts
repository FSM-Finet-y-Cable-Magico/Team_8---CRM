import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { G3IntegrationModule } from '../g3-integration/g3-integration.module';
import { PlanChangeProcessor } from './plan-change.processor';

@Module({
  imports: [AuditModule, ServicesModule, G3IntegrationModule],
  controllers: [ContractsController],
  providers: [ContractsService, PlanChangeProcessor],
})
export class ContractsModule {}
