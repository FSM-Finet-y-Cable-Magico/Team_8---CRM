import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuditModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
