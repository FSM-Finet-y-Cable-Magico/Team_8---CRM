import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommercialCoverageProvider } from './commercial-coverage.provider';
import { CoverageController } from './coverage.controller';
import { CoverageDomainService } from './coverage-domain.service';
import { G3CoverageProvider } from './g3-coverage.provider';
import { GeocodingService } from './geocoding.service';
import { LegacyTomodatCoverageProvider } from './legacy-tomodat-coverage.provider';

@Module({
  imports: [AuditModule],
  controllers: [CoverageController],
  providers: [
    CoverageDomainService,
    CommercialCoverageProvider,
    G3CoverageProvider,
    LegacyTomodatCoverageProvider,
    GeocodingService,
  ],
  exports: [CoverageDomainService, CommercialCoverageProvider],
})
export class CoverageModule {}
