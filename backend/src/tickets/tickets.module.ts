import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuditModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
