import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [AuditModule, ServicesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
