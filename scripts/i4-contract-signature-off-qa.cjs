'use strict';
// Opt-in: a separately provisioned empty public-only database in the exclusive QA cluster.
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
async function main(){
  const raw=process.env.QA_SIGNATURE_OFF_DB_URL,runId=process.env.QA_CONTRACT_SIGNATURE_RUN_ID;
  const target=new URL(raw);
  assert.equal(process.env.NODE_ENV,'test');
  assert.match(runId??'',/^[a-f0-9]{32}$/);
  assert.equal(target.protocol,'postgresql:');assert.equal(target.hostname,'127.0.0.1');
  assert.equal(target.port,'5432');assert.equal(target.username,'qa_contract');
  assert.equal(target.pathname,'/qa_signature_off_'+runId);
  assert.equal(target.search,'?schema=public&connection_limit=1');assert.equal(target.hash,'');
  const {isolatedQaEnv}=await import('./i3-release-acceptance.mjs');
  const env={...isolatedQaEnv(),DATABASE_URL:raw,MAIL_PROVIDER:'disabled',PLAN_CHANGE_PROCESSOR_ENABLED:'false',
    CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES:'[]',CONTRACT_SIGNATURE_MANUAL_COMPANIES:'[]',CONTRACT_SIGNATURE_MANUAL_CONTRACTS:'[]',
    JWT_SECRET:randomBytes(32).toString('hex')};
  for(const key of Object.keys(process.env))if(!Object.hasOwn(env,key))delete process.env[key];
  Object.assign(process.env,env);
  require('./qa-loopback-only.cjs');
  require('reflect-metadata');
  const {ConfigModule,ConfigService}=require('@nestjs/config');
  const original=ConfigModule.forRoot.bind(ConfigModule);
  ConfigModule.forRoot=options=>original({...options,ignoreEnvFile:true});
  const {PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({datasourceUrl:raw,log:[]});
  let app;
  try{
    const [identity]=await db.$queryRawUnsafe("SELECT current_database() AS base,current_user AS rol,current_setting('qa_signature.run_id',true) AS marker,inet_server_addr()::text AS host");
    assert.equal(identity.base,target.pathname.slice(1));assert.equal(identity.rol,'qa_contract');
    assert.equal(identity.marker,runId);assert.ok(['127.0.0.1','127.0.0.1/32'].includes(identity.host));
    const [privateSchema]=await db.$queryRawUnsafe("SELECT to_regnamespace('g8_contratos') IS NULL AS absent");
    assert.equal(privateSchema.absent,true);assert.equal(await db.contrato.count(),0);
    const company=await db.empresa.create({data:{nombre:'Empresa ficticia arranque QA'}});
    const operator=await db.usuario.create({data:{idEmpresa:company.idEmpresa,nombreCompleto:'Operador ficticio',passwordHash:'QA_NO_LOGIN'}});
    const prospect=await db.prospecto.create({data:{idEmpresa:company.idEmpresa,nombreCompleto:'Prospecto ficticio',
      direccion:'DIRECCION FICTICIA QA',estadoPipeline:'Pendiente firma'}});
    const contract=await db.contrato.create({data:{idEmpresa:company.idEmpresa,idProspecto:prospect.idProspecto,
      fechaInicio:new Date('2026-01-01'),diaVencimiento:10,estado:'Pendiente firma contrato',direccionInstalacion:'DIRECCION FICTICIA QA'}});
    await db.contratoDigital.create({data:{idContrato:contract.idContrato,idEmpresa:company.idEmpresa,version:1,
      estadoFirma:'Generado',hashDocumento:'f'.repeat(64),urlDocumento:'generated/contracts/qa-off.pdf',idUsuarioGenerador:operator.idUsuario}});
    process.env.CONTRACT_SIGNATURE_MANUAL_COMPANIES=JSON.stringify([company.idEmpresa]);
    process.env.CONTRACT_SIGNATURE_MANUAL_CONTRACTS=JSON.stringify([contract.idContrato]);
    const {NestFactory}=require('@nestjs/core');
    const {AppModule}=require('../backend/dist/app.module');
    const {ContractsService}=require('../backend/dist/contracts/contracts.service');
    const {ESignatureService}=require('../backend/dist/contracts/e-signature.service');
    app=await NestFactory.create(AppModule,{logger:false});
    await app.listen(0,'127.0.0.1');
    const response=await fetch((await app.getUrl())+'/ready');
    const ready=await response.json();
    assert.equal(response.status,200);assert.equal(ready.global_schema,'READY');
    const actor={idUsuario:operator.idUsuario,idEmpresa:company.idEmpresa,roles:['Comercial'],nombreCompleto:'QA',email:null};
    const status=await app.get(ESignatureService).status(contract.idContrato,actor);
    assert.equal(status.enabled,false);assert.equal(status.policy.manualAllowed,true);
    const service=app.get(ContractsService);
    const signed=await service.confirmManualSignature(contract.idContrato,{},actor);
    assert.equal(signed.estado,'Firmado');
    await service.confirmManualSignature(contract.idContrato,{},actor);
    assert.equal(await db.logAuditoria.count({where:{accion:'CONFIRMAR_FIRMA_CONTRATO_MANUAL'}}),1);
    assert.equal(await db.ordenTrabajo.count(),0);assert.equal(await db.servicioContratado.count(),0);
    assert.equal((await db.$queryRawUnsafe("SELECT to_regnamespace('g8_contratos') IS NULL AS absent"))[0].absent,true);
    console.log(JSON.stringify({result:'PASS',flag:false,private_schema_absent:true,app_boot:true,ready_http:200,
      global_schema:'READY',explicit_legacy_manual:true,manual_audits:1,implicit_orders:0,implicit_services:0}));
  }finally{await app?.close();await db.$disconnect();}
}
main().catch(error=>{console.error('SIGNATURE_OFF_QA_FAILED', error.code??error.name, String(error.stack).split('\n').filter(line=>/^\s+at /.test(line)).slice(0,2).join('\n'));process.exitCode=1;});
