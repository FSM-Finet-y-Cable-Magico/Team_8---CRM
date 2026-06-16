import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CustomersService } from './customers.service';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string, @Query('query') query?: string) {
    return this.customersService.list(user, scope ?? 'consolidado', query ?? '');
  }

  @Get('search')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMERS)
  find(@CurrentUser() user: AuthUser, @Query('term') term: string) {
    return this.customersService.findByRutOrContract(term, user);
  }

  @Get(':id/history')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMERS)
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.customersService.history(id, user);
  }

  @Patch(':id/status')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMERS)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.updateStatus(id, dto, user);
  }
}
