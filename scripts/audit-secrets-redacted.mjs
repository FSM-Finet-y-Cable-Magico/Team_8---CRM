import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
const findings=[];
const reportPath='docs/i3-security-redacted.json';
let previousExternalFindings=[];
try {
 const previous=JSON.parse(readFileSync(reportPath,'utf8'));
 previousExternalFindings=Array.isArray(previous.findings)
  ? previous.findings.filter(f=>f?.source==='G1_SNAPSHOT'&&f?.value==='[REDACTED]') : [];
} catch {}
const rules=[
 ['DATABASE_URI',/postgres(?:ql)?:\/\/[^\s"'<>:]+:[^\s"'<>@]+@/i],
 ['PRIVATE_KEY',/-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
 ['PROVIDER_TOKEN',/\b(?:ghp_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,}|sk-[a-zA-Z0-9_-]{30,})\b/],
 ['CREDENTIAL_LITERAL',/(?:api[_-]?key|jwt[_-]?secret|password|smtp_password|api_token|access_token|integration_secret)\s*['"]?\s*[:=]\s*['"]?([A-Za-z0-9_$!+./=-]{12,})/i],
 ['DOCUMENTED_INTEGRATION_KEY',/(?:X-API-KEY|API.key|credencial|token).*?`[A-Za-z0-9_$./+=-]{24,}`/i],
 ['HASHED_CREDENTIAL_OR_FIXTURE',/\$2[aby]\$\d{2}\$[a-zA-Z0-9./]{40,}/],
];
function scan(root,file,external=false){
 if(!/\.(?:md|sql|ts|tsx|js|mjs|json|yml|yaml|ps1|env|example|sample|txt|pem|key)$/.test(file)||/package-lock/.test(file))return;
 let text;try{text=readFileSync(join(root,file),'utf8');}catch{return;}
 text.split(/\r?\n/).forEach((line,i)=>{for(const [kind,pattern] of rules)if(pattern.test(line)){
 const fixture=/\.spec\.|\.test\.|seed|example|demo/i.test(file)||/change_me|test-only|example\.test|Prueba-local|passwordHash/.test(line);
 findings.push({source:external?'G1_SNAPSHOT':'G8_WORKTREE',file,line:i+1,type:kind,value:'[REDACTED]',status:external&&!fixture?'POTENTIAL_COMMITTED_SECRET_G1':fixture?'TEST_OR_EXAMPLE_REVIEW':'POTENTIAL_COMMITTED_SECRET',action:external?'G1 debe verificar vigencia y rotar si es real; no se copio ni utilizo.':'Revisar vigencia; retirar literal y rotar si es real; no rotado automaticamente.'});
 }});
}
for(const file of execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))scan('.',file);
const external=process.env.G1_SNAPSHOT_PATH;
if(external&&existsSync(external)){
 const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','dist','build'].includes(item.name))continue;const p=join(dir,item.name);if(item.isDirectory())walk(p);else if(statSync(p).size<2000000)scan(external,relative(external,p),true);}};
 walk(external);
}
if(!external) findings.push(...previousExternalFindings);
writeFileSync(reportPath,JSON.stringify({scope:'Working tree trackeado y nuevos; hallazgos G1 previos se conservan cuando el snapshot no esta disponible. Heuristico sin validador remoto; no certifica ausencia de secretos ni escanea todo el historial Git.',findings},null,2)+'\n');
console.log(JSON.stringify({scan:'LOCAL_REDACTED_HEURISTIC',findings:findings.length,g1:findings.filter(f=>f.source==='G1_SNAPSHOT').length}));
