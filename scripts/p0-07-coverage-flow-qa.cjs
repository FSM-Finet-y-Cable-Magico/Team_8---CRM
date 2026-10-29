'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifyDatabase}=require('./p0-05-qa-isolation.cjs');
module.exports=async function verifyFlow({origin,accounts,controlKey,db,capability,onStep}) {
  const u=new URL(origin);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');await verifyDatabase(db,capability);
  assert.equal(await db.prospecto.count(),0,'Requires new exclusive QA');
  const tokens={},cases=[];
  const hash=value=>createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)).digest('hex');
  async function call(role,route,{method='GET',body,status=200,pdf=false}={}) {
    const r=await fetch(new URL(route,origin),{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,status,`${method} ${route}: ${r.status}`);return pdf?Buffer.from(await r.arrayBuffer()):r.json();
  }
  const attestation=await fetch(new URL('/__qa/evidence',origin),{headers:{'X-QA-Control':controlKey},redirect:'error'}).then(r=>r.json());
  assert.equal(attestation.runId,capability.runId);assert.equal(attestation.isolation.initialPublicTables,0);
  for(const a of accounts){const login=await call(null,'/api/auth/login',{method:'POST',body:{email:a.email,password:a.password},status:201});tokens[a.alias]=login.accessToken;assert.ok(tokens[a.alias]);}
  const run=async(name,fn)=>{try{const detail=await fn();cases.push({name,status:'PASS',detail});onStep(cases);}
    catch(e){cases.push({name,status:'FAIL',code:e.code||e.name});onStep(cases);throw e;}};
  const beforeZones=hash(await call('finet','/api/coverage/zones?idEmpresa=1'));
  const rut=number=>{let n=number,sum=0,factor=2;while(n){sum+=(n%10)*factor;n=Math.floor(n/10);factor=factor===7?2:factor+1;}const d=11-sum%11;return `${number}-${d===11?'0':d===10?'K':d}`;};
  const create=(number,lat=-33.475,lng=-70.675)=>call('finet','/api/prospects',{method:'POST',status:201,body:{rut:rut(number),nombreCompleto:'Regresion cobertura QA '+number,
    email:`flow-${number}@example.invalid`,telefono:'+56900000005',direccion:'Calle sintetica QA 505, Santiago',comuna:'Santiago',region:'Metropolitana',origenContacto:'Formulario web',ubicacion:{latitud:lat,longitud:lng}}});
  await run('company_coverage_and_isolation',async()=>{
    const f=await call('finet','/api/coverage/check',{method:'POST',status:201,body:{idEmpresa:1,latitud:-33.475,longitud:-70.675}});
    const c=await call('cable','/api/coverage/check',{method:'POST',status:201,body:{idEmpresa:2,latitud:-33.475,longitud:-70.475}});
    assert.equal(f.estado,'FACTIBLE');assert.deepEqual(f.planes.map(p=>p.idPlan),[1]);assert.equal(c.estado,'FACTIBLE');assert.deepEqual(c.planes.map(p=>p.idPlan),[2]);
    await call('finet','/api/coverage/zones?idEmpresa=2',{status:403});return {finet:'FACTIBLE',cable:'FACTIBLE',crossCompany:403};
  });
  const p=await create(99000005);assert.equal(p.cobertura.estado,'FACTIBLE');
  await run('reject_without_quote_inactive_and_foreign_plan',async()=>{
    await call('finet',`/api/prospects/${p.idProspecto}/contracts`,{method:'POST',body:{planId:1},status:400});
    const inactive=await db.plan.create({data:{idEmpresa:1,nombreComercial:'QA inactivo para rechazo',tipoPlan:'Internet',tipoCliente:'Residencial',precioMensual:19990,activo:false}});
    for(const id of [inactive.idPlan,2])await call('finet',`/api/prospects/${p.idProspecto}/contracts`,{method:'POST',body:{planId:id},status:400});
    assert.equal(await db.contrato.count({where:{idProspecto:p.idProspecto}}),0);return {rejections:3,contracts:0};
  });
  await run('quote_pdf_and_persisted_plan_after_new_login',async()=>{
    const quote=await call('finet',`/api/prospects/${p.idProspecto}/quotes`,{method:'POST',body:{planId:1},status:201});
    const bytes=await call('finet','/api'+quote.pdfUrl,{pdf:true});assert.equal(bytes.subarray(0,4).toString(),'%PDF');
    const filename=`coverage-quote-${capability.runId}.pdf`;fs.writeFileSync(path.join(__dirname,'../docs/entrega-final/evidencias-qa',filename),bytes,{flag:'wx'});
    const account=accounts.find(a=>a.alias==='finet');tokens.finet=(await call(null,'/api/auth/login',{method:'POST',status:201,body:{email:account.email,password:account.password}})).accessToken;
    const reloaded=(await call('finet','/api/prospects')).find(row=>row.idProspecto===p.idProspecto);
    assert.equal(reloaded.estadoPipeline,'Cotizacion Enviada');assert.ok(reloaded.cotizaciones.some(q=>q.idPlan===1&&q.fechaEnvio));
    return {prospect:p.idProspecto,quote:quote.idCotizacion,persistedPlan:1,pdf:filename,pdfSha256:hash(bytes),visualReviewed:false};
  });
  await run('concurrent_confirmation_single_pending_contract',async()=>{
    const responses=await Promise.all([1,2].map(()=>call('finet',`/api/prospects/${p.idProspecto}/contracts`,{method:'POST',status:201,body:{planId:1}})));
    assert.equal(responses[0].contrato.idContrato,responses[1].contrato.idContrato);
    assert.equal(responses[0].contrato.estado,'Pendiente firma contrato');assert.equal(await db.contrato.count({where:{idProspecto:p.idProspecto}}),1);
    return {contract:responses[0].contrato.idContrato,contracts:1,state:'Pendiente firma contrato',concurrentRequests:2};
  });
  await run('outside_coverage_rejected_and_location_updates',async()=>{
    const outside=await create(99000006,-35,-72);assert.equal(outside.cobertura.estado,'NO_FACTIBLE');
    for(const route of ['quotes','contracts'])await call('finet',`/api/prospects/${outside.idProspecto}/${route}`,{method:'POST',body:{planId:1},status:400});
    const moved=await call('finet',`/api/prospects/${outside.idProspecto}/feasibility/tomodat`,{method:'POST',status:201,body:{latitud:-33.475,longitud:-70.675}});
    assert.equal(moved.cobertura.estado,'FACTIBLE');return {prospect:outside.idProspecto,initial:'NO_FACTIBLE',updated:'FACTIBLE',contracts:await db.contrato.count({where:{idProspecto:outside.idProspecto}})};
  });
  await run('lost_prospect_rejected',async()=>{
    const lost=await create(99000007);await call('finet',`/api/prospects/${lost.idProspecto}/quotes`,{method:'POST',body:{planId:1},status:201});
    await call('finet',`/api/prospects/${lost.idProspecto}/loss`,{method:'POST',body:{motivo:'Otro',observaciones:'Caso sintetico de rechazo'},status:201});
    await call('finet',`/api/prospects/${lost.idProspecto}/contracts`,{method:'POST',body:{planId:1},status:400});
    return {prospect:lost.idProspecto,contracts:await db.contrato.count({where:{idProspecto:lost.idProspecto}})};
  });
  await run('zones_prices_and_manual_principal_preserved',async()=>{
    assert.equal(hash(await call('finet','/api/coverage/zones?idEmpresa=1')),beforeZones);
    assert.equal(await db.prospecto.count({where:{rut:'99000001-8'}}),0);
    const page=await fetch(origin,{redirect:'error'});assert.equal(page.status,200);
    const csp=page.headers.get('content-security-policy');assert.ok(csp.includes("connect-src 'self'"));assert.ok(csp.includes("img-src 'self' data: blob: https://tile.openstreetmap.org;"));
    return {zonesAndPricesUnchanged:true,manualPrincipalAbsent:true,cspTileOriginOnly:true,externalTilesFetched:false};
  });
  return cases;
};
