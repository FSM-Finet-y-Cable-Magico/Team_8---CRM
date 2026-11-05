import { MessagingConfig } from './messaging.config';
import { MessagingResult, OutboundMessage, OutboundMessagingPort } from './outbound-messaging.port';

/** No retry: once the POST is handed to the network, a timeout is uncertain. */
export class MetaWhatsAppProvider implements OutboundMessagingPort {
  constructor(private readonly config:MessagingConfig,private readonly request:typeof fetch=fetch) {}
  async send(input:OutboundMessage):Promise<MessagingResult> {
    if (this.config.mode!=='meta') return {state:'Desactivado'};
    let body:unknown,token:string,url:string;
    try {
      const {company,template}=this.config.validate(input);
      token=this.config.credentials(company).accessToken;
      url=`https://graph.facebook.com/${this.config.version}/${company.phoneNumberId}/messages`;
      body={messaging_product:'whatsapp',recipient_type:'individual',to:input.destinationPhone.slice(1),type:'template',
        template:{name:template.name,language:{code:template.locale},...(template.parameters.length ?
          {components:[{type:'body',parameters:template.parameters.map(key=>({type:'text',text:input.variables[key]}))}]} : {})}};
    } catch { return {state:'FALLIDO',errorCode:'META_CONFIGURATION_OR_INPUT_INVALID'}; }
    try {
      const response=await this.request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) return {state:response.status>=400 && response.status<500 ? 'FALLIDO':'RESULTADO_INDETERMINADO',errorCode:`META_HTTP_${response.status}`};
      const payload=await response.json() as {messages?:Array<{id?:unknown}>};
      const id=payload?.messages?.length===1 ? payload.messages[0].id : null;
      if (typeof id!=='string' || !/^wamid\.[A-Za-z0-9_+/=-]{1,500}$/.test(id)) return {state:'RESULTADO_INDETERMINADO',errorCode:'META_RESPONSE_INVALID'};
      return {state:'ENVIADO_PROVEEDOR',providerMessageId:id};
    } catch { return {state:'RESULTADO_INDETERMINADO',errorCode:'META_TRANSPORT_UNCERTAIN'}; }
  }
}
