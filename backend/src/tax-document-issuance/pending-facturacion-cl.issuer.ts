import { Injectable } from '@nestjs/common';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { TaxDocumentIssuer, TaxDocumentIssuerReadiness, TaxDocumentIssuerState } from './tax-document-issuer.types';

@Injectable()
export class PendingFacturacionClIssuer implements TaxDocumentIssuer {
  constructor(private readonly config: FacturacionClConfigService) {}

  getReadiness(idEmpresa: number): TaxDocumentIssuerReadiness {
    const snapshot = this.config.snapshot();
    const company = snapshot.companies.find((entry) => entry.idEmpresa === idEmpresa);
    let state: TaxDocumentIssuerState;
    if (!snapshot.valid) state = 'CONFIGURATION_INVALID';
    else if (!snapshot.enabled) state = 'DISABLED';
    else if (!company) state = 'COMPANY_NOT_CONFIGURED';
    else if (!company.enabled) state = 'COMPANY_DISABLED';
    else state = 'PENDIENTE_CONTRATO_FACTURACION_CL';

    return {
      provider: 'FACTURACION_CL',
      idEmpresa,
      companyAlias: company?.alias ?? null,
      environment: company?.environment ?? null,
      state,
      canIssue: false,
      canRetry: false,
    };
  }
}
