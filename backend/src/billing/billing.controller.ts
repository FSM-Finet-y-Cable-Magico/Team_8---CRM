import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { BillingService } from './billing.service';
import { CreatePaymentZoneDto } from './dto/create-payment-zone.dto';
import { CreateZoneRuleDto } from './dto/create-zone-rule.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { SendBillingNotificationDto } from './dto/send-billing-notification.dto';
import { UpdatePaymentZoneDto } from './dto/update-payment-zone.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('overview')
  @Roles(...ACCESS_ROLES.VIEW_BILLING)
  overview(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.billingService.overview(user, scope ?? 'consolidado');
  }

  @Post('refresh-delinquency')
  @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  refreshDelinquency(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.billingService.refreshDelinquency(user, scope ?? 'consolidado');
  }

  @Post('notifications')
  @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  sendNotification(@Body() dto: SendBillingNotificationDto, @CurrentUser() user: AuthUser) {
    return this.billingService.sendNotification(dto, user);
  }

  @Patch('contracts/:id/suspend')
  @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  suspendContract(@Param('id', ParseIntPipe) idContrato: number, @CurrentUser() user: AuthUser) {
    return this.billingService.suspendContract(idContrato, user);
  }

  @Post('payments')
  @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  registerPayment(@Body() dto: RegisterPaymentDto, @CurrentUser() user: AuthUser) {
    return this.billingService.registerPayment(dto, user);
  }

  @Get('zones')
  @Roles(...ACCESS_ROLES.VIEW_BILLING)
  zones(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.billingService.zones(user, scope ?? 'consolidado');
  }

  @Post('zones')
  @Roles(...ACCESS_ROLES.MANAGE_PAYMENT_ZONES)
  createZone(@Body() dto: CreatePaymentZoneDto, @CurrentUser() user: AuthUser) {
    return this.billingService.createZone(dto, user);
  }

  @Patch('zones/:id')
  @Roles(...ACCESS_ROLES.MANAGE_PAYMENT_ZONES)
  updateZone(
    @Param('id', ParseIntPipe) idZonaPago: number,
    @Body() dto: UpdatePaymentZoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.updateZone(idZonaPago, dto, user);
  }

  @Get('zone-rules')
  @Roles(...ACCESS_ROLES.VIEW_BILLING)
  zoneRules(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.billingService.zoneRules(user, scope ?? 'consolidado');
  }

  @Post('zone-rules')
  @Roles(...ACCESS_ROLES.MANAGE_PAYMENT_ZONES)
  createZoneRule(@Body() dto: CreateZoneRuleDto, @CurrentUser() user: AuthUser) {
    return this.billingService.createZoneRule(dto, user);
  }
}
