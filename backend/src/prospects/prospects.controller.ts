import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { ProspectsService } from './prospects.service';

@Controller('prospects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Get()
  @Roles('Administrador', 'Comercial')
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.prospectsService.list(user, scope ?? 'consolidado');
  }

  @Post()
  @Roles('Administrador', 'Comercial')
  create(@Body() dto: CreateProspectDto, @CurrentUser() user: AuthUser) {
    return this.prospectsService.create(dto, user);
  }
}
