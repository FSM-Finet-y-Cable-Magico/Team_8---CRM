import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { MetaWebhookController } from './meta-webhook.controller';
import { MessagingService } from './messaging.service';
import { MessagingConfig } from './messaging.config';

it('verifies raw HTTP bytes in a Nest server and returns the plain challenge',async()=>{
  const config=new MessagingConfig(new ConfigService({WHATSAPP_PROVIDER:'meta',WHATSAPP_API_VERSION:'v99.0',
    WHATSAPP_COMPANIES:JSON.stringify([{idEmpresa:1,alias:'QA',phoneNumberId:'12345',wabaId:'23456',templates:{}}]),
    WHATSAPP_QA_ACCESS_TOKEN:'FAKE',WHATSAPP_QA_APP_SECRET:'FAKE_SECRET',WHATSAPP_QA_VERIFY_TOKEN:'FAKE_VERIFY'}));
  const acceptStatus=jest.fn();
  const module=await Test.createTestingModule({controllers:[MetaWebhookController],providers:[{provide:MessagingService,useValue:{config,acceptStatus}}]}).compile();
  const app=module.createNestApplication({rawBody:true});app.setGlobalPrefix('api');await app.init();
  try {
    await request(app.getHttpServer()).get('/api/webhooks/whatsapp').query({'hub.mode':'subscribe','hub.verify_token':'FAKE_VERIFY','hub.challenge':'5678'}).expect(200,'5678');
    const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{id:'23456',changes:[{field:'messages',value:{metadata:{phone_number_id:'12345'},statuses:[{id:'wamid.QA',status:'delivered'}]}}]}]});
    const signature='sha256='+createHmac('sha256','FAKE_SECRET').update(raw).digest('hex');
    await request(app.getHttpServer()).post('/api/webhooks/whatsapp').set('Content-Type','application/json').set('X-Hub-Signature-256',signature).send(raw).expect(200);
    expect(acceptStatus).toHaveBeenCalledWith(1,'wamid.QA','delivered',undefined);
    await request(app.getHttpServer()).post('/api/webhooks/whatsapp').set('Content-Type','application/json').set('X-Hub-Signature-256',signature).send(raw+' ').expect(401);
  }finally{await app.close();}
});
