import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { FacturacionClIssuer } from './facturacion-cl.issuer';

export class ReconcilePaymentDteDto {
  @Matches(/^[1-9]\d{0,9}$/) folio!: string;
  @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @IsBoolean() confirmSameDocument!: boolean;
  @IsString() @MaxLength(1000) observation!: string;
}

@Controller('tax-documents/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxDocumentIssuanceController {
  constructor(private readonly issuer: FacturacionClIssuer) {}
  @Get(':id') @Roles(...ACCESS_ROLES.VIEW_BILLING)
  state(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.issuer.paymentState(id,user); }
  @Post(':id/retry') @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.issuer.retryPayment(id,user); }
  @Post(':id/artifacts') @Roles(...ACCESS_ROLES.MANAGE_BILLING)
  artifacts(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.issuer.recoverArtifacts(id,user); }
  @Post(':id/reconcile') @Roles('Administrador')
  reconcile(@Param('id', ParseIntPipe) id: number, @Body() dto: ReconcilePaymentDteDto, @CurrentUser() user: AuthUser) { return this.issuer.reconcilePayment(id,dto,user); }
}
