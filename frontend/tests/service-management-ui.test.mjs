import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/customers/CustomerServiceActions.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const contract = { idContrato: 12, idEmpresa: 1, fechaInicio: '2026-10-01', plan: { idPlan: 1, nombreComercial: 'Plan actual', precioMensual: '20000', velocidadMbps: 400 } };
const service = { idServicio: 20, idCliente: 10, idEmpresa: 1, estadoOperativo: 'Activo', tipoServicio: 'Internet', direccion: { direccionCompleta: 'Calle Principal 123' }, instalacion: { fuente: 'G3', estado: 'COMPLETADA', idOt: 99, idTecnicoG3: 88, fechaCompletada: '2026-10-02' } };
const permissions = { changeCustomerPlan: true, manageServices: true, manageObservations: true, manageContracts: true, generateDigitalContract: true, manageCommercialWarranties: true };

async function harness(t, options = {}) {
  const calls = []; const refreshed = []; const observed = [];
  const api = {
    post: async (...args) => { calls.push(['post', ...args]); if (options.failSave) throw Error('G3 pendiente de ratificacion'); return { data: {} }; },
    patch: async (...args) => { calls.push(['patch', ...args]); return { data: {} }; },
  };
  const mocks = {
    'react-dom': { createPortal: element => element },
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../shared/components': { Modal: ({ title, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, children) },
    '../../lib': { dateInputValue: () => '2026-11-04', formatDateOnly: value => value, formatDateTime: value => value, formatWorkOrderValue: value => value },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => { const [message, showMessage] = React.useState(''); const clearMessage = React.useCallback(() => showMessage(''), []); return { message, showMessage, clearMessage }; } },
    '../observations/ObservationsModal': { ObservationsPanel: ({ target }) => { observed.push(target); return null; } },
    './PlanChangeHistory': { PlanChangeHistory: () => React.createElement('p', {}, 'Historial disponible') },
  };
  const exports = {};
  const previousDocument = globalThis.document;
  globalThis.document = { body: {} };
  t.after(() => { globalThis.document = previousDocument; });
  new Function('require', 'exports', output)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), exports);
  let tree;
  await act(async () => { tree = create(React.createElement(exports.CustomerServiceActions, {
    contract, service: { ...service, ...options.service }, permissions: options.permissions ?? permissions,
    plans: [{ idPlan: 2, idEmpresa: 1, activo: true, nombreComercial: 'Plan nuevo', precioMensual: '30000' }, { idPlan: 3, idEmpresa: 2, nombreComercial: 'Plan otra empresa' }],
    onRefresh: async id => refreshed.push(id),
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => text(node).trim() === label);
  const click = async label => { await act(async () => { await button(label).props.onClick(); }); };
  const form = id => tree.root.findByProps({ id });
  const change = async (node, value) => { await act(async () => node.props.onChange({ target: { value } })); };
  const submit = async id => { await act(async () => { await form(id).props.onSubmit({ preventDefault() {} }); }); };
  return { tree, calls, refreshed, observed, button, click, form, change, submit, text: () => JSON.stringify(tree.toJSON()) };
}

test('las acciones se presentan al final del detalle del servicio', async t => {
  const h = await harness(t);
  assert.equal(h.calls.length, 0);
  assert.equal(h.button('Observaciones'), undefined);
  assert.ok(h.button('Cambiar plan'));
  // FINET 13-11-2026: no «Dar de baja» in Clientes (only the Libro de Control starts a baja).
  assert.equal(h.button('Dar de baja'), undefined);
  assert.equal(h.tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.doesNotMatch(h.text(), /Garantías del servicio/);
});

test('modificar plan conserva seleccion por empresa, fecha, observacion y endpoint', async t => {
  const h = await harness(t);
  await h.click('Cambiar plan');
  assert.equal(h.tree.root.findByProps({ role: 'dialog' }).props['aria-label'], 'Cambiar plan');
  assert.doesNotMatch(h.text(), /Selecciona el nuevo plan y la fecha/);
  assert.equal(h.button('Guardar cambio').props.disabled, true);
  const form = h.form('service-change-plan-20');
  assert.doesNotMatch(text(form.findByType('select')), /Plan otra empresa/);
  await h.change(form.findByType('select'), '2');
  await h.change(form.findByType('input'), '2026-12-01');
  await h.change(form.findByType('textarea'), 'Solicitud del cliente');
  await h.submit('service-change-plan-20');
  assert.deepEqual(h.calls.find(call => call[0] === 'post'), ['post', '/contracts/12/change-plan', { newPlanId: 2, fechaEfectiva: '2026-12-01', observaciones: 'Solicitud del cliente' }]);
  assert.deepEqual(h.refreshed, [20]);
});

test('Clientes no ofrece la baja: solo el cambio de plan, sin llamadas de baja', async t => {
  const h = await harness(t);
  await h.click('Cambiar plan');
  assert.equal(h.button('Dar de baja'), undefined);
  assert.equal(h.tree.root.findAllByProps({ id: 'service-deactivate-20' }).length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'patch').length, 0);
});

test('permisos y estado de baja conservan sus restricciones', async t => {
  const readonly = await harness(t, { permissions: {} });
  for (const label of ['Cambiar plan', 'Dar de baja', 'Observaciones', 'Nueva garantía comercial', 'Desactivar garantía']) assert.equal(readonly.button(label), undefined);
  const inactive = await harness(t, { service: { estadoOperativo: 'Baja' } });
  assert.equal(inactive.button('Dar de baja'), undefined);
  assert.equal(inactive.button('Cambiar plan'), undefined);
  assert.equal(inactive.button('Observaciones'), undefined);
});

test('errores formales conservan el borrador', async t => {
  const h = await harness(t, { failSave: true });
  await h.click('Cambiar plan');
  await h.change(h.form('service-change-plan-20').findByType('select'), '2');
  await h.change(h.form('service-change-plan-20').findByType('textarea'), 'Conservar este borrador');
  await h.submit('service-change-plan-20');
  assert.equal(h.form('service-change-plan-20').findByType('textarea').props.value, 'Conservar este borrador');
  assert.match(h.text(), /No se pudo completar la operación/);
  assert.doesNotMatch(h.text(), /ratificacion/);
});
