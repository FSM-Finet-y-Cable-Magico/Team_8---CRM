import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { BillingService } from './billing.service';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { SendBillingNotificationDto } from './dto/send-billing-notification.dto';

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
}
