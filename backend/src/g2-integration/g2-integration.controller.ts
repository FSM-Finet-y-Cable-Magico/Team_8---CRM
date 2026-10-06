import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IntegrationApiKeyGuard } from '../integration-auth/integration-api-key.guard';
import { IntegrationCompanyScope, IntegrationGroups } from '../integration-auth/integration-auth.types';
import { G2CompanyQueryDto, G2ConfirmedPaymentDto, G2InvoiceQueryDto, G2WifiResultDto } from './g2-integration.dto';
import { G2IntegrationService } from './g2-integration.service';

@Controller('integrations/g2')
@UseGuards(IntegrationApiKeyGuard)
@IntegrationGroups('G2')
export class G2IntegrationController {
  constructor(private readonly integrations: G2IntegrationService) {}

  @Get('invoices')
  @IntegrationCompanyScope('query')
  invoices(@Query() query: G2InvoiceQueryDto) { return this.integrations.invoices(query); }

  @Get('invoices/:id')
  @IntegrationCompanyScope('query')
  invoiceDetail(@Param('id', ParseIntPipe) idFactura: number, @Query() query: G2CompanyQueryDto) {
    return this.integrations.invoiceDetail(idFactura, query.id_empresa);
  }

  @Post('payments')
  @IntegrationCompanyScope('body')
  registerPayment(@Body() dto: G2ConfirmedPaymentDto) { return this.integrations.registerPayment(dto); }

  @Get('payments/:id/comprobante')
  @IntegrationCompanyScope('query')
  paymentReceipt(@Param('id', ParseIntPipe) idPago: number, @Query() query: G2CompanyQueryDto) {
    return this.integrations.paymentReceipt(idPago, query.id_empresa);
  }

  @Post('tickets/:idTicket/wifi-result')
  @IntegrationCompanyScope('body')
  wifiResult(@Param('idTicket', ParseIntPipe) idTicket: number, @Body() dto: G2WifiResultDto) {
    return this.integrations.registerWifiResult(idTicket, dto);
  }
}
