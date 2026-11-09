import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const lib = {};
for (const file of ['formatting', 'dates']) new Function('exports', ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(lib);
const mocks = {
  '../../lib': lib,
  '../../shared/components': {
    Modal: ({ title, open, onClose, children }) => open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, React.createElement('button', { 'aria-label': 'Cerrar modal', onClick: onClose }), children) : null,
    StatusBadge: ({ value }) => React.createElement('span', null, value), TablePagination: () => null,
  },
};
const component = {};
new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../src/features/customers/CustomerPendingInstallations.tsx', import.meta.url), 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), component);

const prospects = [1, 2, 3].map(id => ({ idProspecto: id, nombreCompleto: `Pendiente ${id}`, rut: `QA-${id}`, empresa: { idEmpresa: 1, nombre: 'Empresa QA' }, contratos: [{ idContrato: id, estado: 'Firmado', plan: { nombreComercial: 'Plan QA' }, direccionInstalacion: 'Dirección de prueba' }] }));
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.trim() === text));
async function setup(t, props = {}) {
  let tree;
  await act(async () => { tree = create(React.createElement(component.CustomerPendingInstallations, { prospects, loading: false, error: '', canManage: true, onManageInstallation() {}, ...props })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return tree;
}

test('Clientes muestra sus pendientes de activación solo en modal, separados de la agenda técnica', async t => {
  const tree = await setup(t);
  assert.equal(tree.root.findAllByType('table').length, 0);
  assert.match(JSON.stringify(tree.toJSON()), /3 por activar/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /en agenda/);
  await act(async () => button(tree, 'Ver pendientes').props.onClick());
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 3);
});

test('acceso de dashboard a activación permite buscar, gestionar y volver en un solo modal', async t => {
  let consumed = 0;
  const tree = await setup(t, { requestedView: 'activation', onViewConsumed: () => consumed++ });
  assert.equal(consumed, 1);
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 3);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar pendientes de activación' }).props.onChange({ target: { value: 'QA-2' } }));
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  await act(async () => button(tree, 'Gestionar').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /Pendiente 2/);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => button(tree, 'Volver a pendientes').props.onClick());
  assert.equal(tree.root.findByProps({ 'aria-label': 'Buscar pendientes de activación' }).props.value, 'QA-2');
});

test('gestión de un pendiente conserva el id de prospecto y respeta permisos', async t => {
  const managed = [];
  const tree = await setup(t, { requestedView: 'activation', onManageInstallation: id => managed.push(id) });
  await act(async () => button(tree, 'Gestionar').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /Dirección de prueba/);
  await act(async () => button(tree, 'Gestionar instalación').props.onClick());
  assert.deepEqual(managed, [1]);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  const readOnly = await setup(t, { requestedView: 'activation', canManage: false });
  await act(async () => button(readOnly, 'Gestionar').props.onClick());
  assert.equal(button(readOnly, 'Gestionar instalación'), undefined);
});
