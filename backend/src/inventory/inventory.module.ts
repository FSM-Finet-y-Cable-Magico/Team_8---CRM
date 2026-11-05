import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { DomainOwnershipModule } from '../domain-ownership/domain-ownership.module';

@Module({
  imports: [AuditModule, DomainOwnershipModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
