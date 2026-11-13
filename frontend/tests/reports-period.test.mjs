import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(name, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/features/reports/${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(id => mocks[id] ?? require(id), exports);
  return exports[name];
}

test('período permite dos fechas en orden inverso, previsualiza el rango y lo confirma al aplicar', async t => {
  const original = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const changes = [];
  const Picker = load('ReportPeriodPicker');
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { value: { from: '', to: '' }, onChange: value => changes.push(value), min: '2000-01-01', max: '2026-11-13' })); });
  t.after(() => { act(() => tree.unmount()); globalThis.document = original; });
  await act(async () => tree.root.findByProps({ className: 'report-period-trigger' }).props.onClick());
  assert.equal(tree.root.findAllByProps({ className: 'report-calendar-month' }).length, 1);
  assert.equal(tree.root.findAllByType('select').length, 0);
  const month = () => tree.root.findAllByProps({ className: 'report-calendar-month' })[0];
  const day = n => month().findAllByType('button').find(button => button.children[0] === String(n));
  await act(async () => day(10).props.onClick());
  assert.deepEqual(changes, []);
  await act(async () => day(5).props.onMouseEnter());
  assert.equal(month().findAllByType('button').filter(button => button.props.className.includes('in-range')).length, 6);
  await act(async () => day(5).props.onClick());
  assert.equal(day(14).props.disabled, true);
  assert.equal(day(5).props['aria-pressed'], true);
  await act(async () => tree.root.findAllByType('button').find(button => button.children[0] === 'Aplicar').props.onClick());
  assert.deepEqual(changes, [{ from: '2026-11-05', to: '2026-11-10' }]);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('período navega meses y permite limpiar el filtro sin exportar un rango parcial', async t => {
  const original = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  const changes = [];
  const Picker = load('ReportPeriodPicker');
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { value: { from: '2026-10-31', to: '2026-11-02' }, onChange: value => changes.push(value), min: '2000-01-01', max: '2026-11-13' })); });
  t.after(() => { act(() => tree.unmount()); globalThis.document = original; });
  await act(async () => tree.root.findByProps({ className: 'report-period-trigger' }).props.onClick());
  await act(async () => tree.root.findByProps({ 'aria-label': 'Mes anterior' }).props.onClick());
  assert.match(tree.root.findByProps({ className: 'report-calendar-title' }).children.join(''), /septiembre/i);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Año anterior' }).props.onClick());
  assert.match(tree.root.findByProps({ className: 'report-calendar-title' }).children.join(''), /2025/);
  await act(async () => tree.root.findByProps({ className: 'report-calendar-title' }).props.onClick());
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Seleccionar mes' }).length, 1);
  await act(async () => tree.root.findByProps({ className: 'report-calendar-title' }).props.onClick());
  assert.equal(tree.root.findAll(node => node.type === 'div' && node.props['aria-label'] === 'Seleccionar año').length, 1);
  await act(async () => tree.root.findAllByType('button').find(button => button.children[0] === '2024').props.onClick());
  const months = tree.root.findByProps({ 'aria-label': 'Seleccionar mes' });
  await act(async () => months.findAllByType('button')[1].props.onClick());
  assert.match(tree.root.findByProps({ className: 'report-calendar-title' }).children.join(''), /febrero de 2024/i);
  await act(async () => tree.root.findAllByType('button').find(button => button.children[0] === '5').props.onClick());
  assert.equal(tree.root.findAllByType('button').find(button => button.children[0] === 'Aplicar').props.disabled, true);
  assert.deepEqual(changes, []);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Borrar período' }).props.onClick());
  assert.deepEqual(changes, [{ from: '', to: '' }]);
});

test('reportes reemplaza alcance por empresa y exporta Libro de control con el período elegido', async t => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const calls = [];
  let download;
  globalThis.document = { createElement: () => { download = { click() {} }; return download; } };
  URL.createObjectURL = () => 'blob:synthetic-report'; URL.revokeObjectURL = () => {};
  const Picker = () => React.createElement('div');
  const Panel = load('ReportsPanel', {
    '../../api': { api: { get: async (path, config) => { calls.push({ path, config }); return { data: new Blob(['QA']) }; } }, apiErrorMessage: error => error.message },
    '../../constants': { reportMinimumDate: '2000-01-01' },
    '../../lib': { dateInputValue: () => '2026-11-13', formatDateOnly: value => value },
    './ReportPeriodPicker': { ReportPeriodPicker: Picker },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { companies: [{ idEmpresa: 2, nombre: 'Empresa QA' }], initialScope: 'consolidado' })); });
  t.after(() => { act(() => tree.unmount()); globalThis.document = originalDocument; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
  assert.equal(tree.root.findAllByType('select').length, 3);
  assert.equal(tree.root.findAllByType('input').length, 0);
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Clientes, servicios, documentos'));
  const selects = tree.root.findAllByType('select');
  assert.equal(selects[0].props.value, 'libro-control');
  assert.ok(!selects[0].findAllByType('option').some(option => ['cobranza', 'materiales'].includes(option.props.value)));
  await act(async () => selects[2].props.onChange({ target: { value: '2' } }));
  await act(async () => tree.root.findByType(Picker).props.onChange({ from: '2026-11-01', to: '2026-11-10' }));
  await act(async () => tree.root.findByProps({ className: 'report-button' }).props.onClick());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].config.params, { type: 'libro-control', format: 'csv', scope: '2', dateFrom: '2026-11-01', dateTo: '2026-11-10' });
  assert.equal(download.download, 'reporte-libro-control.csv');
});
