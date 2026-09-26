import { Controller, Get, Param, ParseIntPipe, Post, Query, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CommercialControlBookService } from './commercial-control-book.service';
import {
  ChangePaymentConditionDto,
  CommercialEventDto,
  ControlBookQueryDto,
  CreateAdditionalChargeDto,
  CreateAgreementDto,
  CreateExtensionDto,
  CreateNonContractingLeadDto,
} from './commercial.dto';

@Controller('commercial')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialController {
  constructor(private readonly commercial: CommercialControlBookService) {}

  @Get('control-book')
  @Roles(...ACCESS_ROLES.VIEW_CONTROL_BOOK)
  controlBook(@Query() query: ControlBookQueryDto, @CurrentUser() user: AuthUser) {
    return this.commercial.list(query, user);
  }

  @Get('control-book/export')
  @Roles(...ACCESS_ROLES.EXPORT_CONTROL_BOOK)
  async export(@Query() query: ControlBookQueryDto, @Query('format') format: 'csv' | 'xlsx' = 'csv', @CurrentUser() user: AuthUser, @Res() response: Response) {
    const result = await this.commercial.export(query, format, user);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }

  @Post('events')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  event(@Body() dto: CommercialEventDto, @CurrentUser() user: AuthUser) {
    return this.commercial.registerEvent(dto, user);
  }

  @Post('withdrawal-notices')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  withdrawal(@Body() dto: CommercialEventDto, @CurrentUser() user: AuthUser) {
    return this.commercial.registerEvent({ ...dto, tipo: 'AVISO_PREVIO_RETIRO' }, user);
  }

  @Post('agreements')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  agreement(@Body() dto: CreateAgreementDto, @CurrentUser() user: AuthUser) {
    return this.commercial.createAgreement(dto, user);
  }

  @Post('agreements/:id/approve')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  approveAgreement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.commercial.approveAgreement(id, user);
  }

  @Post('extensions')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  extension(@Body() dto: CreateExtensionDto, @CurrentUser() user: AuthUser) {
    return this.commercial.createExtension(dto, user);
  }

  @Post('payment-condition-changes')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  paymentCondition(@Body() dto: ChangePaymentConditionDto, @CurrentUser() user: AuthUser) {
    return this.commercial.changePaymentCondition(dto, user);
  }

  @Post('additional-charges')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  additionalCharge(@Body() dto: CreateAdditionalChargeDto, @CurrentUser() user: AuthUser) {
    return this.commercial.createAdditionalCharge(dto, user);
  }

  @Post('non-contracting-leads')
  @Roles(...ACCESS_ROLES.MANAGE_COMMERCIAL_COLLECTIONS)
  nonContractingLead(@Body() dto: CreateNonContractingLeadDto, @CurrentUser() user: AuthUser) {
    return this.commercial.createNonContractingLead(dto, user);
  }

  @Get('expiring-plans')
  @Roles(...ACCESS_ROLES.VIEW_CONTROL_BOOK)
  expiringPlans(@CurrentUser() user: AuthUser, @Query('days') days?: string, @Query('idEmpresa') idEmpresa?: string) {
    return this.commercial.expiringPlans(days ? Number(days) : undefined, idEmpresa ? Number(idEmpresa) : undefined, user);
  }
}
