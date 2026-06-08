import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
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
  @Roles('Administrador', 'Comercial', 'Soporte', 'Terreno')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.ticketsService.list(user, scope ?? 'consolidado');
  }

  @Get('categories')
  @Roles('Administrador', 'Comercial', 'Soporte', 'Terreno')
  categories() {
    return this.ticketsService.categories();
  }

  @Post()
  @Roles('Administrador', 'Comercial', 'Soporte')
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.create(dto, user);
  }

  @Patch(':id/category')
  @Roles('Administrador', 'Soporte')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updateCategory(id, dto, user);
  }

  @Patch(':id/priority')
  @Roles('Administrador', 'Soporte')
  updatePriority(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketPriorityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updatePriority(id, dto, user);
  }

  @Patch(':id/status')
  @Roles('Administrador', 'Soporte', 'Terreno')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.updateStatus(id, dto, user);
  }

  @Post(':id/diagnosis')
  @Roles('Administrador', 'Soporte', 'Terreno')
  registerDiagnosis(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterDiagnosisDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.registerDiagnosis(id, dto, user);
  }
}
