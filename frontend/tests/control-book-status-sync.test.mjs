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

test('guardar una suspensión vuelve a consultar el libro y actualiza todas las boletas del contrato, sin cambiar su deuda', async t => {
  const model = compile('control-book-model.ts');
  let suspended = false, parentUpdates = 0;
  const reads = [];
  const commercial = ['ULTIMO_AVISO_REGISTRADO', 'RETIRO_PENDIENTE', 'DEUDA_VENCIDA'];
  const rows = () => commercial.map((estadoComercial, index) => ({ rowId: `10-31-${51 + index}`, idCliente: 10, idEmpresa: 1,
    idContrato: 31, numeroContrato: 'CT-31', idServicio: 41, estadoServicio: suspended ? 'Suspendido' : 'Activo',
    estadoCorte: suspended ? 'SUSPENDIDO_COMERCIAL' : null, nombre: 'Cliente de prueba', rut: '12345678-5',
    idFactura: 51 + index, numeroDocumento: `B-${51 + index}`, tipoDocumento: 'boleta', plan: 'Plan Internet',
    saldoPendiente: 19990, diasAtraso: 35 + index, estadoComercial, accionSugerida: 'Registrar contacto' }));
  const { CommercialControlBookPanel } = compile('CommercialControlBookPanel.tsx', {
    '../../api': { api: { get: async (url, options) => { reads.push({ url, params: options.params }); return { data: {
      items: rows(), dashboard: { customerCount: 1, totalDebt: 59970, overdueCustomerCount: 1, overdueInvoiceCount: 3 },
      pagination: { page: 1, totalPages: 1, totalRows: 3, pageSize: 20 },
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
  assert.deepEqual(badges().map(node => node.children.join('')), ['Último aviso', 'Retiro pendiente', 'Deuda vencida']);
  await act(async () => tree.root.findAllByType('tr').find(node => node.props['data-row-id']).props.onClick());
  await act(async () => tree.root.findAllByType('button').find(node => node.children.includes('Confirmar suspensión de prueba')).props.onClick());
  assert.equal(reads.length, 2);
  assert.ok(reads.every(request => request.url === '/commercial/control-book' && request.params.idEmpresa === '1'));
  assert.equal(parentUpdates, 1);
  assert.deepEqual(badges().map(node => node.children.join('')), ['Suspendido', 'Suspendido', 'Suspendido']);
  assert.deepEqual(badges().map(node => node.props.title), ['Último aviso', 'Retiro pendiente', 'Deuda vencida'].map(label => `Servicio: Suspendido. Cobranza: ${label}`));
  assert.ok(rows().every(row => row.saldoPendiente === 19990));
});
