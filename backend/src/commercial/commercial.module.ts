import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommercialControlBookService } from './commercial-control-book.service';
import { CommercialStatusService } from './commercial-status.service';
import { CommercialController } from './commercial.controller';
import { InstallmentAllocationController } from './installment-allocation.controller';
import { InstallmentAllocationService } from './installment-allocation.service';

@Module({
  imports: [AuditModule],
  controllers: [CommercialController, InstallmentAllocationController],
  providers: [CommercialControlBookService, CommercialStatusService, InstallmentAllocationService],
  exports: [CommercialControlBookService, CommercialStatusService],
})
export class CommercialModule {}
