import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompaniesService } from './companies.service';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @Roles('Administrador')
  list() {
    return this.companiesService.list();
  }

  @Get('summary')
  @Roles('Administrador')
  summary(@Query('scope') scope?: string) {
    return this.companiesService.summary(scope ?? 'consolidado');
  }
}
