import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { G3IntegrationModule } from '../g3-integration/g3-integration.module';

@Module({
  imports: [AuditModule, G3IntegrationModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
