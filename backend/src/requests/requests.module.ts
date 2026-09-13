import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [AuditModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
