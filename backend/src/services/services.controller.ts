import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { AttachEquipmentDto } from './dto/attach-equipment.dto';
import { CreateServiceDto } from './dto/create-service.dto';
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
