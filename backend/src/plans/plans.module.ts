import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [AuditModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
