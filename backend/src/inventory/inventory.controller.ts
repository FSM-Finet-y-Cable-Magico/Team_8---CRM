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
import { DomainOwnershipService } from '../domain-ownership/domain-ownership.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly ownership: DomainOwnershipService,
  ) {}

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
    void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment');
  }

  @Post('nap-boxes')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createNapBox(@Body() dto: CreateNapBoxDto, @CurrentUser() user: AuthUser) {
    void dto;
    return this.ownership.rejectG3Write(user, 'POST /api/inventory/nap-boxes');
  }

  @Post('consumables')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  createConsumableStock(@Body() dto: CreateConsumableStockDto, @CurrentUser() user: AuthUser) {
    void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/consumables');
  }

  @Post('consumables/:id/movements')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  recordConsumableMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordConsumableMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/consumables/:id/movements');
  }

  @Post('movements')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  recordMovement(@Body() dto: RecordMovementDto, @CurrentUser() user: AuthUser) {
    void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/movements');
  }

  @Patch('equipment/:id/status')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'PATCH /api/inventory/equipment/:id/status');
  }

  @Post('equipment/:id/block')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  blockEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BlockEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment/:id/block');
  }

  @Post('equipment/:id/diagnosis')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  diagnoseEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiagnoseEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment/:id/diagnosis');
  }

  @Post('equipment/:id/transfer')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  transferEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment/:id/transfer');
  }

  @Post('equipment/:id/maintenance')
  @Roles(...ACCESS_ROLES.MANAGE_INVENTORY)
  registerMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterMaintenanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment/:id/maintenance');
  }

  @Post('equipment/:id/install')
  @Roles(...ACCESS_ROLES.INSTALL_EQUIPMENT)
  installRouter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InstallRouterDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectInventoryWrite(user, 'POST /api/inventory/equipment/:id/install');
  }

  @Post('work-orders/:id/evidence')
  @Roles(...ACCESS_ROLES.INSTALL_EQUIPMENT)
  attachEvidence(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachEvidenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    void id; void dto;
    return this.ownership.rejectG3Write(user, 'POST /api/inventory/work-orders/:id/evidence');
  }
}
