import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomersService } from './customers.service';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('Administrador', 'Comercial', 'Soporte', 'Terreno')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('query') query?: string) {
    return this.customersService.list(user, scope ?? 'consolidado', query ?? '');
  }

  @Get('search')
  @Roles('Administrador', 'Comercial', 'Soporte')
  find(@CurrentUser() user: AuthUser, @Query('term') term: string) {
    return this.customersService.findByRutOrContract(term, user);
  }

  @Get(':id/history')
  @Roles('Administrador', 'Comercial', 'Soporte')
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.customersService.history(id, user);
  }

  @Patch(':id/status')
  @Roles('Administrador', 'Comercial', 'Soporte')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.updateStatus(id, dto, user);
  }
}
