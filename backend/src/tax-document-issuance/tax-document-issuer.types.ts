export const TAX_DOCUMENT_ISSUER = Symbol('TAX_DOCUMENT_ISSUER');

export type TaxDocumentIssuerProvider = 'FACTURACION_CL';
export type TaxDocumentIssuerEnvironment = 'sandbox' | 'production';
export type TaxDocumentIssuerState =
  | 'DISABLED'
  | 'CONFIGURATION_INVALID'
  | 'COMPANY_NOT_CONFIGURED'
  | 'COMPANY_DISABLED'
  | 'PENDIENTE_CONTRATO_FACTURACION_CL';

export type TaxDocumentIssuerCompany = {
  idEmpresa: number;
  alias: string;
  environment: TaxDocumentIssuerEnvironment;
  enabled: boolean;
};

export type TaxDocumentIssuerReadiness = {
  provider: TaxDocumentIssuerProvider;
  idEmpresa: number;
  companyAlias: string | null;
  environment: TaxDocumentIssuerEnvironment | null;
  state: TaxDocumentIssuerState;
  canIssue: false;
  canRetry: false;
};

/** Frontera segura mientras el contrato de emision e idempotencia no esta confirmado. */
export interface TaxDocumentIssuer {
  getReadiness(idEmpresa: number): TaxDocumentIssuerReadiness;
}
