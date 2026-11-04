import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { ApplyInstallmentsDto, ReverseInstallmentDto } from './installment-allocation.dto';
import { InstallmentAllocationService } from './installment-allocation.service';

@Controller('commercial/agreements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstallmentAllocationController {
  constructor(private readonly allocations: InstallmentAllocationService) {}

  @Get(':id/allocations')
  @Roles(...ACCESS_ROLES.VIEW_CONTROL_BOOK)
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.allocations.detail(id, user);
  }

  @Post(':id/allocations')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  apply(@Param('id', ParseIntPipe) id: number, @Body() dto: ApplyInstallmentsDto, @CurrentUser() user: AuthUser) {
    return this.allocations.apply(id, dto, user);
  }

  @Post(':id/allocations/:allocationId/reverse')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  reverse(@Param('id', ParseIntPipe) id: number, @Param('allocationId', ParseIntPipe) allocationId: number,
    @Body() dto: ReverseInstallmentDto, @CurrentUser() user: AuthUser) {
    return this.allocations.reverse(id, allocationId, dto, user);
  }
}
