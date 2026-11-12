import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const lib = {};
for (const file of ['formatting', 'dates', 'rut']) new Function('exports', ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(lib);
const mocks = {
  '../../lib': lib,
  '../../shared/components': {
    Modal: ({ title, open, onClose, children }) => open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, React.createElement('button', { 'aria-label': 'Cerrar modal', onClick: onClose }), children) : null,
    StatusBadge: ({ value }) => React.createElement('span', null, value), TablePagination: () => null,
  },
};
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const InstallOrderFormMock = ({ contractId, canRequest }) => React.createElement('p', null, `Formulario de instalación ${contractId} ${canRequest ? 'habilitado' : 'bloqueado'}`);
function load(installOrderForm) {
  const exports = {};
  new Function('require', 'exports', compile('../src/features/customers/CustomerPendingInstallations.tsx'))(name => name.endsWith('.css') ? {}
    : name === '../installations/InstallOrderForm' ? installOrderForm : mocks[name] ?? require(name), exports);
  return exports;
}
const component = load({ InstallOrderForm: InstallOrderFormMock });

const prospects = [1, 2, 3].map(id => ({ idProspecto: id, nombreCompleto: `Pendiente ${id}`, rut: `QA-${id}`, empresa: { idEmpresa: 1, nombre: 'Empresa QA' }, contratos: [{ idContrato: id, estado: 'Firmado', plan: { nombreComercial: 'Plan QA' }, direccionInstalacion: 'Dirección de prueba' }] }));
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.trim() === text));
async function setup(t, props = {}) {
  let tree;
  await act(async () => { tree = create(React.createElement(component.CustomerPendingInstallations, { prospects, loading: false, error: '', canManage: true, onChanged() {}, ...props })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return tree;
}

test('Clientes muestra sus pendientes de activación solo en modal, separados de la agenda técnica', async t => {
  const tree = await setup(t);
  assert.equal(tree.root.findAllByType('table').length, 0);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Ver pendientes de activación: 3' }).props['aria-haspopup'], 'dialog');
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /en agenda/);
  await act(async () => button(tree, 'Ver pendientes de activación').props.onClick());
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

test('gestionar un pendiente abre la generación de instalación en el mismo modal, con el contrato exacto', async t => {
  const tree = await setup(t, { requestedView: 'activation' });
  await act(async () => button(tree, 'Gestionar').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /Dirección de prueba/);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(button(tree, 'Gestionar instalación'), undefined);
  const form = tree.root.findByType(InstallOrderFormMock);
  assert.equal(form.props.contractId, 1);
  assert.equal(form.props.prospect.idProspecto, 1);
  assert.equal(form.props.canRequest, true);
  const readOnly = await setup(t, { requestedView: 'activation', canManage: false });
  await act(async () => button(readOnly, 'Gestionar').props.onClick());
  assert.equal(readOnly.root.findByType(InstallOrderFormMock).props.canRequest, false);
});

// Real InstallOrderForm + G3InstallationStatus with a fake API: no G3 call leaves the test.
function realForm(api) {
  const transient = {};
  new Function('require', 'exports', 'window', ts.transpileModule(readFileSync(new URL('../src/shared/hooks/useTransientMessage.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, transient, { setTimeout, clearTimeout });
  const g3 = {};
  const g3Mocks = { '../../api': { api, apiErrorMessage: e => e.message }, '../../lib': { formatDateTime: v => v ?? '-', ...require('./helpers/user-facing-messages.cjs') },
    '../../shared/components': { StatusBadge: ({ value }) => React.createElement('span', null, value), ToastNotice: () => null }, '../../shared/hooks/useTransientMessage': transient };
  new Function('require', 'exports', compile('../src/features/installations/G3InstallationStatus.tsx'))(name => g3Mocks[name] ?? require(name), g3);
  const form = {};
  new Function('require', 'exports', compile('../src/features/installations/InstallOrderForm.tsx'))(name => name === './G3InstallationStatus' ? g3 : require(name), form);
  return form;
}
function fakeG3({ tracking = null, comunaFaltante = false, hold = false } = {}) {
  const calls = []; let release;
  const api = {
    get: async path => { calls.push(['GET', path]); return { data: tracking }; },
    post: async (path, body) => {
      calls.push(['POST', path, body]);
      if (path.endsWith('installation-requirements')) return { data: { idContrato: body.idContrato, comunaFaltante, puedeCompletarComuna: false } };
      const result = { data: { idIntegracion: 5, idOtG3: 'OT-QA-1', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'PENDIENTE' } };
      return hold ? new Promise(resolve => { release = () => resolve(result); }) : result;
    },
  };
  return { api, calls, release: () => release?.() };
}
async function openDetail(t, g3, props = {}) {
  let changed = 0;
  const View = load(realForm(g3.api)).CustomerPendingInstallations;
  let tree;
  await act(async () => { tree = create(React.createElement(View, { prospects, loading: false, error: '', canManage: true, requestedView: 'activation', onChanged: () => changed++, ...props })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => button(tree, 'Gestionar').props.onClick());
  return { tree, changed: () => changed };
}
const installPosts = calls => calls.filter(([method, path]) => method === 'POST' && path === '/integrations/g3/installations');

test('desde pendiente de activación se genera una sola instalación con {idContrato}, sin segundo modal', async t => {
  const g3 = fakeG3({ hold: true });
  const h = await openDetail(t, g3);
  assert.deepEqual(g3.calls, [['GET', '/integrations/g3/contracts/1/installation'], ['POST', '/integrations/g3/installation-requirements', { idContrato: 1 }]]);
  const cta = button(h.tree, 'Generar instalación');
  assert.equal(cta.props.disabled, false);
  await act(async () => { cta.props.onClick(); cta.props.onClick(); });
  assert.deepEqual(installPosts(g3.calls), [['POST', '/integrations/g3/installations', { idContrato: 1 }]]);
  await act(async () => g3.release());
  assert.equal(button(h.tree, 'Generar instalación'), undefined);
  assert.match(JSON.stringify(h.tree.toJSON()), /OT-QA-1/);
  assert.equal(h.tree.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(h.changed(), 1);
  assert.equal(g3.calls.some(([, path]) => /activate|activation|reconcile/.test(path)), false);
});

test('tracking existente en el pendiente muestra la orden original y no ofrece generar otra', async t => {
  const g3 = fakeG3({ tracking: { idIntegracion: 5, idOtG3: 'OT-ORIGINAL', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'ASIGNADA' } });
  const h = await openDetail(t, g3);
  assert.equal(button(h.tree, 'Generar instalación'), undefined);
  assert.match(JSON.stringify(h.tree.toJSON()), /OT-ORIGINAL/);
  assert.equal(g3.calls.some(([method]) => method === 'POST'), false);
});

test('sin permiso o con comuna faltante no se envía ninguna solicitud a G3', async t => {
  const denied = fakeG3();
  const readOnly = await openDetail(t, denied, { canManage: false });
  assert.equal(button(readOnly.tree, 'Generar instalación').props.disabled, true);
  assert.equal(denied.calls.some(([method]) => method === 'POST'), false);
  const missing = fakeG3({ comunaFaltante: true });
  const blocked = await openDetail(t, missing);
  assert.equal(button(blocked.tree, 'Generar instalación').props.disabled, true);
  assert.match(JSON.stringify(blocked.tree.toJSON()), /Falta la comuna/);
  assert.equal(installPosts(missing.calls).length, 0);
});

test('cerrar el modal no genera escrituras', async t => {
  const g3 = fakeG3();
  const h = await openDetail(t, g3);
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Cerrar modal' }).props.onClick());
  assert.equal(h.tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(installPosts(g3.calls).length, 0);
});
