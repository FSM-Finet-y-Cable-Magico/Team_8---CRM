import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('export')
  @Roles('Administrador')
  async export(
    @CurrentUser() user: AuthUser,
    @Query('type') type: 'clientes' | 'prospectos' | 'tickets' | 'inventario',
    @Query('format') format: 'csv' | 'xlsx' = 'csv',
    @Query('scope') scope = 'consolidado',
    @Res() response: Response,
  ) {
    const report = await this.reportsService.export(type, format, user, scope);

    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }
}
