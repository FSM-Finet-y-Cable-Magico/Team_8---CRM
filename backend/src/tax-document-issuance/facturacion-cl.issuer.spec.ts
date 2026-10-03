import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClPaymentConfig } from './facturacion-cl-payment.config';
import { FacturacionClIssuer } from './facturacion-cl.issuer';
import { PaymentTaxContext } from './tax-document-issuer.types';
const profile={idEmpresa:2,approved:true,issuerRut:'66666666-6',defaultDocumentType:'BOLETA',receipt:{tipoDte:39,encoding:'utf8',serviceIndicator:3}};
const context:PaymentTaxContext={idEmpresa:2,idFactura:5,idPago:7,idCliente:3,monto:'100',periodoMes:10,periodoAnio:2026,fechaLimitePago:new Date('2026-10-30'),tipoDocumento:null,folioExterno:null,
  receiver:{rut:'66666666-6',name:'QA NO COBRAR',giro:'',address:'PRUEBA',comuna:'PRUEBA',city:'PRUEBA',email:'qa@example.invalid'}};
async function setup(enabled=true,ready=true) {
  const env=new ConfigService({FACTURACION_CL_INTEGRATION_ENABLED:String(enabled),FACTURACION_CL_DELIVERY_ENABLED:'true',FACTURACION_CL_COMPANIES:JSON.stringify([{idEmpresa:2,alias:'CM',environment:'sandbox',enabled:true}]),FACTURACION_CL_PROFILES:JSON.stringify([profile]),FACTURACION_CL_CM_SANDBOX_CREDENTIALS:JSON.stringify({usuario:'FAKE',rut:'66666666-6',clave:'FAKE'})});
  const config=new FacturacionClPaymentConfig(env,new FacturacionClConfigService(env));
  const job={...context,documento:Buffer.from('FAKE'),tipoDte:39,formato:1,folioEsperado:'0',policyVersion:'PER_PAYMENT_V1',profileHash:config.profileHash(config.profile(2)!),estado:'PENDIENTE',email:context.receiver.email,nombreCliente:context.receiver.name};
  const record={idIntencion:'FAKE',idEmpresa:2,estado:'GENERADO',tipoDte:39,folio:'20',artefactoUrl:null,artefactoEstado:'PENDIENTE',emailEstado:'PENDIENTE'};
  const prisma={$queryRaw:jest.fn().mockResolvedValue([{ready}]),pago:{findUnique:jest.fn().mockResolvedValue({idCliente:3,factura:{contrato:{idEmpresa:2,idCliente:3,cliente:{idEmpresa:2}}}})},taxPaymentJob:{create:jest.fn(),findUnique:jest.fn().mockResolvedValue(job),update:jest.fn()},documentoTributarioExterno:{count:jest.fn().mockResolvedValue(0)},
    taxEmissionIntent:{findUnique:jest.fn().mockResolvedValue(null),findFirst:jest.fn().mockImplementation(async()=>({...record})),update:jest.fn(),updateMany:jest.fn().mockImplementation(async args=>{if(args.data.emailEstado==='EN_PROCESO'){if(record.emailEstado!=='PENDIENTE')return{count:0};record.emailEstado='EN_PROCESO';}else if(args.data.emailEstado)record.emailEstado=args.data.emailEstado;return{count:1};})}};
  const mail={isConfigured:jest.fn().mockReturnValue(true),sendTaxDocument:jest.fn().mockResolvedValue({status:'sent'})};
  const issuer=new FacturacionClIssuer(prisma as unknown as PrismaService,config,mail as unknown as MailService,{} as AuditService);
  try{await issuer.onModuleInit();}finally{issuer.onModuleDestroy();}
  return{issuer,prisma,config,job,record,mail};
}
describe('FacturacionCl payment pipeline (fake provider, no emissions)',()=>{
  it('default disabled creates no work, and an enabled instance requires migration',async()=>{
    const {issuer,prisma}=await setup(false,false);expect(issuer.getReadiness(2).canIssue).toBe(false);
    await issuer.enqueuePayment(prisma as unknown as Prisma.TransactionClient,context);expect(prisma.taxPaymentJob.create).not.toHaveBeenCalled();
    await expect(setup(true,false)).rejects.toThrow('FACTURACION_CL_MIGRATION_REQUIRED');
  });
  it('captures an immutable receipt for the partial payment, with explicit automatic folio',async()=>{
    const {issuer,prisma}=await setup();await issuer.enqueuePayment(prisma as unknown as Prisma.TransactionClient,context);
    const data=prisma.taxPaymentJob.create.mock.calls[0][0].data;
    expect(data).toMatchObject({idPago:7,monto:'100',tipoDte:39,folioEsperado:'0',estado:'PENDIENTE'});
    expect(data.documento.toString()).toContain('Pago CRM 7 - documento de cobro 5');expect(data.documento.toString()).toContain('100');
  });
  it('fiscal errors leave a reviewable job; database errors are not disguised',async()=>{
    const {issuer,prisma}=await setup();await issuer.enqueuePayment(prisma as unknown as Prisma.TransactionClient,{...context,monto:'10.01'});
    expect(prisma.taxPaymentJob.create.mock.calls[0][0].data).toMatchObject({estado:'DATOS_REQUERIDOS',ultimoError:'FISCAL_ROUNDING_REQUIRED'});
    prisma.documentoTributarioExterno.count.mockRejectedValue(new Error('DB_UNAVAILABLE'));
    await expect(issuer.enqueuePayment(prisma as unknown as Prisma.TransactionClient,context)).rejects.toThrow('DB_UNAVAILABLE');
  });
  it('artifact failure keeps the generated document and never sends email',async()=>{
    const {issuer,prisma,mail}=await setup();jest.spyOn(issuer.intents,'execute').mockResolvedValue({idIntencion:'FAKE',estado:'GENERADO',folio:'20'} as never);
    jest.spyOn(issuer.artifacts,'getLink').mockRejectedValue(new Error('FAKE'));
    expect(await issuer.processPayment(7)).toMatchObject({state:'GENERADO',folio:'20'});expect(mail.sendTaxDocument).not.toHaveBeenCalled();
    expect(prisma.taxEmissionIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{artefactoEstado:'FALLIDO'}}));
  });
  it('verifies the PDF even without SMTP and keeps email as not configured',async()=>{
    const {issuer,prisma,mail}=await setup();mail.isConfigured.mockReturnValue(false);
    jest.spyOn(issuer.intents,'execute').mockResolvedValue({idIntencion:'FAKE',estado:'GENERADO',folio:'20'} as never);
    jest.spyOn(issuer.artifacts,'getLink').mockResolvedValue('https://www.facturacion.cl/plano/descargar.php?FAKE');
    const download=jest.spyOn(issuer.artifacts,'downloadPdf').mockResolvedValue(Buffer.from('%PDF-FAKE'));
    expect(await issuer.processPayment(7)).toMatchObject({state:'GENERADO'});expect(download).toHaveBeenCalledTimes(1);expect(mail.sendTaxDocument).not.toHaveBeenCalled();
    expect(prisma.taxEmissionIntent.update).toHaveBeenCalledWith(expect.objectContaining({data:{artefactoEstado:'DISPONIBLE'}}));
    expect(prisma.taxEmissionIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{emailEstado:'NO_CONFIGURADO'}}));
  });
  it('an invalid PDF cannot become available or reach SMTP',async()=>{
    const {issuer,prisma,mail}=await setup();jest.spyOn(issuer.intents,'execute').mockResolvedValue({idIntencion:'FAKE',estado:'GENERADO',folio:'20'} as never);
    jest.spyOn(issuer.artifacts,'getLink').mockResolvedValue('https://www.facturacion.cl/plano/descargar.php?FAKE');
    jest.spyOn(issuer.artifacts,'downloadPdf').mockRejectedValue(new Error('ARTIFACT_NOT_PDF'));
    expect(await issuer.processPayment(7)).toMatchObject({state:'GENERADO'});expect(mail.sendTaxDocument).not.toHaveBeenCalled();
    expect(prisma.taxEmissionIntent.update).toHaveBeenCalledWith(expect.objectContaining({data:{artefactoEstado:'FALLIDO'}}));
  });
  it('SMTP failure leaves generation intact and blocks automatic email replay',async()=>{
    const {issuer,record,mail}=await setup();jest.spyOn(issuer.intents,'execute').mockResolvedValue({idIntencion:'FAKE',estado:'GENERADO',folio:'20'} as never);
    jest.spyOn(issuer.artifacts,'getLink').mockResolvedValue('https://www.facturacion.cl/sistema/descargar.php?FAKE');
    jest.spyOn(issuer.artifacts,'downloadPdf').mockResolvedValue(Buffer.from('%PDF-FAKE'));mail.sendTaxDocument.mockRejectedValue(new Error('FAKE_SMTP_TIMEOUT'));
    await issuer.processPayment(7);await issuer.processPayment(7);expect(record.emailEstado).toBe('RESULTADO_INDETERMINADO');expect(mail.sendTaxDocument).toHaveBeenCalledTimes(1);
  });
  it('concurrent replay sends one email through a database claim',async()=>{
    const {issuer,mail}=await setup();jest.spyOn(issuer.intents,'execute').mockResolvedValue({idIntencion:'FAKE',estado:'GENERADO',folio:'20'} as never);
    jest.spyOn(issuer.artifacts,'getLink').mockResolvedValue('https://www.facturacion.cl/sistema/descargar.php?FAKE');jest.spyOn(issuer.artifacts,'downloadPdf').mockResolvedValue(Buffer.from('%PDF-FAKE'));
    await Promise.all([issuer.processPayment(7),issuer.processPayment(7)]);expect(mail.sendTaxDocument).toHaveBeenCalledTimes(1);
  });
  it('does not retry a failed emission without explicit request, nor dispatch changed configuration',async()=>{
    const {issuer,prisma,job}=await setup();const execute=jest.spyOn(issuer.intents,'execute');
    prisma.taxEmissionIntent.findUnique.mockResolvedValue({estado:'FALLIDO',ultimoError:'CONFIRMED_NOT_SENT'} as never);
    expect(await issuer.processPayment(7)).toMatchObject({state:'FALLIDO'});expect(execute).not.toHaveBeenCalled();
    job.profileHash='0'.repeat(64);expect(await issuer.processPayment(7)).toMatchObject({code:'CONFIGURATION_CHANGED'});expect(execute).not.toHaveBeenCalled();
  });
  it('enforces billing roles and company ownership before reading artifacts',async()=>{
    const {issuer}=await setup();const user={idUsuario:7,idEmpresa:2,email:null,nombreCompleto:'QA',roles:['Comercial']};
    expect(await issuer.assertPaymentAccess(7,user)).toBe(2);
    await expect(issuer.assertPaymentAccess(7,{...user,idEmpresa:1})).rejects.toBeInstanceOf(NotFoundException);
    await expect(issuer.assertPaymentAccess(7,{...user,roles:['Terreno']})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('manual reconciliation requires administrator and matching fingerprint before any provider read',async()=>{
    const {issuer,prisma}=await setup();const user={idUsuario:7,idEmpresa:2,email:null,nombreCompleto:'QA',roles:['Comercial']};
    const input={folio:'20',fingerprint:'a'.repeat(64),confirmSameDocument:true,observation:'QA comprobado'};
    const read=jest.spyOn(issuer.artifacts,'getLink');
    await expect(issuer.reconcilePayment(7,input,user)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.taxEmissionIntent.findUnique.mockResolvedValue({estado:'RESULTADO_INDETERMINADO',fingerprint:'b'.repeat(64),folioEsperado:'0',tipoDte:39} as never);
    await expect(issuer.reconcilePayment(7,input,{...user,roles:['Administrador']})).rejects.toThrow('La identidad');expect(read).not.toHaveBeenCalled();
  });
});
