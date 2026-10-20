import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadComponent(file, mocks) {
  const source = readFileSync(new URL(`../src/features/prospects/${file}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) throw new Error(`Unmocked dependency: ${name}`);
    return require(name);
  }, exports);
  return exports[file];
}
const mocks = {
  '../../api': { api: new Proxy({}, { get() { throw new Error('I/O not allowed'); } }) },
  '../../shared/components': {
    StatusBadge: ({ value }) => React.createElement('span', null, value),
    Modal: ({ children }) => React.createElement('div', null, children),
    TablePagination: () => null,
  },
  '../coverage': { CoveragePicker: () => null },
};
const Workflow = loadComponent('ProspectWorkflowPanel', mocks);
const permissions = { generateQuotes: true, contractPlans: true, recordProspectLoss: true, manageContracts: true };

test('historico ambiguo muestra revision y no habilita firma, cotizacion o perdida', () => {
  let tree;
  act(() => { tree = create(React.createElement(Workflow, {
    prospect: { idProspecto: 10, estadoPipeline: 'Servicio Activo', requiereRevisionComercial: true,
      contratos: [{ idContrato: 20, estado: 'Pendiente firma contrato' }] },
    plans: [], permissions, onChanged() {},
  })); });
  const alert = tree.root.findByProps({ role: 'alert' });
  assert.match(alert.children.join(''), /no demuestra una activación/);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Revisión comercial requerida'));
  for (const button of tree.root.findAllByType('button')) {
    const text = button.children.join('');
    assert.ok(!/Confirmar firma|perdida/i.test(text));
    if (/cotiza/i.test(text)) assert.equal(button.props.disabled, true);
  }
  act(() => tree.unmount());
});

test('prospecto valido con contrato pendiente conserva confirmacion autorizada de firma', () => {
  let tree;
  act(() => { tree = create(React.createElement(Workflow, {
    prospect: { idProspecto: 11, estadoPipeline: 'Pendiente firma', requiereRevisionComercial: false,
      contratos: [{ idContrato: 21, estado: 'Pendiente firma contrato' }] },
    plans: [], permissions, onChanged() {},
  })); });
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.ok(tree.root.findAllByType('button').some(button => button.children.join('') === 'Confirmar firma'));
  act(() => tree.unmount());
});
