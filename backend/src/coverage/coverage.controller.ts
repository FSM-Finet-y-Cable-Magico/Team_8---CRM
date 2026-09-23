import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CheckCoverageDto } from './coverage.dto';
import { CoverageService } from './coverage.service';

@Controller('coverage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Administrador', 'Comercial', 'Soporte')
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Get('status')
  status(@Query('idEmpresa', ParseIntPipe) company: number, @CurrentUser() user: AuthUser) {
    return this.coverage.status(company, user);
  }

  @Post('check')
  check(@Body() dto: CheckCoverageDto, @CurrentUser() user: AuthUser) {
    return this.coverage.check(dto.idEmpresa, dto, user);
  }
}
