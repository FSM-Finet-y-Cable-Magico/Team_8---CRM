import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommercialControlController } from './commercial-control.controller';
import { CommercialControlService } from './commercial-control.service';

@Module({
  imports: [AuditModule],
  controllers: [CommercialControlController],
  providers: [CommercialControlService],
})
export class CommercialControlModule {}
