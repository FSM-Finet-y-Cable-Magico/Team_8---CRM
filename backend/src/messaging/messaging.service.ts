import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingConfig } from './messaging.config';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { DisabledMessagingProvider, MockMessagingProvider, OutboundMessage, OutboundMessagingPort } from './outbound-messaging.port';

const active=['EN_PROCESO','RESULTADO_INDETERMINADO','ENVIADO_PROVEEDOR'];
export const precedingStates:Record<string,string[]>={
  sent:['EN_PROCESO','RESULTADO_INDETERMINADO'],
  delivered:[...active,'FALLIDO'], read:[...active,'FALLIDO','ENTREGADO'], failed:[...active],
};
const states:Record<string,string>={sent:'ENVIADO_PROVEEDOR',delivered:'ENTREGADO',read:'LEIDO',failed:'FALLIDO'};
// JSONB does not preserve key order. Hash a canonical projection, including variables.
export function messageFingerprint(input:OutboundMessage) {
  return createHash('sha256').update(JSON.stringify([input.idEmpresa,input.idCliente,input.destinationPhone,input.templateKey,
    input.locale,input.correlationId,Object.entries(input.variables).sort(([a],[b])=>a.localeCompare(b))])).digest('hex');
}

@Injectable()
export class MessagingService implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private draining=false;
  private readonly provider:OutboundMessagingPort;
  constructor(private readonly prisma:PrismaService,readonly config:MessagingConfig) {
    this.provider=config.mode==='meta' ? new MetaWhatsAppProvider(config) : config.mode==='mock' ? new MockMessagingProvider() : new DisabledMessagingProvider();
  }
  async onModuleInit() {
    if (this.config.mode!=='meta') return;
    // Missing migration fails before the worker can call the provider.
    await this.prisma.logNotificacion.findFirst({select:{correlationId:true,providerMessageId:true,mensaje:true,intentos:true,fechaInicio:true}});
    this.timer=setInterval(()=>{void this.drain().catch(()=>undefined);},15000);this.timer.unref();
  }
  onModuleDestroy() { if(this.timer)clearInterval(this.timer); }
  async enqueue(tx:Prisma.TransactionClient,input:OutboundMessage,idPlantilla:number) {
    if(this.config.mode==='meta') {
      try {this.config.validate(input);} catch {throw new BadRequestException('WHATSAPP_CONFIGURATION_OR_INPUT_INVALID');}
    }
    const fingerprint=messageFingerprint(input);
    const existing=await tx.logNotificacion.findUnique({where:{correlationId:input.correlationId}});
    if(existing) {
      if(existing.idEmpresa!==input.idEmpresa || existing.idCliente!==input.idCliente || existing.payloadHash!==fingerprint) {
        throw new ConflictException('La correlacion ya pertenece a otra notificacion');
      }
      return {notification:existing,duplicate:true};
    }
    const notification=await tx.logNotificacion.create({data:{idEmpresa:input.idEmpresa,idCliente:input.idCliente,idPlantilla,
      canal:'WHATSAPP',fechaEnvio:new Date(),proveedor:this.config.mode,correlationId:input.correlationId,payloadHash:fingerprint,
      mensaje:input as unknown as Prisma.InputJsonValue,
      estadoEnvio:this.config.mode==='meta'?'PENDIENTE':this.config.mode==='mock'?'Simulado':'Desactivado'}});
    return {notification,duplicate:false};
  }
  async dispatch(idNotificacion:bigint) {
    if(this.config.mode!=='meta')return;
    const row=await this.prisma.logNotificacion.findUnique({where:{idNotificacion}});
    if(!row || row.proveedor!=='meta' || row.estadoEnvio!=='PENDIENTE' || row.intentos!==0)return;
    const input=row.mensaje as unknown as OutboundMessage;
    if(!input || input.idEmpresa!==row.idEmpresa || input.idCliente!==row.idCliente || input.correlationId!==row.correlationId ||
      !input.variables || messageFingerprint(input)!==row.payloadHash) {
      await this.prisma.logNotificacion.updateMany({where:{idNotificacion,estadoEnvio:'PENDIENTE'},data:{estadoEnvio:'FALLIDO',ultimoError:'MESSAGE_IDENTITY_INVALID'}});return;
    }
    const claimed=await this.prisma.logNotificacion.updateMany({where:{idNotificacion,estadoEnvio:'PENDIENTE',intentos:0},
      data:{estadoEnvio:'EN_PROCESO',fechaInicio:new Date(),intentos:{increment:1}}});
    if(claimed.count!==1)return;
    const result=await this.provider.send(input);
    // A stale worker can record its result but must never move delivered/read backwards.
    await this.prisma.logNotificacion.updateMany({where:{idNotificacion,estadoEnvio:{in:['EN_PROCESO','RESULTADO_INDETERMINADO']}},
      data:{estadoEnvio:result.state,providerMessageId:result.providerMessageId,ultimoError:result.errorCode ?? null}});
  }
  private async drain() {
    if(this.draining)return;this.draining=true;
    try {
      await this.prisma.logNotificacion.updateMany({where:{proveedor:'meta',estadoEnvio:'EN_PROCESO',fechaInicio:{lt:new Date(Date.now()-300000)}},
        data:{estadoEnvio:'RESULTADO_INDETERMINADO',ultimoError:'META_STALE_RESULT_UNCERTAIN'}});
      const rows=await this.prisma.logNotificacion.findMany({where:{proveedor:'meta',estadoEnvio:'PENDIENTE',intentos:0},orderBy:{fechaEnvio:'asc'},take:10});
      for(const row of rows) {try {await this.dispatch(row.idNotificacion);} catch {/* Persisted state prevents blind retries. */}}
    }finally{this.draining=false;}
  }
  async acceptStatus(idEmpresa:number,messageId:string,status:string,errorCode?:number) {
    if(!precedingStates[status] || !/^wamid\.[A-Za-z0-9_+/=-]{1,500}$/.test(messageId))return;
    const row=await this.prisma.logNotificacion.findUnique({where:{providerMessageId:messageId}});
    if(!row) {
      // Status can arrive before the POST response is persisted. Ask Meta to redeliver.
      const inFlight=await this.prisma.logNotificacion.findFirst({where:{idEmpresa,proveedor:'meta',estadoEnvio:{in:['EN_PROCESO','RESULTADO_INDETERMINADO']}}});
      if(inFlight)throw new ServiceUnavailableException('MESSAGE_CORRELATION_PENDING');
      return;
    }
    if(row.idEmpresa!==idEmpresa || row.proveedor!=='meta')return;
    await this.prisma.logNotificacion.updateMany({where:{idNotificacion:row.idNotificacion,idEmpresa,providerMessageId:messageId,estadoEnvio:{in:precedingStates[status]}},
      data:{estadoEnvio:states[status],ultimoError:status==='failed' ? (Number.isSafeInteger(errorCode) && Number(errorCode)>=0 ? `META_${errorCode}` : 'META_DELIVERY_FAILED') : null}});
  }
}
