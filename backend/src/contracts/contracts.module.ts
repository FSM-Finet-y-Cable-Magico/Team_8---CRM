import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [AuditModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
