import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const customer = { idCliente: 10, nombreCompleto: 'Cliente de prueba', rut: '11111111-1' };
const services = [{ idServicio: 20, idCliente: 10, tipoServicio: 'Internet', estadoOperativo: 'Activo', contrato: { plan: { nombreComercial: 'Fibra 500' } } }];

async function harness(t, options = {}) {
  const calls = []; let created = []; let changed = 0; let gets = 0;
  const api = {
    get: async path => { gets++; if (options.failRefresh && gets > 1) throw Error('Sin conexión'); return { data: [] }; },
    post: async (path, body) => { calls.push([path, body]); if (options.post) return options.post(path, body); return { data: {} }; },
  };
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../lib': { dateInputValue: () => '2026-11-04', formatDateTime: value => value, formatWorkOrderValue: value => value },
    '../../shared/components': {
      Modal: ({ title, open, children }) => open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, children) : null,
      StatusBadge: ({ value }) => React.createElement('span', {}, value),
    },
    '../observations': { ObservationsModal: () => null },
  };
  const load = file => {
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const exports = {};
    new Function('require', 'exports', output)(name => name.endsWith('.css') ? {} : mocks[name] ?? (name.startsWith('./') ? load(resolve(dirname(file), name + '.tsx')) : require(name)), exports);
    return exports;
  };
  const name = options.panel ? 'CustomerRequestsPanel' : 'NewCustomerRequestModal';
  const Component = load(fileURLToPath(new URL(`../src/features/customers/${name}.tsx`, import.meta.url)))[name];
  const props = { customer, services: options.services ?? services, servicesStatus: options.servicesStatus ?? 'success', onClose() {}, onCreated: message => created.push(message), onChanged: () => { changed++; } };
  let tree; await act(async () => { tree = create(React.createElement(Component, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => text(node) === label);
  const field = label => tree.root.findAllByType('label').find(node => text(node).startsWith(label)).findAll(node => ['input', 'select', 'textarea'].includes(node.type))[0];
  const change = async (label, value) => { await act(async () => { field(label).props.onChange({ target: { value } }); }); };
  const submit = async () => { await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); };
  return { tree, button, field, change, submit, calls, created, changed: () => changed, text: () => JSON.stringify(tree.toJSON()) };
}

test('solicitud general exige tipo y descripcion; no envia fecha ni un servicio inventado', async t => {
  const h = await harness(t);
  assert.equal(h.button('Registrar solicitud').props.disabled, true);
  await h.submit(); assert.equal(h.calls.length, 0);
  await h.change('Tipo de solicitud', 'Consulta comercial');
  await h.change('Descripción de la solicitud', '  Consulta por cobertura  ');
  await h.submit();
  assert.deepEqual(h.calls, [['/requests', { idCliente: 10, tipoSolicitud: 'Consulta comercial', idServicio: undefined, descripcion: 'Consulta por cobertura', canalOrigen: 'CRM', estado: 'Abierta' }]]);
  assert.deepEqual(h.created, ['Solicitud registrada.']);
});

test('solicitud vinculada conserva el servicio elegido y distingue registrar de aplicar un cambio', async t => {
  const h = await harness(t);
  await h.change('Tipo de solicitud', 'Cambio de plan');
  await h.change('Servicio asociado', '20');
  await h.change('Descripción de la solicitud', 'Solicita mayor velocidad');
  assert.match(h.text(), /Gestionar servicio/);
  assert.match(h.text(), /Fibra 500/);
  await h.submit();
  assert.equal(h.calls[0][1].idServicio, 20);
  assert.equal('fechaSolicitada' in h.calls[0][1], false);
});

test('retiro requiere servicio y fecha y usa exclusivamente el endpoint existente de retiros', async t => {
  const h = await harness(t);
  await h.change('Tipo de solicitud', 'Retiro de servicio');
  await h.change('Motivo del retiro', 'Cambio de domicilio');
  await h.submit(); assert.equal(h.calls.length, 0);
  await h.change('Servicio asociado', '20');
  await h.change('Fecha solicitada para el retiro', '');
  await h.submit(); assert.equal(h.calls.length, 0);
  await h.change('Fecha solicitada para el retiro', '2026-11-10');
  await h.submit();
  assert.deepEqual(h.calls, [['/service-withdrawals', { idServicio: 20, motivo: 'Cambio de domicilio', fechaSolicitada: '2026-11-10' }]]);
  assert.match(h.created[0], /pendientes de confirmación/);
  assert.doesNotMatch(h.created[0], /G3|BLOQUEADO/);
});

test('fallar al guardar conserva el borrador y presenta un mensaje formal', async t => {
  const h = await harness(t, { post: async () => { throw Error('BLOQUEADO_CONTRATO_G3'); } });
  await h.change('Tipo de solicitud', 'Otro');
  await h.change('Descripción de la solicitud', 'Detalle del cliente');
  await h.submit();
  assert.equal(h.field('Descripción de la solicitud').props.value, 'Detalle del cliente');
  assert.match(h.text(), /No se pudo registrar la solicitud/);
  assert.doesNotMatch(h.text(), /BLOQUEADO_CONTRATO_G3/);
  assert.equal(h.created.length, 0);
});

test('un envio en curso bloquea un segundo registro', async t => {
  let finish; const h = await harness(t, { post: () => new Promise(resolve => { finish = resolve; }) });
  await h.change('Tipo de solicitud', 'Otro');
  await h.change('Descripción de la solicitud', 'Seguimiento del cliente');
  let first;
  await act(async () => { first = h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(h.button('Registrando…').props.disabled, true);
  await h.submit(); assert.equal(h.calls.length, 1);
  await act(async () => { finish({ data: {} }); await first; });
  assert.equal(h.created.length, 1);
});

test('sin servicios puede registrar una consulta general pero no un retiro', async t => {
  const h = await harness(t, { services: [], servicesStatus: 'empty' });
  await h.change('Tipo de solicitud', 'Retiro de servicio');
  await h.change('Motivo del retiro', 'Cambio de domicilio');
  await h.submit(); assert.equal(h.calls.length, 0);
  assert.match(h.text(), /no tiene servicios disponibles/);
  await h.change('Tipo de solicitud', 'Consulta comercial');
  await h.submit(); assert.equal(h.calls.length, 1);
});

test('una carga de servicios en curso no se presenta como ausencia de servicios', async t => {
  const h = await harness(t, { services: [], servicesStatus: 'loading' });
  assert.match(h.text(), /Cargando servicios/);
  assert.doesNotMatch(h.text(), /no tiene servicios registrados/);
});

test('registro confirmado y fallo de recarga no reabre el formulario ni invita a duplicar', async t => {
  const h = await harness(t, { panel: true, failRefresh: true });
  await act(async () => { h.button(' Nueva solicitud').props.onClick(); });
  await h.change('Tipo de solicitud', 'Consulta comercial');
  await h.change('Descripción de la solicitud', 'Consulta del cliente');
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.match(h.text(), /Solicitud registrada/);
  assert.match(h.text(), /No se pudo actualizar la lista/);
  assert.equal(h.button('Registrar solicitud'), undefined);
  assert.equal(h.changed(), 1);
  await act(async () => { h.button(' Nueva solicitud').props.onClick(); });
  assert.equal(h.field('Descripción de la solicitud').props.value, '');
});
