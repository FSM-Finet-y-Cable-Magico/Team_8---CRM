import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { CoverageModule } from '../coverage/coverage.module';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';
import { G3IntegrationModule } from '../g3-integration/g3-integration.module';

@Module({
  imports: [AuditModule, MailModule, CoverageModule, G3IntegrationModule],
  controllers: [ProspectsController],
  providers: [ProspectsService],
})
export class ProspectsModule {}
