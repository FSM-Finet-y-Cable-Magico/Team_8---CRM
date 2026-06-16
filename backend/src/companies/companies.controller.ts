import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CompaniesService } from './companies.service';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  list() {
    return this.companiesService.list();
  }

  @Get('summary')
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  summary(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.companiesService.summary(user, scope ?? 'consolidado');
  }
}
