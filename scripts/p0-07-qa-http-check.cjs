'use strict';
// Supplementary integration checks, NOT a substitute for UI execution/captures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
async function main() {
  const privatePath=path.resolve(process.argv[2]);
  const cfg=JSON.parse(fs.readFileSync(privatePath,'utf8'));
  const root=path.dirname(privatePath),runId=fs.readFileSync(path.join(root,'owner'),'utf8');
  assert.match(path.basename(root),/^finet-p005-qa-/);
  const origin=new URL(cfg.origin);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.protocol,'http:');
  // Read-only proof before login (which itself writes an audit/session record).
  const attestation=await fetch(new URL('/__qa/evidence',origin),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-QA-Control':cfg.controlKey}});
  assert.equal(attestation.status,200);const current=await attestation.json();assert.equal(current.runId,runId);
  assert.equal(current.isolation.markerMatches,true);assert.equal(current.isolation.initialPublicTables,0);
  const manualAction=process.argv[3];
  assert.ok([undefined,'--stop','--status','--approve','--conflict','--invoice-fixture','--check-export-permissions'].includes(manualAction),'Unknown QA action');
  if(manualAction==='--status') {
    const health=await fetch(new URL('/api/health',origin),{redirect:'error'});
    const ready=await fetch(new URL('/api/ready',origin),{redirect:'error'});
    console.log(JSON.stringify({runId,origin:cfg.origin,health:health.status,ready:await ready.json(),expiresAt:current.expiresAt,
      aliases:current.aliases,orders:current.orders,g3:current.g3,g1:current.g1,rows:current.rows,
      accounts:cfg.accounts.map(({alias,email,role,idEmpresa})=>({alias,email,role,idEmpresa}))},null,2));return;
  }
  if(['--approve','--conflict','--invoice-fixture'].includes(manualAction)) {
    const id=Number(process.argv[4]);assert.ok(Number.isSafeInteger(id)&&id>0,'Positive QA ID required');
    const route=`/__qa/${manualAction.slice(2)}/${id}`;
    const r=await fetch(new URL(route,origin),{method:'POST',redirect:'error',headers:{'X-QA-Control':cfg.controlKey}});
    const data=await r.json();
    console.log(JSON.stringify({runId,action:manualAction,id,status:r.status,duplicate:data.duplicate??null,idFactura:data.idFactura??null}));
    if(!r.ok&&!(manualAction==='--conflict'&&r.status===409))process.exitCode=1;return;
  }
  if(process.argv.includes('--stop')) {
    const r=await fetch(new URL('/__qa/stop',origin),{method:'POST',redirect:'error',headers:{'X-QA-Control':cfg.controlKey}});
    assert.equal(r.status,200);console.log('QA_STOP_REQUESTED');return;
  }
  const stateFile=path.join(root,'http-state.json');
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{ids:{},results:[]};
  const evidenceDir=path.resolve(__dirname,'../docs/entrega-final/evidencias-qa');
  const tokens={};
  async function call(role,route,{method='GET',body,control=false,binary=false}={}) {
    assert.ok(route.startsWith('/')&&!route.startsWith('//'));
    const response=await fetch(new URL(route,origin),{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),
        ...(control?{'X-QA-Control':cfg.controlKey}:{})},body:body?JSON.stringify(body):undefined});
    if(binary)return {status:response.status,body:Buffer.from(await response.arrayBuffer()),headers:response.headers};
    let data;try{data=await response.json();}catch{data=null;}
    return {status:response.status,body:data,headers:response.headers};
  }
  const ok=(r,status=200)=>{assert.equal(r.status,status,`HTTP ${r.status}; expected ${status}; ${typeof r.body?.message==='string'?r.body.message:''}`);return r.body;};
  const save=()=>{fs.writeFileSync(stateFile,JSON.stringify(state));fs.writeFileSync(path.join(evidenceDir,`http-${runId}.json`),JSON.stringify({runId,origin:cfg.origin,mode:'HTTP_ONLY_NOT_UI',...state},null,2));};
  for(const account of cfg.accounts.filter(a=>manualAction!=='--check-export-permissions'||['admin','finet'].includes(a.alias))){const r=await call(null,'/api/auth/login',{method:'POST',body:{email:account.email,password:account.password}});
    const data=ok(r,201);tokens[account.alias]=data.accessToken;assert.ok(tokens[account.alias],'Login token missing');}
  if(manualAction==='--check-export-permissions') {
    const admin=await call('admin','/api/reports/export?type=clientes&format=csv',{binary:true});
    const commercial=await call('finet','/api/reports/export?type=clientes&format=csv');
    assert.equal(admin.status,200);assert.equal(commercial.status,403);
    const result={runId,mode:'HTTP_SUPPORT_ONLY',admin:admin.status,commercial:commercial.status,at:new Date().toISOString()};
    fs.writeFileSync(path.join(evidenceDir,`manual-export-${runId}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
  }
  const cases=[];
  const test=async(name,fn)=>{cases.push({name,fn});};
  const runTest=async(name,fn)=>{if(state.results.some(r=>r.name===name&&r.status==='PASS'))return;
    try{const detail=await fn();state.results.push({name,status:'PASS',at:new Date().toISOString(),detail});console.log(name,'PASS');}
    catch(e){state.results.push({name,status:'FAIL',at:new Date().toISOString(),error:String(e.message).slice(0,350)});console.log(name,'FAIL',String(e.message).slice(0,350));}save();};
  await test('D01_HTTP_login_roles_and_rejection',async()=>{
    const r=await call(null,'/api/auth/login',{method:'POST',body:{email:cfg.accounts[3].email,password:'INVALID-QA-ONLY'}});ok(r,401);
    return {successfulRoles:4,wrongCredential:r.status};
  });
  await test('QA_HTTP_health_ready_static_frontend',async()=>{
    ok(await call(null,'/api/health'));const ready=ok(await call(null,'/api/ready'));
    assert.equal(ready.global_schema,'READY');assert.equal(ready.database,'UP');
    const r=await fetch(origin,{redirect:'error'});assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("connect-src 'self'"));
    assert.ok((await r.text()).includes('/assets/'));return {ready:ready.global_schema,staticReactServed:true,browserExecuted:false};
  });
  await test('D02_D09_HTTP_shared_customer_isolation',async()=>{
    const f=ok(await call('finet','/api/customers')),c=ok(await call('cable','/api/customers')),a=ok(await call('admin','/api/customers'));
    const sharedF=f.find(x=>x.idCliente===1),sharedC=c.find(x=>x.idCliente===1),sharedA=a.find(x=>x.idCliente===1);
    assert.deepEqual(sharedF.contratos.map(x=>x.idEmpresa),[1]);assert.deepEqual(sharedC.contratos.map(x=>x.idEmpresa),[2]);
    assert.equal(sharedA.contratos.length,2);assert.ok(!sharedF.datosTecnicos);assert.ok(!sharedC.datosTecnicos);
    return {finetContracts:1,cableContracts:1,adminContracts:2,globalTechnicalHidden:true};
  });
  await test('D03_HTTP_create_covered_prospect',async()=>{
    const p=ok(await call('finet','/api/prospects',{method:'POST',body:{rut:'99000001-8',nombreCompleto:'Prospecto QA FiNet',
      email:'prospect-qa@example.invalid',telefono:'+56900000001',direccion:'Calle sintetica QA 101',comuna:'Santiago',region:'Metropolitana',
      origenContacto:'Web',idPlanInteres:1,ubicacion:{latitud:-33.475,longitud:-70.675}}}),201);
    state.ids.prospect=p.idProspecto;save();assert.equal(p.idEmpresa,1);assert.equal(p.cobertura.coberturaComercial,true);
    return {prospect:p.idProspecto,company:p.idEmpresa,commercialCoverage:true};
  });
  await test('D03_HTTP_outside_coverage_blocks_contract',async()=>{
    const p=ok(await call('cable','/api/prospects',{method:'POST',body:{rut:'99000002-6',nombreCompleto:'Prospecto QA fuera cobertura',
      email:'outside-qa@example.invalid',telefono:'+56900000002',direccion:'Calle sintetica QA 202',comuna:'Santiago',
      ubicacion:{latitud:-35,longitud:-72}}}),201);state.ids.outside=p.idProspecto;save();
    assert.equal(p.cobertura.coberturaComercial,false);ok(await call('cable',`/api/prospects/${p.idProspecto}/contracts`,{method:'POST',body:{planId:2}}),400);
    return {prospect:p.idProspecto,blocked:true};
  });
  await test('D04_HTTP_quote_PDF_and_pending_signature',async()=>{
    assert.ok(state.ids.prospect,'Covered prospect prerequisite');
    const quote=ok(await call('finet',`/api/prospects/${state.ids.prospect}/quotes`,{method:'POST',body:{planId:1}}),201);
    state.ids.quote=quote.idCotizacion;save();
    assert.ok(state.ids.quote,'Quote ID missing');
    const pdf=await call('finet',`/api/prospects/${state.ids.prospect}/quotes/${state.ids.quote}/pdf`,{binary:true});ok(pdf);
    assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');
    const filename=`quote-${runId}.pdf`;fs.writeFileSync(path.join(evidenceDir,filename),pdf.body);
    const result=ok(await call('finet',`/api/prospects/${state.ids.prospect}/contracts`,{method:'POST',body:{planId:1,diaVencimiento:10,comuna:'Santiago',ciudad:'Santiago'}}),201);
    state.ids.contract=result.contrato.idContrato;save();assert.equal(result.contrato.estado,'Pendiente firma contrato');
    return {quote:state.ids.quote,contract:state.ids.contract,mail:quote.envioEmail,pdf:filename,sha256:createHash('sha256').update(pdf.body).digest('hex'),visualReviewed:false};
  });
  await test('D05_HTTP_signature_and_versioned_PDF',async()=>{
    assert.ok(state.ids.contract,'Contract prerequisite');
    ok(await call('finet',`/api/contracts/${state.ids.contract}/confirm-signature`,{method:'PATCH',body:{observacion:'Firma exclusivamente sintetica QA, sin validez contractual'}}));
    ok(await call('admin',`/api/contracts/${state.ids.contract}/digital-contract`,{method:'POST'}),201);
    const pdf=await call('admin',`/api/contracts/${state.ids.contract}/digital-contract/download`,{binary:true});ok(pdf);
    assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');const filename=`contract-${runId}.pdf`;fs.writeFileSync(path.join(evidenceDir,filename),pdf.body);
    return {contract:state.ids.contract,pdf:filename,sha256:createHash('sha256').update(pdf.body).digest('hex'),visualReviewed:false};
  });
  await test('D06_HTTP_installation_request_and_retry',async()=>{
    assert.ok(state.ids.contract,'Contract prerequisite');
    const response=ok(await call('admin',`/api/contracts/${state.ids.contract}/prepare-installation`,{method:'POST'}),201);
    const tracking=response.tracking||response;state.ids.tracking=tracking.idIntegracion;state.ids.ot=Number(tracking.idOtG3);save();
    assert.ok(state.ids.tracking,'Tracking ID missing');
    ok(await call('admin',`/api/integrations/g3/installations/${state.ids.tracking}/retry`,{method:'POST'}),201);
    ok(await call('cable',`/api/integrations/g3/installations/${state.ids.tracking}`),403);
    return {tracking:state.ids.tracking,ot:state.ids.ot,crossCompany:403};
  });
  await test('D07_HTTP_approved_closure_and_duplicate',async()=>{
    assert.ok(state.ids.ot,'OT prerequisite');
    const first=ok(await call(null,`/__qa/approve/${state.ids.ot}`,{method:'POST',control:true}),201);
    const repeated=ok(await call(null,`/__qa/approve/${state.ids.ot}`,{method:'POST',control:true}),201);
    assert.equal(repeated.duplicate,true);
    ok(await call(null,`/__qa/conflict/${state.ids.ot}`,{method:'POST',control:true}),409);
    const ev=ok(await call(null,'/__qa/evidence',{control:true}));const tracking=ev.g3.find(x=>x.idIntegracion===state.ids.tracking);
    assert.equal(tracking.estadoIntegracion,'COMPLETADA');assert.equal(ev.rows.events,1);state.ids.service=tracking.idServicio;save();
    assert.equal(ev.g1Effects,1);assert.equal(ev.g1[0].estadoIntegracion,'COMPLETADA');
    return {firstDuplicate:first.duplicate,retryDuplicate:repeated.duplicate,incompatibleHash:409,events:ev.rows.events,service:tracking.idServicio,g1Effects:ev.g1Effects};
  });
  await test('D08_D13_HTTP_G1_inventory_and_equipment',async()=>{
    assert.ok(state.ids.service,'Activated service prerequisite');
    const equipment=ok(await call('admin',`/api/integrations/g1/services/${state.ids.service}/equipment`));
    assert.equal(equipment.data.length,1);assert.equal(equipment.data[0].numero_serie,'QA-I4-ONT-1-001');
    assert.equal(equipment.data[0].id_empresa,1);assert.equal(equipment.data[0].estado,'Instalado en cliente');
    const types=ok(await call('admin','/api/integrations/g1/equipment-types?idEmpresa=1'));assert.equal(types.data[0].id_empresa,1);
    const unit=ok(await call('admin','/api/integrations/g1/units/QA-I4-ONT-1-001?idEmpresa=1'));assert.equal(unit.data.asignacion_actual.id_servicio_externo,state.ids.service);
    return {service:state.ids.service,equipment:1,types:types.data.length,assignmentMatches:true,provider:'LOCAL_SIMULATOR_ONLY'};
  });
  await test('D11_HTTP_reactivation_requires_G3_evidence',async()=>{
    assert.ok(state.ids.service,'Activated service prerequisite');
    const fixture=ok(await call(null,`/__qa/invoice-fixture/${state.ids.contract}`,{method:'POST',control:true}),201);
    ok(await call('admin',`/api/billing/contracts/${state.ids.contract}/suspend`,{method:'PATCH'}));
    const payment=ok(await call('admin','/api/billing/payments',{method:'POST',body:{idFactura:fixture.idFactura,monto:1000,pasarela:'Efectivo',codigoTransaccion:`QA-${runId}-reactivate`}}),201);
    assert.deepEqual(payment.reactivatedServiceIds,[state.ids.service]);
    ok(await call('admin','/api/billing/contracts/2/suspend',{method:'PATCH'}));
    const without=ok(await call('admin','/api/billing/payments',{method:'POST',body:{idFactura:2,monto:7000,pasarela:'Efectivo',codigoTransaccion:`QA-${runId}-no-closure`}}),201);
    assert.deepEqual(without.reactivatedServiceIds,[]);
    return {withEvidence:payment.reactivatedServiceIds,withoutEvidence:without.reactivatedServiceIds,secondaryCompanyPaymentExplicitQA:true};
  });
  await test('D12_HTTP_ticket_diagnosis_and_G3_repair_block',async()=>{
    const categories=ok(await call('soporte','/api/tickets/categories'));
    const category=categories.find(c=>c.nombre==='Soporte sintetico QA');assert.ok(category);
    const ticket=ok(await call('soporte','/api/tickets',{method:'POST',body:{rut:'99000003-4',idCategoria:category.idCategoria,idServicio:1,prioridad:'Media',descripcion:'Ensayo sintetico, sin averia real'}}),201);
    state.ids.ticket=ticket.idTicket;save();
    ok(await call('soporte',`/api/tickets/${ticket.idTicket}/priority`,{method:'PATCH',body:{prioridad:'Alta'}}));
    ok(await call('soporte',`/api/tickets/${ticket.idTicket}/technical-notes`,{method:'POST',body:{observacion:'Nota sintetica de seguimiento QA'}}),201);
    ok(await call('soporte',`/api/tickets/${ticket.idTicket}/diagnosis`,{method:'POST',body:{causaRaiz:'Ensayo QA',descripcionProblema:'Sin incidencia real',accionesRealizadas:'Comprobacion local',estadoFinalServicio:'Activo'}}),201);
    const repair=await call('soporte',`/api/tickets/${ticket.idTicket}/work-order`,{method:'POST',body:{tipoOt:'Reparacion'}});ok(repair,410);assert.equal(repair.body.code,'G3_INTEGRATION_REQUIRED');
    const customers=ok(await call('admin','/api/customers'));assert.equal(customers.find(c=>c.idCliente===1).estado,'Moroso');
    return {ticket:ticket.idTicket,repairStatus:410,code:repair.body.code,sharedFinancialState:'Moroso'};
  });
  await test('D10_HTTP_payments_and_idempotency',async()=>{
    const body={idFactura:1,monto:5000,pasarela:'Efectivo',codigoTransaccion:`QA-${runId}-partial`};
    ok(await call('finet','/api/billing/payments',{method:'POST',body}),201);
    const partial=ok(await call('finet','/api/billing/invoices/1'));assert.equal(partial.saldo,14990);
    ok(await call('finet','/api/billing/payments',{method:'POST',body}),409);
    ok(await call('finet','/api/billing/payments',{method:'POST',body:{...body,monto:14990,codigoTransaccion:`QA-${runId}-final`}}),201);
    const ev=ok(await call(null,'/__qa/evidence',{control:true}));assert.equal(ev.rows.payments,2);
    const cable=ok(await call('cable','/api/billing/invoices/2'));
    const final=ok(await call('finet','/api/billing/invoices/1'));assert.equal(final.saldo,0);assert.equal(cable.saldo,7000);
    return {payments:2,partialBalance:partial.saldo,finalBalance:final.saldo,cableBalance:cable.saldo,replay:409,noRealPaymentProvider:true};
  });
  await test('D14_HTTP_export_admin_and_commercial_forbidden',async()=>{
    const report=await call('admin','/api/reports/export?type=clientes&format=csv&scope=consolidado',{binary:true});ok(report);
    ok(await call('finet','/api/reports/export?type=clientes&format=csv&scope=consolidado'),403);
    const filename=`customers-${runId}.csv`;fs.writeFileSync(path.join(evidenceDir,filename),report.body);
    return {admin:200,commercial:403,file:filename,sha256:createHash('sha256').update(report.body).digest('hex'),visualReviewed:false};
  });
  for(const c of cases.sort((a,b)=>a.name.localeCompare(b.name)))await runTest(c.name,c.fn);
  ok(await call(null,'/__qa/evidence',{control:true}));save();
  if(state.results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
main().catch(e=>{console.error('QA_HTTP_SETUP_FAILED',String(e.message).slice(0,150));process.exitCode=1;});
