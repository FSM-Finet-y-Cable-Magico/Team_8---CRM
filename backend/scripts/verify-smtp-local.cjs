/* Isolated PostgreSQL + actual local Mailpit SMTP; simulated tax document/provider.
 * No Facturacion.cl calls. Creates and removes only its own disposable QA records. */
const assert = require('node:assert/strict');
const { randomUUID, randomInt, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const PDFDocument = require('pdfkit');
const { MailService, MailDeliveryError } = require('../dist/mail/mail.service');
const { FacturacionClConfigService } = require('../dist/tax-document-issuance/facturacion-cl-config.service');
const { FacturacionClPaymentConfig, PAYMENT_TAX_POLICY } = require('../dist/tax-document-issuance/facturacion-cl-payment.config');
const { FacturacionClIssuer } = require('../dist/tax-document-issuance/facturacion-cl.issuer');
const prisma = new PrismaClient();

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,'db'); assert.equal(url.pathname,'/fsm_facturacion_local');
  assert.equal(process.env.SMTP_HOST,'mailpit'); assert.equal(process.env.SMTP_PORT,'1025');
  const [{name}] = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(name,'fsm_facturacion_local');
  assert.equal(await prisma.taxPaymentJob.count({where:{estado:'PENDIENTE'}}),0,'Do not process unrelated pending work');
  assert.equal(await prisma.taxEmissionIntent.count({where:{estado:'GENERADO',emailEstado:{in:['PENDIENTE','NO_CONFIGURADO','REINTENTO_PENDIENTE','EN_PROCESO']}}}),0,'Do not deliver unrelated pending emails');
  const existing = await prisma.taxEmissionIntent.findMany({select:{idIntencion:true,estado:true,folio:true,emailEstado:true,emailIntentos:true}});
  const env = new ConfigService(process.env);
  const config = new FacturacionClPaymentConfig(env,new FacturacionClConfigService(env));
  const profile = config.profile(2); assert(profile);
  const mail = new MailService(env); mail.onModuleInit();
  assert.equal((await mail.verifyConnection()).status,'ready');
  const runId=randomUUID(), folio='998'+randomInt(100000,999999), bytes=Buffer.from('SIMULATED_SMTP_QA_NOT_A_DTE');
  const pdf=await new Promise(resolve=>{
    const doc=new PDFDocument({size:'A4'}),parts=[];doc.on('data',chunk=>parts.push(chunk));doc.on('end',()=>resolve(Buffer.concat(parts)));
    doc.fontSize(20).text('PRUEBA SMTP LOCAL');doc.moveDown().fontSize(12).text('DOCUMENTO SIMULADO - SIN VALOR TRIBUTARIO\nNo es una boleta emitida por Facturacion.cl.\nSolo verifica el transporte y la recuperacion del correo.\nQA '+runId);doc.end();
  });
  const own=await prisma.$transaction(async tx=>{
    const customer=await tx.cliente.create({data:{idEmpresa:2,nombreCompleto:'QA SMTP LOCAL - DOCUMENTO SIMULADO',estado:'Activo',email:'qa-smtp@example.invalid'}});
    const contract=await tx.contrato.create({data:{idEmpresa:2,idCliente:customer.idCliente,fechaInicio:new Date(),diaVencimiento:28,estado:'Activo'}});
    const invoice=await tx.factura.create({data:{idContrato:contract.idContrato,periodoMes:10,periodoAnio:2026,monto:100,fechaLimitePago:new Date('2026-10-28'),estado:'Pendiente'}});
    const payment=await tx.pago.create({data:{idCliente:customer.idCliente,idFactura:invoice.idFactura,monto:100,fechaPago:new Date(),pasarela:'QA SMTP SIMULADO'}});
    await tx.taxPaymentJob.create({data:{idEmpresa:2,idFactura:invoice.idFactura,idPago:payment.idPago,idCliente:customer.idCliente,monto:100,
      policyVersion:PAYMENT_TAX_POLICY,profileHash:config.profileHash(profile),documento:bytes,tipoDte:39,formato:1,folioEsperado:'0',
      email:customer.email,nombreCliente:customer.nombreCompleto,estado:'PROCESADO'}});
    const record=await tx.taxEmissionIntent.create({data:{idEmpresa:2,idFactura:invoice.idFactura,idPago:payment.idPago,businessKey:`PAYMENT:${payment.idPago}`,
      policyVersion:PAYMENT_TAX_POLICY,ambiente:'sandbox',tipoDte:39,formato:1,fingerprint:createHash('sha256').update(bytes).digest('hex'),folioEsperado:'0',
      estado:'GENERADO',folio,artefactoUrl:'https://www.facturacion.cl/plano/descargar.php?SIMULATED_SMTP_QA',artefactoEstado:'DISPONIBLE'}});
    return {customer,contract,invoice,payment,record};
  });
  let actualSmtpSends=0;
  const realSend=mail.sendTaxDocument.bind(mail);
  mail.sendTaxDocument=async message=>{actualSmtpSends++;return realSend(message);};
  const makeIssuer=async sender=>{
    const issuer=new FacturacionClIssuer(prisma,config,sender,{});
    issuer.intents.execute=async()=>{throw Error('PROVIDER_CALL_FORBIDDEN_IN_SMTP_QA');};
    issuer.processPayment=async()=>{throw Error('ISSUANCE_FORBIDDEN_IN_SMTP_QA');};
    issuer.artifacts.getLink=async()=>{throw Error('PROVIDER_ARTIFACT_CALL_FORBIDDEN_IN_SMTP_QA');};
    issuer.artifacts.downloadPdf=async()=>pdf;
    await issuer.onModuleInit();issuer.onModuleDestroy();return issuer;
  };
  try {
    const before=await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
    const beforeIds=new Set(before.messages.map(m=>m.ID));
    const failed=await makeIssuer({isConfigured:()=>true,sendTaxDocument:async()=>{throw new MailDeliveryError('SMTP_TEMPORARY_NOT_ACCEPTED',true,true);}});
    await failed.drain();
    assert.equal((await prisma.taxEmissionIntent.findUnique({where:{idIntencion:own.record.idIntencion}})).emailEstado,'REINTENTO_PENDIENTE');
    // Accelerate only this disposable fixture's persisted backoff to test restart.
    await prisma.taxEmissionIntent.update({where:{idIntencion:own.record.idIntencion},data:{fechaProximoEmail:new Date(0)}});
    const restarted=await makeIssuer(mail),concurrent=await makeIssuer(mail);
    await Promise.all([restarted.drain(),concurrent.drain()]);
    await restarted.drain();await concurrent.drain();
    const result=await prisma.taxEmissionIntent.findUnique({where:{idIntencion:own.record.idIntencion}});
    assert.equal(result.emailEstado,'ENVIADO');assert.equal(result.emailIntentos,2);assert.equal(result.estado,'GENERADO');assert.equal(result.folio,folio);assert.equal(actualSmtpSends,1);
    const after=await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
    const delivered=after.messages.filter(m=>!beforeIds.has(m.ID));assert.equal(delivered.length,1);assert.equal(delivered[0].Attachments,1);
    const existingAfter=await prisma.taxEmissionIntent.findMany({where:{idIntencion:{in:existing.map(r=>r.idIntencion)}},select:{idIntencion:true,estado:true,folio:true,emailEstado:true,emailIntentos:true}});
    assert.deepEqual(existingAfter,existing);
    console.log(JSON.stringify({result:'PASS',date:'2026-10-04',database:name,provider:'SIMULATED_FOR_SMTP_QA',providerCalls:0,emissions:0,
      transientFailure:'INJECTED_NOT_ACCEPTED',restartRecovery:'PASS',concurrentClaim:'PASS',replay:'PASS',actualSmtpSends,
      inbox:'LOCAL_MAILPIT',inboxMessages:delivered.length,attachments:delivered[0].Attachments,mailpitMessageId:delivered[0].ID,
      emailAttempts:result.emailIntentos,existingDocumentsUnchanged:true,externalDeliveryVerified:false}));
  } finally {
    await prisma.taxEmissionIntent.delete({where:{idIntencion:own.record.idIntencion}});
    await prisma.taxPaymentJob.delete({where:{idPago:own.payment.idPago}});
    await prisma.pago.delete({where:{idPago:own.payment.idPago}});
    await prisma.factura.delete({where:{idFactura:own.invoice.idFactura}});
    await prisma.contrato.delete({where:{idContrato:own.contract.idContrato}});
    await prisma.cliente.delete({where:{idCliente:own.customer.idCliente}});
  }
}
main().catch(error=>{console.error(JSON.stringify({result:'FAIL',code:error.code || error.name}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
