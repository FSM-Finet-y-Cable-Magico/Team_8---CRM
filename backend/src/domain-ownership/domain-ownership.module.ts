import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainOwnershipService } from './domain-ownership.service';

@Module({
  imports: [AuditModule],
  providers: [DomainOwnershipService],
  exports: [DomainOwnershipService],
})
export class DomainOwnershipModule {}
