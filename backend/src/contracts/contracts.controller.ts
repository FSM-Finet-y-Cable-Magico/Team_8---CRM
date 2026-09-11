import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { ContractsService } from './contracts.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ConfirmContractSignatureDto } from './dto/confirm-contract-signature.dto';
import { CreateCustomerContractDto } from './dto/create-customer-contract.dto';
import { UpdateDigitalContractStatusDto } from './dto/update-digital-contract-status.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get(':id/plan-changes')
  @Roles(...ACCESS_ROLES.CHANGE_CUSTOMER_PLAN)
  planChanges(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.contractsService.planChanges(id, user);
  }

  @Patch(':id/plan-changes/:changeId/cancel')
  @Roles(...ACCESS_ROLES.CHANGE_CUSTOMER_PLAN)
  cancelChange(@Param('id', ParseIntPipe) id: number, @Param('changeId', ParseIntPipe) changeId: number, @CurrentUser() user: AuthUser) {
    return this.contractsService.cancelPlanChange(id, changeId, user);
  }

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_CONTRACTS)
  createCustomerContract(@Body() dto: CreateCustomerContractDto, @CurrentUser() user: AuthUser) {
    return this.contractsService.createCustomerContract(dto, user);
  }

  @Patch(':id/confirm-signature')
  @Roles(...ACCESS_ROLES.MANAGE_CONTRACTS)
  confirmSignature(
    @Param('id', ParseIntPipe) idContrato: number,
    @Body() dto: ConfirmContractSignatureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.confirmManualSignature(idContrato, dto, user);
  }

  @Post(':id/prepare-installation')
  @Roles(...ACCESS_ROLES.MANAGE_SERVICES)
  prepareInstallation(
    @Param('id', ParseIntPipe) idContrato: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.prepareInstallation(idContrato, user);
  }

  @Post(':id/change-plan')
  @Roles(...ACCESS_ROLES.CHANGE_CUSTOMER_PLAN)
  changePlan(
    @Param('id', ParseIntPipe) idContrato: number,
    @Body() dto: ChangePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.changePlan(idContrato, dto, user);
  }

  @Post(':id/digital-contract')
  @Roles(...ACCESS_ROLES.GENERATE_DIGITAL_CONTRACT)
  generateDigitalContract(@Param('id', ParseIntPipe) idContrato: number, @CurrentUser() user: AuthUser) {
    return this.contractsService.generateDigitalContract(idContrato, user);
  }

  @Get(':id/digital-contract')
  @Roles(...ACCESS_ROLES.MANAGE_CONTRACTS)
  getDigitalContracts(@Param('id', ParseIntPipe) idContrato: number, @CurrentUser() user: AuthUser) {
    return this.contractsService.getDigitalContracts(idContrato, user);
  }

  @Get(':id/digital-contract/download')
  @Roles(...ACCESS_ROLES.MANAGE_CONTRACTS)
  downloadDigitalContract(
    @Param('id', ParseIntPipe) idContrato: number,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
    @Query('version') version?: string,
  ) {
    return this.contractsService.downloadDigitalContract(idContrato, user, response, version === undefined ? undefined : Number(version));
  }

  @Patch(':id/digital-contract/sign-status')
  @Roles(...ACCESS_ROLES.GENERATE_DIGITAL_CONTRACT)
  updateDigitalContractStatus(
    @Param('id', ParseIntPipe) idContrato: number,
    @Body() dto: UpdateDigitalContractStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contractsService.updateDigitalContractStatus(idContrato, dto, user);
  }
}
