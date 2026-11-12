import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
async function harness(t, options = {}) {
  const calls = [];
  const mocks = {
    'react-dom': { createPortal: element => element },
    '../../shared/components': { Modal: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null },
    '../../api': { apiErrorMessage: error => error.message, api: {
      post: async (...args) => { calls.push(['post', ...args]); if (options.fail) throw Error('Registra el aviso previo'); return { data: {} }; },
      patch: async (...args) => { calls.push(['patch', ...args]); return { data: {} }; },
    } },
    '../../lib': { dateInputValue: () => '2026-11-11' },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => {
      const [message, showMessage] = React.useState(''); return { message, showMessage };
    } },
    '../observations/ObservationsModal': { ObservationsPanel: () => null },
    './PlanChangeHistory': { PlanChangeHistory: () => null },
  };
  const source = readFileSync(new URL('../src/features/customers/CustomerServiceActions.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  const previousDocument = globalThis.document;
  globalThis.document = { body: {} };
  t.after(() => { globalThis.document = previousDocument; });
  new Function('require', 'exports', output)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), exports);
  const service = { idServicio: 40, idCliente: 10, idEmpresa: 2, estadoOperativo: options.state ?? 'Suspendido' };
  const permissions = { manageServices: true, manageCustomerRequests: options.authorized !== false, ...options.permissions };
  let tree;
  await act(async () => { tree = create(React.createElement(exports.CustomerServiceActions, {
    service, contract: { idContrato: 20, idEmpresa: 2 }, plans: [], permissions, onRefresh: async () => {},
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => text(node) === label);
  const submit = async () => { await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); };
  const note = async value => { await act(async () => tree.root.findByType('textarea').props.onChange({ target: { value } })); };
  return { tree, button, submit, note, calls, service };
}

test('servicio suspendido solicita retiro con contexto exacto sin confirmar una baja', async t => {
  const h = await harness(t);
  assert.equal(h.button('Dar de baja'), undefined);
  await act(async () => h.button('Solicitar retiro por morosidad').props.onClick());
  await h.submit(); assert.equal(h.calls.length, 0);
  await h.note('  Solicita retiro tras aviso  '); await h.submit();
  assert.deepEqual(h.calls, [['post', '/service-withdrawals', { idServicio: 40, idContrato: 20, motivo: 'MOROSIDAD',
    fechaSolicitada: '2026-11-11', observaciones: 'Solicita retiro tras aviso' }]]);
  assert.equal(h.service.estadoOperativo, 'Suspendido');
  assert.match(JSON.stringify(h.tree.toJSON()), /sigue suspendido/);
});

test('rechazo del aviso preserva observaciones y no anuncia baja', async t => {
  const h = await harness(t, { fail: true });
  await act(async () => h.button('Solicitar retiro por morosidad').props.onClick());
  await h.note('Conservar evidencia'); await h.submit();
  assert.equal(h.tree.root.findByType('textarea').props.value, 'Conservar evidencia');
  assert.match(JSON.stringify(h.tree.toJSON()), /Registra el aviso previo/);
  assert.ok(h.calls.every(call => call[0] === 'post'));
});

test('permiso de solicitudes permite retiro sin habilitar baja administrativa', async t => {
  const h = await harness(t, { permissions: { manageServices: false, manageCustomerRequests: true } });
  assert.equal(h.button('Dar de baja'), undefined);
  await act(async () => h.button('Solicitar retiro por morosidad').props.onClick());
  await h.note('Retiro autorizado'); await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1], '/service-withdrawals');
});

test('no ofrece retiro sin permiso y conserva baja administrativa ajena a morosidad', async t => {
  const denied = await harness(t, { authorized: false });
  assert.equal(denied.button('Solicitar retiro por morosidad'), undefined);
  const h = await harness(t, { state: 'Activo' });
  await act(async () => h.button('Dar de baja').props.onClick());
  await h.note('Motivo administrativo'); await h.submit();
  assert.deepEqual(h.calls, [['patch', '/services/40/deactivate', { observacion: 'Motivo administrativo' }]]);
});
