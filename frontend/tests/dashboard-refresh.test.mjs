import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../src/', import.meta.url));
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function harness(t) {
  const calls = [], intervals = new Set(), mutations = [];
  const win = new EventTarget(), doc = new EventTarget();
  let now = 100000, failure = false, delayed = null, dialogs = false;
  const user = { idUsuario: 1, idEmpresa: 1, nombreCompleto: 'Admin QA', roles: ['Administrador'] };
  const companies = [{ idEmpresa: 1, nombre: 'FiNet QA' }, { idEmpresa: 2, nombre: 'Cable QA' }];
  const customers = [{ idCliente: 1, nombreCompleto: 'Cliente QA', contratos: [] }];
  doc.visibilityState = 'visible'; doc.querySelectorAll = () => dialogs ? [{ closest: () => null }] : [];
  win.setInterval = fn => { intervals.add(fn); return fn; }; win.clearInterval = fn => intervals.delete(fn);
  win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
  const storage = new Map([['finet_user', JSON.stringify(user)], ['finet_token', 'test-only']]);
  const restore = [];
  for (const [key, value] of Object.entries({ window: win, document: doc, localStorage: { getItem: key => storage.get(key) ?? null } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', () => { throw Error('No external traffic'); });
  const api = {
    get: async (path, options = {}) => {
      calls.push({ path, options });
      const wait = delayed;
      if (wait) await wait.promise;
      if (failure) throw Error('503 Service Unavailable');
      return { data: path === '/companies' ? companies : path === '/companies/summary' ? { empresas: companies, metricas: {} }
        : path === '/customers' ? structuredClone(customers) : [] };
    },
    post: (...args) => { mutations.push(args); throw Error('Reads must not mutate'); },
    patch: (...args) => { mutations.push(args); throw Error('Reads must not mutate'); },
  };
  const mocks = new Map([
    [resolve(root, 'api.ts'), { api, apiErrorMessage: error => error.message }],
    [resolve(root, 'lib/session.ts'), { restoreSession: () => user, monitorSession: () => () => {}, clearSession() {} }],
    [resolve(root, 'shared/components/index.ts'), { Modal: () => null, ToastNotice: () => null }],
  ]);
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (mocks.has(path)) return mocks.get(path);
    if (cache.has(path)) return cache.get(path);
    if (path.startsWith(resolve(root, 'features'))) return new Proxy({}, { get: (_, name) => props => React.createElement('section', { 'data-view': name, ...props }) });
    const exports = {}; cache.set(path, exports);
    const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'exports', output)(name => {
      if (!name.startsWith('.')) return require(name);
      if (name.endsWith('.css')) return {};
      const base = resolve(dirname(path), name);
      return load(['.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => base + ext).find(existsSync));
    }, exports);
    return exports;
  }
  const App = load(resolve(root, 'App.tsx')).default;
  let tree; await act(async () => { tree = create(React.createElement(App)); });
  t.after(async () => { await act(async () => tree.unmount()); restore.forEach(fn => fn()); assert.equal(intervals.size, 0); assert.equal(mutations.length, 0); });
  const go = async label => { await act(async () => tree.root.findAllByType('button').find(node => text(node) === label).props.onClick()); };
  return {
    calls, go, tree, customers,
    view: name => tree.root.findByProps({ 'data-view': name }),
    tick: async (ms = 60000) => { now += ms; await act(async () => { [...intervals].forEach(fn => fn()); }); },
    focus: async () => { await act(async () => { win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('online')); }); },
    fail: value => { failure = value; }, delay: value => { delayed = value; },
    edit: value => { doc.activeElement = value ? { closest: () => ({}) } : null; },
    dialog: value => { dialogs = value; }, hidden: value => { doc.visibilityState = value ? 'hidden' : 'visible'; },
    scope: async value => { await act(async () => tree.root.findByProps({ 'aria-label': 'Seleccionar empresa' }).props.onChange({ target: { value } })); },
  };
}

test('Prospectos actualiza solo sus fuentes, sin repetir peticiones de Tickets, OT, usuarios ni auditoría', async t => {
  const h = await harness(t); h.calls.length = 0;
  await h.go('Prospectos');
  assert.deepEqual(h.calls.map(call => call.path).sort(), ['/plans', '/prospects']);
  h.calls.length = 0; await h.focus();
  assert.deepEqual(h.calls.map(call => call.path).sort(), ['/plans', '/prospects']);
  await h.focus(); assert.equal(h.calls.length, 2, 'focus y visibility no disparan otra ronda');
  await h.tick(); assert.equal(h.calls.length, 4);
});

test('las lecturas idénticas conservan identidad y no refrescan fichas descendientes', async t => {
  const h = await harness(t); await h.go('Clientes');
  const initial = h.view('CustomersPanel').props.customers;
  h.calls.length = 0; await h.tick();
  assert.strictEqual(h.view('CustomersPanel').props.customers, initial);
  assert.equal(h.calls.length, 2);
});

test('no consulta automáticamente al escribir, tener modal abierto o pestaña oculta', async t => {
  const h = await harness(t); await h.go('Clientes'); h.calls.length = 0;
  h.edit(true); await h.tick(); await h.focus(); assert.equal(h.calls.length, 0);
  h.edit(false); h.dialog(true); await h.tick(); assert.equal(h.calls.length, 0);
  h.dialog(false); h.hidden(true); await h.tick(); assert.equal(h.calls.length, 0);
  h.hidden(false); await h.focus(); assert.equal(h.calls.length, 2);
});

test('503 conserva datos y usa espera progresiva sin banners duplicados ni avisos de otro módulo', async t => {
  const h = await harness(t); await h.go('Clientes');
  const initial = h.view('CustomersPanel').props.customers;
  h.calls.length = 0; h.fail(true); await h.tick();
  assert.strictEqual(h.view('CustomersPanel').props.customers, initial);
  assert.equal(h.tree.root.findAllByProps({ className: 'section-read-error' }).length, 1);
  assert.ok(!text(h.tree.toJSON()).includes('actualizar el ticket'));
  assert.equal(h.calls.length, 2); await h.focus(); await h.tick(); assert.equal(h.calls.length, 2);
  await h.tick(); assert.equal(h.calls.length, 4);
  h.fail(false);
  await act(async () => h.tree.root.findAllByType('button').find(node => text(node) === 'Reintentar').props.onClick());
  assert.equal(h.tree.root.findAllByProps({ className: 'section-read-error' }).length, 0);
  assert.deepEqual(h.view('CustomersPanel').props.customers, h.customers);
});

test('lectura lenta no se solapa y se aborta al navegar; respuesta tardía no modifica otra sección', async t => {
  const h = await harness(t); await h.go('Clientes'); h.calls.length = 0;
  const wait = deferred(); h.delay(wait); await h.tick();
  const previous = [...h.calls]; assert.equal(previous.length, 2);
  await h.tick(); await h.focus(); assert.equal(h.calls.length, 2);
  h.delay(null); await h.go('Prospectos');
  assert.ok(previous.every(call => call.options.signal.aborted));
  await act(async () => wait.resolve());
  assert.equal(h.tree.root.findAllByProps({ className: 'section-read-error' }).length, 0);
});

test('respuesta de empresa anterior no repuebla listas después de cambiar el filtro', async t => {
  const h = await harness(t); await h.go('Clientes');
  const wait = deferred(); h.delay(wait); await h.tick();
  const stale = h.calls.filter(call => call.path === '/customers').at(-1);
  h.delay(null); await h.scope('2');
  assert.ok(stale.options.signal.aborted);
  await act(async () => wait.resolve());
  assert.equal(h.view('CustomersPanel').props.scope, '2');
  assert.equal(h.calls.filter(call => call.path === '/customers').at(-1).options.params.scope, '2');
});

test('una alerta del dashboard abre el libro con el cliente y la empresa de esa alerta', async t => {
  const h = await harness(t);
  await act(async () => h.view('DashboardHome').props.onOpenControlBook({ idCliente: 10, idEmpresa: 2 }));
  const book = h.view('CommercialControlBookPanel');
  assert.equal(book.props.scope, '2');
  assert.deepEqual(book.props.customerFocus, { idCliente: 10, idEmpresa: 2 });
  await act(async () => book.props.onCustomerFocusConsumed());
  assert.equal(h.view('CommercialControlBookPanel').props.customerFocus, null);
  h.calls.length = 0; await h.go('Dashboard');
  assert.ok(h.calls.some(call => call.path === '/companies/summary'));
  assert.ok(h.calls.some(call => call.path === '/customers'));
  assert.ok(!h.calls.some(call => call.path === '/billing/overview'));
});
