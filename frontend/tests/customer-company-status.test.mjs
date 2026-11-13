import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// TK-02/TK-05: the customers table shows the dimension the API returned. A company view carries
// no global status; it shows the real service states of that company, never an invented marker.
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node?.children ?? []).map(textOf).join('');
function compile(path, mocks = {}) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  return exports;
}
const { StatusBadge } = compile('../src/shared/components/StatusBadge.tsx');
const status = compile('../src/features/customers/CustomerStatusBadge.tsx', { '../../shared/components': { StatusBadge } });
const { CustomersPanel } = compile('../src/features/customers/CustomersPanel.tsx', {
  '../../api': { api: { get: async () => ({ data: [] }), patch: async () => ({ data: {} }) }, apiErrorMessage: () => 'Error' },
  './CustomerStatusBadge': status,
  '../../constants': { captureOriginOptions: [], equipmentModeOptions: [], serviceStatusOptions: [], serviceTypeOptions: [] },
  '../../lib': { emptyServiceForm: () => ({}), dateInputValue: () => '2026-11-12', addYearsToInputDate: v => v, normalizeWorkOrderValue: v => String(v ?? '').toLowerCase(), formatWorkOrderValue: v => v, formatRutForDisplay: v => v ?? null },
  '../../shared/components': { Modal: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null, TablePagination: () => null, StatusBadge },
  './CustomerContractWorkflow': { CustomerContractWorkflow: () => null },
  './CustomerPendingInstallations': { CustomerPendingInstallations: () => null },
  './CustomerProfileForm': { CustomerProfileForm: () => null },
  './customer-services-state': compile('../src/features/customers/customer-services-state.ts'),
});
const base = { email: null, telefono: null, origenContacto: null, datosTecnicos: null, contratos: [] };

async function render(t, customers, scope) {
  let tree;
  await act(async () => { tree = create(React.createElement(CustomersPanel, { customers, plans: [], scope, permissions: {}, onChanged() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return tree;
}
const header = tree => tree.root.findAllByType('th').map(textOf);
const filter = tree => tree.root.findAll(node => node.type === 'select' && String(node.props['aria-label']).startsWith('Filtrar clientes por'))[0];
const rows = tree => tree.root.findByType('tbody').findAllByType('tr');

test('vista por empresa rotula y filtra por el estado real del servicio en esa empresa', async t => {
  const customers = [
    { ...base, idCliente: 1, idEmpresa: 2, rut: '11111111-1', nombreCompleto: 'Cliente compartido', estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: ['Activo'] },
    { ...base, idCliente: 2, idEmpresa: 2, rut: '22222222-2', nombreCompleto: 'Cliente suspendido', estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: ['Suspendido'] },
    { ...base, idCliente: 3, idEmpresa: null, rut: '33333333-3', nombreCompleto: 'Sin servicio aquí', estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: [] },
  ];
  const tree = await render(t, customers, '2');
  assert.ok(header(tree).includes('Estado del servicio en esta empresa'));
  assert.ok(!header(tree).includes('Estado actual'));
  assert.deepEqual(filter(tree).findAllByType('option').map(node => node.props.value), ['', 'activo', 'suspendido']);
  const visible = textOf(tree.toJSON());
  assert.doesNotMatch(visible, /Restringido por empresa|Estado global no compartido|Moroso/);
  assert.match(visible, /Sin servicio en esta empresa/);
  await act(async () => filter(tree).props.onChange({ target: { value: 'suspendido' } }));
  assert.equal(rows(tree).length, 1);
  assert.match(textOf(rows(tree)[0]), /Cliente suspendido/);
});

test('consolidado conserva el estado global real como dimensión del listado', async t => {
  const customers = [
    { ...base, idCliente: 1, idEmpresa: 1, rut: '11111111-1', nombreCompleto: 'Cliente moroso', estado: 'Moroso', estadoGlobalDisponible: true },
    { ...base, idCliente: 2, idEmpresa: 2, rut: '22222222-2', nombreCompleto: 'Cliente activo', estado: 'Activo', estadoGlobalDisponible: true },
  ];
  const tree = await render(t, customers, 'consolidado');
  assert.ok(header(tree).includes('Estado del cliente'));
  assert.deepEqual(filter(tree).findAllByType('option').map(node => node.props.value), ['', 'activo', 'moroso']);
  assert.doesNotMatch(textOf(tree.toJSON()), /Estado del servicio en esta empresa|Restringido por empresa/);
});
