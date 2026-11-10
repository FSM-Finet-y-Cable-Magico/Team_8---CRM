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
  './InstallationHistoryPanel': { InstallationHistoryPanel: ({ scope, onLoaded }) => {
    React.useEffect(() => { onLoaded?.(scope, ['1:99']); }, [scope, onLoaded]);
    return null;
  } },
  './InstallOrderForm': { InstallOrderForm: ({ prospect, onChanged }) => React.createElement('button', { onClick: onChanged }, `Actualizar estado de ${prospect.idProspecto}`) },
  './InstallationCompletionForm': { InstallationCompletionForm: ({ order }) => React.createElement('p', null, `Detalle de orden ${order.idOt}`) },
};
const component = {};
new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../src/features/installations/InstallationsPanel.tsx', import.meta.url), 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), component);

const prospects = ['Sofía Demo', 'Carlos Prueba', 'Ya coordinado', 'Sin contrato firmado'].map((name, index) => ({
  idProspecto: index + 1, nombreCompleto: name, rut: `QA-${index + 1}`, direccion: 'Dirección QA',
  empresa: { idEmpresa: 1, nombre: 'Empresa QA' }, contratos: [{ estado: index === 3 ? 'Borrador' : 'Firmado' }],
}));
const workOrders = [
  { idOt: 10, idEmpresa: 1, idProspecto: 3, tipoOt: 'INSTALACION', estado: 'ASIGNADA', prioridad: 'Media', cliente: { nombreCompleto: 'Visita activa' } },
  { idOt: 11, idEmpresa: 1, tipoOt: 'Instalación', estado: 'EN_CURSO', prioridad: 'Alta', cliente: { nombreCompleto: 'Visita en curso' } },
  { idOt: 12, idEmpresa: 1, tipoOt: 'INSTALACION', estado: 'CANCELADA', prioridad: 'Alta', cliente: { nombreCompleto: 'Visita cancelada' } },
  { idOt: 13, idEmpresa: 1, tipoOt: 'INSTALACION', estado: 'COMPLETADA', cliente: { nombreCompleto: 'NO MOSTRAR COMPLETADA' } },
  { idOt: 14, idEmpresa: 1, tipoOt: 'REPARACION', estado: 'ASIGNADA', cliente: { nombreCompleto: 'NO MOSTRAR REPARACION' } },
  { idOt: 99, idEmpresa: 1, tipoOt: 'INSTALACION', estado: 'ASIGNADA', cliente: { nombreCompleto: 'NO MOSTRAR CIERRE CONFIRMADO' } },
];
const defaults = { scope: '1', prospects, pendingActivationProspects: prospects.slice(0, 3), workOrders, inventory: [], canComplete: false, focusedProspectId: null, onFocusConsumed() {}, onChanged() {} };
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.trim() === text));
async function setup(t, props = {}) {
  let tree;
  await act(async () => { tree = create(React.createElement(component.InstallationsPanel, { ...defaults, ...props })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return tree;
}


test('solo muestra la tabla de contrataciones pendientes; no vuelve a incluir OT terminales ni duplicar la agenda', async t => {
  const tree = await setup(t);
  assert.equal(tree.root.findAllByType('table').length, 1);
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 3);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Órdenes en agenda|NO MOSTRAR|Sin contrato firmado|solicitudes por coordinar/);
});

test('buscar, gestionar y volver conserva el listado y no crea solicitudes', async t => {
  let refreshed = 0;
  const tree = await setup(t, { onChanged: () => refreshed++ });
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar instalaciones en proceso' }).props.onChange({ target: { value: 'carlos' } }));
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  await act(async () => button(tree, 'Gestionar').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /Carlos Prueba/);
  await act(async () => button(tree, 'Actualizar estado de 2').props.onClick());
  assert.equal(refreshed, 1);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Cerrar modal' }).props.onClick());
  assert.equal(tree.root.findByProps({ 'aria-label': 'Buscar instalaciones en proceso' }).props.value, 'carlos');
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('gestiona una contratación que ya tiene orden local sin agregar otra tabla', async t => {
  const tree = await setup(t, { focusedProspectId: 3 });
  assert.match(JSON.stringify(tree.toJSON()), /Actualizar estado de 3/);
  assert.equal(tree.root.findAllByProps({ role: 'dialog', 'aria-label': 'Instalación técnica' }).length, 1);
  assert.equal(tree.root.findAllByType('table').length, 1);
  await act(async () => tree.update(React.createElement(component.InstallationsPanel, { ...defaults, scope: '2', focusedProspectId: null })));
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('el foco no se consume antes de que llegue la contratación pendiente', async t => {
  let consumed = 0;
  const tree = await setup(t, { pendingActivationProspects: [], focusedProspectId: 3, onFocusConsumed: () => consumed++ });
  assert.equal(consumed, 0);
  await act(async () => tree.update(React.createElement(component.InstallationsPanel, { ...defaults, focusedProspectId: 3, onFocusConsumed: () => consumed++ })));
  assert.equal(consumed, 1);
  assert.match(JSON.stringify(tree.toJSON()), /Actualizar estado de 3/);
});
