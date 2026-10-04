import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { AddressInfo, Socket, createServer } from 'node:net';
import { join } from 'node:path';
import { TLSSocket, createSecureContext, createServer as createTlsServer } from 'node:tls';
import { MailDeliveryError, MailService } from './mail.service';
import { smtpSettings } from './smtp.config';

const cert=readFileSync(join(__dirname,'fixtures/localhost-test-cert.pem'));
const key=readFileSync(join(__dirname,'fixtures/localhost-test-key.pem'));
type FakeOptions={mode?:'plain'|'starttls'|'tls';auth?:boolean;rejectAuth?:boolean;noStartTls?:boolean;rejectRecipient?:number;rejectData?:number;dropBeforeAck?:boolean;dropAfterAck?:boolean;hangGreeting?:boolean;hangAfterData?:boolean};
async function fakeSmtp(options:FakeOptions={}) {
  const messages:string[]=[],authEncrypted:boolean[]=[],commands:string[]=[],sockets=new Set<Socket>();
  const attach=(initial:Socket,greet=true,encrypted=false)=>{
    let socket=initial,buffer='',data=false,lines:string[]=[],authStep=0;
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>undefined);
    if(greet && !options.hangGreeting)socket.write('220 localhost SMTP QA\r\n');
    const onData=(chunk:Buffer)=>{
      buffer+=chunk.toString();
      let end=buffer.indexOf('\n');
      while(end>=0){
        const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);
        if(data){
          if(line==='.'){
            data=false;messages.push(lines.join('\r\n'));lines=[];
            if(options.dropBeforeAck)socket.destroy();
            else if(!options.hangAfterData){socket.write(`${options.rejectData ?? 250} result\r\n`);if(options.dropAfterAck)socket.end();}
          }else lines.push(line);
        }else if(authStep){if(authStep===1){authStep=2;socket.write('334 UGFzc3dvcmQ6\r\n');}else{authStep=0;authEncrypted.push(encrypted);socket.write('235 Authenticated\r\n');}}
        else{
          commands.push(line.startsWith('AUTH')?'AUTH':line.split(' ')[0]);
          if(line.startsWith('EHLO')||line.startsWith('HELO'))socket.write(`250-localhost\r\n${options.mode==='starttls'&&!encrypted&&!options.noStartTls?'250-STARTTLS\r\n':''}${options.auth?'250-AUTH PLAIN LOGIN\r\n':''}250 SIZE 10000000\r\n`);
          else if(line==='STARTTLS'){
            if(options.noStartTls)socket.write('454 TLS unavailable\r\n');
            else{socket.write('220 Ready for TLS\r\n');socket.off('data',onData);const secured=new TLSSocket(socket,{isServer:true,secureContext:createSecureContext({key,cert})});attach(secured,false,true);return;}
          }else if(line.startsWith('AUTH PLAIN')){authEncrypted.push(encrypted);socket.write(options.rejectAuth?'535 Auth rejected\r\n':'235 Authenticated\r\n');}
          else if(line==='AUTH LOGIN'){authStep=1;socket.write('334 VXNlcm5hbWU6\r\n');}
          else if(line.startsWith('MAIL FROM'))socket.write('250 Sender OK\r\n');
          else if(line.startsWith('RCPT TO'))socket.write(`${options.rejectRecipient ?? 250} Recipient\r\n`);
          else if(line==='DATA'){data=true;socket.write('354 Send message\r\n');}
          else if(line==='QUIT'){socket.write('221 Bye\r\n');socket.end();}
          else socket.write('250 OK\r\n');
        }
        end=buffer.indexOf('\n');
      }
    };
    socket.on('data',onData);
  };
  const server=options.mode==='tls'?createTlsServer({key,cert},socket=>attach(socket,true,true)):createServer(socket=>attach(socket));
  server.on('tlsClientError',()=>undefined);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const values:Record<string,string>={SMTP_HOST:'127.0.0.1',SMTP_PORT:String((server.address() as AddressInfo).port),SMTP_FROM:'qa@finet.local',
    SMTP_SECURE:String(options.mode==='tls'),SMTP_STARTTLS:String(options.mode==='starttls'),SMTP_ALLOW_INSECURE_LOCAL:'true',SMTP_TIMEOUT_MS:'1500',
    SMTP_TLS_SERVERNAME:'localhost',SMTP_TLS_CA:cert.toString(),
    ...(options.auth?{SMTP_USER:'qa@finet.local',SMTP_PASSWORD:'FAKE_TEST_ONLY'}:{})};
  const service=new MailService(new ConfigService(values));
  return{service,values,messages,commands,authEncrypted,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
const tax={to:'qa@example.invalid',customerName:'QA',tipoDte:39,folio:'20',idPago:7,pdf:Buffer.from('%PDF-TEST'),filename:'boleta-20.pdf',deliveryKey:'tax:TEST_ONLY'};

describe('SMTP protocol over isolated loopback sockets',()=>{
  it('disabled SMTP makes no connection',async()=>{
    const service=new MailService(new ConfigService({}));
    expect(await service.verifyConnection()).toEqual({status:'not_configured'});
    expect(await service.sendTaxDocument(tax)).toEqual({status:'not_configured'});
  });
  it('verify authenticates without sending a message',async()=>{
    const server=await fakeSmtp({mode:'starttls',auth:true});
    try{expect(await server.service.verifyConnection()).toMatchObject({status:'ready',mode:'starttls',authenticated:true});expect(server.messages).toHaveLength(0);expect(server.commands).not.toContain('DATA');expect(server.authEncrypted).toEqual([true]);}finally{await server.close();}
  });
  it.each(['starttls','tls'] as const)('sends an attached boleta with %s and authenticates only after encryption',async mode=>{
    const server=await fakeSmtp({mode,auth:true});
    try{expect(await server.service.sendTaxDocument(tax)).toMatchObject({status:'sent'});expect(server.authEncrypted).toEqual([true,true]);
      expect(server.messages).toHaveLength(1);expect(server.messages[0]).toContain('filename=boleta-20.pdf');expect(server.messages[0]).toContain(tax.pdf.toString('base64'));expect(server.messages[0]).toContain('Message-ID:');
    }finally{await server.close();}
  });
  it('preserves quote attachments and generates a stable tax Message-ID',async()=>{
    const server=await fakeSmtp();
    try{await server.service.sendQuote({to:tax.to,prospectName:'QA',companyName:'Cable Magico',pdf:tax.pdf,filename:'cotizacion-4.pdf'});await server.service.sendTaxDocument(tax);await server.service.sendTaxDocument(tax);
      expect(server.messages[0]).toContain('filename=cotizacion-4.pdf');expect(server.messages[1].match(/Message-ID: (.+)/)?.[1]).toEqual(server.messages[2].match(/Message-ID: (.+)/)?.[1]);
    }finally{await server.close();}
  });
  it('refuses an untrusted TLS certificate before sending credentials or DATA',async()=>{
    const server=await fakeSmtp({mode:'tls',auth:true});delete server.values.SMTP_TLS_CA;
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true,retryable:false});expect(server.messages).toHaveLength(0);expect(server.authEncrypted).toHaveLength(0);}finally{await server.close();}
  });
  it('refuses a certificate with the wrong hostname',async()=>{
    const server=await fakeSmtp({mode:'tls',auth:true});server.values.SMTP_TLS_SERVERNAME='wrong.example.invalid';
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true});expect(server.messages).toHaveLength(0);}finally{await server.close();}
  });
  it('requires STARTTLS and never falls back to plaintext AUTH',async()=>{
    const server=await fakeSmtp({mode:'starttls',auth:true,noStartTls:true});
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true,retryable:false});expect(server.authEncrypted).toHaveLength(0);expect(server.messages).toHaveLength(0);}finally{await server.close();}
  });
  it('stops on rejected authentication without sending DATA',async()=>{
    const server=await fakeSmtp({mode:'tls',auth:true,rejectAuth:true});
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({code:'SMTP_NOT_ACCEPTED',confirmedNotAccepted:true,retryable:false});expect(server.messages).toHaveLength(0);}finally{await server.close();}
  });
  it.each([450,550])('classifies recipient rejection %i without exposing server responses',async code=>{
    const server=await fakeSmtp({rejectRecipient:code});
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true,retryable:code===450});expect(server.messages).toHaveLength(0);}finally{await server.close();}
  });
  it('classifies an explicit DATA rejection as not accepted',async()=>{
    const server=await fakeSmtp({rejectData:451});
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true,retryable:true});expect(server.messages).toHaveLength(1);}finally{await server.close();}
  });
  it('a connection lost before the DATA acknowledgement is uncertain even when its error says CONN',async()=>{
    const server=await fakeSmtp({dropBeforeAck:true});
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({code:'SMTP_RESULT_UNCERTAIN',confirmedNotAccepted:false,retryable:false});expect(server.messages).toHaveLength(1);}finally{await server.close();}
  });
  it('does not turn SMTP acceptance into failure if QUIT loses its connection',async()=>{
    const server=await fakeSmtp({dropAfterAck:true});
    try{expect(await server.service.sendTaxDocument(tax)).toMatchObject({status:'sent'});expect(server.messages).toHaveLength(1);}finally{await server.close();}
  });
  it('bounds preflight waiting and confirms no DATA was sent',async()=>{
    const server=await fakeSmtp({hangGreeting:true});server.values.SMTP_TIMEOUT_MS='100';
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:true,retryable:true});expect(server.messages).toHaveLength(0);}finally{await server.close();}
  });
  it('a timeout waiting for DATA acceptance remains uncertain',async()=>{
    const server=await fakeSmtp({hangAfterData:true});server.values.SMTP_TIMEOUT_MS='100';
    try{await expect(server.service.sendTaxDocument(tax)).rejects.toMatchObject({confirmedNotAccepted:false,retryable:false});expect(server.messages).toHaveLength(1);}finally{await server.close();}
  });
  it.each(['victim@example.invalid\r\nRCPT TO:<other@example.invalid>','first@example.invalid,second@example.invalid'])('rejects envelope injection or multiple recipients before connecting',async to=>{
    const server=await fakeSmtp();
    try{await expect(server.service.sendTaxDocument({...tax,to})).rejects.toMatchObject({code:'SMTP_RECIPIENT_INVALID'});expect(server.commands).toHaveLength(0);}finally{await server.close();}
  });
});

describe('SMTP configuration gates',()=>{
  it.each([{SMTP_REJECT_UNAUTHORIZED:'false'},{SMTP_STARTTLS:'false'},{SMTP_PORT:'not-a-port'},{SMTP_USER:'qa',SMTP_PASSWORD:undefined},{SMTP_SECURE:'maybe'},{SMTP_FROM:'qa@example.invalid\r\nBCC: other@example.invalid'}])('rejects unsafe/incomplete configuration %j',override=>{
    expect(()=>smtpSettings(new ConfigService({SMTP_HOST:'smtp.example.invalid',SMTP_FROM:'qa@example.invalid',...override}))).toThrow(MailDeliveryError);
  });
  it('permits plaintext only explicitly for unauthenticated local QA, never production',()=>{
    const values={SMTP_HOST:'mailpit',SMTP_PORT:'1025',SMTP_FROM:'qa@finet.local',SMTP_STARTTLS:'false',SMTP_ALLOW_INSECURE_LOCAL:'true'};
    expect(smtpSettings(new ConfigService(values))?.mode).toBe('local_plaintext');
    for(const override of [{NODE_ENV:'production'},{SMTP_HOST:'smtp.example.invalid'},{SMTP_USER:'qa',SMTP_PASSWORD:'FAKE'}])expect(()=>smtpSettings(new ConfigService({...values,...override}))).toThrow('SMTP_CONFIG_INVALID');
  });
});
