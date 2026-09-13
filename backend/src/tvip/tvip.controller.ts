import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { TvipService } from './tvip.service';

@Controller('tvip')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TvipController {
  constructor(private readonly tvipService: TvipService) {}

  @Post('contracts/:idContrato/generate')
  @Roles(...ACCESS_ROLES.MANAGE_TVIP)
  generate(@Param('idContrato', ParseIntPipe) idContrato: number, @CurrentUser() user: AuthUser) {
    return this.tvipService.generateForContract(idContrato, user);
  }

  @Post('contracts/:idContrato/regenerate')
  @Roles(...ACCESS_ROLES.MANAGE_TVIP)
  regenerate(@Param('idContrato', ParseIntPipe) idContrato: number, @CurrentUser() user: AuthUser) {
    return this.tvipService.regenerateForContract(idContrato, user);
  }

  @Get('customer/:idCliente')
  @Roles(...ACCESS_ROLES.MANAGE_TVIP)
  listByCustomer(@Param('idCliente', ParseIntPipe) idCliente: number, @CurrentUser() user: AuthUser) {
    return this.tvipService.listByCustomer(idCliente, user);
  }
}

