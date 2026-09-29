import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExternalTaxDocumentsController } from './external-tax-documents.controller';
import { ExternalTaxDocumentsService } from './external-tax-documents.service';

@Module({
  imports: [AuditModule],
  controllers: [ExternalTaxDocumentsController],
  providers: [ExternalTaxDocumentsService],
  exports: [ExternalTaxDocumentsService],
})
export class ExternalTaxDocumentsModule {}
