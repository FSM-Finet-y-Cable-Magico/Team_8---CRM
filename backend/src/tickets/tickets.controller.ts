import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { RegisterDiagnosisDto } from './dto/register-diagnosis.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.ticketsService.list(user, scope ?? 'consolidado');
  }

  @Get('categories')
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  categories() {
    return this.ticketsService.categories();
  }

  @Post()
  @Roles(...ACCESS_ROLES.CREATE_TICKETS)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.create(dto, user);
  }

  @Patch(':id/category')
  @Roles(...ACCESS_ROLES.MANAGE_TICKETS)
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updateCategory(id, dto, user);
  }

  @Patch(':id/priority')
  @Roles(...ACCESS_ROLES.MANAGE_TICKETS)
  updatePriority(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketPriorityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updatePriority(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(...ACCESS_ROLES.UPDATE_TICKET_STATUS)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updateStatus(id, dto, user);
  }

  @Post(':id/diagnosis')
  @Roles(...ACCESS_ROLES.UPDATE_TICKET_STATUS)
  registerDiagnosis(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterDiagnosisDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.registerDiagnosis(id, dto, user);
  }
}
