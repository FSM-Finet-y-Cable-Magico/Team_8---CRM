import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommercialControlBookService } from './commercial-control-book.service';
import { CommercialStatusService } from './commercial-status.service';
import { CommercialController } from './commercial.controller';

@Module({
  imports: [AuditModule],
  controllers: [CommercialController],
  providers: [CommercialControlBookService, CommercialStatusService],
  exports: [CommercialControlBookService, CommercialStatusService],
})
export class CommercialModule {}
