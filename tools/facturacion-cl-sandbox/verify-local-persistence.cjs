/* Real PostgreSQL, fake dispatcher. Never calls Facturacion.cl or SMTP.
 * Requires the exclusive Docker QA database and backend/root dependencies. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const parsed = require('dotenv').parse(fs.readFileSync(path.join(root,'.env.facturacion-local')));
const prisma = new PrismaClient({datasources:{db:{url:`postgresql://postgres:${encodeURIComponent(parsed.FACTURACION_LOCAL_DB_PASSWORD)}@127.0.0.1:5433/fsm_facturacion_local?schema=public`}}});
require.extensions['.ts']=(module, filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,filename);
const { PrismaTaxIntentStore } = require('../../backend/src/tax-document-issuance/prisma-tax-intent.store.ts');
const { TaxEmissionIntentService } = require('../../backend/src/tax-document-issuance/tax-emission-intent.service.ts');

(async()=>{
  const [{name}] = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(name,'fsm_facturacion_local');
  const customer=await prisma.cliente.create({data:{idEmpresa:1,nombreCompleto:'QA PERSISTENCE '+randomUUID(),estado:'Activo'}});
  const contract=await prisma.contrato.create({data:{idEmpresa:1,idCliente:customer.idCliente,fechaInicio:new Date(),diaVencimiento:28,estado:'Activo'}});
  const invoice=await prisma.factura.create({data:{idContrato:contract.idContrato,periodoMes:10,periodoAnio:2026,monto:100,fechaLimitePago:new Date('2026-10-28'),estado:'Pendiente'}});
  const payment=await prisma.pago.create({data:{idCliente:customer.idCliente,idFactura:invoice.idFactura,monto:100,fechaPago:new Date(),pasarela:'QA PERSISTENCE'}});
  const store=new PrismaTaxIntentStore(prisma);
  const input={idEmpresa:1,idFactura:invoice.idFactura,idPago:payment.idPago,ambiente:'sandbox',businessKey:'QA:'+randomUUID(),policyVersion:'PER_PAYMENT_V1',document:{bytes:Buffer.from('FAKE_NOT_A_DTE'),tipoDte:39,formato:1,folio:'0',folioMode:'provider_auto'}};
  let dispatches=0;
  const dispatcher={canIssue:()=>true,dispatch:async()=>{dispatches++;return{state:'GENERADO',folio:'999000001',tipoDte:39};}};
  const service=new TaxEmissionIntentService(store,dispatcher);
  try {
    const prepared=await service.prepare(input);
    const result=await Promise.all([service.execute(input),service.execute(input)]);
    assert.equal(dispatches,1);assert(result.some(row=>row.estado==='GENERADO'));
    const restarted=new TaxEmissionIntentService(new PrismaTaxIntentStore(prisma),dispatcher);
    assert.equal((await restarted.execute(input)).estado,'GENERADO');assert.equal(dispatches,1);
    await assert.rejects(()=>restarted.prepare({...input,document:{...input.document,bytes:Buffer.from('CHANGED')}}),/TAX_INTENT_CONTENT_CONFLICT/);
    await assert.rejects(()=>prisma.taxEmissionIntent.update({where:{idIntencion:prepared.idIntencion},data:{folio:null}}));
    const failedInput={...input,businessKey:'QA:'+randomUUID()};let attempts=0;
    const failedService=new TaxEmissionIntentService(store,{canIssue:()=>true,dispatch:async()=>{attempts++;return attempts===1?{state:'FALLIDO',code:'CONFIRMED_NOT_SENT'}:{state:'RESULTADO_INDETERMINADO'};}});
    assert.equal((await failedService.execute(failedInput)).estado,'FALLIDO');
    assert.equal((await failedService.execute(failedInput)).estado,'RESULTADO_INDETERMINADO');
    assert.equal((await new TaxEmissionIntentService(store,{canIssue:()=>true,dispatch:async()=>{throw Error('MUST_NOT_DISPATCH');}}).execute(failedInput)).estado,'RESULTADO_INDETERMINADO');
    assert.equal(attempts,2);
    console.log(JSON.stringify({database:name,concurrentDispatches:dispatches,restartReplay:'PASS',fingerprintConflict:'PASS',generatedNullFolioConstraint:'PASS',confirmedNotSentRetry:'PASS',uncertainResendBlocked:'PASS',providerCalls:0,smtpCalls:0}));
  } finally {
    // Remove only this script's synthetic records from the verified QA database.
    await prisma.taxEmissionIntent.deleteMany({where:{idFactura:invoice.idFactura}});
    await prisma.pago.delete({where:{idPago:payment.idPago}});
    await prisma.factura.delete({where:{idFactura:invoice.idFactura}});
    await prisma.contrato.delete({where:{idContrato:contract.idContrato}});
    await prisma.cliente.delete({where:{idCliente:customer.idCliente}});
  }
})().catch(error=>{console.error(JSON.stringify({result:'FAIL',code:error.code||error.name}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
