import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TvipController } from './tvip.controller';
import { TvipService } from './tvip.service';

@Module({
  imports: [AuditModule],
  controllers: [TvipController],
  providers: [TvipService],
  exports: [TvipService],
})
export class TvipModule {}
