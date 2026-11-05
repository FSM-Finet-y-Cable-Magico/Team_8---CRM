import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ACCESS_ROLES } from '../common/permissions';
import { CreateExternalTaxDocumentDto, ExternalTaxDocumentQueryDto, UpdateExternalTaxDocumentDto } from './external-tax-documents.dto';
import { ExternalTaxDocumentsService } from './external-tax-documents.service';

@Controller('external-tax-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ACCESS_ROLES.VIEW_EXTERNAL_TAX_DOCUMENTS)
export class ExternalTaxDocumentsController {
  constructor(private readonly documents: ExternalTaxDocumentsService) {}

  @Post()
  @Roles(...ACCESS_ROLES.MANAGE_EXTERNAL_TAX_DOCUMENTS)
  create(@Body() dto: CreateExternalTaxDocumentDto, @CurrentUser() user: AuthUser) { return this.documents.create(dto, user); }

  @Get()
  list(@Query() query: ExternalTaxDocumentQueryDto, @CurrentUser() user: AuthUser) { return this.documents.list(query, user); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.documents.findOne(id, user); }

  @Patch(':id')
  @Roles(...ACCESS_ROLES.MANAGE_EXTERNAL_TAX_DOCUMENTS)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExternalTaxDocumentDto, @CurrentUser() user: AuthUser) { return this.documents.update(id, dto, user); }

  @Patch(':id/deactivate')
  @Roles(...ACCESS_ROLES.MANAGE_EXTERNAL_TAX_DOCUMENTS)
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.documents.deactivate(id, user); }
}
