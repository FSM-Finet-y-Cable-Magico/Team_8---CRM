import { Prisma } from '@prisma/client';
export const TAX_DOCUMENT_ISSUER = Symbol('TAX_DOCUMENT_ISSUER');

export type TaxDocumentIssuerProvider = 'FACTURACION_CL';
export type TaxDocumentIssuerEnvironment = 'sandbox' | 'production';
export type TaxDocumentIssuerState =
  | 'DISABLED'
  | 'CONFIGURATION_INVALID'
  | 'COMPANY_NOT_CONFIGURED'
  | 'COMPANY_DISABLED'
  | 'PENDIENTE_CONTRATO_FACTURACION_CL'
  | 'READY_SANDBOX' | 'CREDENTIALS_MISSING' | 'MIGRATION_REQUIRED' | 'PRODUCTION_NOT_CERTIFIED';

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
  canIssue: boolean;
  canRetry: false;
};

/** Local payment capture and independent processing after commit. */
export interface TaxDocumentIssuer {
  getReadiness(idEmpresa: number): TaxDocumentIssuerReadiness;
  enqueuePayment?(tx: Prisma.TransactionClient, input: PaymentTaxContext): Promise<void>;
  processPayment?(idPago: number): Promise<unknown>;
}
export type PaymentTaxContext = {
  idEmpresa: number; idFactura: number; idPago: number; idCliente: number; monto: string;
  periodoMes: number; periodoAnio: number; fechaLimitePago: Date; tipoDocumento: string | null; folioExterno: string | null;
  receiver: { rut: string; name: string; giro: string; address: string; comuna: string; city: string; email: string | null };
};
