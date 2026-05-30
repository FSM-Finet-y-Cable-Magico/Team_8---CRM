import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuditModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
