import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreateObservationDto } from './dto/create-observation.dto';
import { ObservationsService } from './observations.service';

@Controller('observations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Get(':tipoEntidad/:idEntidad')
  @Roles(...ACCESS_ROLES.MANAGE_OBSERVATIONS)
  list(
    @Param('tipoEntidad') tipoEntidad: string,
    @Param('idEntidad', ParseIntPipe) idEntidad: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.observationsService.list(tipoEntidad, idEntidad, user);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_OBSERVATIONS)
  create(@Body() dto: CreateObservationDto, @CurrentUser() user: AuthUser) {
    return this.observationsService.create(dto, user);
  }
}
