'use strict';
// Only newly created, attested PostgreSQL clusters. Never accepts a caller database URL.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {createCluster,verifyDatabase}=require('./p0-05-qa-isolation.cjs');
require('./qa-loopback-only.cjs');
const root=path.resolve(__dirname,'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const migrationPath='backend/prisma/migrations/20261022010000_i3_tax_production_preparation/migration.sql';
const evidence={startedAt:new Date().toISOString(),status:'QA_FAIL',externalCalls:0,productionWrites:0,cases:[],runs:[]};
async function record(name,work){const entry={name,status:'FAIL'};evidence.cases.push(entry);const result=await work();Object.assign(entry,{status:'PASS',...result});}
async function rejected(work,code){await assert.rejects(work,error=>code?error.code===code:true);}
async function run(mode,canonical,migration,global,verify){
  const {PrismaClient}=require('@prisma/client');
  let cluster,db,second;
  const runEvidence={mode,cleanup:false};evidence.runs.push(runEvidence);
  try {
    cluster=await createCluster(process.argv[2]||'C:/Program Files/PostgreSQL/18/bin');
    db=new PrismaClient({datasources:{db:{url:cluster.capability.url}}});
    second=new PrismaClient({datasources:{db:{url:cluster.capability.url}}});
    const identity=await verifyDatabase(db,cluster.capability);await verifyDatabase(second,cluster.capability);
    Object.assign(runEvidence,{runId:cluster.capability.runId,engine:cluster.version,host:identity.host});
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(),'0');
    assert.doesNotMatch(canonical,/^\s*\\/m);
    // Reconstruct only the two previous tax definitions; all other objects stay canonical.
    const previous=canonical.replace("CONSTRAINT tax_job_environment_check CHECK (ambiente IN ('sandbox', 'production'))",
      "CONSTRAINT tax_payment_job_ambiente_check CHECK (ambiente = 'sandbox')")
      .replace('ON tax_payment_job (id_empresa, ambiente, tipo_dte, folio_esperado)','ON tax_payment_job (id_empresa, tipo_dte, folio_esperado)');
    assert.notEqual(previous,canonical);
    cluster.sql(mode==='upgrade'?previous:canonical);
    const c1=await db.empresa.create({data:{nombre:'QA FiNet'}}),c2=await db.empresa.create({data:{nombre:'QA Cable Magico'}});
    const customer=await db.cliente.create({data:{idEmpresa:c1.idEmpresa,rut:'66666666-6',nombreCompleto:'Identidad sintetica compartida',estado:'Moroso'}});
    const operator=await db.usuario.create({data:{idEmpresa:c1.idEmpresa,nombreCompleto:'Operador QA',passwordHash:'NO_LOGIN_QA'}});
    const contracts=[];
    for(const company of [c1,c2]) contracts.push(await db.contrato.create({data:{idEmpresa:company.idEmpresa,idCliente:customer.idCliente,
      fechaInicio:new Date('2026-01-01'),diaVencimiento:10,estado:'Activo'}}));
    async function invoice(company=0,monto=7000){return db.factura.create({data:{idContrato:contracts[company].idContrato,
      periodoMes:1,periodoAnio:2026,monto,fechaLimitePago:new Date('2026-01-10'),estado:'Pendiente'}});}
    async function payment(company=0){const i=await invoice(company);return db.pago.create({data:{idFactura:i.idFactura,idCliente:customer.idCliente,
      monto:100,fechaPago:new Date(),pasarela:'QA'}});}
    async function job(p,company,ambiente,folio='100') {return db.taxPaymentJob.create({data:{idEmpresa:company,idFactura:p.idFactura,idPago:p.idPago,idCliente:customer.idCliente,
      monto:100,ambiente,policyVersion:'QA',profileHash:'a'.repeat(64),documento:Buffer.from('SYNTHETIC_NO_FISCAL_VALUE'),tipoDte:34,formato:2,folioEsperado:folio,nombreCliente:'QA'}});}
    const oldPayment=await payment();const historical=await job(oldPayment,c1.idEmpresa,'sandbox');
    const oldIntent=await db.taxEmissionIntent.create({data:{idEmpresa:c1.idEmpresa,idFactura:oldPayment.idFactura,idPago:oldPayment.idPago,
      businessKey:`PAYMENT:${oldPayment.idPago}`,ambiente:'sandbox',policyVersion:'QA',tipoDte:34,formato:2,folioEsperado:'100',folio:'100',
      fingerprint:'a'.repeat(64),estado:'GENERADO'}});
    const before=await db.taxPaymentJob.findUnique({where:{idPago:oldPayment.idPago}});
    if(mode==='upgrade') {
      await record('legacy_rejects_production',async()=>{await rejected(()=>job(oldPayment,c1.idEmpresa,'production'));return {};});
      // Deliberate failure after the migration body proves its transactional DDL rolls back.
      await record('migration_rollback_preserves_history_and_old_constraint',async()=>{
        assert.throws(()=>cluster.sql(migration.replace(/COMMIT;/,'SELECT 1 / 0; COMMIT;')));
        assert.equal(cluster.sql("SELECT count(*) FROM pg_constraint WHERE conname='tax_payment_job_ambiente_check'").trim(),'1');
        assert.deepEqual(await db.taxPaymentJob.findUnique({where:{idPago:oldPayment.idPago}}),before);
        assert.deepEqual(await db.taxEmissionIntent.findUnique({where:{idIntencion:oldIntent.idIntencion}}),oldIntent);return {historicalRows:2};
      });
      cluster.sql(migration);
      await record('migration_preserves_historical_snapshot',async()=>{
        assert.deepEqual(await db.taxPaymentJob.findUnique({where:{idPago:oldPayment.idPago}}),before);
        assert.deepEqual(await db.taxEmissionIntent.findUnique({where:{idIntencion:oldIntent.idIntencion}}),oldIntent);return {historicalRows:2};
      });
    }
    await record(mode+'_canonical_catalog',async()=>{
      const result=verify.compareCatalog(global,await verify.readCatalog(db));
      assert.equal(result.status,'PASS',JSON.stringify(result.rows.filter(r=>r.status!=='MATCH').map(r=>({table:r.table,name:r.name,status:r.status}))));
      return {catalogStatus:result.status,counts:result.counts};
    });
    await record(mode+'_unique_payment_environment_and_folio',async()=>{
      const p2=await payment(),p3=await payment(1),p4=await payment();
      await job(p2,c1.idEmpresa,'production');await job(p3,c2.idEmpresa,'sandbox');
      await rejected(()=>job(oldPayment,c1.idEmpresa,'production','200'),'P2002');
      await rejected(()=>job(p4,c1.idEmpresa,'sandbox'),'P2002');
      await rejected(()=>job(p4,c1.idEmpresa,'invalid','200'));
      await rejected(()=>job(p4,c1.idEmpresa,'sandbox','invalid'));
      await rejected(()=>db.taxPaymentJob.update({where:{idTrabajo:historical.idTrabajo},data:{monto:0}}));
      await rejected(()=>db.taxPaymentJob.update({where:{idTrabajo:historical.idTrabajo},data:{documento:null}}));
      await rejected(()=>db.taxPaymentJob.update({where:{idTrabajo:historical.idTrabajo},data:{formato:1}}));
      await rejected(()=>db.taxPaymentJob.update({where:{idTrabajo:historical.idTrabajo},data:{profileHash:'invalid'}}));
      assert.equal(await db.taxPaymentJob.count(),3);return {jobs:3,paymentUniqueAcrossEnvironments:true};
    });
    const {PrismaTaxIntentStore}=require('../backend/dist/tax-document-issuance/prisma-tax-intent.store');
    const store=new PrismaTaxIntentStore(db),otherStore=new PrismaTaxIntentStore(second);
    const {FacturacionClIssuer}=require('../backend/dist/tax-document-issuance/facturacion-cl.issuer');
    // Access method only: do not initialize timers/configuration/dispatchers.
    const access=Object.create(FacturacionClIssuer.prototype);access.prisma=db;
    const sharedPayment=await payment(1);
    const input={idEmpresa:c2.idEmpresa,idFactura:sharedPayment.idFactura,idPago:sharedPayment.idPago,businessKey:`PAYMENT:${sharedPayment.idPago}`,
      ambiente:'sandbox',policyVersion:'QA',tipoDte:34,formato:2,folioEsperado:'222',fingerprint:'b'.repeat(64)};
    await record(mode+'_shared_customer_access_and_financial_integrity',async()=>{
      for(const role of ['Comercial','Soporte','Administrador']){
        const user={idUsuario:operator.idUsuario,idEmpresa:c2.idEmpresa,roles:[role]};
        assert.equal(await access.assertPaymentAccess(sharedPayment.idPago,user),c2.idEmpresa);
        if(role!=='Administrador')await rejected(()=>access.assertPaymentAccess(sharedPayment.idPago,{...user,idEmpresa:c1.idEmpresa}));
      }
      await rejected(()=>access.assertPaymentAccess(sharedPayment.idPago,{idEmpresa:c2.idEmpresa,roles:['Terreno']}));
      await rejected(()=>store.prepare({...input,idEmpresa:c1.idEmpresa}));
      await rejected(()=>store.prepare({...input,idPago:oldPayment.idPago}));
      const row=await store.prepare(input);const replay=await store.prepare(input);assert.equal(row.idIntencion,replay.idIntencion);
      const preserved=await store.prepare({...input,fingerprint:'c'.repeat(64)});assert.equal(preserved.fingerprint,input.fingerprint);
      assert.equal((await db.cliente.findUnique({where:{idCliente:customer.idCliente}})).idEmpresa,c1.idEmpresa);
      return {intentions:await db.taxEmissionIntent.count(),primaryCompanyUnchanged:true};
    });
    await record(mode+'_concurrent_claim_and_durable_idempotency',async()=>{
      const row=await store.prepare(input),a=randomUUID(),b=randomUUID();
      const results=await Promise.all([store.claim(row,a),otherStore.claim(row,b)]);assert.equal(results.filter(Boolean).length,1);
      const winner=results[0]?a:b;assert.equal(await store.beginDispatch(row,winner),true);assert.equal(await otherStore.beginDispatch(row,winner),false);
      await store.finish(row,winner,{estado:'GENERADO',folio:'222'});
      assert.equal(await otherStore.claim(row,randomUUID()),false);
      const replay=await otherStore.prepare(input);assert.equal(replay.estado,'GENERADO');assert.equal(replay.intentos,1);
      await rejected(()=>store.finish(row,randomUUID(),{estado:'FALLIDO',ultimoError:'CONFIRMED_NOT_SENT'}));
      const {TaxEmissionIntentService}=require('../backend/dist/tax-document-issuance/tax-emission-intent.service');
      const service=new TaxEmissionIntentService(store,{dispatch:()=>{throw Error('NO_EXTERNAL_DISPATCH_ALLOWED');}});
      await rejected(()=>service.execute({...input,document:{bytes:Buffer.from('different'),tipoDte:34,formato:2,folio:'222'}}));
      return {claimsWon:1,dispatchClaims:1,externalSends:0,finalState:'GENERADO'};
    });
    await record(mode+'_generated_folio_scoped_to_company_and_environment',async()=>{
      const base={...input,businessKey:'QA:SECOND',estado:'GENERADO',folio:'222'};
      await rejected(()=>db.taxEmissionIntent.create({data:base}),'P2002');
      await db.taxEmissionIntent.create({data:{...base,ambiente:'production'}});
      await db.taxEmissionIntent.create({data:{...base,idEmpresa:c1.idEmpresa,idPago:oldPayment.idPago,idFactura:oldPayment.idFactura}});
      return {generated:await db.taxEmissionIntent.count({where:{estado:'GENERADO'}})};
    });
    await record(mode+'_full_tax_pipeline_fake_transport_both_environments',async()=>{
      const {ConfigService}=require('@nestjs/config');
      const {FacturacionClConfigService}=require('../backend/dist/tax-document-issuance/facturacion-cl-config.service');
      const {FacturacionClPaymentConfig}=require('../backend/dist/tax-document-issuance/facturacion-cl-payment.config');
      const originalFetch=globalThis.fetch,emissions=[],deliveries=[];
      globalThis.fetch=async(input,options)=>{
        const url=new URL(String(input));assert.equal(options.redirect,'error');
        if(url.origin==='https://rest.facturacion.cl'&&url.pathname==='/login'){
          const credentials=JSON.parse(options.body);assert.match(credentials.usuario,/^SYNTHETIC_[12]$/);
          return new Response(JSON.stringify({token:credentials.usuario}));
        }
        if(url.origin==='https://rest.facturacion.cl'&&url.pathname==='/wsds/procesar'){
          emissions.push(options.headers.Authorization);
          return new Response(JSON.stringify({WSPLANO:{Resultado:'True',Detalle:{Documento:{Resultado:'True',TipoDte:'39',Folio:String(900000+emissions.length)}}}}));
        }
        if(url.origin==='https://rest.facturacion.cl'&&url.pathname==='/wsds/obtenerlink')return new Response(JSON.stringify({WSPLANO:{Mensaje:
          Buffer.from('https://www.facturacion.cl/sistema/descargar.php?fixture=QA').toString('base64')}}));
        if(url.origin==='https://www.facturacion.cl'&&url.pathname==='/sistema/descargar.php'){
          assert.equal(options.headers,undefined);return new Response('%PDF-1.7\nSYNTHETIC_QA_ONLY\n',{headers:{'content-type':'application/pdf'}});
        }
        throw Error('UNEXPECTED_FAKE_PROVIDER_REQUEST');
      };
      try {
        for(const environment of ['sandbox','production']){
          const profiles=[c1,c2].map(c=>({idEmpresa:c.idEmpresa,approved:true,issuerRut:'66666666-6',defaultDocumentType:'BOLETA',receipt:{tipoDte:39,encoding:'utf8',serviceIndicator:3}}));
          const values={FACTURACION_CL_INTEGRATION_ENABLED:'true',FACTURACION_CL_PRODUCTION_ENABLED:'true',FACTURACION_CL_DELIVERY_ENABLED:'true',
            FACTURACION_CL_COMPANIES:JSON.stringify([c1,c2].map(c=>({idEmpresa:c.idEmpresa,alias:'QA'+c.idEmpresa,environment,enabled:true}))),FACTURACION_CL_PROFILES:JSON.stringify(profiles)};
          for(const c of [c1,c2])values['FACTURACION_CL_QA'+c.idEmpresa+'_'+environment.toUpperCase()+'_CREDENTIALS']=JSON.stringify({usuario:'SYNTHETIC_'+c.idEmpresa,rut:'66666666-6',clave:'SYNTHETIC_ONLY'});
          const config=new ConfigService(values);
          const issuer=new FacturacionClIssuer(db,new FacturacionClPaymentConfig(config,new FacturacionClConfigService(config)),
            {isConfigured:()=>true,sendTaxDocument:async message=>{deliveries.push(message.idEmpresa);return{status:'simulated'};}},{record:()=>{throw Error('UNEXPECTED_RECOVERY_WRITE');}});
          try {
            await issuer.onModuleInit();issuer.onModuleDestroy();
            for(const [i,c] of [c1,c2].entries()){
              const p=await payment(i);const before=emissions.length;
              await db.$transaction(tx=>issuer.enqueuePayment(tx,{idEmpresa:c.idEmpresa,idFactura:p.idFactura,idPago:p.idPago,idCliente:customer.idCliente,monto:'100',
                periodoMes:1,periodoAnio:2026,fechaLimitePago:new Date('2026-01-10'),tipoDocumento:null,folioExterno:null,
                receiver:{rut:customer.rut,name:'QA',giro:'',address:'QA',comuna:'QA',city:'QA',email:'qa@example.invalid'}}));
              await Promise.allSettled([issuer.processPayment(p.idPago),issuer.processPayment(p.idPago)]);
              const processed=await issuer.processPayment(p.idPago);
              evidence.lastPipelineCheck={environment,company:c.idEmpresa,state:processed.state,code:processed.code??null,simulatedEmissions:emissions.length};
              assert.equal(processed.state,'GENERADO');
              assert.equal(emissions.length,before+1);
              const user={idUsuario:operator.idUsuario,idEmpresa:c.idEmpresa,roles:['Comercial']};
              const history=await issuer.paymentState(p.idPago,user);assert.equal(history.intention.ambiente,environment);assert.equal(history.intention.emailEstado,'SIMULADO');
              const sent=deliveries.length;await issuer.recoverArtifacts(p.idPago,user);
              assert.equal(emissions.length,before+1);assert.equal(deliveries.length,sent);
            }
          }finally{issuer.onModuleDestroy();}
        }
        assert.deepEqual(emissions,['SYNTHETIC_1','SYNTHETIC_2','SYNTHETIC_1','SYNTHETIC_2']);assert.deepEqual(deliveries,[1,2,1,2]);
        return {simulatedEmissions:4,simulatedDeliveries:4,externalRequests:0,duplicateEmissions:0};
      }finally{globalThis.fetch=originalFetch;}
    });
    await record(mode+'_agreement_gap_reproduced_without_repair',async()=>{
      const {BillingService}=require('../backend/dist/billing/billing.service');
      const {AuditService}=require('../backend/dist/audit/audit.service');
      const {ConfigService}=require('@nestjs/config');
      const billing=new BillingService(db,new AuditService(db),new ConfigService({}));
      const debt=await invoice(1),untouched=await invoice(0);
      const agreement=await db.convenioPago.create({data:{idEmpresa:c2.idEmpresa,idCliente:customer.idCliente,idContrato:contracts[1].idContrato,
        idFactura:debt.idFactura,montoComprometido:7000,cantidadCuotas:2,condiciones:'QA: sin imputacion automatica autorizada',fechaInicio:new Date('2026-01-01'),
        estado:'APROBADO',idUsuarioResponsable:operator.idUsuario,cuotas:{create:[{numero:1,monto:3500,fechaVencimiento:new Date('2026-01-10')},{numero:2,monto:3500,fechaVencimiento:new Date('2026-02-10')}]}}});
      const user={idUsuario:operator.idUsuario,idEmpresa:c2.idEmpresa,roles:['Comercial']};
      const dto={idFactura:debt.idFactura,monto:3500,pasarela:'QA',codigoTransaccion:'QA-'+randomUUID(),codigoAutorizacion:'QA-AUTH',fechaPago:'2026-10-29T12:00:00.000Z'};
      await rejected(()=>billing.registerPayment(dto,{...user,idEmpresa:c1.idEmpresa}));
      const first=await billing.registerPayment(dto,user,{idEmpresa:c2.idEmpresa});assert.equal(first.saldoPendiente,3500);
      const retry=await billing.registerPayment(dto,user,{idEmpresa:c2.idEmpresa});assert.equal(retry.duplicate,true);
      await billing.registerPayment({...dto,codigoTransaccion:'QA-'+randomUUID()},user,{idEmpresa:c2.idEmpresa});
      assert.equal((await db.factura.findUnique({where:{idFactura:debt.idFactura}})).estado,'Pagada');
      const quotas=await db.cuotaConvenioPago.findMany({where:{idConvenio:agreement.idConvenio}});
      assert.deepEqual(quotas.map(q=>q.estado),['PENDIENTE','PENDIENTE']);assert.ok(quotas.every(q=>q.fechaPago===null));
      assert.equal(await db.pago.count({where:{idFactura:debt.idFactura}}),2);
      assert.equal(await db.logAuditoria.count({where:{accion:'REGISTRAR_PAGO_G2'}}),2);
      assert.deepEqual(await db.factura.findUnique({where:{idFactura:untouched.idFactura}}),untouched);
      assert.equal((await db.cliente.findUnique({where:{idCliente:customer.idCliente}})).estado,'Moroso');
      return {invoice:'Pagada',payments:2,installments:['PENDIENTE','PENDIENTE'],audits:2,functionalStatus:'BLOCKED_BUSINESS_DECISION',historicalRepairs:0};
    });
  } finally {
    if(second)await second.$disconnect();if(db)await db.$disconnect();
    if(cluster){cluster.stop();runEvidence.cleanup=true;}
  }
}
async function main(){
  const output=path.join(root,'.codex-review','tax-qa-'+randomUUID()+'.json');fs.mkdirSync(path.dirname(output),{recursive:true});
  try{
    const canonical=fs.readFileSync(path.join(root,'db/global/init-global.sql'),'utf8');
    const migration=fs.readFileSync(path.join(root,migrationPath),'utf8');
    const {parseGlobalSchema}=await import(pathToFileURL(path.join(__dirname,'global-schema.mjs')).href);
    const verify=await import(pathToFileURL(path.join(__dirname,'verify-global-db.mjs')).href);
    const global=parseGlobalSchema();evidence.canonicalSHA256=hash(Buffer.from(canonical));evidence.migrationSHA256=hash(migration);
    for(const mode of ['upgrade','fresh'])await run(mode,canonical,migration,global,verify);
    evidence.status='QA_PASS';evidence.agreementsStatus='BLOCKED_BUSINESS_DECISION';
  }catch(error){evidence.error={code:error.code||error.name,
    location:String(error.stack||'').split('\n').find(line=>line.includes('i4-tax-postgresql-qa.cjs:')&&line.trim().startsWith('at '))?.trim()};
    console.error('QA scenario failed:',error.code||error.name,evidence.error.location||'');}
  finally{evidence.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,evidence:output,cases:evidence.cases.length}));}
  if(evidence.status!=='QA_PASS')process.exitCode=1;
}
void main();
