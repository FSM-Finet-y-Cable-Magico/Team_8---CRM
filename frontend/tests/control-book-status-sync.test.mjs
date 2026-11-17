import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
function compile(file, mocks = {}) {
  const source = readFileSync(new URL('../src/features/commercial/' + file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports;
}

test('abrir cliente desde una alerta selecciona su ficha real y no dispara escrituras', async t => {
  const reads = []; let consumed = 0;
  const model = compile('control-book-model.ts');
  const target = { rowId: 'customer-2-10', idEmpresa: 2, idCliente: 10, nombre: 'Cliente de alerta', idFactura: null,
    saldoPendiente: 19990, diasAtraso: 3, estadoComercial: 'DEUDA_VENCIDA', accionSugerida: '', resumenCliente: { contratos: 1, facturas: 1, planes: ['Internet'] } };
  const { CommercialControlBookPanel } = compile('CommercialControlBookPanel.tsx', {
    '../../api': { api: { get: async (url, options) => { reads.push(options); return { data: {
      items: options.params.idCliente ? [target] : [], dashboard: { customerCount: 1, totalDebt: 19990, overdueCustomerCount: 1, overdueInvoiceCount: 1 },
      pagination: { page: 1, totalPages: 1, totalRows: 1, pageSize: 20 }, filterOptions: { plans: [], zones: [], commercialStatuses: [], serviceStatuses: [] },
    } }; } }, apiErrorMessage: () => 'Error' },
    './control-book-model': model,
    './ControlBookDrawer': { ControlBookDrawer: ({ row }) => React.createElement('div', { 'data-customer': row.idCliente, 'data-company': row.idEmpresa }, row.nombre) },
    './ControlBookFinancePanel': { ControlBookFinancePanel: () => null },
    './ControlBookFilters': { FILTER_LABELS: {}, filterDescription: () => '', ControlBookFilters: () => null },
    './ControlBookExternalDocuments': { ControlBookExternalDocuments: () => null },
    '../../shared/components/TablePagination': { TablePagination: () => null },
    '../../shared/hooks/useAutoRefresh': { useAutoRefresh() {} },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => ({ message: '', showMessage() {}, clearMessage() {} }) },
    './commercial-control-book.css': {},
  });
  const props = { active: true, scope: '2', writeCompanyId: 2, customers: [], companies: [], permissions: {}, onChanged() {},
    customerFocus: { idCliente: 10, idEmpresa: 2 }, onCustomerFocusConsumed: () => consumed++ };
  let tree; await act(async () => { tree = create(React.createElement(CommercialControlBookPanel, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  assert.equal(tree.root.findByProps({ 'data-customer': 10 }).props['data-company'], 2);
  assert.equal(consumed, 1);
  assert.ok(reads.some(read => read.params.idCliente === 10 && read.params.idEmpresa === 2 && read.params.groupBy === 'customer'));
  const count = reads.length;
  await act(async () => tree.update(React.createElement(CommercialControlBookPanel, { ...props, customerFocus: null })));
  assert.equal(reads.length, count);
});

test('el listado solicita un resumen por cliente y guardar una suspensión actualiza esa fila sin alterar la deuda', async t => {
  const model = compile('control-book-model.ts');
  let suspended = false, parentUpdates = 0;
  const reads = [];
  const commercial = ['ULTIMO_AVISO_REGISTRADO', 'RETIRO_PENDIENTE', 'DEUDA_VENCIDA'];
  const rows = () => [{ rowId: 'customer-1-10', idCliente: 10, idEmpresa: 1,
    idContrato: null, numeroContrato: 'CT-31', idServicio: null, estadoServicio: suspended ? 'Suspendido' : 'Activo',
    estadoCorte: suspended ? 'SUSPENDIDO_COMERCIAL' : null, nombre: 'Cliente de prueba', rut: '12345678-5',
    idFactura: null, numeroDocumento: null, tipoDocumento: null, plan: 'Plan Internet',
    resumenCliente: { contratos: 1, facturas: 3, planes: ['Plan Internet'] },
    saldoPendiente: 59970, diasAtraso: 37, estadoComercial: 'ULTIMO_AVISO_REGISTRADO', accionSugerida: 'Registrar contacto' }];
  const { CommercialControlBookPanel } = compile('CommercialControlBookPanel.tsx', {
    '../../api': { api: { get: async (url, options) => { reads.push({ url, params: options.params }); return { data: {
      items: rows(), dashboard: { customerCount: 1, totalDebt: 59970, overdueCustomerCount: 1, overdueInvoiceCount: 3 },
      pagination: { page: 1, totalPages: 1, totalRows: 1, pageSize: 20 },
      filterOptions: { plans: [], zones: [], commercialStatuses: commercial, serviceStatuses: [suspended ? 'Suspendido' : 'Activo'] },
    } }; } }, apiErrorMessage: () => 'Error' },
    './control-book-model': model,
    './ControlBookDrawer': { ControlBookDrawer: ({ onSaved }) => React.createElement('button', {
      onClick: () => { suspended = true; onSaved('Servicio suspendido.'); },
    }, 'Confirmar suspensión de prueba') },
    './ControlBookFinancePanel': { ControlBookFinancePanel: () => null },
    './ControlBookFilters': { FILTER_LABELS: {}, filterDescription: () => '', ControlBookFilters: () => null },
    './ControlBookExternalDocuments': { ControlBookExternalDocuments: () => null },
    '../../shared/components/TablePagination': { TablePagination: () => null },
    '../../shared/hooks/useAutoRefresh': { useAutoRefresh() {} },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => ({ message: '', showMessage() {}, clearMessage() {} }) },
    './commercial-control-book.css': {},
  });
  let tree;
  await act(async () => { tree = create(React.createElement(CommercialControlBookPanel, {
    scope: 'consolidado', writeCompanyId: 1, customers: [], companies: [], permissions: { manageBilling: true },
    onChanged: () => { parentUpdates++; },
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const badges = () => tree.root.findAll(node => typeof node.props.className === 'string' && node.props.className.startsWith('control-status '));
  assert.deepEqual(badges().map(node => node.children.join('')), ['Último aviso']);
  assert.equal(tree.root.findAllByType('tr').filter(node => node.props['data-row-id']).length, 1);
  assert.ok(!tree.root.findAllByType('th').some(node => node.children.join('') === 'Documento'));
  await act(async () => tree.root.findAllByType('tr').find(node => node.props['data-row-id']).props.onClick());
  await act(async () => tree.root.findAllByType('button').find(node => node.children.includes('Confirmar suspensión de prueba')).props.onClick());
  assert.equal(reads.length, 2);
  assert.ok(reads.every(request => request.url === '/commercial/control-book' && request.params.idEmpresa === '1' && request.params.groupBy === 'customer'));
  assert.equal(parentUpdates, 1);
  assert.deepEqual(badges().map(node => node.children.join('')), ['Suspendido']);
  assert.deepEqual(badges().map(node => node.props.title), ['Servicio: Suspendido. Cobranza: Último aviso']);
  assert.equal(rows()[0].saldoPendiente, 59970);
});
