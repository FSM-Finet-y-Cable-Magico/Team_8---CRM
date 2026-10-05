import { BadRequestException, Controller, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request,Response } from 'express';
import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { MessagingService } from './messaging.service';

function equalSecret(a:string,b:string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
type Envelope={object?:string;entry?:Array<{id?:string;changes?:Array<{field?:string;value?:{
  metadata?:{phone_number_id?:string};statuses?:Array<{id?:string;status?:string;errors?:Array<{code?:number}>}>;
}}>} >};

@Controller('webhooks/whatsapp')
export class MetaWebhookController {
  constructor(private readonly messaging:MessagingService) {}
  private companies() {
    if(this.messaging.config.mode!=='meta')throw new UnauthorizedException('WEBHOOK_NOT_CONFIGURED');
    return this.messaging.config.companies;
  }
  @Get()
  verify(@Query() query:Record<string,string>,@Res() res:Response) {
    const companies=this.companies();
    if(query['hub.mode']!=='subscribe' || typeof query['hub.verify_token']!=='string' ||
      !companies.some(c=>equalSecret(query['hub.verify_token'],this.messaging.config.credentials(c).verifyToken)) ||
      typeof query['hub.challenge']!=='string' || !/^\d{1,100}$/.test(query['hub.challenge']))throw new UnauthorizedException('WEBHOOK_VERIFICATION_FAILED');
    res.type('text/plain').send(query['hub.challenge']);
  }
  @Post() @HttpCode(200)
  async receive(@Headers('x-hub-signature-256') signature:string,@Req() req:RawBodyRequest<Request>) {
    const companies=this.companies();
    if(!req.rawBody || !/^sha256=[a-f0-9]{64}$/.test(signature ?? '')) {
      throw new UnauthorizedException('WEBHOOK_SIGNATURE_INVALID');
    }
    const signed=companies.filter(c=>timingSafeEqual(createHmac('sha256',this.messaging.config.credentials(c).appSecret)
      .update(req.rawBody!).digest(),Buffer.from(signature.slice(7),'hex')));
    if(!signed.length)throw new UnauthorizedException('WEBHOOK_SIGNATURE_INVALID');
    let body:Envelope;
    try {body=JSON.parse(req.rawBody.toString('utf8'));}catch{throw new BadRequestException('WEBHOOK_BODY_INVALID');}
    if(body?.object!=='whatsapp_business_account' || !Array.isArray(body.entry))throw new BadRequestException('WEBHOOK_BODY_INVALID');
    for(const entry of body.entry) {
      if(!Array.isArray(entry?.changes))continue;
      for(const change of entry.changes) {
        const company=signed.find(c=>c.wabaId===entry.id && c.phoneNumberId===change?.value?.metadata?.phone_number_id);
        if(!company || change?.field!=='messages' || !Array.isArray(change.value?.statuses))continue;
        for(const status of change.value.statuses) {
          if(typeof status?.id==='string' && typeof status.status==='string')await this.messaging.acceptStatus(company.idEmpresa,status.id,status.status,status.errors?.[0]?.code);
        }
      }
    }
    return {received:true};
  }
}
