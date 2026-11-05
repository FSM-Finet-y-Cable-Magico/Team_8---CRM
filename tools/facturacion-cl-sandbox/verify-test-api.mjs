import { readFile, unlink, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

function responseShape(value, depth = 0) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return 'array';
  if (depth >= 3) return 'object';
  const allowedKeys = ['WSPLANO', 'version', 'Version', 'VERSION', 'Resultado', 'Mensaje', 'Detalle', 'Error'];
  return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item], index) => [
    allowedKeys.includes(key) ? key : `OTHER_${index}`, responseShape(item, depth + 1),
  ]));
}

// This probe can authenticate and read the service version. It cannot emit DTEs.
function productionCredentialsValid(credentials) {
  return credentials && typeof credentials === 'object' && !Array.isArray(credentials) &&
    Object.keys(credentials).sort().join(',') === 'clave,rut,usuario' &&
    ['usuario', 'rut', 'clave'].every(key => typeof credentials[key] === 'string' &&
      credentials[key].trim() && credentials[key].length <= 4096 && !/[\r\n\0]/.test(credentials[key]));
}

function assertProductionInput(input) {
  if (input?.environment !== 'production' || input.source !== 'provider-production-section' ||
      !Number.isSafeInteger(input.idEmpresa) || input.idEmpresa < 1 || !productionCredentialsValid(input.credentials)) {
    throw new Error('CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED');
  }
  // A known shared DEMO identity must not be relabeled as a corporate emitter.
  if (input.credentials.usuario.trim().toUpperCase() === 'DEMOFE' ||
      input.credentials.rut.replace(/[.\s]/g, '').toUpperCase() === '1-9') {
    throw new Error('DEMO_CREDENTIALS_NOT_PRODUCTION');
  }
}

export function productionInputFromEnvironment(env, idEmpresa) {
  if (env.FACTURACION_CL_PRODUCTION_PREFLIGHT_ENABLED !== 'true') throw new Error('PRODUCTION_PREFLIGHT_DISABLED');
  if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1) throw new Error('PRODUCTION_COMPANY_INVALID');
  let rows;
  try { rows = JSON.parse(env.FACTURACION_CL_PRODUCTION_PREFLIGHT_COMPANIES || '[]'); }
  catch { throw new Error('PRODUCTION_COMPANIES_INVALID'); }
  if (!Array.isArray(rows)) throw new Error('PRODUCTION_COMPANIES_INVALID');
  const ids = new Set(), aliases = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).sort().join(',') !== 'alias,idEmpresa' ||
        !Number.isSafeInteger(row.idEmpresa) || row.idEmpresa < 1 ||
        typeof row.alias !== 'string' || !/^[A-Z][A-Z0-9_]{0,39}$/.test(row.alias) ||
        ids.has(row.idEmpresa) || aliases.has(row.alias)) throw new Error('PRODUCTION_COMPANIES_INVALID');
    ids.add(row.idEmpresa); aliases.add(row.alias);
  }
  const company = rows.find(row => row.idEmpresa === idEmpresa);
  if (!company) throw new Error('PRODUCTION_COMPANY_MISSING');
  let credentials;
  try { credentials = JSON.parse(env['FACTURACION_CL_' + company.alias + '_PRODUCTION_CREDENTIALS'] || 'null'); }
  catch { throw new Error('CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED'); }
  const input = { environment: 'production', source: 'provider-production-section', idEmpresa, credentials };
  assertProductionInput(input);
  return input;
}

export async function verifyTestApi(input, request = globalThis.fetch) {
  if (input?.environment !== 'test' || input?.source !== 'provider-test-section' ||
      !['usuario', 'rut', 'clave'].every(key => typeof input.credentials?.[key] === 'string' && input.credentials[key].trim())) {
    throw new Error('CONFIRMED_TEST_CREDENTIALS_REQUIRED');
  }
  return verifyReadOnlyApi(input, request);
}

// Only login/version: this path cannot dispatch documents or access a database.
export async function verifyProductionApi(input, request = globalThis.fetch) {
  assertProductionInput(input);
  return {
    ...await verifyReadOnlyApi(input, request), idEmpresa: input.idEmpresa,
    readOnly: true, environmentEvidence: 'OPERATOR_DECLARED',
    issuerIdentityVerified: false, productionReady: false,
  };
}

async function verifyReadOnlyApi(input, request) {
  const result = { environment: input.environment, login: 'NOT_RUN', version: 'NOT_RUN', emissionRequests: 0 };
  let token;
  try {
    const response = await request('https://rest.facturacion.cl/login', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: input.credentials.usuario, rut: input.credentials.rut, clave: input.credentials.clave }),
    });
    result.loginHttpStatus = response.status;
    let body;
    try { body = await response.json(); }
    catch { result.login = 'INVALID_JSON'; }
    if (body !== undefined) {
      if (response.ok && typeof body?.token === 'string' && body.token.trim() && !/[\r\n]/.test(body.token)) {
        result.login = 'PASS';
        token = body.token;
      } else {
        result.login = 'FAIL';
      }
    }
    if (!token) return result;
    const versionResponse = await request('https://rest.facturacion.cl/wsds/version', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: token },
    });
    result.versionHttpStatus = versionResponse.status;
    let versionBody;
    try { versionBody = await versionResponse.json(); }
    catch { result.version = 'INVALID_JSON'; }
    if (versionBody !== undefined) {
      const value = versionBody?.version;
      const version = Array.isArray(value) && value.length === 1 ? value[0] : value;
      if (versionResponse.ok && typeof version === 'string' && !/[\r\n]/.test(version) && /^[0-9]+(?:\.[0-9]+){1,5}$/.test(version)) {
        result.version = 'PASS';
        result.reportedVersion = version;
        if (Array.isArray(value)) result.versionResponseShape = { version: 'array' };
      } else {
        result.version = 'UNEXPECTED_RESPONSE';
        result.versionResponseShape = responseShape(versionBody);
      }
    }
    return result;
  } catch (error) {
    // Do not expose exception messages, request bodies, tokens or remote errors.
    const code = error?.cause?.code ?? error?.name;
    const safeCodes = new Set(['EACCES', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
      'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET', 'ABORT_ERR']);
    result.transportError = safeCodes.has(code) ? code : 'TRANSPORT_ERROR';
    if (result.login === 'NOT_RUN') result.login = 'TRANSPORT_FAILED';
    else if (result.login === 'PASS' && result.version === 'NOT_RUN') result.version = 'TRANSPORT_FAILED';
    return result;
  } finally { token = undefined; }
}

async function main() {
  if (process.argv.length === 4 && process.argv[2] === '--production-company') {
    const input = productionInputFromEnvironment(process.env, Number(process.argv[3]));
    let result;
    try { result = await verifyProductionApi(input); }
    finally { input.credentials = undefined; }
    console.log(JSON.stringify(result, null, 2));
    if (result.login !== 'PASS' || result.version !== 'PASS') process.exitCode = 1;
    return;
  }
  if (process.argv.length !== 4 || process.argv[2] !== '--test-input') throw new Error('USAGE_TEST_INPUT_REQUIRED');
  // Use a temporary file outside the repository, never an environment file.
  const inputPath = resolve(process.argv[3]);
  const inputDirectory = dirname(inputPath);
  if (basename(inputPath) !== 'test-api-once.json' ||
      !/^facturacion-readonly-[A-Za-z0-9_-]+$/.test(basename(inputDirectory)) ||
      dirname(inputDirectory) !== resolve(tmpdir()) ||
      (await realpath(inputPath)) !== inputPath || !(await lstat(inputPath)).isFile()) {
    throw new Error('TEMPORARY_INPUT_OUTSIDE_REPOSITORY_REQUIRED');
  }
  let inputText;
  try { inputText = await readFile(inputPath, 'utf8'); }
  finally { await unlink(inputPath); }
  const input = JSON.parse(inputText);
  inputText = undefined;
  let result;
  try { result = await verifyTestApi(input); }
  finally { if (input.credentials) input.credentials = undefined; }
  console.log(JSON.stringify({ ...result, temporaryInputDeleted: true }, null, 2));
  if (result.login !== 'PASS' || result.version !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const safeCodes = new Set(['PRODUCTION_PREFLIGHT_DISABLED', 'PRODUCTION_COMPANY_INVALID',
      'PRODUCTION_COMPANIES_INVALID', 'PRODUCTION_COMPANY_MISSING',
      'CONFIRMED_PRODUCTION_CREDENTIALS_REQUIRED', 'DEMO_CREDENTIALS_NOT_PRODUCTION']);
    console.error(safeCodes.has(error?.message) ? error.message : 'READONLY_PROBE_FAILED');
    process.exitCode = 1;
  });
}
