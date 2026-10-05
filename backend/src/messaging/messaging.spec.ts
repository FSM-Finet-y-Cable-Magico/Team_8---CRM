import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MessagingConfig } from './messaging.config';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { DisabledMessagingProvider, MockMessagingProvider, OutboundMessage } from './outbound-messaging.port';
import { MessagingService, messageFingerprint } from './messaging.service';
import { MetaWebhookController } from './meta-webhook.controller';

const company={idEmpresa:1,alias:'QA',wabaId:'12345',phoneNumberId:'23456',templates:{AVISO_PREVENTIVO:{name:'approved_qa',locale:'es_CL',parameters:['customer_name']}}};
const config=(overrides:Record<string,unknown>={})=>new MessagingConfig(new ConfigService({WHATSAPP_PROVIDER:'meta',WHATSAPP_API_VERSION:'v99.0',
  WHATSAPP_COMPANIES:JSON.stringify([company]),WHATSAPP_QA_ACCESS_TOKEN:'FAKE_TOKEN',WHATSAPP_QA_APP_SECRET:'FAKE_SECRET',WHATSAPP_QA_VERIFY_TOKEN:'FAKE_VERIFY',...overrides}));
const input:OutboundMessage={idEmpresa:1,idCliente:2,destinationPhone:'+56912345678',templateKey:'AVISO_PREVENTIVO',locale:'es_CL',
  variables:{customer_name:'QA'},correlationId:'abcdef00-0000-4000-8000-000000000001'};
const response=(status:number,body:unknown)=>({ok:status>=200&&status<300,status,json:async()=>body}) as Response;
function database(initial:Record<string,unknown>={}) {
  const row={idNotificacion:1n,idEmpresa:1,idCliente:2,proveedor:'meta',correlationId:input.correlationId,payloadHash:messageFingerprint(input),
    mensaje:input,estadoEnvio:'PENDIENTE',intentos:0,providerMessageId:null as string|null,...initial};
  const logNotificacion={findUnique:jest.fn().mockImplementation(async()=>({...row})),findFirst:jest.fn().mockResolvedValue(null),
    create:jest.fn().mockImplementation(async({data})=>({idNotificacion:1n,...data})),findMany:jest.fn().mockResolvedValue([]),
    updateMany:jest.fn().mockImplementation(async({where,data})=>{
      if(where.idEmpresa && where.idEmpresa!==row.idEmpresa)return{count:0};
      if(where.estadoEnvio && !(typeof where.estadoEnvio==='string' ? where.estadoEnvio===row.estadoEnvio : where.estadoEnvio.in.includes(row.estadoEnvio)))return{count:0};
      if(where.intentos!==undefined && where.intentos!==row.intentos)return{count:0};
      const attempts=data.intentos;Object.assign(row,data);if(attempts)row.intentos=1;return{count:1};
    })};
  return {row,db:{logNotificacion},log:logNotificacion};
}
describe('WhatsApp providers (synthetic HTTP only)',()=>{
  it('defaults disabled and retains explicit mock without sending',async()=>{
    expect(new MessagingConfig(new ConfigService({})).mode).toBe('disabled');
    expect(await new DisabledMessagingProvider().send()).toEqual({state:'Desactivado'});
    expect(await new MockMessagingProvider().send()).toEqual({state:'Simulado'});
  });
  it('rejects incomplete configuration and secrets embedded in company metadata',()=>{
    expect(()=>config({WHATSAPP_QA_ACCESS_TOKEN:''})).toThrow('WHATSAPP_CREDENTIALS_MISSING');
    expect(()=>config({WHATSAPP_API_VERSION:''})).toThrow('WHATSAPP_CONFIGURATION_INVALID');
    expect(()=>config({WHATSAPP_COMPANIES:JSON.stringify([{...company,token:'FAKE_TOKEN'}])})).toThrow('WHATSAPP_CONFIGURATION_INVALID');
    expect(()=>config({WHATSAPP_COMPANIES:JSON.stringify([company,company])})).toThrow('WHATSAPP_CONFIGURATION_INVALID');
  });
  it('translates the domain object to a configured template, never exposes access token in result',async()=>{
    const request=jest.fn().mockResolvedValue(response(200,{messages:[{id:'wamid.QA'}]}));
    const result=await new MetaWhatsAppProvider(config(),request).send(input);
    expect(result).toEqual({state:'ENVIADO_PROVEEDOR',providerMessageId:'wamid.QA'});
    expect(request).toHaveBeenCalledWith('https://graph.facebook.com/v99.0/23456/messages',expect.objectContaining({method:'POST',redirect:'error'}));
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({to:'56912345678',type:'template',template:{name:'approved_qa',language:{code:'es_CL'},components:[{type:'body',parameters:[{type:'text',text:'QA'}]}]}});
    expect(JSON.stringify(result)).not.toContain('FAKE_TOKEN');
  });
  it.each([{idEmpresa:2},{destinationPhone:'912345678'},{templateKey:'ULTIMO_AVISO_CORTE'},{locale:'en_US'},{variables:{}}])('rejects scope/phone/template/variables before network: %j',async patch=>{
    const request=jest.fn();expect(await new MetaWhatsAppProvider(config(),request).send({...input,...patch} as OutboundMessage)).toMatchObject({state:'FALLIDO'});
    expect(request).not.toHaveBeenCalled();
  });
  it.each([400,401,429,500,503])('sanitizes HTTP %i and never retries',async status=>{
    const request=jest.fn().mockResolvedValue(response(status,{error:{message:'FAKE_SECRET'}}));
    expect(await new MetaWhatsAppProvider(config(),request).send(input)).toEqual({state:status<500?'FALLIDO':'RESULTADO_INDETERMINADO',errorCode:`META_HTTP_${status}`});
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('quarantines timeout and malformed success',async()=>{
    const request=jest.fn().mockRejectedValue(new Error('FAKE_SECRET'));
    expect(await new MetaWhatsAppProvider(config(),request).send(input)).toEqual({state:'RESULTADO_INDETERMINADO',errorCode:'META_TRANSPORT_UNCERTAIN'});
    expect(request).toHaveBeenCalledTimes(1);
    expect(await new MetaWhatsAppProvider(config(),jest.fn().mockResolvedValue(response(200,{}))).send(input)).toMatchObject({state:'RESULTADO_INDETERMINADO'});
  });
});
describe('Durable notifications',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('canonical hash survives JSONB key reordering',()=>{
    const a={...input,variables:{customer_name:'QA',balance:'100'}};
    expect(messageFingerprint(a)).toBe(messageFingerprint({...a,variables:{balance:'100',customer_name:'QA'}}));
  });
  it('enqueue is local, replay reuses the row, altered identity conflicts',async()=>{
    const {db,log}=database();const service=new MessagingService(db as never,config());
    const fetch=jest.spyOn(globalThis,'fetch');
    expect((await service.enqueue(db as never,input,1)).duplicate).toBe(true);
    await expect(service.enqueue(db as never,{...input,idCliente:3},1)).rejects.toThrow('correlacion');
    log.findUnique.mockResolvedValueOnce(null);
    expect((await service.enqueue(db as never,input,1)).notification.estadoEnvio).toBe('PENDIENTE');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('concurrent dispatchers claim once; replay never resends',async()=>{
    const fetch=jest.spyOn(globalThis,'fetch').mockResolvedValue(response(200,{messages:[{id:'wamid.QA'}]}));
    const {db,row}=database();const one=new MessagingService(db as never,config()),two=new MessagingService(db as never,config());
    await Promise.all([one.dispatch(1n),two.dispatch(1n)]);await one.dispatch(1n);
    expect(fetch).toHaveBeenCalledTimes(1);expect(row.estadoEnvio).toBe('ENVIADO_PROVEEDOR');expect(row.intentos).toBe(1);
  });
  it('timeout remains indeterminate across worker instances',async()=>{
    const fetch=jest.spyOn(globalThis,'fetch').mockRejectedValue(new Error('FAKE_SECRET'));
    const {db,row}=database();await new MessagingService(db as never,config()).dispatch(1n);
    await new MessagingService(db as never,config()).dispatch(1n);
    expect(fetch).toHaveBeenCalledTimes(1);expect(row.estadoEnvio).toBe('RESULTADO_INDETERMINADO');
  });
  it('delivery/read is monotonic and duplicate statuses have no effect',async()=>{
    const {db,row}=database({estadoEnvio:'ENVIADO_PROVEEDOR',providerMessageId:'wamid.QA'});const service=new MessagingService(db as never,config());
    await service.acceptStatus(2,'wamid.QA','read');expect(row.estadoEnvio).toBe('ENVIADO_PROVEEDOR');
    await service.acceptStatus(1,'wamid.QA','delivered');expect(row.estadoEnvio).toBe('ENTREGADO');
    await service.acceptStatus(1,'wamid.QA','read');await service.acceptStatus(1,'wamid.QA','delivered');
    await service.acceptStatus(1,'wamid.QA','failed',1);await service.acceptStatus(1,'wamid.QA','read');expect(row.estadoEnvio).toBe('LEIDO');
  });
  it('stores only sanitized numeric provider errors',async()=>{
    const {db,row}=database({estadoEnvio:'ENVIADO_PROVEEDOR',providerMessageId:'wamid.QA'});
    await new MessagingService(db as never,config()).acceptStatus(1,'wamid.QA','failed',131026);
    expect(row).toMatchObject({estadoEnvio:'FALLIDO',ultimoError:'META_131026'});
  });
  it('requests webhook redelivery while the send result is still being persisted',async()=>{
    const {db,log}=database();log.findUnique.mockResolvedValue(null);log.findFirst.mockResolvedValue({idNotificacion:1n} as never);
    await expect(new MessagingService(db as never,config()).acceptStatus(1,'wamid.EARLY','sent')).rejects.toThrow('MESSAGE_CORRELATION_PENDING');
  });
});
describe('Meta webhook authentication and company routing',()=>{
  function setup() {
    const acceptStatus=jest.fn(),messaging={config:config(),acceptStatus};
    return {controller:new MetaWebhookController(messaging as never),acceptStatus};
  }
  const body=(phone='23456',waba='12345')=>Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field:'messages',value:{metadata:{phone_number_id:phone},statuses:[{id:'wamid.QA',status:'read'}]}}]}]}));
  const sign=(raw:Buffer,secret='FAKE_SECRET')=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  it('returns challenge only for the verify token',()=>{
    const {controller}=setup(),res={type:jest.fn().mockReturnThis(),send:jest.fn()};
    controller.verify({'hub.mode':'subscribe','hub.verify_token':'FAKE_VERIFY','hub.challenge':'123'},res as never);
    expect(res.send).toHaveBeenCalledWith('123');
    expect(()=>controller.verify({'hub.mode':'subscribe','hub.verify_token':'WRONG','hub.challenge':'123'},res as never)).toThrow('WEBHOOK_VERIFICATION_FAILED');
  });
  it('requires signature on exact bytes; verify token cannot authenticate POST',async()=>{
    const {controller,acceptStatus}=setup(),raw=body();
    await expect(controller.receive(sign(raw,'FAKE_VERIFY'),{rawBody:raw} as never)).rejects.toThrow('WEBHOOK_SIGNATURE_INVALID');
    await expect(controller.receive(sign(raw),{rawBody:Buffer.concat([raw,Buffer.from(' ')])} as never)).rejects.toThrow('WEBHOOK_SIGNATURE_INVALID');
    await expect(controller.receive('',{} as never)).rejects.toThrow('WEBHOOK_SIGNATURE_INVALID');expect(acceptStatus).not.toHaveBeenCalled();
  });
  it('routes only matching WABA and phone after validating app signature',async()=>{
    const {controller,acceptStatus}=setup(),raw=body();
    await controller.receive(sign(raw),{rawBody:raw} as never);expect(acceptStatus).toHaveBeenCalledWith(1,'wamid.QA','read',undefined);
    acceptStatus.mockClear();for(const wrong of [body('99999'),body('23456','99999')])await controller.receive(sign(wrong),{rawBody:wrong} as never);
    expect(acceptStatus).not.toHaveBeenCalled();
  });
});
