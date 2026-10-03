import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { IntegrationCompanyScope, IntegrationGroups } from '../integration-auth/integration-auth.types';
import { G3ClosureProcessor } from './g3-closure.processor';
import { CreateServiceWithdrawalDto, G3ClosureDto, RequestG3InstallationDto, UpdateServiceWithdrawalDto } from './g3-integration.dto';
import { InstallationIntegrationService } from './installation-integration.service';
import { ServiceWithdrawalService } from './service-withdrawal.service';

@Controller('integrations/g3')
export class G3IntegrationController {
  constructor(
    private readonly installations: InstallationIntegrationService,
    private readonly closureProcessor: G3ClosureProcessor,
  ) {}

  @Post('installations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  request(@Body() dto: RequestG3InstallationDto, @CurrentUser() user: AuthUser) {
    return this.installations.requestInstallation(dto, user);
  }

  @Post('installations/:id/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.retry(id, user);
  }

  @Get('installations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.detail(id, user);
  }

  @Get('prospects/:id/installation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  latestForProspect(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.latestForProspect(id, user);
  }

  @Get('contracts/:id/installation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  latestForContract(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.latestForContract(id, user);
  }

  @Post('installations/:id/reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  reconcile(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.reconcile(id, user);
  }

  @Post('events/work-order-closed')
  @UseGuards(IntegrationApiKeyGuard)
  @IntegrationGroups('G3')
  @IntegrationCompanyScope('body')
  receiveClosure(@Body() dto: G3ClosureDto) {
    return this.closureProcessor.process(dto, 'WEBHOOK');
  }
}

@Controller('integraciones/fsm')
export class G3CanonicalWebhookController {
  constructor(private readonly closureProcessor: G3ClosureProcessor) {}

  @Post('ordenes/:idOt/cierre')
  @UseGuards(IntegrationApiKeyGuard)
  @IntegrationGroups('G3')
  @IntegrationCompanyScope('body')
  receiveClosure(
    @Param('idOt', ParseIntPipe) idOt: number,
    @Body() dto: G3ClosureDto,
  ) {
    if (dto.id_ot !== undefined && dto.id_ot !== idOt) {
      throw new BadRequestException('El id_ot de la ruta no coincide con el payload');
    }
    return this.closureProcessor.process({ ...dto, id_ot: idOt }, 'WEBHOOK');
  }
}

@Controller('service-withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceWithdrawalController {
  constructor(private readonly withdrawals: ServiceWithdrawalService) {}

  @Get()
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  list(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.withdrawals.list(user, scope);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  create(@Body() dto: CreateServiceWithdrawalDto, @CurrentUser() user: AuthUser) {
    return this.withdrawals.create(dto, user);
  }

  @Patch(':id')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceWithdrawalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.withdrawals.update(id, dto, user);
  }
}
