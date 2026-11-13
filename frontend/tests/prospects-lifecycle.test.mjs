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
    if (name === '../../shared/hooks/useTransientMessage') return { useTransientMessage: () => ({ message: '', showMessage() {} }) };
    if (name === '../../shared/data/chile-territories') return { findChileRegion: () => null };
    if (name === '../../lib') return { formatDateTime: String, formatRutForDisplay: value => value ?? null };
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) throw new Error(`Unmocked dependency: ${name}`);
    return require(name);
  }, exports);
  return exports[file];
}
const mocks = {
  '../contracts/useSignatureStatus': { useSignatureStatus: () => ({ status: { policy: { manualAllowed: true, mode: 'manual' } }, refresh: async () => ({ policy: { manualAllowed: true } }) }) },
  '../customers/ContractDocuments': { ContractDocuments: () => null },
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
  assert.ok(tree.root.findAllByType('button').some(button => button.children.join('') === 'Registrar firma manual'));
  act(() => tree.unmount());
});

function workflowWithApi(api) {
  return loadComponent('ProspectWorkflowPanel', { ...mocks, '../../api': { api, apiErrorMessage: error => error.message } });
}
const lostProspect = {
  idProspecto: 30, idCliente: null, estadoPipeline: 'Perdido', motivoPerdida: 'Precio elevado',
  observacionPerdida: 'Lo encontró caro', fechaPerdida: '2026-10-01T10:00:00Z', requiereRevisionComercial: false,
  nombreCompleto: 'Cliente Perdido', rut: '11111111-1', contratos: [{ idContrato: 5, estado: 'Anulado' }],
};

test('prospecto Perdido muestra motivo, no habilita cotizar y permite reactivar por la transición autorizada', async () => {
  const calls = [];
  const Component = workflowWithApi({ patch: async (...args) => { calls.push(args); return { data: {} }; } });
  let changed = 0;
  let tree;
  act(() => { tree = create(React.createElement(Component, { prospect: lostProspect, plans: [], permissions: { ...permissions, createProspects: true }, onChanged() { changed++; } })); });
  const text = JSON.stringify(tree.toJSON());
  assert.ok(text.includes('Precio elevado') && text.includes('Lo encontró caro'));
  assert.ok(!text.includes('Revisión comercial requerida'));
  for (const button of tree.root.findAllByType('button')) {
    if (/cotiza/i.test(button.children.join(''))) assert.equal(button.props.disabled, true);
  }
  const reactivate = tree.root.findAllByType('button').find(button => button.children.join('') === 'Reactivar prospecto');
  assert.ok(reactivate);
  await act(async () => { await reactivate.props.onClick(); });
  assert.deepEqual(calls, [['/prospects/30/pipeline', { estadoPipeline: 'Prospecto Nuevo' }]]);
  assert.equal(changed, 1);
  act(() => tree.unmount());
});

test('no ofrece reactivar sin permiso, para clientes o con contratos vigentes', () => {
  const Component = workflowWithApi({});
  for (const [prospect, perms] of [
    [lostProspect, { ...permissions, createProspects: false }],
    [{ ...lostProspect, idCliente: 4 }, { ...permissions, createProspects: true }],
    [{ ...lostProspect, contratos: [{ idContrato: 6, estado: 'Pendiente firma contrato' }] }, { ...permissions, createProspects: true }],
  ]) {
    let tree;
    act(() => { tree = create(React.createElement(Component, { prospect, plans: [], permissions: perms, onChanged() {} })); });
    assert.ok(!tree.root.findAllByType('button').some(button => button.children.join('') === 'Reactivar prospecto'));
    act(() => tree.unmount());
  }
});

test('la pérdida muestra motivo y fecha con observación larga desplegable y sin texto explicativo', () => {
  let tree;
  const observation = 'Motivo comercial detallado. '.repeat(30);
  act(() => { tree = create(React.createElement(Workflow, { prospect: { ...lostProspect, observacionPerdida: observation }, plans: [], permissions, onChanged() {} })); });
  const loss = tree.root.findByProps({ className: 'prospect-loss-summary' });
  assert.match(JSON.stringify(tree.toJSON()), /Precio elevado/);
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Se conserva su historial comercial'));
  const details = loss.findByType('details');
  assert.equal(details.findByType('summary').children.join(''), 'Leer observación completa');
  assert.equal(details.findByType('p').children.join(''), observation);
  act(() => tree.unmount());
});
