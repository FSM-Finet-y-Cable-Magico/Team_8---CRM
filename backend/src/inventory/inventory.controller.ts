import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { InstallRouterDto } from './dto/install-router.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_INVENTORY)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.inventoryService.list(user, scope ?? 'consolidado');
  }

  @Post('equipment')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createEquipment(@Body() dto: CreateEquipmentDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.createEquipment(dto, user);
  }

  @Post('movements')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  recordMovement(@Body() dto: RecordMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.recordMovement(dto, user);
  }

  @Patch('equipment/:id/status')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.updateStatus(id, dto, user);
  }

  @Post('equipment/:id/install')
  @Roles(...ACCESS_ROLES.INSTALL_EQUIPMENT)
  installRouter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InstallRouterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.installRouter(id, dto, user);
  }
}
