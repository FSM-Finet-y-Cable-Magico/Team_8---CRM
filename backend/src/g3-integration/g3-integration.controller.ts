import { BadRequestException, Body, Controller, Get, Header, Optional, Param, ParseIntPipe, Patch, Post, Query, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { IntegrationCompanyScope, IntegrationGroups } from '../integration-auth/integration-auth.types';
import { G3ClosureProcessor } from './g3-closure.processor';
import { CompleteG3InstallationDataDto, CreateServiceWithdrawalDto, G3ClosureDto, RequestG3InstallationDto, UpdateServiceWithdrawalDto, InitiateServiceWithdrawalDto, CancelServiceWithdrawalDto, VoluntaryTerminationDto } from './g3-integration.dto';
import { InstallationIntegrationService } from './installation-integration.service';
import { ServiceWithdrawalService } from './service-withdrawal.service';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { independentRepairAcknowledgement, installationClosure } from './g3-closure-contract';
import { isWithdrawalClosure, withdrawalClosure } from './g3-withdrawal-closure-contract';

async function receiveApprovedClosure(processor: G3ClosureProcessor, workflow: WithdrawalWorkflowService | undefined, dto: G3ClosureDto, response?: Response) {
  // BAJA has its own validator and handler: it never enters the installation or repair paths.
  if (isWithdrawalClosure(dto)) {
    if (!workflow) throw new ServiceUnavailableException({ code: 'WITHDRAWAL_FLOW_NOT_AVAILABLE', message: 'G8 no tiene habilitado el registro de cierres de BAJA' });
    const result = await workflow.receiveWithdrawalClosure(withdrawalClosure(dto));
    response?.status(200);
    return result;
  }
  const acknowledgement = independentRepairAcknowledgement(dto);
  if (acknowledgement) {
    response?.status(200);
    return acknowledgement;
  }
  return processor.process(installationClosure(dto), 'WEBHOOK');
}

@Controller('integrations/g3')
export class G3IntegrationController {
  constructor(
    private readonly installations: InstallationIntegrationService,
    private readonly closureProcessor: G3ClosureProcessor,
    @Optional() private readonly workflow?: WithdrawalWorkflowService,
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

  @Post('installation-requirements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.CREATE_INSTALL_ORDER)
  requirements(@Body() dto: RequestG3InstallationDto, @CurrentUser() user: AuthUser) {
    return this.installations.installationRequirements(dto, user);
  }

  @Patch('contracts/:id/installation-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.MANAGE_PROSPECTS)
  completeData(@Param('id', ParseIntPipe) id: number, @Body() dto: CompleteG3InstallationDataDto, @CurrentUser() user: AuthUser) {
    return this.installations.completeInstallationData(id, dto, user);
  }

  @Get('installations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.detail(id, user);
  }

  @Get('services/:id/historical-closure')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCESS_ROLES.VIEW_CORE_DATA)
  historicalClosure(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.installations.historicalClosureForService(id, user);
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
  receiveClosure(@Body() dto: G3ClosureDto, @Res({ passthrough: true }) response?: Response) {
    return receiveApprovedClosure(this.closureProcessor, this.workflow, dto, response);
  }
}

@Controller('integraciones/fsm')
export class G3CanonicalWebhookController {
  constructor(private readonly closureProcessor: G3ClosureProcessor, @Optional() private readonly workflow?: WithdrawalWorkflowService) {}

  @Post('ordenes/:idOt/cierre')
  @UseGuards(IntegrationApiKeyGuard)
  @IntegrationGroups('G3')
  @IntegrationCompanyScope('body')
  receiveClosure(
    @Param('idOt', ParseIntPipe) idOt: number,
    @Body() dto: G3ClosureDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    if (dto.id_ot !== undefined && dto.id_ot !== idOt) {
      throw new BadRequestException('El id_ot de la ruta no coincide con el payload');
    }
    return receiveApprovedClosure(this.closureProcessor, this.workflow, { ...dto, id_ot: idOt }, response);
  }
}

@Controller('service-withdrawals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceWithdrawalController {
  constructor(private readonly withdrawals: ServiceWithdrawalService, private readonly workflow: WithdrawalWorkflowService) {}

  @Get('eligibility/:idServicio')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  eligibility(@Param('idServicio', ParseIntPipe) idServicio: number, @CurrentUser() user: AuthUser) {
    return this.workflow.eligibility(idServicio, user);
  }

  @Post('initiate')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  initiate(@Body() dto: InitiateServiceWithdrawalDto, @CurrentUser() user: AuthUser) {
    return this.workflow.initiate(dto, user);
  }

  /** Voluntary termination from Tickets: commercial termination now, technical withdrawal (OT BAJA VOLUNTARIA) prepared. */
  @Post('voluntary')
  @Roles(...ACCESS_ROLES.CREATE_TICKETS)
  terminateVoluntarily(@Body() dto: VoluntaryTerminationDto, @CurrentUser() user: AuthUser) {
    return this.workflow.terminateVoluntarily(dto, user);
  }

  @Post(':id/dispatch')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  dispatch(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.workflow.dispatch(id, user);
  }

  @Post(':id/order-status')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  refreshOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.workflow.refreshOrder(id, user);
  }

  @Post(':id/reception-sync')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  syncReception(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.workflow.syncReception(id, user);
  }

  /** Effective baja: Administrador only (PR #81 policy), on top of WITHDRAWAL_FINALIZE_ENABLED and the G3/G1 evidence. */
  @Post(':id/finalize')
  @Roles(...ACCESS_ROLES.ADMIN_ONLY)
  finalize(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.workflow.finalize(id, user);
  }

  @Post(':id/cancel')
  @Roles(...ACCESS_ROLES.MANAGE_CUSTOMER_REQUESTS)
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelServiceWithdrawalDto, @CurrentUser() user: AuthUser) {
    return this.workflow.cancel(id, dto.motivo, user);
  }

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
