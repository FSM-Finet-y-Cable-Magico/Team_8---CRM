import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { CommercialModule } from '../commercial/commercial.module';

@Module({
  imports: [AuditModule, CommercialModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
