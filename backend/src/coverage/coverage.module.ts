import { Module } from '@nestjs/common';
import { CoverageController } from './coverage.controller';
import { CoverageService } from './coverage.service';

@Module({ controllers: [CoverageController], providers: [CoverageService], exports: [CoverageService] })
export class CoverageModule {}
