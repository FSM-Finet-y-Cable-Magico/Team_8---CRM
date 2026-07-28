import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TvipModule } from '../tvip/tvip.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [AuditModule, TicketsModule, TvipModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
