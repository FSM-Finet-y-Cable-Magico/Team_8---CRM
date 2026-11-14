import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), exports);
  return exports;
}
const customer = { idCliente: 7, rut: '11111111-1', nombreCompleto: 'Cliente QA', email: 'qa@example.cl', estado: 'Activo' };
const category = { idCategoria: 10, nombreAtencion: 'Consulta general', tipo: 'ATENCION', tipoDisponible: true };

async function harness(t, get = async path => ({ data: path === '/customers/search' ? customer : [{ idServicio: 8, tipoServicio: 'Internet', estadoOperativo: 'Activo' }] })) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id) };
  t.mock.method(globalThis, 'fetch', () => { throw Error('Real traffic prohibited'); });
  const calls = [];
  const api = { get: (...args) => { calls.push(['get', ...args]); return get(...args); }, post: async (...args) => { calls.push(['post', ...args]); return { data: {} }; } };
  const { ToastNotice } = load('../src/shared/components/ToastNotice.tsx');
  const { TicketsPanel } = load('../src/features/tickets/TicketsPanel.tsx', {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../constants': { rutPattern: /^\d{7,8}-[\dkK]$/ },
    '../../lib': { ...load('../src/lib/rut.ts'), formatWorkOrderValue: value => value },
    '../../shared/components': { ToastNotice, StatusBadge: () => null },
    '../../shared/hooks/useTransientMessage': load('../src/shared/hooks/useTransientMessage.ts'),
    './TicketManagementModal': { TicketManagementModal: () => null },
    './ticket-presentation': { ticketMatchesSearch: () => true, manualTicketCategories: () => [category], isTerminationTicketCategory: () => false },
    '../commercial/control-book-contact-time': load('../src/features/commercial/control-book-contact-time.ts'),
  });
  let tree;
  await act(async () => { tree = create(React.createElement(TicketsPanel, { tickets: [], categories: [category], permissions: { createTickets: true }, onChanged() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); globalThis.window = originalWindow; });
  const form = () => tree.root.findByType('form');
  const input = () => form().findByType('input');
  return { tree, calls, form, input,
    change: async value => { await act(async () => input().props.onChange({ target: { value } })); },
    tick: async ms => { await act(async () => t.mock.timers.tick(ms)); },
    toast: () => tree.root.findByType(ToastNotice),
    cards: () => tree.root.findAllByProps({ className: 'customer-preview' }),
  };
}

test('consulta al dejar de escribir, conserva la ficha y el aviso verde desaparece a los tres segundos', async t => {
  const h = await harness(t);
  assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /Buscar datos del cliente/);
  await h.change('11.111.111-1'); await h.tick(499);
  assert.equal(h.calls.length, 0);
  await h.tick(1);
  assert.equal(h.calls[0][2].params.term, '11111111-1');
  assert.equal(h.cards().length, 1);
  assert.equal(h.toast().props.message, 'Cliente encontrado');
  assert.equal(h.toast().props.tone, 'success');
  assert.equal(h.form().findAllByProps({ className: 'inline-status' }).length, 0);
  await h.tick(2999); assert.equal(h.toast().props.message, 'Cliente encontrado');
  await h.tick(1); assert.equal(h.toast().props.message, '');
  assert.equal(h.cards().length, 1);
});

test('RUT inválido o correo muestra aviso rojo temporal sin consultar la red', async t => {
  const h = await harness(t);
  for (const value of ['11111111-2', 'qa@', 'qa@example.cl']) {
    await h.change(value); await h.tick(500);
    assert.equal(h.calls.length, 0);
    assert.equal(h.toast().props.message, 'Cliente no encontrado');
    assert.equal(h.toast().props.tone, 'error');
    assert.equal(h.tree.root.findAllByProps({ className: 'toast-notice toast-notice-error' }).length, 1);
    await h.tick(3000); assert.equal(h.toast().props.message, '');
  }
});

test('un cliente ausente muestra el aviso rojo y los errores de conexión conservan su motivo', async t => {
  let message = 'Cliente no encontrado';
  const h = await harness(t, async () => { throw Error(message); });
  await h.change('11111111-1'); await h.tick(500);
  assert.equal(h.toast().props.message, 'Cliente no encontrado');
  assert.equal(h.toast().props.tone, 'error');
  assert.equal(h.cards().length, 0);
  message = 'No se pudo conectar con el servicio';
  await h.change('11.111.111-1'); await h.tick(500);
  assert.equal(h.toast().props.message, message);
});

test('buscar por RUT permite crear el ticket con su RUT normalizado', async t => {
  const h = await harness(t);
  await h.change('11.111.111-1'); await h.tick(500);
  assert.equal(h.calls[0][2].params.term, '11111111-1');
  await act(async () => h.form().findAllByType('select')[1].props.onChange({ target: { value: '10' } }));
  await act(async () => h.form().findByType('textarea').props.onChange({ target: { value: 'Consulta de prueba del cliente' } }));
  await act(async () => h.form().props.onSubmit({ preventDefault() {} }));
  assert.equal(h.calls.at(-1)[0], 'post');
  assert.equal(h.calls.at(-1)[2].rut, '11111111-1');
});

test('cambiar o vaciar el dato descarta las respuestas anteriores y cancela la consulta', async t => {
  let resolve;
  const h = await harness(t, () => new Promise(done => { resolve = done; }));
  await h.change('11111111-1'); await h.tick(500);
  const signal = h.calls[0][2].signal;
  await h.change('qa@');
  assert.equal(signal.aborted, true);
  await act(async () => resolve({ data: customer }));
  assert.equal(h.cards().length, 0);
  assert.equal(h.toast().props.message, '');
  assert.equal(h.calls.length, 1);
  await h.change(''); await h.tick(1000);
  assert.equal(h.calls.length, 1);
  assert.equal(h.toast().props.message, '');
});

test('fallo al cargar servicios conserva al cliente identificado y no lo presenta como ausente', async t => {
  const h = await harness(t, async path => {
    if (path === '/customers/search') return { data: customer };
    throw Error('Fallo de servicios');
  });
  await h.change('11111111-1'); await h.tick(500);
  assert.equal(h.cards().length, 1);
  assert.match(h.toast().props.message, /No se pudieron cargar los servicios/);
  assert.equal(h.toast().props.tone, 'error');
});
