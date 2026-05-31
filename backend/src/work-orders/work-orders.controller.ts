import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @Roles('Administrador', 'Soporte', 'Terreno')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.workOrdersService.list(user, scope ?? 'consolidado');
  }

  @Patch(':id/complete-installation')
  @Roles('Administrador', 'Terreno', 'Soporte')
  completeInstallation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteInstallOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workOrdersService.completeInstallation(id, dto, user);
  }
}
