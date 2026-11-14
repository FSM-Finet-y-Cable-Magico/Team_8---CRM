import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
globalThis.window = globalThis; // the panel debounces with window.setTimeout
const rut = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/rut.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(rut);
function loadPanel(api) {
  const source = readFileSync(new URL('../src/features/prospects/ProspectsPanel.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../lib': { emptyProspectForm: { rut: '', nombreCompleto: '', email: '', telefono: '', direccion: '', comuna: '', region: '', origenContacto: 'Formulario web' }, formatChileanMobileInput: String, formatRutForDisplay: rut.formatRutForDisplay, formatRutInput: String, normalizeRutInput: String, validateProspectForm: () => '' },
    '../../shared/components': {
      Modal: () => null,
      TablePagination: ({ totalItems, onPageChange }) => React.createElement('button', { 'aria-label': 'pagina', 'data-total': totalItems, onClick: () => onPageChange(2) }),
    },
    './ProspectWorkflowPanel': { ProspectWorkflowPanel: () => null },
    '../coverage': { CoveragePicker: () => null },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => ({ message: '', showMessage() {} }) },
    '../../shared/data/chile-territories': { chileRegions: [], findChileRegion: () => null, normalizeTerritory: String },
  };
  new Function('require', 'exports', outputText)(name => (name in mocks ? mocks[name] : require(name)), exports);
  return exports.ProspectsPanel;
}

const row = (id, estadoPipeline, extra = {}) => ({
  idProspecto: id, idCliente: null, rut: `1111111${id}-1`, nombreCompleto: `Persona ${id}`,
  email: null, telefono: null, direccion: null, estadoPipeline, motivoPerdida: null, origenContacto: 'Referido',
  empresa: { nombre: 'FiNet' }, ...extra,
});
const baseProps = { prospects: [], loading: false, loadError: '', plans: [], writeCompanyId: 1,
  permissions: { createProspects: false }, onReload() {}, onCreated() {} };

test('con scope usa el backend paginado, muestra Perdido con motivo y reenvía filtros y página', async () => {
  const requests = [];
  const api = {
    get: async (path, config) => {
      requests.push({ path, params: config.params });
      return { data: {
        items: [row(1, 'Perdido', { motivoPerdida: 'Precio elevado', fechaPerdida: '2026-10-01T10:00:00Z' })],
        total: 101, page: config.params.page, pageSize: 20, counts: { Perdido: 40, 'Prospecto Nuevo': 61 },
      } };
    },
  };
  const Panel = loadPanel(api);
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...baseProps, scope: 'consolidado' })); });
  assert.equal(requests[0].path, '/prospects');
  assert.deepEqual(requests[0].params, { paginated: true, scope: 'consolidado', page: 1, pageSize: 20 });
  const text = JSON.stringify(tree.toJSON());
  assert.ok(text.includes('Perdido') && text.includes('Precio elevado'));
  // No summary/counter bar, neither before nor after searching.
  assert.ok(!text.includes('perdidos en la cartera'));
  assert.equal(tree.root.findAll(node => node.props?.role === 'status').length, 0);
  assert.equal(tree.root.findByProps({ 'aria-label': 'pagina' }).props['data-total'], 101);

  // Only the unified search bar is shown: no state/origin/date selectors.
  assert.equal(tree.root.findAllByType('select').length, 0);
  assert.equal(tree.root.findAllByProps({ type: 'date' }).length, 0);
  assert.equal(tree.root.findAllByType('input').filter(input => input.props.type === 'search').length, 1);
  await act(async () => { tree.root.findByProps({ 'aria-label': 'pagina' }).props.onClick(); });
  assert.equal(requests.at(-1).params.page, 2);
  await act(async () => tree.unmount());
});

test('la búsqueda de texto se aplica con retardo y viaja al backend', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  const api = { get: async (path, config) => { requests.push(config.params); return { data: { items: [], total: 0, page: 1, pageSize: 20, counts: {} } }; } };
  const Panel = loadPanel(api);
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...baseProps, scope: '1' })); });
  await act(async () => { tree.root.findByProps({ 'aria-label': 'Buscar prospecto' }).props.onChange({ target: { value: '12.345.678-5' } }); });
  const before = requests.length;
  await act(async () => { t.mock.timers.tick(300); });
  assert.ok(requests.length > before);
  assert.equal(requests.at(-1).q, '12.345.678-5');
  assert.equal(tree.root.findAll(node => node.props?.role === 'status').length, 0);
  await act(async () => tree.unmount());
});

test('el listado presenta con guion el RUT válido recibido sin guion (G2/web) y conserva el inválido tal cual', async () => {
  const api = { get: async () => ({ data: { items: [
    row(1, 'Prospecto Nuevo', { rut: '123456785', origenContacto: 'Formulario web' }),
    row(2, 'Prospecto Nuevo', { rut: '12.345.670-k' }),
    row(3, 'Prospecto Nuevo', { rut: '123456789' }),
  ], total: 3, page: 1, pageSize: 20, counts: {} } }) };
  const Panel = loadPanel(api);
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...baseProps, scope: 'consolidado' })); });
  const cells = tree.root.findAllByType('td').map(cell => cell.children.join(''));
  assert.ok(cells.includes('12345678-5'));
  assert.ok(cells.includes('12345670-K'));
  assert.ok(cells.includes('123456789'), 'un DV inválido no se corrige ni se le agrega guion');
  assert.ok(!cells.includes('123456785'));
  await act(async () => tree.unmount());
});

test('excliente: la fila muestra la etiqueta calculada por el backend en lugar de su estado histórico', async () => {
  const api = { get: async () => ({ data: { items: [
    row(4, 'Servicio Activo', { idCliente: 33, excliente: { etiqueta: 'Excliente con deuda pendiente', situacionFinanciera: 'CON_DEUDA' } }),
    row(5, 'Prospecto Nuevo'),
  ], total: 2, page: 1, pageSize: 20, counts: { Excliente: 1 } } }) };
  const Panel = loadPanel(api);
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...baseProps, scope: '1' })); });
  const rows = tree.root.findAllByType('tr').filter(tr => tr.findAllByType('td').length > 2).map(tr => tr.findAllByType('td').map(td => td.children.join('')));
  assert.equal(rows[0][2], 'Excliente con deuda pendiente');
  assert.ok(!JSON.stringify(rows[0]).includes('Servicio Activo'));
  assert.equal(rows[1][2], 'Prospecto Nuevo');
  await act(async () => tree.unmount());
});
