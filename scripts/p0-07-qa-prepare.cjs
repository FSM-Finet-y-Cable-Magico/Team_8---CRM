'use strict';
// Operator fixtures only: authenticates real QA users and creates a SECONDARY
// reactivation case through existing HTTP flows. Never accepts an external origin.
const assert=require('node:assert/strict');
const {verifyDatabase}=require('./p0-05-qa-isolation.cjs');
module.exports=async function prepare({origin,accounts,controlKey,db,capability}) {
  const url=new URL(origin);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');
  await verifyDatabase(db,capability);
  assert.equal(await db.prospecto.count(),0,'Preparation requires fresh QA, never resume partially prepared data');
  const tokens={},logins=[],operations=[];
  async function call(role,route,{method='GET',body,control=false,status=200}={}) {
    assert.ok(route.startsWith('/')&&!route.startsWith('//'));
    const response=await fetch(new URL(route,origin),{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),
        ...(control?{'X-QA-Control':controlKey}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(response.status,status,`QA_PREPARATION_HTTP_${method}_${route}_${response.status}`);
    operations.push({method,path:route,status:response.status});return response.json();
  }
  const attestation=await call(null,'/__qa/evidence',{control:true});
  assert.equal(attestation.runId,capability.runId);assert.equal(attestation.isolation.markerMatches,true);
  assert.equal(attestation.isolation.initialPublicTables,0);
  for(const account of accounts) {
    const data=await call(null,'/api/auth/login',{method:'POST',body:{email:account.email,password:account.password},status:201});
    assert.ok(data.accessToken);tokens[account.alias]=data.accessToken;
    logins.push({alias:account.alias,idUsuario:account.idUsuario,idEmpresa:account.idEmpresa,role:account.role,status:201});
  }
  // Different RUT and company from the principal prospect reserved for manual D03.
  const prospect=await call('cable','/api/prospects',{method:'POST',status:201,body:{rut:'99000004-2',
    nombreCompleto:'Reactivacion secundaria QA',email:'reactivation@example.invalid',telefono:'+56900000004',
    direccion:'Calle sintetica QA 404',comuna:'Santiago',region:'Metropolitana',origenContacto:'Formulario web',
    idPlanInteres:attestation.aliases.plans[1],ubicacion:{latitud:-33.475,longitud:-70.475}}});
  assert.equal(prospect.idEmpresa,attestation.aliases.companies[1]);assert.equal(prospect.cobertura.coberturaComercial,true);
  await call('cable',`/api/prospects/${prospect.idProspecto}/quotes`,{method:'POST',status:201,body:{planId:attestation.aliases.plans[1]}});
  const created=await call('cable',`/api/prospects/${prospect.idProspecto}/contracts`,{method:'POST',status:201,
    body:{planId:attestation.aliases.plans[1],diaVencimiento:10,comuna:'Santiago',ciudad:'Santiago'}});
  const contract=created.contrato.idContrato;
  await call('cable',`/api/contracts/${contract}/confirm-signature`,{method:'PATCH',body:{observacion:'Firma sintetica QA secundaria sin validez contractual'}});
  const installation=await call('admin',`/api/contracts/${contract}/prepare-installation`,{method:'POST',status:201});
  const tracking=installation.tracking||installation,ot=Number(tracking.idOtG3);assert.ok(ot>0);
  await call(null,`/__qa/approve/${ot}`,{method:'POST',control:true,status:201});
  const evidence=await call(null,'/__qa/evidence',{control:true});
  const closed=evidence.g3.find(t=>t.idIntegracion===tracking.idIntegracion);
  assert.equal(closed.estadoIntegracion,'COMPLETADA');assert.ok(closed.idServicio);assert.ok(closed.idCliente);
  assert.equal(evidence.g1Effects,1);assert.equal(evidence.g1[0].estadoIntegracion,'COMPLETADA');
  const invoice=await call(null,`/__qa/invoice-fixture/${contract}`,{method:'POST',control:true,status:201});
  await call('admin',`/api/billing/contracts/${contract}/suspend`,{method:'PATCH'});
  const finalContract=await db.contrato.findUniqueOrThrow({where:{idContrato:contract}});
  const service=await db.servicioContratado.findUniqueOrThrow({where:{idServicio:closed.idServicio}});
  assert.equal(finalContract.estado,'Suspendido');assert.equal(service.estadoOperativo,'Suspendido');
  assert.equal(service.idEmpresa,closed.idEmpresa);assert.equal(service.idContrato,contract);
  assert.equal(await db.pago.count(),0);assert.equal(await db.prospecto.count({where:{rut:'99000001-8'}}),0);
  const shared=await db.cliente.findUniqueOrThrow({where:{idCliente:attestation.aliases.sharedCustomer}});assert.equal(shared.estado,'Moroso');
  for(const row of attestation.aliases.sharedContracts) {
    const c=await db.contrato.findUniqueOrThrow({where:{idContrato:row.contract}});assert.equal(c.estado,'Activo');
    const i=await db.factura.findUniqueOrThrow({where:{idFactura:row.invoice}});assert.equal(Number(i.monto),row.company===attestation.aliases.companies[0]?19990:7000);
  }
  return {at:new Date().toISOString(),mode:'QA_HTTP_FIXTURE_PREPARATION_NOT_VISUAL',logins,operations,
    manualProspectAbsent:true,payments:0,reactivation:{company:closed.idEmpresa,prospect:prospect.idProspecto,
      customer:closed.idCliente,contract,service:closed.idServicio,tracking:closed.idIntegracion,ot,invoice:invoice.idFactura,
      balance:1000,contractState:finalContract.estado,serviceState:service.estadoOperativo,g3:'COMPLETADA',g1:'COMPLETADA',
      equipment:`QA-I4-ONT-${closed.idEmpresa}-001`}};
};
