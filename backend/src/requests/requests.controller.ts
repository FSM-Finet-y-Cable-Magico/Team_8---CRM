import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateRequestFeasibilityDto } from './dto/update-request-feasibility.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.requestsService.list(user, scope ?? 'consolidado');
  }

  @Get('customer/:idCliente')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  listByCustomer(@Param('idCliente', ParseIntPipe) idCliente: number, @CurrentUser() user: AuthUser) {
    return this.requestsService.listByCustomer(idCliente, user);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  create(@Body() dto: CreateCustomerRequestDto, @CurrentUser() user: AuthUser) {
    return this.requestsService.create(dto, user);
  }

  @Patch(':id/status')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  updateStatus(
    @Param('id', ParseIntPipe) idSolicitud: number,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requestsService.updateStatus(idSolicitud, dto, user);
  }

  @Patch(':id/feasibility')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  updateFeasibility(
    @Param('id', ParseIntPipe) idSolicitud: number,
    @Body() dto: UpdateRequestFeasibilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requestsService.updateFeasibility(idSolicitud, dto, user);
  }
}
