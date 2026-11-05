export type TemplateKey = 'AVISO_PREVENTIVO' | 'ULTIMO_AVISO_CORTE';
export type OutboundMessage = {
  idEmpresa: number; idCliente: number; destinationPhone: string; templateKey: TemplateKey;
  locale: string; variables: Record<string,string>; correlationId: string;
};
export type MessagingResult = { state: 'ENVIADO_PROVEEDOR' | 'FALLIDO' | 'RESULTADO_INDETERMINADO' | 'Simulado' | 'Desactivado';
  providerMessageId?: string; errorCode?: string };
export interface OutboundMessagingPort { send(input: OutboundMessage): Promise<MessagingResult> }
export class DisabledMessagingProvider implements OutboundMessagingPort {
  async send(): Promise<MessagingResult> { return {state:'Desactivado'}; }
}
export class MockMessagingProvider implements OutboundMessagingPort {
  async send(): Promise<MessagingResult> { return {state:'Simulado'}; }
}
