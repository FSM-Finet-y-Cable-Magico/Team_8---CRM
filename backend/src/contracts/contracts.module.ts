import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PlanChangeProcessor } from './plan-change.processor';

@Module({
  imports: [AuditModule, ServicesModule],
  controllers: [ContractsController],
  providers: [ContractsService, PlanChangeProcessor],
})
export class ContractsModule {}
