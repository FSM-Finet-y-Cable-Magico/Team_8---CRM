import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ObservationsController } from './observations.controller';
import { ObservationsService } from './observations.service';

@Module({
  imports: [AuditModule],
  controllers: [ObservationsController],
  providers: [ObservationsService],
})
export class ObservationsModule {}
