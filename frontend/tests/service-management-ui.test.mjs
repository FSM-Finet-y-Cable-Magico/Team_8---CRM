import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/customers/CustomerServiceManagementModal.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const customer = { idCliente: 10, nombreCompleto: 'Cliente de prueba', empresa: { nombre: 'FiNet' } };
const contract = { idContrato: 12, idEmpresa: 1, fechaInicio: '2026-10-01', plan: { idPlan: 1, nombreComercial: 'Plan actual', precioMensual: '20000', velocidadMbps: 400 } };
const service = { idServicio: 20, idEmpresa: 1, estadoOperativo: 'Activo', tipoServicio: 'Internet', direccion: { direccionCompleta: 'Calle Principal 123' }, instalacion: { fuente: 'G3', estado: 'COMPLETADA', idOt: 99, idTecnicoG3: 88, fechaCompletada: '2026-10-02' } };
const permissions = { changeCustomerPlan: true, manageServices: true, manageObservations: true, manageContracts: true, generateDigitalContract: true, manageCommercialWarranties: true };

async function harness(t, options = {}) {
  const calls = []; const refreshed = []; const observed = [];
  const api = {
    get: async (path, params) => {
      calls.push(['get', path, params]);
      if (path.includes('/equipment')) {
        if (options.failEquipment) throw Error('G1 interno');
        return { data: { data: [{ id_unidad: 1, numero_serie: 'SERIE-20', tipo_equipo: 'Router', estado: 'Instalado', garantia: { vigente: true } }] } };
      }
      return { data: [{ idGarantia: 30, tipo: 'Garantía comercial', fechaInicio: '2026-01-01', fechaTermino: '2027-01-01', cobertura: 'Soporte', monto: null, estado: 'ACTIVA' }] };
    },
    post: async (...args) => { calls.push(['post', ...args]); if (options.failSave) throw Error('G3 pendiente de ratificacion'); return { data: {} }; },
    patch: async (...args) => { calls.push(['patch', ...args]); return { data: {} }; },
  };
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../lib': { dateInputValue: () => '2026-11-04', formatDateOnly: value => value, formatDateTime: value => value, formatWorkOrderValue: value => value },
    '../../shared/components': { Modal: ({ open, children }) => open ? React.createElement('section', {}, children) : null, StatusBadge: ({ value }) => React.createElement('span', {}, value) },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => { const [message, showMessage] = React.useState(''); const clearMessage = React.useCallback(() => showMessage(''), []); return { message, showMessage, clearMessage }; } },
    './ContractDocuments': { ContractDocuments: () => React.createElement('p', {}, 'Documentos disponibles') },
    './PlanChangeHistory': { PlanChangeHistory: () => React.createElement('p', {}, 'Historial disponible') },
    './HistoricalG3Closure': { HistoricalG3Closure: () => React.createElement('p', {}, 'Antecedentes disponibles') },
  };
  const exports = {};
  new Function('require', 'exports', output)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), exports);
  let tree;
  await act(async () => { tree = create(React.createElement(exports.CustomerServiceManagementModal, {
    open: true, customer, contract, service: { ...service, ...options.service }, permissions: options.permissions ?? permissions,
    plans: [{ idPlan: 2, idEmpresa: 1, activo: true, nombreComercial: 'Plan nuevo', precioMensual: '30000' }, { idPlan: 3, idEmpresa: 2, nombreComercial: 'Plan otra empresa' }],
    onClose() {}, onRefresh: async id => refreshed.push(id), onOpenObservations: target => observed.push(target),
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => text(node) === label);
  const click = async label => { await act(async () => { await button(label).props.onClick(); }); };
  const form = id => tree.root.findByProps({ id });
  const change = async (node, value) => { await act(async () => node.props.onChange({ target: { value } })); };
  const submit = async id => { await act(async () => { await form(id).props.onSubmit({ preventDefault() {} }); }); };
  return { tree, calls, refreshed, observed, button, click, form, change, submit, text: () => JSON.stringify(tree.toJSON()) };
}

test('acciones en orden y sin iconos; datos completos disponibles en tres secciones', async t => {
  const h = await harness(t);
  assert.deepEqual(h.tree.root.findAllByType('button').map(text).filter(label => ['Modificar plan', 'Observaciones', 'Dar de baja'].includes(label)), ['Modificar plan', 'Observaciones', 'Dar de baja']);
  for (const label of ['Modificar plan', 'Observaciones', 'Dar de baja']) assert.equal(h.button(label).findAllByType('svg').length, 0);
  assert.equal(h.tree.root.findAllByType('details').length, 3);
  for (const value of ['Plan actual', 'Calle Principal 123', 'SERIE-20', 'Garantía comercial', 'Documentos disponibles', 'Historial disponible', 'Antecedentes disponibles']) assert.match(h.text(), new RegExp(value));
  assert.doesNotMatch(h.text(), /Fuente:|G1|G3|G8|Legado local/);
  await h.click('Observaciones');
  assert.deepEqual(h.observed, [{ tipoEntidad: 'Servicio', idEntidad: 20, idCliente: 10, idEmpresa: 1, label: 'Servicio 20' }]);
});

test('modificar plan conserva seleccion por empresa, fecha, observacion y endpoint', async t => {
  const h = await harness(t);
  await h.click('Modificar plan');
  assert.equal(h.button('Guardar cambio').props.disabled, true);
  const form = h.form('service-change-plan');
  assert.doesNotMatch(text(form.findByType('select')), /Plan otra empresa/);
  await h.change(form.findByType('select'), '2');
  await h.change(form.findByType('input'), '2026-12-01');
  await h.change(form.findByType('textarea'), 'Solicitud del cliente');
  await h.submit('service-change-plan');
  assert.deepEqual(h.calls.find(call => call[0] === 'post'), ['post', '/contracts/12/change-plan', { newPlanId: 2, fechaEfectiva: '2026-12-01', observaciones: 'Solicitud del cliente' }]);
  assert.deepEqual(h.refreshed, [20]);
});

test('baja permanece separada y requiere confirmar con el mismo payload', async t => {
  const h = await harness(t);
  await h.click('Modificar plan');
  await h.click('Dar de baja');
  assert.equal(h.tree.root.findAllByProps({ id: 'service-change-plan' }).length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'patch').length, 0);
  await h.change(h.form('service-deactivate').findByType('textarea'), 'Fin del servicio');
  await h.submit('service-deactivate');
  assert.deepEqual(h.calls.find(call => call[0] === 'patch'), ['patch', '/services/20/deactivate', { observacion: 'Fin del servicio' }]);
});

test('conserva alta y desactivacion de garantias', async t => {
  const h = await harness(t);
  await h.click('Desactivar garantía');
  assert.ok(h.calls.some(call => call[0] === 'patch' && call[1] === '/commercial-warranties/30/deactivate'));
  await h.click('Nueva garantía comercial');
  const warranty = h.tree.root.findAllByType('form')[0];
  const labels = warranty.findAllByType('label');
  const field = label => labels.find(node => text(node).startsWith(label)).findAll(node => ['input', 'textarea'].includes(node.type))[0];
  await h.change(field('Cobertura'), 'Reparación y soporte');
  await h.change(field('Número de serie'), 'SERIE-20');
  await act(async () => warranty.props.onSubmit({ preventDefault() {} }));
  const saved = h.calls.find(call => call[0] === 'post');
  assert.equal(saved[1], '/commercial-warranties');
  assert.equal(saved[2].idServicio, 20);
  assert.equal(saved[2].cobertura, 'Reparación y soporte');
  assert.equal(saved[2].numeroSerieEquipo, 'SERIE-20');
});

test('permisos y estado de baja conservan sus restricciones', async t => {
  const readonly = await harness(t, { permissions: {} });
  for (const label of ['Modificar plan', 'Dar de baja', 'Observaciones', 'Nueva garantía comercial', 'Desactivar garantía']) assert.equal(readonly.button(label), undefined);
  const inactive = await harness(t, { service: { estadoOperativo: 'Baja' } });
  assert.equal(inactive.button('Dar de baja'), undefined);
  assert.equal(inactive.button('Modificar plan'), undefined);
  assert.ok(inactive.button('Observaciones'));
});

test('errores formales conservan el borrador y los datos ausentes no se presentan como monto cero', async t => {
  const h = await harness(t, { failEquipment: true, failSave: true });
  assert.match(h.text(), /No se pudieron consultar los equipos/);
  assert.doesNotMatch(h.text(), /G1 interno/);
  await h.click('Modificar plan');
  await h.change(h.form('service-change-plan').findByType('select'), '2');
  await h.change(h.form('service-change-plan').findByType('textarea'), 'Conservar este borrador');
  await h.submit('service-change-plan');
  assert.equal(h.form('service-change-plan').findByType('textarea').props.value, 'Conservar este borrador');
  assert.match(h.text(), /No se pudo completar la operación/);
  assert.doesNotMatch(h.text(), /ratificacion/);
  assert.match(h.text(), /No registrado/);
});
