'use strict';
// A new application process reads persisted evidence after the signing runner exits.
const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
async function main(){
  const raw=process.env.QA_CONTRACT_SIGNATURE_DB_URL,runId=process.env.QA_CONTRACT_SIGNATURE_RUN_ID;
  const target=new URL(raw);
  assert.equal(process.env.NODE_ENV,'test');assert.match(runId??'',/^[a-f0-9]{32}$/);
  assert.equal(target.protocol,'postgresql:');assert.equal(target.hostname,'127.0.0.1');
  assert.equal(target.port,'5432');assert.equal(target.username,'qa_contract');
  assert.equal(target.pathname,'/qa_contract_signature_'+runId);
  assert.equal(target.search,'?schema=public&connection_limit=1');assert.equal(target.hash,'');
  const {isolatedQaEnv}=await import('./i3-release-acceptance.mjs');
  const env={...isolatedQaEnv(),DATABASE_URL:raw,MAIL_PROVIDER:'disabled',PLAN_CHANGE_PROCESSOR_ENABLED:'false',
    CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES:'[]',CONTRACT_SIGNATURE_MANUAL_COMPANIES:'[]',CONTRACT_SIGNATURE_MANUAL_CONTRACTS:'[]',
    JWT_SECRET:randomBytes(32).toString('hex')};
  for(const key of Object.keys(process.env))if(!Object.hasOwn(env,key))delete process.env[key];
  Object.assign(process.env,env);
  require('./qa-loopback-only.cjs');require('reflect-metadata');
  const {ConfigModule}=require('@nestjs/config');
  const original=ConfigModule.forRoot.bind(ConfigModule);
  ConfigModule.forRoot=options=>original({...options,ignoreEnvFile:true});
  const {NestFactory}=require('@nestjs/core');
  const {AppModule}=require('../backend/dist/app.module');
  const {PrismaService}=require('../backend/dist/prisma/prisma.service');
  const {ESignatureService}=require('../backend/dist/contracts/e-signature.service');
  let app;
  try{
    app=await NestFactory.create(AppModule,{logger:false});await app.init();
    const db=app.get(PrismaService);
    const [identity]=await db.$queryRawUnsafe("SELECT current_database() AS base,current_user AS rol,current_setting('qa_signature.run_id',true) AS marker,inet_server_addr()::text AS host");
    assert.equal(identity.base,target.pathname.slice(1));assert.equal(identity.rol,'qa_contract');
    assert.equal(identity.marker,runId);assert.ok(['127.0.0.1','127.0.0.1/32'].includes(identity.host));
    const rows=await db.$queryRawUnsafe("SELECT id_contrato,id_empresa,id_usuario_creador,hash_original,pdf_original,hash_firmado FROM g8_contratos.solicitud_firma WHERE estado='FIRMADA' ORDER BY id_contrato");
    assert.ok(rows.length>0);
    const service=app.get(ESignatureService);
    for(const row of rows){
      const actor={idUsuario:row.id_usuario_creador,idEmpresa:row.id_empresa,roles:['Comercial'],nombreCompleto:'QA',email:null};
      const signed=await service.signedPdf(row.id_contrato,actor);
      assert.equal(createHash('sha256').update(signed).digest('hex'),row.hash_firmado);
      assert.equal(createHash('sha256').update(Buffer.from(row.pdf_original)).digest('hex'),row.hash_original);
    }
    console.log(JSON.stringify({result:'PASS',new_app_process:true,flag:false,persisted_signed_documents:rows.length,
      original_and_signed_hashes_verified:true,external_sends:0}));
  }finally{await app?.close();}
}
main().catch(error=>{console.error('SIGNATURE_RECOVERY_QA_FAILED',error.code??error.name);
  process.exitCode=1;});
