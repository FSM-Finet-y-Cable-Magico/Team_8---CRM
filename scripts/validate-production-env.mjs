import { pathToFileURL } from 'node:url';

const configured = value => typeof value === 'string' && value.trim().length > 0;
const placeholder = value => /change[_ -]?me|reemplazar|example|placeholder/i.test(value ?? '');

function validOrigin(value, allowPath = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (allowPath || url.pathname === '/') && (allowPath || !url.pathname || url.pathname === '/');
  } catch { return false; }
}

export function validateIntegrationKeys(raw) {
  if (!configured(raw)) return { configured: false, valid: true };
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length) return { configured: false, valid: Array.isArray(rows) };
    const ids = new Set(), hashes = new Set();
    const valid = rows.every(row => {
      if (!row || typeof row !== 'object' || !/^[a-zA-Z0-9._-]{1,64}$/.test(row.keyId ?? '')
        || !/^G[1-9]\d?$/.test(row.group ?? '') || !/^[a-fA-F0-9]{64}$/.test(row.sha256 ?? '')
        || !Array.isArray(row.companies) || !row.companies.length
        || row.companies.some(id => !Number.isSafeInteger(id) || id < 1) || typeof row.active !== 'boolean'
        || ids.has(row.keyId) || hashes.has(row.sha256.toLowerCase())) return false;
      ids.add(row.keyId); hashes.add(row.sha256.toLowerCase()); return true;
    });
    return { configured: true, valid };
  } catch { return { configured: true, valid: false }; }
}

export function validateFacturacionClCompanies(raw) {
  if (!configured(raw)) return { configured: false, valid: true, count: 0 };
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return { configured: true, valid: false, count: 0 };
    const ids = new Set(), aliases = new Set();
    const expectedKeys = ['alias', 'enabled', 'environment', 'idEmpresa'];
    const valid = rows.every(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)
        || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expectedKeys)
        || !Number.isSafeInteger(row.idEmpresa) || row.idEmpresa < 1
        || !/^[A-Z0-9_]{1,40}$/.test(row.alias ?? '')
        || !['sandbox', 'production'].includes(row.environment)
        || typeof row.enabled !== 'boolean' || ids.has(row.idEmpresa) || aliases.has(row.alias)) return false;
      ids.add(row.idEmpresa); aliases.add(row.alias); return true;
    });
    return { configured: true, valid, count: valid ? rows.length : 0 };
  } catch { return { configured: true, valid: false, count: 0 }; }
}

function canonicalRut(value) {
  if (typeof value !== 'string') return null;
  const cleaned=value.replace(/[.\s-]/g,'').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(cleaned)) return null;
  const body=cleaned.slice(0,-1), verifier=cleaned.slice(-1);
  const sum=[...body].reverse().reduce((total,n,i)=>total+Number(n)*(2+i%6),0), mod=11-sum%11;
  return verifier===(mod===11?'0':mod===10?'K':String(mod)) ? body+'-'+verifier : null;
}

// Structural pre-deploy check only; backend and live schema checks remain authoritative.
export function validateProductionTaxConfig(env) {
  try {
    if (String(env.FACTURACION_CL_PRODUCTION_ENABLED??'false').trim().toLowerCase()!=='true') return false;
    const companies=JSON.parse(env.FACTURACION_CL_COMPANIES??'[]').filter(c=>c.enabled);
    const profiles=JSON.parse(env.FACTURACION_CL_PROFILES??'[]');
    if (!Array.isArray(profiles) || !companies.length) return false;
    return companies.every(c=>{
      if (c.environment!=='production') return false;
      const matches=profiles.filter(p=>p.idEmpresa===c.idEmpresa), p=matches[0];
      if (matches.length!==1 || p.approved!==true || !canonicalRut(p.issuerRut) ||
          !['BOLETA','FACTURA'].includes(p.defaultDocumentType) ||
          ![39,41].includes(p.receipt?.tipoDte) || !['utf8','latin1'].includes(p.receipt?.encoding) ||
          ![1,2,3].includes(p.receipt?.serviceIndicator)) return false;
      if (p.defaultDocumentType==='FACTURA' && !p.invoice) return false;
      if (p.invoice && (![33,34].includes(p.invoice.tipoDte) || ![p.invoice.folioFrom,p.invoice.folioTo].every(f=>typeof f==='string'&&/^[1-9]\d{0,9}$/.test(f)) ||
          BigInt(p.invoice.folioFrom)>BigInt(p.invoice.folioTo) || (p.invoice.tipoDte===33 && (!/^\d{1,2}(\.\d{1,2})?$/.test(p.invoice.vatRate??'') || Number(p.invoice.vatRate)<=0)) || (p.invoice.tipoDte===34 && p.invoice.vatRate!==undefined))) return false;
      const creds=JSON.parse(env['FACTURACION_CL_'+c.alias+'_PRODUCTION_CREDENTIALS']??'null');
      return creds && Object.keys(creds).sort().join(',')==='clave,rut,usuario' &&
        ['usuario','rut','clave'].every(k=>typeof creds[k]==='string'&&creds[k].trim()&&!/[\r\n\0]/.test(creds[k])) &&
        creds.usuario.trim().toUpperCase()!=='DEMOFE' && canonicalRut(creds.rut)===canonicalRut(p.issuerRut);
    });
  } catch { return false; }
}

export function validateProductionEnv(env) {
  const rows = [], errors = [];
  const add = (name, status, valid = true, reason = '') => {
    rows.push(`${name}: ${status}`);
    if (!valid) errors.push(`${name}_${reason || 'INVALID'}`);
  };

  let databaseValid = false;
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    databaseValid = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1)
      && !placeholder(env.DATABASE_URL);
  } catch { databaseValid = false; }
  add('DATABASE_URL', databaseValid ? 'configured' : 'invalid or missing', databaseValid);

  const jwt = env.JWT_SECRET ?? '';
  const jwtValid = jwt.length >= 32 && !placeholder(jwt);
  add('JWT_SECRET', jwtValid ? 'configured' : 'invalid or missing', jwtValid);

  const port = Number(env.PORT ?? 3000);
  add('PORT', Number.isInteger(port) && port >= 1 && port <= 65535 ? 'configured' : 'invalid', Number.isInteger(port) && port >= 1 && port <= 65535);

  const trustProxy = Number(env.TRUST_PROXY_HOPS ?? 0);
  add('TRUST_PROXY_HOPS', Number.isInteger(trustProxy) && trustProxy >= 0 && trustProxy <= 10 ? 'configured' : 'invalid', Number.isInteger(trustProxy) && trustProxy >= 0 && trustProxy <= 10);
  const requestTimeout = Number(env.REQUEST_TIMEOUT_MS ?? 30000);
  add('REQUEST_TIMEOUT_MS', Number.isInteger(requestTimeout) && requestTimeout >= 1000 && requestTimeout <= 120000 ? 'configured' : 'invalid', Number.isInteger(requestTimeout) && requestTimeout >= 1000 && requestTimeout <= 120000);

  const origins = (env.FRONTEND_URL ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const originsValid = origins.length > 0 && origins.every(validOrigin);
  add('FRONTEND_URL', originsValid ? 'configured' : 'invalid or missing', originsValid);

  const g1Enabled = String(env.G1_INTEGRATION_ENABLED ?? 'false').toLowerCase() === 'true';
  const g1UrlSet = configured(env.G1_API_URL), g1KeySet = configured(env.G1_API_KEY);
  const g1UrlValid = !g1UrlSet || validOrigin(env.G1_API_URL);
  const g1KeyValid = !g1KeySet || (env.G1_API_KEY === env.G1_API_KEY.trim() && !/[\r\n]/.test(env.G1_API_KEY));
  add('G1_API_URL', g1UrlSet ? (g1UrlValid ? 'configured' : 'invalid') : 'not configured (integration disabled)', g1UrlValid && (!g1Enabled || g1UrlSet));
  add('G1_API_KEY', g1KeySet ? (g1KeyValid ? 'configured' : 'invalid') : 'not configured (integration disabled)', g1KeyValid && (!g1Enabled || g1KeySet));
  const timeout = Number(env.G1_REQUEST_TIMEOUT_MS ?? 8000);
  add('G1_REQUEST_TIMEOUT_MS', Number.isInteger(timeout) && timeout >= 1 && timeout <= 60000 ? 'configured' : 'invalid', Number.isInteger(timeout) && timeout >= 1 && timeout <= 60000);

  const publicUrlSet = configured(env.G8_PUBLIC_API_URL);
  const publicUrlValid = !publicUrlSet || (validOrigin(env.G8_PUBLIC_API_URL, true) && new URL(env.G8_PUBLIC_API_URL).pathname.replace(/\/$/, '') === '/api');
  add('G8_PUBLIC_API_URL', publicUrlSet ? (publicUrlValid ? 'configured' : 'invalid') : 'not configured (optional)', publicUrlValid);

  const s2s = validateIntegrationKeys(env.G8_INTEGRATION_API_KEYS);
  add('G8_S2S_AUTH', s2s.configured ? (s2s.valid ? 'configured' : 'invalid') : 'not configured', s2s.valid);

  const facturacionFlag = String(env.FACTURACION_CL_INTEGRATION_ENABLED ?? 'false').trim().toLowerCase();
  const facturacionFlagValid = facturacionFlag === 'true' || facturacionFlag === 'false';
  const productionFlag=String(env.FACTURACION_CL_PRODUCTION_ENABLED??'false').trim().toLowerCase();
  const productionFlagValid=['true','false'].includes(productionFlag);
  const productionContract=validateFacturacionClCompanies(env.FACTURACION_CL_COMPANIES).valid && validateProductionTaxConfig(env);
  add('FACTURACION_CL_PRODUCTION_ENABLED', productionFlagValid ? productionFlag : 'invalid', productionFlagValid);
  add('FACTURACION_CL_INTEGRATION_ENABLED', facturacionFlagValid
    ? (facturacionFlag === 'true' ? (productionContract ? 'configured: explicit production opt-in' : 'blocked: pending contract') : 'disabled') : 'invalid',
  facturacionFlagValid && (facturacionFlag === 'false' || productionContract), facturacionFlag === 'true' ? 'PENDING_CONTRACT' : 'INVALID');
  const facturacionCompanies = validateFacturacionClCompanies(env.FACTURACION_CL_COMPANIES);
  add('FACTURACION_CL_COMPANIES', facturacionCompanies.configured
    ? (facturacionCompanies.valid ? `configured (${facturacionCompanies.count})` : 'invalid') : 'not configured (defaults to empty)',
  facturacionCompanies.valid);
  return { ok: errors.length === 0, rows, errors };
}

export function main(env = process.env, output = console.log) {
  const result = validateProductionEnv(env);
  for (const row of result.rows) output(row);
  output(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`);
  if (!result.ok) output(`ERROR_CODES: ${result.errors.join(',')}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
