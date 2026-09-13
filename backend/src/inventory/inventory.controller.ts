import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { AttachEvidenceDto } from './dto/attach-evidence.dto';
import { BlockEquipmentDto } from './dto/block-equipment.dto';
import { CreateConsumableStockDto } from './dto/create-consumable-stock.dto';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { CreateNapBoxDto } from './dto/create-nap-box.dto';
import { DiagnoseEquipmentDto } from './dto/diagnose-equipment.dto';
import { InstallRouterDto } from './dto/install-router.dto';
import { RecordConsumableMovementDto } from './dto/record-consumable-movement.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { RegisterMaintenanceDto } from './dto/register-maintenance.dto';
import { TransferEquipmentDto } from './dto/transfer-equipment.dto';
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

  @Get('advanced')
  @Roles(...ACCESS_ROLES.VIEW_INVENTORY)
  advanced(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.inventoryService.advanced(user, scope ?? 'consolidado');
  }

  @Post('equipment')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createEquipment(@Body() dto: CreateEquipmentDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.createEquipment(dto, user);
  }

  @Post('nap-boxes')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createNapBox(@Body() dto: CreateNapBoxDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.createNapBox(dto, user);
  }

  @Post('consumables')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createConsumableStock(@Body() dto: CreateConsumableStockDto, @CurrentUser() user: AuthUser) {
    return this.inventoryService.createConsumableStock(dto, user);
  }

  @Post('consumables/:id/movements')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  recordConsumableMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordConsumableMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.recordConsumableMovement(id, dto, user);
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

  @Post('equipment/:id/block')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  blockEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BlockEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.blockEquipment(id, dto, user);
  }

  @Post('equipment/:id/diagnosis')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  diagnoseEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiagnoseEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.diagnoseEquipment(id, dto, user);
  }

  @Post('equipment/:id/transfer')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  transferEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.transferEquipment(id, dto, user);
  }

  @Post('equipment/:id/maintenance')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  registerMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterMaintenanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.registerMaintenance(id, dto, user);
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

  @Post('work-orders/:id/evidence')
  @Roles(...ACCESS_ROLES.INSTALL_EQUIPMENT)
  attachEvidence(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachEvidenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.attachEvidence(id, dto, user);
  }
}
