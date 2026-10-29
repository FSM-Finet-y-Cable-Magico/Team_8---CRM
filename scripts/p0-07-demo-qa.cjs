'use strict';
// Full UI QA only: new owned database, synthetic fixtures, loopback providers.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { createCluster, verifyDatabase, cleanEnv } = require('./p0-05-qa-isolation.cjs');
const fixtures = require('./p0-07-qa-fixtures.cjs');
const { providers } = require('./p0-07-qa-providers.cjs');
const repo = path.resolve(__dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const safeFetch = (url, options) => {
  const u = new URL(url); assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.protocol, 'http:');
  return fetch(u, { ...options, redirect: 'error' });
};
async function port() {
  const s = http.createServer(); await new Promise(r=>s.listen(0, '127.0.0.1', r));
  const p=s.address().port; await new Promise(r=>s.close(r)); return p;
}
async function main() {
  assert.ok(process.argv.slice(2).every(arg=>['--operator-ready','--coverage-flow','--installation-flow','--installation-ready'].includes(arg)),'Unknown QA launch option');
  assert.ok(process.argv.slice(2).length<=1,'Use separate fresh runs for regression and operator');
  assert.ok(fs.existsSync(path.join(repo, 'backend/dist/main.js')), 'Build backend first');
  assert.ok(fs.existsSync(path.join(repo, 'frontend/dist/index.html')), 'Build frontend first');
  const schema = fs.readFileSync(path.join(repo, 'db/global/init-global.sql'));
  assert.equal(digest(schema), 'f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa');
  const cluster = await createCluster('C:/Program Files/PostgreSQL/18/bin');
  const cap = cluster.capability;
  let db, stub, backend, web, expiryTimer, closing = false;
  const evidence = { started: new Date().toISOString(), sha: execFileSync('git', ['rev-parse','HEAD'], {cwd:repo,encoding:'utf8'}).trim(),
    schemaSha256: digest(schema), postgres: cluster.version, runId: cap.runId, isolation: {}, requests: [], cleanup: false,
    contractsSourceSha256: digest(fs.readFileSync(path.join(repo,'backend/src/contracts/contracts.service.ts'))),
    contractsCompiledSha256: digest(fs.readFileSync(path.join(repo,'backend/dist/contracts/contracts.service.js'))),
    prospectsSourceSha256: digest(fs.readFileSync(path.join(repo,'backend/src/prospects/prospects.service.ts'))),
    frontendIndexSha256: digest(fs.readFileSync(path.join(repo,'frontend/dist/index.html'))) };
  const evidencePath = path.join(repo, 'docs/entrega-final/evidencias-qa', `run-${cap.runId}.json`);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const save = () => fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  async function stop() {
    if (closing) return; closing=true;
    clearTimeout(expiryTimer);
    if (backend && backend.exitCode === null) { backend.kill(); await new Promise(r=>backend.once('exit',r)); }
    for (const server of [web, stub?.server]) if (server) { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
    if (db) await db.$disconnect();
    cluster.stop(); evidence.cleanup=true; evidence.ended=new Date().toISOString(); save();
    console.log('QA_STOPPED_CLEANUP_CONFIRMED');
  }
  process.once('SIGINT',()=>void stop()); process.once('SIGTERM',()=>void stop());
  try {
    db = new PrismaClient({ datasources: { db: { url: cap.url } } });
    const identity = await verifyDatabase(db, cap);
    const [empty] = await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    assert.equal(empty.n, 0);
    evidence.isolation = { database: identity.db, role: identity.usr, host: identity.host, port: identity.port,
      markerMatches: true, ownedTempDirectory: true, initialPublicTables: empty.n, inheritedEnv: false,
      jsNetworkGuard: true, browserCsp: true, systemFirewallModified: false };
    save(); // Attestation saved BEFORE canonical DDL and synthetic records.
    cluster.sql(schema.toString());
    const fixture = await fixtures(db, cap);
    evidence.aliases=fixture.aliases;
    stub = await providers(fixture.aliases.companies);
    const backendPort = await port(), webPort = await port();
    const origin = `http://127.0.0.1:${webPort}`, apiOrigin = `http://127.0.0.1:${backendPort}`;
    const controlKey=randomBytes(32).toString('hex'), inboundKey=randomBytes(32).toString('hex');
    const privatePath=path.join(cap.root,'demo-private.json');
    fs.writeFileSync(privatePath,JSON.stringify({origin,apiOrigin,controlKey,accounts:fixture.accounts}),{mode:0o600});
    // A full Nest app needs more than the single connection used by the P0-05 worker.
    // Derive ONLY from the already attested capability; destination/credentials cannot change.
    const applicationUrl=new URL(cap.url);applicationUrl.searchParams.set('connection_limit','5');
    evidence.isolation.applicationPoolSize=5;
    const env = { ...cleanEnv(), DATABASE_URL:applicationUrl.toString(), JWT_SECRET:randomBytes(48).toString('hex'), PORT:String(backendPort),
      FRONTEND_URL:origin, MAIL_PROVIDER:'disabled', WHATSAPP_PROVIDER:'disabled', FACTURACION_CL_INTEGRATION_ENABLED:'false',
      GEOCODING_PROVIDER:'MANUAL', GEOCODING_API_URL:'', TOMODAT_ENABLED:'false',
      G1_INTEGRATION_ENABLED:'true', G1_API_URL:stub.origin, G1_API_KEY:stub.key,
      G3_INTEGRATION_ENABLED:'true', G3_API_URL:stub.origin, G3_API_KEY:stub.key,
      G8_INTEGRATION_API_KEYS:JSON.stringify([{keyId:'qa-only-g3',group:'G3',sha256:digest(inboundKey),companies:fixture.aliases.companies,active:true}]),
      QA_LOOPBACK_PORTS:[cap.port,stub.port,backendPort].join(',') };
    backend=spawn(process.execPath,['--require',path.join(__dirname,'p0-07-qa-network.cjs'),path.join(repo,'backend/dist/main.js')],
      {cwd:cap.root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(path.join(cap.root,'backend-private.log'));
    backend.stdout.pipe(log);backend.stderr.pipe(log);
    web=http.createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,origin);
        if(url.pathname.startsWith('/__qa/')) {
          if(req.headers['x-qa-control']!==controlKey)return json(res,403,{});
          if(url.pathname==='/__qa/stop' && req.method==='POST') {json(res,200,{stopping:true});setImmediate(()=>void stop());return;}
          const invoiceFixture=/^\/__qa\/invoice-fixture\/(\d+)$/.exec(url.pathname);
          if(invoiceFixture && req.method==='POST') {
            await verifyDatabase(db,cap);
            const contract=await db.contrato.findUniqueOrThrow({where:{idContrato:Number(invoiceFixture[1])}});
            assert.ok(fixture.aliases.companies.includes(contract.idEmpresa));assert.ok(contract.idCliente);
            assert.equal(await db.factura.count({where:{idContrato:contract.idContrato}}),0);
            const invoice=await db.factura.create({data:{idContrato:contract.idContrato,periodoMes:10,periodoAnio:2026,monto:1000,
              fechaEmision:new Date('2026-10-01'),fechaLimitePago:new Date('2026-10-01'),estado:'Pendiente'}});
            evidence.requests.push({method:'QA_FIXTURE',path:'synthetic_invoice_for_activated_contract',idFactura:invoice.idFactura});save();
            return json(res,201,{idFactura:invoice.idFactura});
          }
          if(url.pathname==='/__qa/evidence' && req.method==='GET') {
            evidence.providerCalls=stub.calls;
            evidence.orders=[...stub.orders.values()].map(o=>({id:o.id,company:o.payload.id_empresa,completed:!!o.closure,hash:o.hash}));
            evidence.g1Effects=stub.activations.size;
            evidence.rows={customers:await db.cliente.count(),services:await db.servicioContratado.count(),events:await db.integracionEventoEntrante.count(),payments:await db.pago.count()};
            evidence.g3=await db.integracionInstalacionG3.findMany({select:{idIntegracion:true,idContrato:true,idCliente:true,idServicio:true,idEmpresa:true,estadoIntegracion:true}});
            evidence.g1=await db.integracionActivacionG1.findMany({select:{idIntegracion:true,estadoIntegracion:true,eventId:true}});
            save();return json(res,200,evidence);
          }
          const approve=/^\/__qa\/(approve|conflict)\/(\d+)$/.exec(url.pathname);
          if(approve && req.method==='POST') {
            const original=stub.approve(Number(approve[2]));
            const closure=approve[1]==='conflict'?{...original,equipos_instalados:[{numero_serie:'QA-INCOMPATIBLE-RETRY'}]}:original;
            const response=await safeFetch(`${apiOrigin}/api/integraciones/fsm/ordenes/${closure.id_ot}/cierre`,{
              method:'POST',headers:{'Content-Type':'application/json','X-API-KEY':inboundKey},body:JSON.stringify(closure)});
            const data=await response.json();evidence.requests.push({method:'POST',path:'G3_SIMULATED_CLOSURE',status:response.status});save();
            return json(res,response.status,data);
          }
          return json(res,404,{});
        }
        if(url.pathname.startsWith('/api/')) {
          const proxy=http.request(`${apiOrigin}${req.url}`,{method:req.method,headers:{...req.headers,host:`127.0.0.1:${backendPort}`}},up=>{
            evidence.requests.push({method:req.method,path:url.pathname,status:up.statusCode});
            res.writeHead(up.statusCode,up.headers);up.pipe(res);
          });proxy.on('error',()=>json(res,502,{message:'QA backend unavailable'}));req.pipe(proxy);return;
        }
        const base=path.join(repo,'frontend/dist');
        const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
        let file=path.resolve(base,relative||'index.html');
        if(!file.startsWith(base+path.sep)&&file!==base)return json(res,403,{});
        if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(base,'index.html');
        const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self' data:; frame-src 'self' blob:; object-src 'self' blob:; form-action 'self'; base-uri 'self'"});
        res.end(fs.readFileSync(file));
      } catch { json(res,500,{message:'QA harness error; no secret details exposed'}); }
    });
    await new Promise(r=>web.listen(webPort,'127.0.0.1',r));
    evidence.origin=origin;evidence.apiOrigin=apiOrigin;evidence.providerOrigin=stub.origin;save();
    let healthy=false;
    for(let attempt=0;attempt<50;attempt++) {
      if(backend.exitCode!==null)throw new Error('QA_BACKEND_EXITED_CHECK_PRIVATE_LOG');
      try {const r=await safeFetch(`${apiOrigin}/api/health`);if(r.ok){healthy=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,300));
    }
    assert.ok(healthy,'QA_HEALTH_NOT_READY');
    if(process.argv.includes('--installation-flow')) {
      evidence.installationFlow=await require('./p0-07-installation-flow-qa.cjs')({origin,accounts:fixture.accounts,controlKey,db,capability:cap,stub,
        onStep:cases=>{evidence.installationFlow=cases;save();}});
      save();await stop();console.log(JSON.stringify({QA_INSTALLATION_PASS:true,evidencePath,cases:evidence.installationFlow.length}));return;
    }
    if(process.argv.includes('--coverage-flow')) {
      evidence.coverageFlow=await require('./p0-07-coverage-flow-qa.cjs')({origin,accounts:fixture.accounts,controlKey,db,capability:cap,
        onStep:cases=>{evidence.coverageFlow=cases;save();}});
      save();await stop();console.log(JSON.stringify({QA_COVERAGE_PASS:true,evidencePath,cases:evidence.coverageFlow.length}));return;
    }
    if(process.argv.includes('--operator-ready')) {
      evidence.operatorPreparation=await require('./p0-07-qa-prepare.cjs')({origin,accounts:fixture.accounts,controlKey,db,capability:cap});
      evidence.aliases.reactivation=evidence.operatorPreparation.reactivation;save();
    }
    if(process.argv.includes('--installation-ready')) {
      evidence.installationPreparation=await require('./p0-07-installation-flow-qa.cjs')({origin,accounts:fixture.accounts,controlKey,db,capability:cap,stub,prepareOnly:true});
      evidence.aliases.installationContinuation=evidence.installationPreparation;save();
    }
    evidence.expiresAt=new Date(Date.now()+2*60*60*1000).toISOString();save();
    expiryTimer=setTimeout(()=>void stop(),2*60*60*1000);
    console.log(JSON.stringify({QA_READY:true,origin,privatePath,evidencePath,expiresAt:evidence.expiresAt,aliases:fixture.aliases}));
  } catch(error) { console.error(error.code||error.name, 'QA_SETUP_FAILED'); await stop();process.exitCode=1; }
}
void main();
