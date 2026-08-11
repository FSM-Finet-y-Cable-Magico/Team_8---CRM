import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { AttachEquipmentDto } from './dto/attach-equipment.dto';
import { CreateServiceInstallOrderDto } from './dto/create-service-install-order.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { ServiceInstallAvailabilityDto } from './dto/service-install-availability.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('customer/:idCliente')
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  listByCustomer(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.servicesService.listByCustomer(idCliente, user);
  }

  @Get(':id')
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.servicesService.detail(id, user);
  }

  @Get(':id/install-availability')
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  installAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Query() dto: ServiceInstallAvailabilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.servicesService.installAvailability(id, dto, user);
  }

  @Post(':id/install-order')
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  createInstallOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateServiceInstallOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.servicesService.createInstallOrder(id, dto, user);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_SERVICES)
  create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthUser) {
    return this.servicesService.create(dto, user);
  }

  @Patch(':id')
  @Roles(...ACCESS_ROLES.MANAGE_SERVICES)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.servicesService.update(id, dto, user);
  }

  @Post(':id/equipment')
  @Roles(...ACCESS_ROLES.MANAGE_SERVICES)
  attachEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.servicesService.attachEquipment(id, dto, user);
  }
}
