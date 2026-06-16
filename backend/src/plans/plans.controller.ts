import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { PlansService } from './plans.service';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.plansService.list(user, scope ?? 'consolidado');
  }
}
