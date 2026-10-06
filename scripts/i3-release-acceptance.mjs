// Local-only acceptance. Never enables opt-in database tests or provider calls.
import { spawnSync,execFileSync } from 'node:child_process';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname,resolve,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(root,'docs/evidencias/i3-release/2026-10-04');
const temp=resolve(root,'.codex-review');
const run=process.argv.includes('--run-local');
const env={...process.env,CRM_INTEGRATION_TESTS:'0',RUN_DB_INTEGRATION:'0',RUN_POSTGRES_INTEGRATION_TESTS:'false',
  FACTURACION_CL_INTEGRATION_ENABLED:'false',FACTURACION_CL_COMPANIES:'[]',FACTURACION_CL_PROFILES:'[]',
  G1_INTEGRATION_ENABLED:'false',G3_INTEGRATION_ENABLED:'false',WHATSAPP_PROVIDER:'disabled',WHATSAPP_COMPANIES:'[]'};
for(const key of Object.keys(env))if(key.startsWith('SMTP_') || key==='MAIL_PROVIDER')delete env[key];
const cases=[];
function add(id,environment,precondition,expected,actual,status,evidence) {
  cases.push({CASE_ID:id,ENVIRONMENT:environment,PRECONDITION:precondition,REQUEST_SANITIZED:'Only synthetic/local requests; no operational credentials',EXPECTED:expected,ACTUAL:actual,STATUS:status,EVIDENCE:evidence});
}
const groups={
  AUTH_ROLES:['common/guards/jwt-auth.guard.spec.ts','common/roles.spec.ts'],
  MULTI_COMPANY:['integration-auth/integration-api-key.guard.spec.ts','g2-integration/g2-integration.service.spec.ts'],
  CUSTOMERS:['customers/customers.service.spec.ts'],PROSPECTS:['prospects/prospects.service.spec.ts'],
  CONTRACTS:['contracts/contracts.service.spec.ts'],SERVICES:['services/services.service.spec.ts'],
  BILLING:['billing/billing.service.spec.ts','billing/billing-read.service.spec.ts','billing/invoice-balance.spec.ts'],
  G1:['g1-integration/http-g1-inventory.client.spec.ts','g1-integration/g1-activation.service.spec.ts'],
  G2:['g2-integration/g2-integration.service.spec.ts','integration-auth/integration-api-key.guard.spec.ts'],
  G3:['g3-integration/installation-integration.service.spec.ts','g3-integration/g3-closure.processor.spec.ts','g3-integration/g3-integration.controller.spec.ts'],
  DTE:['tax-document-issuance/facturacion-cl.issuer.spec.ts','tax-document-issuance/tax-emission-intent.service.spec.ts','tax-document-issuance/tax-recovery.spec.ts'],
  META:['messaging/messaging.spec.ts','messaging/meta-webhook.http.spec.ts'],SMTP:['mail/mail.service.spec.ts'],
};
let suiteResults=[],checks=[];
if(run) {
  mkdirSync(temp,{recursive:true});mkdirSync(destination,{recursive:true});
  const execute=(name,args,cwd=root)=>{
    const result=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000,windowsHide:true});
    const output=(result.stdout ?? '')+(result.stderr ?? '');
    const summary={name,exitCode:result.status,outputSHA256:createHash('sha256').update(output).digest('hex')};
    checks.push(summary);console.log(`${name}: ${result.status===0?'PASS':'FAIL'}`);return result;
  };
  const jestFile=resolve(temp,'i3-jest.json');
  const jest=execute('BACKEND_UNIT', [resolve(root,'node_modules/jest/bin/jest.js'),'--runInBand','--silent','--json',`--outputFile=${jestFile}`],resolve(root,'backend'));
  let data;
  try{data=JSON.parse(readFileSync(jestFile,'utf8'));}catch{}
  suiteResults=(data?.testResults ?? []).map(s=>({file:relative(resolve(root,'backend/src'),s.name).replaceAll('\\','/'),status:s.status,
    passed:s.assertionResults.filter(t=>t.status==='passed').length,failed:s.assertionResults.filter(t=>t.status==='failed').length,
    skipped:s.assertionResults.filter(t=>['pending','todo','skipped'].includes(t.status)).length}));
  for(const [id,files] of Object.entries(groups)) {
    const suites=files.map(file=>suiteResults.find(s=>s.file===file));
    const pass=jest.status===0 && suites.every(s=>s && s.status==='passed' && s.passed>0 && s.failed===0 && s.skipped===0);
    add(id+'_LOCAL','UNIT/CONTRACT','Synthetic fixtures and isolated transports','All mapped tests pass',suites,pass?'PASS':'FAIL',files);
  }
  for(const [id,files] of [['GLOBAL_TOOLS',['scripts/global-schema.test.mjs','scripts/g1-smoke.test.mjs','scripts/validate-production-env.test.mjs','scripts/smoke-billing-write.test.mjs']],
    ['FRONTEND_CONFIG',['frontend/runtime-config.test.mjs']],['DTE_PROTOTYPE',['tools/facturacion-cl-sandbox/prototype.test.mjs','tools/facturacion-cl-sandbox/verify-test-api.test.mjs']]]) {
    const result=execute(id,['--test',...files]);
    add(id,'UNIT','No provider credentials','Tests pass',`exit=${result.status}`,result.status===0?'PASS':'FAIL',files);
  }
}
for(const [id,environment,requirement] of [
  ['DB_CONCURRENCY','INTEGRATION_LOCAL','Isolated PostgreSQL with all reviewed migrations'],
  ['FRONTEND_NGINX','INTEGRATION_LOCAL','Docker: production stage, health, SPA and assets HTTP checks'],
  ['CORE_UI','INTEGRATION_LOCAL','Browser + local database: login, roles, companies, prospects, contracts, services, tickets and Billing'],
  ['G1_READ','POST_DEPLOY_READ_ONLY','Authorized G1 test endpoint/key and read regression'],
  ['G2_E2E','POST_DEPLOY_AUTHORIZED_WRITE','Coordinated QA: invoices/detail, payment replay, receipt, WiFi, wrong key/company'],
  ['G3_E2E','POST_DEPLOY_AUTHORIZED_WRITE','Coordinated QA: installation, stable retry, GET OT, pending/rejected/completed, webhook/reconcile'],
  ['FINET_DTE','SANDBOX','FiNet account/profile and authorized BOLETA/FACTURA test'],
  ['CABLE_MAGICO_DTE','SANDBOX','Current Cable Magico account/profile and authorized BOLETA/FACTURA test'],
  ['META_REAL','SANDBOX','Meta account, approved templates and test recipient; real delivery status webhook'],
  ['SMTP_REAL','SANDBOX','SMTP account and test recipient; verify inbox receipt'],
  ['DEPLOY_HEALTH','POST_DEPLOY_READ_ONLY','Deployed frontend/backend URLs, CORS and readiness body'],
  ['SCHEMA_RELEASE','POST_DEPLOY_READ_ONLY','Owner-approved schema migration history and live readonly comparison'],
  ['SECURITY_RELEASE','RELEASE','Classification/remediation of tracked data dumps and full history/secret review'],
])add(id,environment,requirement,'Evidence from current release candidate','Not executed by local harness','BLOCKED',[]);
const report={baseSHA:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTree:true,runLocal:run,
  externalBusinessCalls:0,productionWrites:0,checks,suites:suiteResults,cases,
  totals:{pass:cases.filter(c=>c.STATUS==='PASS').length,fail:cases.filter(c=>c.STATUS==='FAIL').length,blocked:cases.filter(c=>c.STATUS==='BLOCKED').length},
  RELEASE_READY:false};
if(run)writeFileSync(resolve(destination,'local-acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runLocal:run,...report.totals,RELEASE_READY:false,report:run?'docs/evidencias/i3-release/2026-10-04/local-acceptance.json':null}));
if(cases.some(c=>c.STATUS==='FAIL'))process.exitCode=1;
