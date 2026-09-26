import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ControlBookImportPreviewService } from './control-book-import-preview.service';

@Module({
  imports: [AuditModule],
  controllers: [ImportsController],
  providers: [ImportsService, ControlBookImportPreviewService],
})
export class ImportsModule {}
