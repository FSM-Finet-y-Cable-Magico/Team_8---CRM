import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import axios from 'axios';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function setup(t, validate) {
  const values = new Map([['finet_token', 'current-token']]);
  let expired = 0, cleared = 0;
  const win = new EventTarget(); win.location = { hostname: 'localhost' };
  win.addEventListener('finet:auth-expired', () => expired++);
  const storage = { getItem: key => values.get(key) ?? null };
  for (const [key, value] of Object.entries({ window: win, localStorage: storage })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  const exports = {};
  new Function('require', 'exports', code)(name => name === './lib/session' ? {
    currentSessionExpired: () => false,
    clearSession: () => { cleared++; values.clear(); },
  } : name === './lib/user-facing-messages' ? { userFacingApiError: value => value } : require(name), exports);
  const calls = [];
  exports.api.defaults.adapter = async config => {
    calls.push([config.url, config.headers.Authorization]);
    if (config.url === '/auth/me') return validate(config);
    throw failure(config, 401);
  };
  return { api: exports.api, calls, values, expired: () => expired, cleared: () => cleared };
}
const failure = (config, status) => new axios.AxiosError('Request rejected', 'ERR_BAD_RESPONSE', config, null,
  { status, data: {}, config, headers: {} });
const success = config => ({ status: 200, data: { idUsuario: 1 }, config, headers: {} });

test('401 de integración conserva una sesión válida y no repite la operación original', async t => {
  const h = setup(t, async config => success(config));
  await assert.rejects(h.api.post('/integrations/g3/installations/7/reconcile'));
  assert.deepEqual(h.calls, [['/integrations/g3/installations/7/reconcile', 'Bearer current-token'], ['/auth/me', 'Bearer current-token']]);
  assert.equal(h.expired(), 0);
  assert.equal(h.values.get('finet_token'), 'current-token');
});

for (const status of [503, 502, undefined]) test(`fallo temporal al confirmar sesión (${status ?? 'red'}) conserva credenciales`, async t => {
  const h = setup(t, async config => { throw status ? failure(config, status) : new axios.AxiosError('Network Error'); });
  await assert.rejects(h.api.get('/customers'));
  assert.equal(h.expired(), 0);
  assert.equal(h.cleared(), 0);
});

test('sesión rechazada realmente cierra una sola vez sin recursión de auth/me', async t => {
  const h = setup(t, async config => { throw failure(config, 401); });
  await assert.rejects(h.api.get('/customers'));
  assert.equal(h.expired(), 1);
  assert.equal(h.cleared(), 1);
  assert.equal(h.calls.length, 2);
});

test('respuestas 401 simultáneas comparten una sola comprobación de sesión', async t => {
  let finish;
  const h = setup(t, config => new Promise(resolve => { finish = () => resolve(success(config)); }));
  const requests = Promise.allSettled([h.api.get('/customers'), h.api.get('/prospects')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(([path]) => path === '/auth/me').length, 1);
  finish(); await requests;
  assert.equal(h.expired(), 0);
});

test('una respuesta antigua no cierra una sesión iniciada después', async t => {
  const h = setup(t, async config => { h.values.set('finet_token', 'new-token'); throw failure(config, 401); });
  await assert.rejects(h.api.get('/customers'));
  assert.equal(h.expired(), 0);
  assert.equal(h.values.get('finet_token'), 'new-token');
});
