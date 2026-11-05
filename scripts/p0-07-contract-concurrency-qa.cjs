'use strict';
// Fresh, attested PostgreSQL only; all identities and commercial records are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {createCluster,verifyDatabase}=require('./p0-05-qa-isolation.cjs');
require('./qa-loopback-only.cjs');
const root=path.resolve(__dirname,'..');
const {PrismaClient}=require('@prisma/client');
const {ProspectsService}=require('../backend/dist/prospects/prospects.service');
const {ContractsService}=require('../backend/dist/contracts/contracts.service');
const {AuditService}=require('../backend/dist/audit/audit.service');
const result={status:'QA_FAIL',cases:[],externalCalls:0,cleanup:false};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function main(){
  let cluster,db,other,observer;
  const output=path.join(root,'.codex-review',`contract-concurrency-qa-${randomUUID()}.json`);
  try{
    const {parseGlobalSchema}=await import('./global-schema.mjs');parseGlobalSchema();
    cluster=await createCluster('C:/Program Files/PostgreSQL/18/bin');
    const url=new URL(cluster.capability.url);url.searchParams.set('connection_limit','1');
    db=new PrismaClient({datasources:{db:{url:url.toString()}}});
    other=new PrismaClient({datasources:{db:{url:url.toString()}}});
    observer=new PrismaClient({datasources:{db:{url:url.toString()}}});
    for(const client of [db,other,observer])await verifyDatabase(client,cluster.capability);
    assert.equal(cluster.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(),'0');
    const sql=fs.readFileSync(path.join(root,'db/global/init-global.sql'),'utf8');assert.doesNotMatch(sql,/^\s*\\/m);cluster.sql(sql);
    result.environment={postgres:cluster.version,runId:cluster.capability.runId,host:'127.0.0.1',independentConnections:3};
    result.sourceSHA256=Object.fromEntries(['prospects/prospects.service','contracts/contracts.service'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,'backend/src',name+'.ts'))).digest('hex')]));
    const company=await db.empresa.create({data:{nombre:'Empresa sintetica QA'}});
    const operator=await db.usuario.create({data:{idEmpresa:company.idEmpresa,nombreCompleto:'QA',passwordHash:'QA_NO_LOGIN'}});
    const user={idUsuario:operator.idUsuario,idEmpresa:company.idEmpresa,roles:['Comercial'],nombreCompleto:'QA',email:null};
    const plan=await db.plan.create({data:{idEmpresa:company.idEmpresa,nombreComercial:'Plan sintetico',tipoPlan:'Internet',tipoCliente:'Residencial',precioMensual:7000,activo:true}});
    const coverage={check:async()=>({estado:'FACTIBLE'}),plansForLocation:async()=>({coberturaComercial:true,planes:[{idPlan:plan.idPlan}]})};
    const service=(client,provider=coverage)=>new ProspectsService(client,new AuditService(client),{},provider);
    const normal=service(other);
    let sequence=0;
    const rut=()=>{const base=99000001+sequence++;let n=base,sum=0,factor=2;while(n){sum+=(n%10)*factor;n=Math.floor(n/10);factor=factor===7?2:factor+1;}const digit=11-sum%11;return `${base}-${digit===11?'0':digit===10?'K':digit}`;};
    async function fixture(){const p=await db.prospecto.create({data:{idEmpresa:company.idEmpresa,nombreCompleto:'Prospecto sintetico',rut:rut(),telefono:'+56900000001',direccion:'Calle QA original',latitud:-33.47,longitud:-70.67,estadoPipeline:'Cotizacion Enviada'}});
      await db.cotizacion.create({data:{idProspecto:p.idProspecto,idPlan:plan.idPlan,fechaEnvio:new Date(),factibilidadVerificada:true}});return p;}
    async function run(name,fn){try{const detail=await fn();result.cases.push({name,status:'PASS',detail});}catch(error){result.cases.push({name,status:'FAIL',code:error.code||error.name});}}
    await run('location_committed_after_preflight_rejects_stale_contract',async()=>{
      const p=await fixture();
      const delayed=service(db,{...coverage,plansForLocation:async()=>{
        await normal.updateLocation(p.idProspecto,{ubicacion:{latitud:-35,longitud:-72},direccion:'Calle QA modificada'},user);
        return coverage.plansForLocation();
      }});
      await assert.rejects(()=>delayed.contractPlan(p.idProspecto,{planId:plan.idPlan},user),e=>e.getStatus?.()===409);
      assert.equal(await db.contrato.count({where:{idProspecto:p.idProspecto}}),0);
      assert.equal((await db.prospecto.findUniqueOrThrow({where:{idProspecto:p.idProspecto}})).direccion,'Calle QA modificada');
      return {contracts:0,conflict:409,locationPreserved:true};
    });
    await run('loss_committed_after_preflight_is_not_overwritten',async()=>{
      const p=await fixture();
      const delayed=service(db,{...coverage,plansForLocation:async()=>{
        await normal.recordLoss(p.idProspecto,{motivo:'Otro',observaciones:'Perdida sintetica QA'},user);
        return coverage.plansForLocation();
      }});
      await assert.rejects(()=>delayed.contractPlan(p.idProspecto,{planId:plan.idPlan},user),e=>e.getStatus?.()===409);
      assert.equal(await db.contrato.count({where:{idProspecto:p.idProspecto}}),0);
      assert.equal((await db.prospecto.findUniqueOrThrow({where:{idProspecto:p.idProspecto}})).estadoPipeline,'Perdido');
      return {contracts:0,state:'Perdido',conflict:409};
    });
    await run('confirmation_during_signature_rejects_without_deadlock',async()=>{
      const p=await fixture();
      const pending=await service(db).contractPlan(p.idProspecto,{planId:plan.idPlan},user);
      const ready=deferred(),release=deferred();let intercepted=false;
      const wrapper=new Proxy(db,{get(target,key){
        if(key==='$transaction')return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){
          if(k==='contrato')return new Proxy(t.contrato,{get(model,operation){
            if(operation==='findFirst')return async args=>{const found=await model.findFirst(args);if(!intercepted){intercepted=true;ready.resolve();await release.promise;}return found;};
            const value=model[operation];return typeof value==='function'?value.bind(model):value;
          }});
          const value=t[k];return typeof value==='function'?value.bind(t):value;
        }})),{timeout:20000});
        const value=target[key];return typeof value==='function'?value.bind(target):value;
      }});
      const [pidRow]=await other.$queryRaw`SELECT pg_backend_pid() AS pid`;
      const confirmation=service(wrapper).contractPlan(p.idProspecto,{planId:plan.idPlan},user);
      // Attach rejection handlers before scheduling either concurrent operation.
      const first=confirmation.then(value=>({ok:true,value}),error=>({ok:false,code:error.code||error.name,status:error.getStatus?.(),deadlock:/deadlock|40P01/i.test(error.message)}));
      await Promise.race([ready.promise,first.then(outcome=>{throw Error(outcome.code||'MISSING_BARRIER');})]);
      const signing=new ContractsService(other,new AuditService(other),{}).confirmManualSignature(pending.contrato.idContrato,{observacion:'Firma sintetica QA'},user);
      const second=signing.then(value=>({ok:true,value}),error=>({ok:false,code:error.code||error.name,status:error.getStatus?.(),deadlock:/deadlock|40P01/i.test(error.message)}));
      let observed=false;
      try{const until=Date.now()+10000;while(Date.now()<until){const rows=await observer.$queryRaw`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${pidRow.pid}`;
        if(rows[0]?.wait_event_type==='Lock'){observed=true;break;}await new Promise(r=>setTimeout(r,20));}}
      finally{release.resolve();}
      const outcomes=await Promise.all([first,second]);
      result.concurrentOutcomes={realLockContention:observed,outcomes:outcomes.map(o=>({ok:o.ok,code:o.code,status:o.status,deadlock:o.deadlock}))};
      assert.ok(observed,'Expected real lock contention');
      assert.ok(outcomes[0].ok || outcomes[0].status===409,'Confirmation must succeed or reject with controlled conflict');
      assert.ok(outcomes[1].ok,'Signing must complete without a deadlock');
      const final=await db.contrato.findUniqueOrThrow({where:{idContrato:pending.contrato.idContrato}});
      assert.equal(final.estado,'Firmado');assert.ok(final.fechaFirmaManual);
      assert.equal(await db.contrato.count({where:{idProspecto:p.idProspecto}}),1);
      return {realLockContention:true,contracts:1,state:'Firmado',deadlocks:0};
    });
    result.status=result.cases.every(c=>c.status==='PASS')?'QA_PASS':'QA_FAIL';
  }catch(error){result.error={code:error.code||error.name};}
  finally{for(const client of [db,other,observer])if(client)await client.$disconnect();if(cluster){cluster.stop();result.cleanup=true;}
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});}
  console.log(JSON.stringify({status:result.status,cases:result.cases.map(c=>({name:c.name,status:c.status,code:c.code})),cleanup:result.cleanup,evidence:output}));
  if(result.status!=='QA_PASS')process.exitCode=1;
}
main().catch(()=>{console.error('QA initialization failed');process.exitCode=1;});
