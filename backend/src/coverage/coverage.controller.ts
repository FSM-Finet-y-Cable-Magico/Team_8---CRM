import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CheckCoverageDto,
  CoverageCompanyQueryDto,
  CreateCoverageZoneDto,
  GeocodeAddressDto,
  PlansForLocationDto,
  UpdateCoverageZoneDto,
} from './coverage.dto';
import { CoverageDomainService } from './coverage-domain.service';

@Controller('coverage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrador', 'Comercial', 'Soporte')
export class CoverageController {
  constructor(private readonly coverage: CoverageDomainService) {}

  @Get('status')
  status(@Query('idEmpresa', ParseIntPipe) company: number, @CurrentUser() user: AuthUser) {
    return this.coverage.status(company, user);
  }

  @Post('check')
  check(@Body() dto: CheckCoverageDto, @CurrentUser() user: AuthUser) {
    return this.coverage.check(dto.idEmpresa, dto, user);
  }

  @Get('zones')
  zones(@Query() query: CoverageCompanyQueryDto, @CurrentUser() user: AuthUser) {
    return this.coverage.listZones(query.idEmpresa, user);
  }

  @Get('zones/:id')
  zone(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.coverage.getZone(id, user);
  }

  @Post('zones')
  @Roles('Administrador', 'Comercial')
  createZone(@Body() dto: CreateCoverageZoneDto, @CurrentUser() user: AuthUser) {
    return this.coverage.createZone(dto, user);
  }

  @Patch('zones/:id')
  @Roles('Administrador', 'Comercial')
  updateZone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCoverageZoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coverage.updateZone(id, dto, user);
  }

  @Post('zones/:id/deactivate')
  @Roles('Administrador', 'Comercial')
  deactivateZone(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.coverage.deactivateZone(id, user);
  }

  @Get('plans-for-location')
  plansForLocation(@Query() dto: PlansForLocationDto, @CurrentUser() user: AuthUser) {
    return this.coverage.plansForLocation(dto.idEmpresa, dto, user);
  }

  @Post('geocode')
  geocode(@Body() dto: GeocodeAddressDto) {
    return this.coverage.geocode(dto.direccion);
  }
}
