import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {}; new Function('require', 'exports', code)(name => mocks[name] ?? require(name), exports); return exports;
}
const { TablePagination } = load('shared/components/TablePagination.tsx');
const lib = load('lib/formatting.ts');
const { WorkOrdersPanel } = load('features/work-orders/WorkOrdersPanel.tsx', {
  '../../lib': { ...lib, formatDateOnly: String }, '../../api': {},
  '../../shared/components': { TablePagination, Modal: () => null, StatusBadge: () => null },
  './WorkOrderDetail': { WorkOrderDetail: () => null },
});
test('26 órdenes por página, búsqueda y ordenación globales, y ajuste al reducir resultados', async t => {
  const orders = Array.from({ length: 55 }, (_, i) => ({ idOt: i + 1, codigoSeguimiento: `OT-${String(i + 1).padStart(3, '0')}`,
    tipoOt: 'INSTALACION', estado: 'PENDIENTE', cliente: { nombreCompleto: `Persona ${i + 1}` } }));
  let tree; await act(async () => { tree = create(React.createElement(WorkOrdersPanel, { workOrders: orders, onChanged() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const rows = () => tree.root.findByType('tbody').findAllByType('tr');
  assert.equal(rows().length, 26);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Página siguiente' }).props.onClick());
  assert.equal(rows().length, 26); assert.equal(rows()[0].findAllByType('td')[0].children.join(''), 'OT-027');
  await act(async () => tree.root.findByProps({ 'aria-label': 'Página siguiente' }).props.onClick());
  assert.equal(rows().length, 3);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar órdenes de trabajo' }).props.onChange({ target: { value: 'Persona 55' } }));
  assert.equal(rows().length, 1); assert.equal(rows()[0].findAllByType('td')[0].children.join(''), 'OT-055');
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar órdenes de trabajo' }).props.onChange({ target: { value: '' } }));
  const sort = () => tree.root.findByType('thead').findAllByType('button')[0];
  await act(async () => sort().props.onClick()); await act(async () => sort().props.onClick());
  assert.equal(rows()[0].findAllByType('td')[0].children.join(''), 'OT-055');
  await act(async () => tree.root.findByProps({ 'aria-label': 'Página siguiente' }).props.onClick());
  await act(async () => tree.update(React.createElement(WorkOrdersPanel, { workOrders: orders.slice(0, 10), onChanged() {} })));
  assert.equal(rows().length, 10);
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Paginación de resultados' }).length, 0);
});
