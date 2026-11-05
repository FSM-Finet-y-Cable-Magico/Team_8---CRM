import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CommercialWarrantiesService } from './commercial-warranties.service';
import { G1ActivationService } from './g1-activation.service';
import { CommercialWarrantyQueryDto, G1EquipmentTypesQueryDto, G1UnitQueryDto, SaveCommercialWarrantyDto } from './g1-integration.dto';
import { G1InventoryService } from './g1-inventory.service';

@Controller('integrations/g1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class G1IntegrationController {
  constructor(
    private readonly inventory: G1InventoryService,
    private readonly activations: G1ActivationService,
  ) {}

  @Get('equipment-types')
  @Roles(...ACCESS_ROLES.VIEW_G1_EQUIPMENT)
  equipmentTypes(@Query() query: G1EquipmentTypesQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventory.equipmentTypes(user, query);
  }

  @Get('units/:serial')
  @Roles(...ACCESS_ROLES.VIEW_G1_EQUIPMENT)
  unit(@Param('serial') serial: string, @Query() query: G1UnitQueryDto, @CurrentUser() user: AuthUser) {
    return this.inventory.unitBySerial(serial, user, query.idEmpresa);
  }

  @Get('services/:id/equipment')
  @Roles(...ACCESS_ROLES.VIEW_G1_EQUIPMENT)
  serviceEquipment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.inventory.equipmentByService(id, user);
  }

  @Get('activations/:id')
  @Roles(...ACCESS_ROLES.VIEW_G1_EQUIPMENT)
  activation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.activations.detail(id, user);
  }

  @Post('activations/:id/retry')
  @Roles(...ACCESS_ROLES.MANAGE_G1_ACTIVATION_RETRY)
  retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.activations.retry(id, user);
  }
}

@Controller('commercial-warranties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialWarrantiesController {
  constructor(private readonly warranties: CommercialWarrantiesService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_G1_EQUIPMENT)
  list(@Query() query: CommercialWarrantyQueryDto, @CurrentUser() user: AuthUser) {
    return this.warranties.list(query, user);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_WARRANTIES)
  create(@Body() dto: SaveCommercialWarrantyDto, @CurrentUser() user: AuthUser) {
    return this.warranties.create(dto, user);
  }

  @Patch(':id')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_WARRANTIES)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveCommercialWarrantyDto, @CurrentUser() user: AuthUser) {
    return this.warranties.update(id, dto, user);
  }

  @Patch(':id/deactivate')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_WARRANTIES)
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.warranties.deactivate(id, user);
  }
}
