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
export async function verifyTestApi(input, request = globalThis.fetch) {
  if (input?.environment !== 'test' || input?.source !== 'provider-test-section' ||
      !['usuario', 'rut', 'clave'].every(key => typeof input.credentials?.[key] === 'string' && input.credentials[key].trim())) {
    throw new Error('CONFIRMED_TEST_CREDENTIALS_REQUIRED');
  }
  const result = { environment: 'test', login: 'NOT_RUN', version: 'NOT_RUN', emissionRequests: 0 };
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
      if (versionResponse.ok && typeof versionBody?.version === 'string' && /^[0-9]+(?:\.[0-9]+){1,5}$/.test(versionBody.version)) {
        result.version = 'PASS';
        result.reportedVersion = versionBody.version;
      } else {
        result.version = 'UNEXPECTED_RESPONSE';
        result.versionResponseShape = responseShape(versionBody);
      }
    }
    return result;
  } catch (error) {
    // Do not expose exception messages, request bodies, tokens or remote errors.
    const code = error?.cause?.code ?? error?.name;
    result.transportError = typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : 'TRANSPORT_ERROR';
    if (result.login === 'NOT_RUN') result.login = 'TRANSPORT_FAILED';
    else if (result.login === 'PASS' && result.version === 'NOT_RUN') result.version = 'TRANSPORT_FAILED';
    return result;
  } finally { token = undefined; }
}

async function main() {
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
  main().catch(() => { console.error('READONLY_PROBE_FAILED'); process.exitCode = 1; });
}
