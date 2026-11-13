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

// FINET 13-11-2026: Clientes no longer offers any baja. A baja for non-payment starts only from the Libro de Control
// (suspension, then guided withdrawal); the administrative baja is an Administrador-only API exception.
for (const state of ['Suspendido', 'Activo', 'Moroso']) {
  test(`servicio ${state}: Clientes no ofrece «Dar de baja» ni «Solicitar retiro por morosidad»`, async t => {
    for (const permissions of [{}, { manageServices: true, manageCustomerRequests: true, changeCustomerPlan: true }]) {
      const h = await harness(t, { state, permissions });
      assert.equal(h.button('Dar de baja'), undefined);
      assert.equal(h.button('Solicitar retiro por morosidad'), undefined);
      assert.equal(h.tree.root.findAllByType('form').length, 0);
      assert.equal(h.calls.length, 0);
    }
  });
}

test('el componente no conserva rutas de baja directa ni de retiro', () => {
  const source = readFileSync(new URL('../src/features/customers/CustomerServiceActions.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.(post|patch)\([^)]*(service-withdrawals|deactivate)/);
  assert.doesNotMatch(source, /motivo: 'MOROSIDAD'/);
});
