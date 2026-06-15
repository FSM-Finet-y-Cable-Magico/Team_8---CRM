import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { ContractPlanDto } from './dto/contract-plan.dto';
import { CreateInstallOrderDto } from './dto/create-install-order.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { GenerateQuoteDto } from './dto/generate-quote.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { VerifyFeasibilityDto } from './dto/verify-feasibility.dto';
import { ProspectsService } from './prospects.service';

@Controller('prospects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Get()
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.prospectsService.list(user, scope ?? 'consolidado');
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  create(@Body() dto: CreateProspectDto, @CurrentUser() user: AuthUser) {
    return this.prospectsService.create(dto, user);
  }

  @Patch(':id/pipeline')
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  updatePipeline(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePipelineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.updatePipeline(id, dto, user);
  }

  @Post(':id/feasibility')
  @Roles(...ACCESS_ROLES.VERIFY_FEASIBILITY)
  verifyFeasibility(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyFeasibilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.verifyFeasibility(id, dto, user);
  }

  @Post(':id/quotes')
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  generateQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateQuoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.generateQuote(id, dto, user);
  }

  @Get(':id/quotes/:quoteId/pdf')
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  async downloadQuotePdf(
    @Param('id', ParseIntPipe) id: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    const buffer = await this.prospectsService.buildQuotePdfBuffer(id, quoteId, user);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="cotizacion-${quoteId}.pdf"`);
    response.send(buffer);
  }

  @Post(':id/loss')
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  recordLoss(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordLossDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.recordLoss(id, dto, user);
  }

  @Post(':id/contracts')
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  contractPlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ContractPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.contractPlan(id, dto, user);
  }

  @Post(':id/install-orders')
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  createInstallOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInstallOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prospectsService.createInstallOrder(id, dto, user);
  }
}
