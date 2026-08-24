import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CommercialControlService } from './commercial-control.service';
import { CommercialControlQueryDto } from './dto/commercial-control-query.dto';
import { CreateCommercialEventDto } from './dto/create-commercial-event.dto';

@Controller('commercial-control')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialControlController {
  constructor(private readonly commercialControlService: CommercialControlService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_BILLING)
  list(@Query() query: CommercialControlQueryDto, @CurrentUser() user: AuthUser) {
    return this.commercialControlService.list(query, user);
  }

  @Post('events')
  @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  createEvent(@Body() dto: CreateCommercialEventDto, @CurrentUser() user: AuthUser) {
    return this.commercialControlService.createEvent(dto, user);
  }
}
