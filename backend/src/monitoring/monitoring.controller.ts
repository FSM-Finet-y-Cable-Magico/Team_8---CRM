import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { DemoMeasurementDto } from './dto/demo-measurement.dto';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('customers/:idCliente/status')
  @Roles(...ACCESS_ROLES.VIEW_MONITORING)
  customerStatus(@Param('idCliente', ParseIntPipe) idCliente: number, @CurrentUser() user: AuthUser) {
    return this.monitoringService.customerStatus(idCliente, user);
  }

  @Get('services/:idServicio/status')
  @Roles(...ACCESS_ROLES.VIEW_MONITORING)
  serviceStatus(@Param('idServicio', ParseIntPipe) idServicio: number, @CurrentUser() user: AuthUser) {
    return this.monitoringService.serviceStatus(idServicio, user);
  }

  @Get('equipment/:idUnidad/status')
  @Roles(...ACCESS_ROLES.VIEW_MONITORING)
  equipmentStatus(@Param('idUnidad', ParseIntPipe) idUnidad: number, @CurrentUser() user: AuthUser) {
    return this.monitoringService.equipmentStatus(idUnidad, user);
  }

  @Get('customers/:idCliente/history')
  @Roles(...ACCESS_ROLES.VIEW_MONITORING)
  customerHistory(@Param('idCliente', ParseIntPipe) idCliente: number, @CurrentUser() user: AuthUser) {
    return this.monitoringService.customerHistory(idCliente, user);
  }

  @Post('demo-measurements')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  createDemoMeasurement(@Body() dto: DemoMeasurementDto, @CurrentUser() user: AuthUser) {
    return this.monitoringService.createDemoMeasurement(dto, user);
  }
}
