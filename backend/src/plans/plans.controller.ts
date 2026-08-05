import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('includeInactive') includeInactive?: string) {
    return this.plansService.list(user, scope ?? 'consolidado', includeInactive === 'true');
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_PLANS)
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser) {
    return this.plansService.create(dto, user);
  }

  @Patch(':id')
  @Roles(...ACCESS_ROLES.MANAGE_PLANS)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthUser) {
    return this.plansService.update(id, dto, user);
  }

  @Patch(':id/activate')
  @Roles(...ACCESS_ROLES.MANAGE_PLANS)
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.plansService.setActive(id, true, user);
  }

  @Patch(':id/deactivate')
  @Roles(...ACCESS_ROLES.MANAGE_PLANS)
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.plansService.setActive(id, false, user);
  }
}
