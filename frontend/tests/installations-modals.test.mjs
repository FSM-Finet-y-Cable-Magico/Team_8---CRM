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
    React.useEffect(() => { onLoaded(scope, ['1:99']); }, [scope, onLoaded]);
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
const defaults = { scope: '1', prospects, pendingActivationProspects: [prospects[0]], workOrders, inventory: [], canComplete: false, focusedProspectId: null, onFocusConsumed() {}, onChanged() {} };
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.trim() === text));
async function setup(t, props = {}) {
  let tree;
  await act(async () => { tree = create(React.createElement(component.InstallationsPanel, { ...defaults, ...props })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return tree;
}

test('las dos tablas permanecen visibles en la página sin agruparse en contadores o modales', async t => {
  const tree = await setup(t);
  assert.equal(tree.root.findAllByType('table').length, 2);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Solicitudes por coordinar' }).findByType('tbody').findAllByType('tr').length, 2);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Órdenes en agenda' }).findByType('tbody').findAllByType('tr').length, 2);
  assert.equal(tree.root.findAllByProps({ className: 'installation-summary-strip' }).length, 0);
});

test('coordinar abre únicamente la gestión en modal y conserva el listado al volver', async t => {
  let refreshed = 0;
  const tree = await setup(t, { onChanged: () => refreshed++ });
  const rows = () => tree.root.findByProps({ 'aria-label': 'Solicitudes por coordinar' }).findByType('tbody').findAllByType('tr');
  assert.equal(rows().length, 2);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar solicitudes por coordinar' }).props.onChange({ target: { value: 'carlos' } }));
  assert.equal(rows().length, 1);
  await act(async () => button(tree, 'Gestionar').props.onClick());
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.match(JSON.stringify(tree.toJSON()), /Carlos Prueba/);
  await act(async () => button(tree, 'Actualizar estado de 2').props.onClick());
  assert.equal(refreshed, 1);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => button(tree, 'Volver al listado').props.onClick());
  assert.equal(tree.root.findByProps({ 'aria-label': 'Buscar solicitudes por coordinar' }).props.value, 'carlos');
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('agenda conserva filtros y detalle; cancelaciones quedan consultables fuera de la agenda activa', async t => {
  const tree = await setup(t, { requestedView: 'agenda' });
  const rows = () => tree.root.findByProps({ 'aria-label': 'Órdenes en agenda' }).findByType('tbody').findAllByType('tr');
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(rows().length, 2);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /NO MOSTRAR|Visita cancelada/);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Filtrar órdenes por estado' }).props.onChange({ target: { value: 'all' } }));
  assert.equal(rows().length, 3);
  assert.match(JSON.stringify(tree.toJSON()), /Visita cancelada/);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Filtrar órdenes por prioridad' }).props.onChange({ target: { value: 'alta' } }));
  assert.equal(rows().length, 2);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar órdenes de instalación' }).props.onChange({ target: { value: 'en curso' } }));
  assert.equal(rows().length, 1);
  await act(async () => button(tree, 'Detalle').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /Detalle de orden 11/);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => button(tree, 'Volver al listado').props.onClick());
  assert.equal(tree.root.findByProps({ 'aria-label': 'Buscar órdenes de instalación' }).props.value, 'en curso');
  assert.equal(tree.root.findByProps({ 'aria-label': 'Filtrar órdenes por prioridad' }).props.value, 'alta');
});

test('acceso enfocado abre la coordinación y un cambio de empresa no arrastra el modal anterior', async t => {
  let consumed = 0;
  const tree = await setup(t, { focusedProspectId: 1, onFocusConsumed: () => consumed++ });
  assert.equal(consumed, 1);
  assert.match(JSON.stringify(tree.toJSON()), /Actualizar estado de 1/);
  await act(async () => tree.update(React.createElement(component.InstallationsPanel, { ...defaults, scope: '2', focusedProspectId: null })));
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});
