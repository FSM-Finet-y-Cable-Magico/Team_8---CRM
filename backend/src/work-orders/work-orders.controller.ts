import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';
import { CompleteRepairOrderDto } from './dto/complete-repair-order.dto';
import { WorkOrdersService } from './work-orders.service';
import { DomainOwnershipService } from '../domain-ownership/domain-ownership.service';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly ownership: DomainOwnershipService,
  ) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_WORK_ORDERS)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.workOrdersService.list(user, scope ?? 'consolidado');
  }

  @Patch(':id/complete-installation')
  @Roles(...ACCESS_ROLES.COMPLETE_INSTALLATION)
  completeInstallation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteInstallOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectG3Write(user, 'PATCH /api/work-orders/:id/complete-installation');
  }

  @Patch(':id/cancel-installation')
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  cancelInstallation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.cancelInstallation(id, user);
  }

  @Patch(':id/complete-repair')
  @Roles(...ACCESS_ROLES.UPDATE_TICKET_STATUS)
  completeRepair(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteRepairOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.completeRepair(id, dto, user);
  }
}
