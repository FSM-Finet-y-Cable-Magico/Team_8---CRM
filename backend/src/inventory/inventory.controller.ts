import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
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
  @Roles('Administrador', 'Soporte', 'Terreno')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.inventoryService.list(user, scope ?? 'consolidado');
  }

  @Post('equipment')
  @Roles('Administrador', 'Soporte')
  createEquipment(@Body() dto: CreateEquipmentDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.createEquipment(dto, user);
  }

  @Post('movements')
  @Roles('Administrador', 'Soporte')
  recordMovement(@Body() dto: RecordMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.recordMovement(dto, user);
  }

  @Patch('equipment/:id/status')
  @Roles('Administrador', 'Soporte')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.updateStatus(id, dto, user);
  }

  @Post('equipment/:id/install')
  @Roles('Administrador', 'Soporte', 'Terreno')
  installRouter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InstallRouterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.installRouter(id, dto, user);
  }
}
