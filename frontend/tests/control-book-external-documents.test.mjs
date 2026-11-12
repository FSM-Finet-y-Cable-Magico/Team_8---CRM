import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function harness(t, initial = {}) {
  const panels = [];
  const source = readFileSync(new URL('../src/features/commercial/ControlBookExternalDocuments.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mocks = {
    '../../shared/components': { Modal: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null },
    '../billing/ExternalTaxDocumentsPanel': { ExternalTaxDocumentsPanel: props => {
      panels.push(props); return React.createElement('div', { 'data-panel': 'external-documents' });
    } },
  };
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  let props = { active: true, scope: '2', writeCompanyId: 2, customers: [], canView: true, canManage: true, disabled: false, ...initial };
  let tree; await act(async () => { tree = create(React.createElement(exports.ControlBookExternalDocuments, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return { tree, panels, open: async () => { await act(async () => tree.root.findByType('button').props.onClick()); },
    update: async next => { props = { ...props, ...next }; await act(async () => tree.update(React.createElement(exports.ControlBookExternalDocuments, props))); } };
}

test('entrada global no necesita cliente ni factura y mantiene permisos/empresa originales', async t => {
  const h = await harness(t);
  assert.equal(h.panels.length, 0);
  await h.open();
  assert.equal(h.panels.at(-1).fixedCustomerId, undefined);
  assert.equal(h.panels.at(-1).scope, '2'); assert.equal(h.panels.at(-1).writeCompanyId, 2);
  assert.equal(h.panels.at(-1).canManage, true);
  assert.equal(h.tree.root.findAllByType('p').length, 0);
});

test('sin autorización no monta panel y cambio de empresa o módulo cierra el contexto anterior', async t => {
  const denied = await harness(t, { canView: false, canManage: false });
  assert.equal(denied.tree.toJSON(), null); assert.equal(denied.panels.length, 0);
  const h = await harness(t); await h.open();
  await h.update({ scope: '1', writeCompanyId: 1 });
  assert.equal(h.tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  await h.open(); assert.equal(h.panels.at(-1).writeCompanyId, 1);
  await h.update({ active: false });
  assert.equal(h.tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});
