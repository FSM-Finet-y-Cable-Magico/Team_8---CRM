/** Domain boundary: acceptance of an email never changes a payment or a DTE. */
export const TAX_DOCUMENT_DELIVERY = Symbol('TAX_DOCUMENT_DELIVERY');
export type TaxDocumentEmail = {
  to: string; customerName: string; tipoDte: number; folio: string; idPago: number;
  pdf: Buffer; filename: string; deliveryKey?: string;
};
export interface TaxDocumentDeliveryPort {
  isConfigured(): boolean;
  sendTaxDocument(message: TaxDocumentEmail): Promise<{ status: 'sent' | 'not_configured' | 'simulated'; messageId?: string }>;
}
