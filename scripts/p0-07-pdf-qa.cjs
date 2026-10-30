'use strict';
// Dedicated PDF regression. Reuses the existing attestation/fixtures; never accepts a DB URL.
const fs=require('node:fs'), fsp=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {createCluster,verifyDatabase,cleanEnv,assertTarget}=require('./p0-05-qa-isolation.cjs');
const repo=path.resolve(__dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');

async function worker(input) {
  assertTarget(input.capability);
  const {PrismaClient}=require('@prisma/client');
  const url=new URL(input.capability.url);assert.ok([1,5].includes(input.pool));
  url.searchParams.set('connection_limit',String(input.pool));
  const p=new PrismaClient({datasources:{db:{url:url.toString()}}});
  await verifyDatabase(p,input.capability);
  const {ContractsService}=require('../backend/dist/contracts/contracts.service');
  const {AuditService}=require('../backend/dist/audit/audit.service');
  const service=new ContractsService(p,new AuditService(p),{});
  const originalOpen=fsp.open,originalWrite=fsp.writeFile;
  if(input.action==='write-failure') {
    // Real partial file, then simulated disk error, only in this isolated worker.
    fsp.open=async(...args)=>{
      const handle=await originalOpen(...args);
      if(String(args[0]).endsWith('.pdf'))handle.writeFile=async()=>{
        await handle.write(Buffer.from('%PDF-partial-QA'));
        throw Object.assign(new Error('QA_WRITE_FAILURE'),{code:'EIO'});
      };
      return handle;
    };
    fsp.writeFile=async(...args)=>{await originalWrite(args[0],Buffer.from('%PDF-partial-QA'),args[2]);throw Object.assign(new Error('QA_WRITE_FAILURE'),{code:'EIO'});};
  }
  process.send({ready:true});
  await new Promise(resolve=>process.once('message',resolve));
  const start=Date.now();
  try {
    if(input.action==='download') {
      const file=await service.downloadDigitalContract(input.contract,input.user,{setHeader(){}},input.version);
      const chunks=[];for await(const c of file.getStream())chunks.push(Buffer.from(c));
      const bytes=Buffer.concat(chunks);assert.equal(bytes.subarray(0,4).toString(),'%PDF');
      process.send({ok:true,sha256:sha(bytes),bytes:bytes.length});
    } else {
      const doc=await service.generateDigitalContract(input.contract,input.user);
      process.send({ok:true,version:doc.version,id:doc.idContratoDigital,path:doc.urlDocumento,hash:doc.hashDocumento,ms:Date.now()-start});
    }
  } catch(e) {process.send({ok:false,code:e.code||e.name,status:e.getStatus?.()||null,ms:Date.now()-start});}
  finally {fsp.open=originalOpen;fsp.writeFile=originalWrite;await p.$disconnect();process.disconnect();}
}

async function main() {
  const baseline=process.argv.includes('--baseline');
  assert.ok(process.argv.slice(2).every(a=>a==='--baseline'),'Unknown argument');
  const schema=fs.readFileSync(path.join(repo,'db/global/init-global.sql'));
  const {parseGlobalSchema}=await import('./global-schema.mjs');
  parseGlobalSchema(schema); // Same reviewed hash gate as the global verifier.
  const cluster=await createCluster('C:/Program Files/PostgreSQL/18/bin');
  const cap=cluster.capability;
  const evidence={kind:baseline?'PDF_BASELINE':'PDF_REGRESSION',runId:cap.runId,at:new Date().toISOString(),
    head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
    sourceSha:sha(fs.readFileSync(path.join(repo,'backend/src/contracts/contracts.service.ts'))),
    compiledSha:sha(fs.readFileSync(path.join(repo,'backend/dist/contracts/contracts.service.js'))),schemaSha:sha(schema),cases:[],cleanup:false};
  const output=path.join(repo,'docs/entrega-final/evidencias-qa',`pdf-${baseline?'baseline':'regression'}-${cap.runId}.json`);
  const save=()=>fs.writeFileSync(output,JSON.stringify(evidence,null,2));
  const children=new Set();let p;
  try {
    const {PrismaClient}=require('@prisma/client');p=new PrismaClient({datasources:{db:{url:cap.url}}});
    const identity=await verifyDatabase(p,cap);
    const [empty]=await p.$queryRawUnsafe("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'");assert.equal(empty.n,0);
    evidence.isolation={database:identity.db,host:identity.host,port:identity.port,markerMatches:true,initialTables:0};save();
    cluster.sql(schema.toString());
    const fixture=await require('./p0-07-qa-fixtures.cjs')(p,cap);
    const admin=fixture.accounts.find(a=>a.alias==='admin');
    const user={idUsuario:admin.idUsuario,idEmpresa:admin.idEmpresa,nombreCompleto:'QA',email:null,roles:['Administrador']};
    const contract=fixture.aliases.sharedContracts[0].contract;
    const files=()=>fs.existsSync(path.join(cap.root,'generated/contracts'))?fs.readdirSync(path.join(cap.root,'generated/contracts')).sort():[];
    async function snapshot() {
      const docs=await p.contratoDigital.findMany({where:{idContrato:contract},orderBy:{version:'asc'},select:{version:true,urlDocumento:true,hashDocumento:true}});
      return {versions:docs.map(d=>d.version),documents:docs.length,audits:await p.logAuditoria.count({where:{accion:'GENERAR_CONTRATO_DIGITAL'}}),files:files(),
        hashes:docs.map(d=>({version:d.version,db:d.hashDocumento,file:sha(fs.readFileSync(path.join(cap.root,d.urlDocumento)))}))};
    }
    function launch(pool,action='generate',extra={}) {
      const child=fork(__filename,['--worker'],{cwd:cap.root,windowsHide:true,env:{...cleanEnv(),QA_LOOPBACK_PORTS:String(cap.port)},
        execArgv:['--require',path.join(__dirname,'p0-07-qa-network.cjs')],stdio:['ignore','pipe','pipe','ipc']});
      children.add(child);child.stdout.resume();child.stderr.resume();
      let readyResolve,readyReject,doneResolve,result;
      const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
      const done=new Promise(r=>{doneResolve=r;});
      const timer=setTimeout(()=>{readyReject(new Error('PDF worker timeout'));child.kill();},45000);
      child.on('message',m=>{if(m.ready)readyResolve();else result=m;});
      child.on('error',readyReject);
      child.on('exit',code=>{clearTimeout(timer);children.delete(child);if(!result)readyReject(new Error('Worker setup failed'));doneResolve(result||{ok:false,code:`EXIT_${code}`});});
      child.send({capability:cap,pool,action,contract,user,...extra});
      return {ready,done,go:()=>child.send('go')};
    }
    async function run(pool,action,extra) {const w=launch(pool,action,extra);await w.ready;w.go();return w.done;}
    async function record(name,fn) {const before=await snapshot();try{const detail=await fn();evidence.cases.push({name,status:'PASS',before,detail,after:await snapshot()});}
      catch(e){evidence.cases.push({name,status:'FAIL',before,error:e.message});process.exitCode=1;}
      save();console.log(name,evidence.cases.at(-1).status);}
    await record('pool_1',async()=>{
      const r=await run(1);assert.equal(r.ok,!baseline);
      if(baseline){assert.equal(r.code,'P2024');assert.equal((await snapshot()).documents,0);}
      return r;
    });
    await record('pool_5',async()=>{const r=await run(5);assert.equal(r.ok,true);return r;});
    if(!baseline){
      await record('consecutive_versions',async()=>{const a=await run(1),b=await run(1);assert.ok(a.ok&&b.ok);assert.equal(b.version,a.version+1);return {a,b};});
      await record('concurrent_independent_connections',async()=>{
        const a=launch(1),b=launch(1);await Promise.all([a.ready,b.ready]);a.go();b.go();const results=await Promise.all([a.done,b.done]);
        assert.ok(results.every(r=>r.ok));const v=results.map(r=>r.version).sort((a,b)=>a-b);assert.equal(v[1],v[0]+1);return results;
      });
      await record('partial_file_write_failure',async()=>{const before=await snapshot();const r=await run(1,'write-failure');assert.equal(r.ok,false);assert.equal(r.code,'EIO');assert.deepEqual(await snapshot(),before);return r;});
      async function failInsert(table,action){
        await verifyDatabase(p,cap);
        cluster.sql(`CREATE FUNCTION qa_pdf_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA injected persistence failure'; END; $$; CREATE TRIGGER qa_pdf_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION qa_pdf_failure();`);
        try {const before=await snapshot();const r=await run(1);assert.equal(r.ok,false);assert.deepEqual(await snapshot(),before);return {action,...r};}
        finally {cluster.sql(`DROP TRIGGER qa_pdf_failure ON ${table}; DROP FUNCTION qa_pdf_failure();`);}
      }
      await record('document_insert_rollback',()=>failInsert('contrato_digital','document insert'));
      await record('audit_insert_rollback',()=>failInsert('log_auditoria','audit insert'));
      await record('versions_audit_and_historical_download',async()=>{
        const s=await snapshot();assert.equal(s.documents,s.audits);assert.equal(s.files.length,s.documents);
        assert.deepEqual(s.versions,Array.from({length:s.documents},(_,i)=>i+1));
        for(const h of s.hashes)assert.equal(h.db,h.file);
        const first=await run(1,'download',{version:1});const last=await run(5,'download',{version:s.versions.at(-1)});
        assert.ok(first.ok&&last.ok);assert.equal(first.sha256,s.hashes[0].db);assert.equal(last.sha256,s.hashes.at(-1).db);return {first,last};
      });
      await record('unauthorized_company_no_writes',async()=>{
        const before=await snapshot();const cable=fixture.accounts.find(a=>a.alias==='cable');
        const r=await run(1,'generate',{user:{...user,idUsuario:cable.idUsuario,idEmpresa:cable.idEmpresa,roles:['Comercial']}});
        assert.equal(r.ok,false);assert.equal(r.status,400);assert.deepEqual(await snapshot(),before);return r;
      });
    }
    evidence.result=evidence.cases.every(c=>c.status==='PASS')?'QA_PASS':'QA_FAIL';
  } finally {
    for(const c of children)c.kill();
    if(p)await p.$disconnect();cluster.stop();evidence.cleanup=true;save();console.log(JSON.stringify({result:evidence.result,output,cleanup:true}));
  }
}
if(process.argv.includes('--worker')){
  if(!process.send)throw new Error('IPC required');
  process.once('message',input=>worker(input).catch(()=>{process.send({ok:false,code:'WORKER_SETUP_FAILED'});process.exitCode=1;process.disconnect();}));
}else void main().catch(e=>{console.error('PDF_QA_FAILED',e.code||e.name);process.exitCode=1;});
