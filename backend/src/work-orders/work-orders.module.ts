import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { DomainOwnershipModule } from '../domain-ownership/domain-ownership.module';

@Module({
  imports: [AuditModule, DomainOwnershipModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}
