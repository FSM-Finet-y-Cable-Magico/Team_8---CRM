import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClPaymentConfig } from './facturacion-cl-payment.config';
import { FacturacionClIssuer } from './facturacion-cl.issuer';
const operator={idUsuario:1,idEmpresa:2,roles:['Comercial'],email:null,nombreCompleto:'QA'};
async function setup() {
  const profile={idEmpresa:2,approved:true,issuerRut:'66666666-6',defaultDocumentType:'BOLETA',receipt:{tipoDte:39,encoding:'utf8',serviceIndicator:3}};
  const env=new ConfigService({FACTURACION_CL_INTEGRATION_ENABLED:'true',FACTURACION_CL_COMPANIES:JSON.stringify([{idEmpresa:2,alias:'QA',enabled:true,environment:'sandbox'}]),
    FACTURACION_CL_PROFILES:JSON.stringify([profile]),FACTURACION_CL_QA_SANDBOX_CREDENTIALS:JSON.stringify({usuario:'FAKE',rut:'66666666-6',clave:'FAKE'})});
  const config=new FacturacionClPaymentConfig(env,new FacturacionClConfigService(env));
  const customer={idCliente:3,idEmpresa:2,rut:'66666666-6',nombreCompleto:'QA',email:'corrected@example.invalid',datosTecnicos:null};
  const contract={idEmpresa:2,idCliente:3,cliente:customer,direccionInstalacion:'QA',comunaInstalacion:'QA',ciudadInstalacion:'QA'};
  const payment={idCliente:3,monto:new Prisma.Decimal(100),factura:{idFactura:5,contrato:contract,folioExterno:null,tipoDocumento:'BOLETA',periodoMes:10,periodoAnio:2026,fechaLimitePago:new Date('2026-10-30')}};
  const job={idEmpresa:2,idFactura:5,idCliente:3,idPago:7,monto:new Prisma.Decimal(100),estado:'DATOS_REQUERIDOS',profileHash:'old',email:null};
  const record={idIntencion:'QA',idEmpresa:2,estado:'GENERADO',emailEstado:'SIN_DESTINATARIO',emailIntentos:0};
  const tx={$queryRaw:jest.fn().mockResolvedValue([{ready:true}]),$executeRaw:jest.fn(),pago:{findUnique:jest.fn().mockResolvedValue(payment)},
    cliente:{findUnique:jest.fn().mockResolvedValue(customer)},documentoTributarioExterno:{count:jest.fn().mockResolvedValue(0)},
    taxPaymentJob:{findUnique:jest.fn().mockResolvedValue(job),findFirst:jest.fn().mockResolvedValue(job),update:jest.fn(),updateMany:jest.fn().mockResolvedValue({count:1})},
    taxEmissionIntent:{findUnique:jest.fn().mockResolvedValue(null),updateMany:jest.fn().mockResolvedValue({count:1})}};
  const db={...tx,$transaction:jest.fn(async(fn:(client:typeof tx)=>unknown)=>fn(tx))};
  const mail={isConfigured:jest.fn(),sendTaxDocument:jest.fn()},audit={record:jest.fn()};
  const issuer=new FacturacionClIssuer(db as never,config,mail,audit as never);
  await issuer.onModuleInit();issuer.onModuleDestroy();
  return {issuer,db,tx,job,record,customer,payment,mail,audit};
}
describe('Tax recovery from authoritative G8 data',()=>{
  it('reprepares an unissued job, persists the corrected document and audit without HTTP/SMTP',async()=>{
    const {issuer,tx,mail,audit,db}=await setup();
    const dispatch=jest.spyOn(issuer.intents,'execute');
    await issuer.repreparePayment(7,'Datos de QA corregidos',operator);
    expect(tx.taxPaymentJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({estado:'DATOS_REQUERIDOS'}),
      data:expect.objectContaining({estado:'PENDIENTE',folioEsperado:'0',tipoDte:39,email:'corrected@example.invalid',ultimoError:null})}));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({accion:'PREPARAR_DTE_DATOS_CORREGIDOS'}),tx);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
    expect(dispatch).not.toHaveBeenCalled();expect(mail.sendTaxDocument).not.toHaveBeenCalled();
  });
  it.each(['PENDIENTE','EN_PROCESO','GENERADO','RESULTADO_INDETERMINADO','FALLIDO'])('never rewrites a job that already has an intent in %s',async estado=>{
    const {issuer,tx}=await setup();tx.taxEmissionIntent.findUnique.mockResolvedValue({estado} as never);
    await expect(issuer.repreparePayment(7,'QA',operator)).rejects.toThrow('sin intencion');expect(tx.taxPaymentJob.updateMany).not.toHaveBeenCalled();
  });
  it('rejects wrong company, missing permission, empty justification and financial drift',async()=>{
    const {issuer,tx,payment}=await setup();
    await expect(issuer.repreparePayment(7,'QA',{...operator,idEmpresa:1})).rejects.toThrow('alcance');
    await expect(issuer.repreparePayment(7,'QA',{...operator,roles:['Soporte']})).rejects.toThrow('permiso');
    await expect(issuer.repreparePayment(7,' ',operator)).rejects.toThrow('motivo');
    payment.monto=new Prisma.Decimal(200);
    await expect(issuer.repreparePayment(7,'QA',operator)).rejects.toThrow('identidad financiera');
    expect(tx.taxPaymentJob.updateMany).not.toHaveBeenCalled();
  });
  it('does not hide a database failure as bad fiscal input',async()=>{
    const {issuer,tx}=await setup();tx.documentoTributarioExterno.count.mockRejectedValue(new Error('FAKE_DB_FAILURE'));
    await expect(issuer.repreparePayment(7,'QA',operator)).rejects.toThrow('FAKE_DB_FAILURE');
  });
  it('corrects only the missing email from the scoped customer, queues existing DTE without sending',async()=>{
    const {issuer,tx,record,mail,audit}=await setup();tx.taxEmissionIntent.findUnique.mockResolvedValue(record as never);
    await issuer.correctRecipient(7,'Correo QA corregido',operator);
    expect(tx.taxPaymentJob.update).toHaveBeenCalledWith({where:{idPago:7},data:{email:'corrected@example.invalid'}});
    expect(tx.taxEmissionIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({emailEstado:'SIN_DESTINATARIO',emailIntentos:0}),data:expect.objectContaining({emailEstado:'PENDIENTE'})}));
    expect(audit.record).toHaveBeenCalled();expect(mail.sendTaxDocument).not.toHaveBeenCalled();
  });
  it.each(['ENVIADO','EN_PROCESO','RESULTADO_INDETERMINADO','FALLIDO'])('cannot change recipient after delivery state %s',async emailEstado=>{
    const {issuer,tx,record}=await setup();tx.taxEmissionIntent.findUnique.mockResolvedValue({...record,emailEstado} as never);
    await expect(issuer.correctRecipient(7,'QA',operator)).rejects.toThrow('sin envios previos');expect(tx.taxPaymentJob.update).not.toHaveBeenCalled();
  });
  it('refuses invalid corrected email and racing updates',async()=>{
    const {issuer,tx,record,customer,audit}=await setup();tx.taxEmissionIntent.findUnique.mockResolvedValue(record as never);
    customer.email='bad,another@example.invalid';await expect(issuer.correctRecipient(7,'QA',operator)).rejects.toThrow('correo del cliente');
    customer.email='valid@example.invalid';tx.taxEmissionIntent.updateMany.mockResolvedValue({count:0});
    await expect(issuer.correctRecipient(7,'QA',operator)).rejects.toThrow('correo cambio');expect(audit.record).not.toHaveBeenCalled();
  });
});
