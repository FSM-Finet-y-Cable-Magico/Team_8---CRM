import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const out = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {}; new Function('require', 'exports', out)(name => mocks[name] ?? require(name), exports); return exports;
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function harness(t, handler, companies = '1') {
  const win = new EventTarget(), doc = new EventTarget(), timers = new Set(), restore = [];
  let now = 100000, current;
  win.setInterval = fn => { timers.add(fn); return fn; }; win.clearInterval = fn => timers.delete(fn);
  doc.visibilityState = 'visible'; doc.querySelectorAll = () => [];
  for (const [name, value] of Object.entries({ window: win, document: doc })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    restore.push(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
  }
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', () => { throw Error('No external traffic'); });
  const calls = [], api = { get: async (url, options) => { calls.push({ url, options }); return { data: await handler(url, options) }; } };
  const auto = load('shared/hooks/useAutoRefresh.ts');
  const { useDashboardFinance } = load('features/dashboard/useDashboardFinance.ts', { '../../api': { api }, '../../shared/hooks/useAutoRefresh': auto });
  function View({ ids, enabled = true }) { current = useDashboardFinance(ids, enabled, 7); return null; }
  let tree; await act(async () => { tree = create(React.createElement(View, { ids: companies })); });
  t.after(async () => { await act(async () => tree.unmount()); restore.forEach(fn => fn()); assert.equal(timers.size, 0); });
  return { calls, state: () => current, refresh: async () => { await act(async () => current.refresh()); },
    update: async (ids, enabled = true) => { await act(async () => tree.update(React.createElement(View, { ids, enabled }))); },
    tick: async () => { now += 60000; await act(async () => [...timers].forEach(fn => fn())); },
    edit: value => { doc.activeElement = value ? { closest: () => ({}) } : null; },
    close: async () => { await act(async () => tree.unmount()); } };
}
const book = (amount = 19990, customers = [10]) => ({
  items: customers.map((idCliente, index) => ({ idCliente, idFactura: index + 1 })),
  summary: { totalDebt: amount }, dashboard: { totalDebt: amount + 10000, overdueInvoiceCount: customers.length, overdueCustomerCount: new Set(customers).size },
  pagination: { totalPages: 1 },
});
const invoice = { idFactura: 4, idContrato: 1, idCliente: 10, cliente: 'Fernando Pavés', plan: 'Internet', fechaVencimiento: '2026-11-15', diasRestantes: 0 };

test('saldo vencido y alertas vienen de las APIs del libro; un pago elimina la alerta sin fechas inventadas', async t => {
  let paid = false;
  const h = await harness(t, url => url.endsWith('expiring-plans') ? { items: paid ? [] : [invoice] } : book(paid ? 0 : 19990, paid ? [] : [10]));
  assert.equal(h.state().data.overdueBalance, 19990);
  assert.equal(h.state().data.alerts[0].idFactura, 4);
  assert.equal(h.state().data.alerts[0].idEmpresa, 1);
  const query = h.calls.find(call => call.url.endsWith('control-book')).options.params;
  assert.equal(query.groupBy, 'document'); assert.equal(query.vencido, true); assert.equal(query.conDeuda, true);
  paid = true; await h.refresh();
  assert.equal(h.state().data.overdueBalance, 0);
  assert.deepEqual(h.state().data.alerts, []);
  assert.ok(h.calls.every(call => call.url.startsWith('/commercial/')));
});

test('Consolidado suma las empresas y cuenta una sola vez al cliente compartido, incluyendo todas las páginas', async t => {
  const h = await harness(t, (url, { params }) => {
    if (url.endsWith('expiring-plans')) return { items: [{ ...invoice, idFactura: params.idEmpresa, idCliente: 10 }] };
    if (params.idEmpresa === 1) return params.page === 2 ? book(5000, [11]) : { ...book(5000, [10]), pagination: { totalPages: 2 } };
    return book(9000, [10, 12]);
  }, '1,2');
  assert.equal(h.state().data.overdueBalance, 14000);
  assert.equal(h.state().data.totalDebt, 34000);
  assert.equal(h.state().data.overdueCustomerCount, 3);
  assert.deepEqual(h.state().data.alerts.map(alert => alert.idEmpresa), [1, 2]);
  assert.equal(h.calls.filter(call => call.options.params.page === 2).length, 1);
});

test('una lectura lenta se comparte entre refrescos y no se solapa; datos iguales conservan referencia', async t => {
  const wait = deferred(); let delay = false;
  const h = await harness(t, async url => { if (delay) await wait.promise; return url.endsWith('expiring-plans') ? { items: [] } : book(); });
  const initial = h.state().data; delay = true;
  await h.tick(); assert.equal(h.calls.length, 4);
  await h.tick(); await h.refresh(); assert.equal(h.calls.length, 4);
  delay = false; await act(async () => wait.resolve());
  assert.strictEqual(h.state().data, initial);
});

test('cambiar de empresa cancela la lectura anterior y nunca mezcla saldos', async t => {
  const wait = deferred(); let delay = false;
  const h = await harness(t, async (url, { params }) => {
    if (delay && params.idEmpresa === 1) await wait.promise;
    return url.endsWith('expiring-plans') ? { items: [] } : book(params.idEmpresa === 1 ? 100 : 200);
  });
  delay = true; await h.tick();
  const old = h.calls.at(-1); await h.update('2');
  assert.equal(old.options.signal.aborted, true);
  assert.equal(h.state().data.overdueBalance, 200);
  await act(async () => wait.resolve()); assert.equal(h.state().data.overdueBalance, 200);
});

test('la actualización automática se pausa al editar y un fallo conserva el último saldo válido', async t => {
  let failed = false;
  const h = await harness(t, url => { if (failed) throw Error('503'); return url.endsWith('expiring-plans') ? { items: [] } : book(300); });
  const initial = h.state().data;
  h.edit(true); await h.tick(); assert.equal(h.calls.length, 2);
  h.edit(false); failed = true; await h.tick();
  assert.strictEqual(h.state().data, initial);
  const attempts = h.calls.length; await h.tick(); assert.equal(h.calls.length, attempts);
});

test('sin empresa o sin permiso no consulta el libro ni fabrica un saldo cero', async t => {
  const h = await harness(t, () => { throw Error('No debe consultarse'); }, '');
  assert.equal(h.state().data, null); assert.equal(h.calls.length, 0);
  await h.update('1', false); assert.equal(h.calls.length, 0);
});

test('al volver a abrir se lee el saldo actualizado y al cerrar se abortan las consultas pendientes', async t => {
  const wait = deferred(); let delay = false;
  const h = await harness(t, async url => { if (delay) await wait.promise; return url.endsWith('expiring-plans') ? { items: [] } : book(); });
  delay = true; await h.tick(); const last = h.calls.at(-1);
  await h.close(); assert.equal(last.options.signal.aborted, true);
  await act(async () => wait.resolve());
});
