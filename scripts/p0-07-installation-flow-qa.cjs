'use strict';
// Writes only to the fresh, attested, owned QA cluster supplied by the launcher.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {verifyDatabase}=require('./p0-05-qa-isolation.cjs');
const {installationSnapshot}=require('../backend/dist/g3-integration/g3-integration.utils.js');
module.exports=async function verifyFlow({origin,accounts,controlKey,db,capability,stub,onStep,prepareOnly=false}) {
  for(const value of [origin,stub.origin]) {const u=new URL(value);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');}
  await verifyDatabase(db,capability);assert.equal(await db.prospecto.count(),0,'Requires fresh exclusive QA');
  const tokens={},cases=[],hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const run=async(name,fn)=>{try{cases.push({name,status:'PASS',detail:await fn()});onStep(cases);}
    catch(e){cases.push({name,status:'FAIL',code:e.code||e.name});onStep(cases);throw e;}};
  async function call(role,route,{method='GET',body,status=200,control=false}={}) {
    assert.ok(route.startsWith('/')&&!route.startsWith('//'));
    const r=await fetch(new URL(route,origin),{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{
      ...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...(control?{'X-QA-Control':controlKey}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,status,`${method} ${route}: ${r.status}`);return r.json();
  }
  const proof=await call(null,'/__qa/evidence',{control:true});assert.equal(proof.runId,capability.runId);assert.equal(proof.isolation.initialPublicTables,0);
  for(const a of accounts)tokens[a.alias]=(await call(null,'/api/auth/login',{method:'POST',body:{email:a.email,password:a.password},status:201})).accessToken;
  const rut=n=>{let v=n,s=0,f=2;while(v){s+=(v%10)*f;v=Math.floor(v/10);f=f===7?2:f+1;}const d=11-s%11;return `${n}-${d===11?'0':d===10?'K':d}`;};
  async function signed(n,comuna) {
    const p=await call('finet','/api/prospects',{method:'POST',status:201,body:{rut:rut(n),nombreCompleto:'Instalacion sintetica QA '+n,email:`installation-${n}@example.invalid`,telefono:'+56900000005',direccion:'Calle sintetica QA 505',...(comuna?{comuna}:{}),origenContacto:'Formulario web',ubicacion:{latitud:-33.475,longitud:-70.675}}});
    await call('finet',`/api/prospects/${p.idProspecto}/quotes`,{method:'POST',status:201,body:{planId:1}});
    const c=(await call('finet',`/api/prospects/${p.idProspecto}/contracts`,{method:'POST',status:201,body:{planId:1}})).contrato;
    await call('finet',`/api/contracts/${c.idContrato}/confirm-signature`,{method:'PATCH',body:{observacion:'Firma sintetica QA'}});
    return {p:p.idProspecto,c:c.idContrato};
  }
  const missing=await signed(99000005),complete=await signed(99000006,'Santiago');let t1,t2;
  if (prepareOnly) return { mode:'HTTP_FIXTURE_PREPARATION_NOT_VISUAL', company:1,
    missingComuna:{prospect:missing.p,contract:missing.c},withComuna:{prospect:complete.p,contract:complete.c},
    knownSyntheticComuna:'Santiago',trackingRows:await db.integracionInstalacionG3.count(),orders:stub.orders.size };
  const stored=id=>db.integracionInstalacionG3.findUniqueOrThrow({where:{idIntegracion:id}});
  await run('01_comuna_present_accepted',async()=>{
    t1=await call('finet','/api/integrations/g3/installations',{method:'POST',status:201,body:{idContrato:complete.c}});
    assert.equal(t1.estadoIntegracion,'ENVIADA');assert.ok(t1.idOtG3);return {contract:complete.c,tracking:t1.idIntegracion,ot:Number(t1.idOtG3)};
  });
  await run('02_missing_comuna_no_tracking',async()=>{
    const r=await call('finet','/api/integrations/g3/installation-requirements',{method:'POST',status:201,body:{idContrato:missing.c}});assert.equal(r.comunaFaltante,true);
    const e=await call('finet','/api/integrations/g3/installations',{method:'POST',status:400,body:{idContrato:missing.c}});assert.match(e.message,/comuna/);
    assert.equal(await db.integracionInstalacionG3.count({where:{idContrato:missing.c}}),0);return {status:400,trackingRows:0};
  });
  await run('03_authorized_missing_comuna_without_signed_contract_changes',async()=>{
    const beforeContract=hash(await db.contrato.findUniqueOrThrow({where:{idContrato:missing.c}}));
    const before=await db.prospecto.findUniqueOrThrow({where:{idProspecto:missing.p}});
    const quotes=hash(await db.cotizacion.findMany({where:{idProspecto:missing.p}}));
    const route=`/api/integrations/g3/contracts/${missing.c}/installation-data`,body={comuna:'Santiago',confirmarMismaDireccion:true};
    await call('cable',route,{method:'PATCH',body,status:403});await call('soporte',route,{method:'PATCH',body,status:403});
    await call('finet',route,{method:'PATCH',body:{...body,confirmarMismaDireccion:false},status:400});
    await call('finet',`/api/prospects/${missing.p}/location`,{method:'PATCH',body:{ubicacion:{latitud:-33.475,longitud:-70.675},direccion:'Cambio prohibido QA'},status:400});
    await call('finet',route,{method:'PATCH',body});
    const after=await db.prospecto.findUniqueOrThrow({where:{idProspecto:missing.p}});
    assert.equal(after.comuna,'Santiago');assert.deepEqual({...after,comuna:before.comuna},before);
    assert.equal(hash(await db.contrato.findUniqueOrThrow({where:{idContrato:missing.c}})),beforeContract);
    assert.equal(hash(await db.cotizacion.findMany({where:{idProspecto:missing.p}})),quotes);
    assert.equal(await db.logAuditoria.count({where:{accion:'COMPLETAR_COMUNA_INSTALACION',idEntidadAfectada:missing.p}}),1);
    await call('finet',route,{method:'PATCH',body:{...body,comuna:'Otra'},status:400});return {contractUnchanged:true,feasibilityUnchanged:true,onlyComunaChanged:true,auditRows:1};
  });
  await run('04_two_contracts_distinct_correlations',async()=>{
    t2=await call('finet','/api/integrations/g3/installations',{method:'POST',status:201,body:{idContrato:missing.c}});
    assert.notEqual(t1.requestId,t2.requestId);assert.notEqual(t1.traceId,t2.traceId);assert.notEqual(t1.idOtG3,t2.idOtG3);
    for(const t of [t1,t2]){const s=await stored(t.idIntegracion),o=stub.orders.get(Number(t.idOtG3));assert.deepEqual(installationSnapshot(s),o.payload);assert.equal(s.payloadSnapshot.id_contrato,t.idContrato);assert.equal(s.payloadSnapshot.id_empresa,1);}
    await call('cable',`/api/integrations/g3/installations/${t1.idIntegracion}`,{status:403});
    return {trackingRows:await db.integracionInstalacionG3.count(),orders:stub.orders.size,distinctRequestIds:true,distinctTraceIds:true,canonicalPayloadHashesValidated:true};
  });
  await run('05_identical_retry_immutable_snapshot',async()=>{
    const before=await stored(t1.idIntegracion),sendCount=stub.calls.filter(c=>c.path==='/api/integraciones/instalaciones').length;
    const repeated=await call('finet','/api/integrations/g3/installations',{method:'POST',status:201,body:{idContrato:complete.c}});assert.equal(repeated.idIntegracion,t1.idIntegracion);
    assert.equal(stub.calls.filter(c=>c.path==='/api/integraciones/instalaciones').length,sendCount);
    await call('finet',`/api/integrations/g3/installations/${t1.idIntegracion}/retry`,{method:'POST',status:201});
    const after=await stored(t1.idIntegracion);assert.equal(hash(after.payloadSnapshot),hash(before.payloadSnapshot));assert.equal(after.payloadHash,before.payloadHash);assert.equal(after.requestId,before.requestId);assert.equal(stub.orders.size,2);
    return {snapshotSha256:hash(after.payloadSnapshot),storedPayloadHash:after.payloadHash,orders:2,identicalRetry:true};
  });
  await run('06_incompatible_request_409_preserved',async()=>{
    const original=stub.orders.get(Number(t1.idOtG3)),before=hash(original);
    const r=await fetch(stub.origin+'/api/integraciones/instalaciones',{method:'POST',redirect:'error',headers:{'X-API-KEY':stub.key,'Content-Type':'application/json'},body:JSON.stringify({...original.payload,id_plan:999999})});
    assert.equal(r.status,409);assert.equal(hash(original),before);return {status:r.status,originalUnchanged:true,orders:stub.orders.size};
  });
  await run('07_pending_detail_and_closure_no_500',async()=>{
    const r=await call('finet',`/api/integrations/g3/installations/${t1.idIntegracion}`);assert.equal(r.estadoPresentacion,'PENDIENTE');
    const closed=await call('finet',`/api/integrations/g3/installations/${t1.idIntegracion}/reconcile`,{method:'POST',status:201});assert.equal(closed.available,false);
    const after=await stored(t1.idIntegracion);assert.equal(after.estadoIntegracion,'ENVIADA');assert.equal(after.idServicio,null);
    assert.equal(stub.calls.filter(c=>c.path.endsWith('/cierre')).at(-1).status,409);
    return {detailHttp:200,reconcileHttp:201,remoteClosureHttp:409,state:after.estadoIntegracion,service:null};
  });
  await run('08_simulated_closures_activate_g8',async()=>{
    for(const t of [t1,t2])await call(null,`/__qa/approve/${t.idOtG3}`,{method:'POST',control:true,status:201});
    for(const t of [t1,t2]){const s=await stored(t.idIntegracion);assert.equal(s.estadoIntegracion,'COMPLETADA');assert.ok(s.idCliente);assert.ok(s.idServicio);
      const svc=await db.servicioContratado.findUniqueOrThrow({where:{idServicio:s.idServicio}});assert.equal(svc.idContrato,s.idContrato);assert.equal(svc.idEmpresa,1);assert.equal(svc.idCliente,s.idCliente);}
    return {closed:2,events:await db.integracionEventoEntrante.count(),g1Effects:stub.activations.size};
  });
  await run('09_g1_correct_service_company_contract_and_distinct_equipment',async()=>{
    const serials=[],unitIds=[];
    for(const t of [t1,t2]){const s=await stored(t.idIntegracion),g1=await db.integracionActivacionG1.findFirstOrThrow({where:{idContrato:s.idContrato}});
      assert.equal(g1.estadoIntegracion,'COMPLETADA');assert.equal(g1.idEmpresa,1);assert.equal(g1.idServicio,s.idServicio);assert.equal(g1.idCliente,s.idCliente);
      const response=await fetch(stub.origin+`/api/integraciones/equipos?id_empresa=1&id_servicio=${s.idServicio}`,{headers:{'X-API-KEY':stub.key},redirect:'error'});
      const equipment=(await response.json()).data;assert.equal(equipment.length,1);assert.equal(equipment[0].asignacion_actual.id_contrato_externo,s.idContrato);serials.push(equipment[0].numero_serie);unitIds.push(equipment[0].id_unidad);
    }assert.notEqual(serials[0],serials[1]);assert.notEqual(unitIds[0],unitIds[1]);return {completedG1:2,distinctEquipment:true,distinctUnitIds:true,company:1};
  });
  await run('10_recovery_conflicts_preserve_confirmed_evidence',async()=>{
    const snapshots=await Promise.all([t1,t2].map(t=>stored(t.idIntegracion).then(s=>({requestId:s.requestId,traceId:s.traceId,hash:s.payloadHash,snapshot:hash(s.payloadSnapshot)}))));
    const before={clients:await db.cliente.count(),services:await db.servicioContratado.count(),events:await db.integracionEventoEntrante.count(),g1Effects:stub.activations.size};
    await call(null,`/__qa/approve/${t1.idOtG3}`,{method:'POST',control:true,status:201});
    await call(null,`/__qa/conflict/${t1.idOtG3}`,{method:'POST',control:true,status:409});
    await call('finet',`/api/integrations/g3/installations/${t1.idIntegracion}/reconcile`,{method:'POST',status:201});
    assert.deepEqual({clients:await db.cliente.count(),services:await db.servicioContratado.count(),events:await db.integracionEventoEntrante.count(),g1Effects:stub.activations.size},before);
    assert.deepEqual(await Promise.all([t1,t2].map(t=>stored(t.idIntegracion).then(s=>({requestId:s.requestId,traceId:s.traceId,hash:s.payloadHash,snapshot:hash(s.payloadSnapshot)})))),snapshots);
    return {...before,conflict:409,snapshotsUnchanged:true};
  });
  await call(null,'/__qa/evidence',{control:true});return cases;
};
