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
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const permissions = { createTickets: true, classifyTickets: true, updateTicketStatus: true, diagnoseTickets: true, registerTechnicalNotes: true };
const ticket = { idTicket: 1, idEmpresa: 2, idCliente: 100, idServicio: 2, idCategoria: 1,
  codigoSeguimiento: 'TK-QA', prioridad: 'Media', estado: 'En progreso', cliente: { nombreCompleto: 'QA' },
  categoria: { nombre: 'Soporte QA' }, workOrders: [], observacionesTecnicas: [{ metadata: 'QA', texto: 'Nota historica' }] };

async function harness(t, name, props) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited'); });
  const calls = [];
  let refreshed = 0;
  let failure = null;
  const api = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (...args) => {
    calls.push([method, ...args]);
    if (failure && failure.path === args[0]) { const message = failure.message; failure = null; throw new Error(message); }
    return { data: {} };
  }]));
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../constants': { rutPattern: /^[0-9]+-[0-9kK]$/ },
    '../../lib': { normalizeRutInput: value => value, formatWorkOrderValue: value => value ?? '-',
      normalizeWorkOrderValue: value => (value ?? '').toLowerCase(), formatDateTime: value => value ?? '-',
      formatDateOnly: value => value ?? '-', formatConnectionType: value => value ?? '-' },
    '../../shared/components': {
      Modal: ({ open, children }) => open ? React.createElement('section', {}, children) : null,
      StatusBadge: ({ value }) => React.createElement('span', {}, value),
      HistoryBox: ({ title, value }) => React.createElement('div', {}, `${title}: ${value}`),
    },
  };
  function load(file) {
    const source = readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } });
    const exports = {};
    new Function('require', 'exports', outputText)(name => {
      if (name.endsWith('.css')) return {};
      if (mocks[name]) return mocks[name];
      if (name.startsWith('./')) return load(resolve(dirname(file), name + (name.endsWith('ticket-presentation') ? '.ts' : '.tsx')));
      return require(name);
    }, exports);
    return exports;
  }
  const exports = load(fileURLToPath(new URL(`../src/features/${name === 'TicketsPanel' ? 'tickets' : 'work-orders'}/${name}.tsx`, import.meta.url)));
  let tree;
  await act(async () => { tree = create(React.createElement(exports[name], { ...props, onChanged: () => { refreshed++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => textOf(node) === label);
  const click = async label => { await act(async () => { button(label).props.onClick(); }); };
  const field = label => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label)).findAll(node => ['input', 'select', 'textarea'].includes(node.type))[0];
  const submit = async label => {
    let form = button(label); while (form.type !== 'form') form = form.parent;
    await act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
  };
  await click('Gestionar');
  return { tree, calls, button, click, field, submit, text: () => JSON.stringify(tree.toJSON()), refreshed: () => refreshed,
    failNext: (path, message = 'No se pudo guardar el cambio.') => { failure = { path, message }; },
    change: async (node, value) => { await act(async () => node.props.onChange({ target: { value } })); } };
}

test('Tickets separa gestion, seguimiento y resolucion con mensajes de produccion', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [{ idCategoria: 1, nombre: 'Soporte QA' }], permissions });
  assert.match(ctx.text(), /Sin orden técnica asociada/);
  assert.doesNotMatch(ctx.text(), /G3|ratifica|payload/);
  assert.equal(ctx.button('Generar orden de trabajo'), undefined);
  assert.equal(ctx.button('Guardar cambios').props.disabled, true);
  for (const label of ['Gestión', 'Seguimiento1', 'Resolución']) assert.ok(ctx.button(label), label);
  await ctx.click('Seguimiento1');
  assert.match(ctx.text(), /Nota historica/);
  assert.equal(ctx.calls.length, 0);
});

test('diagnostico conserva payload compatible y anuncia la resolucion', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions });
  await ctx.click('Resolución');
  assert.match(ctx.text(), /ticket quedará resuelto/);
  await ctx.change(ctx.field('Causa raíz'), 'Causa QA');
  await ctx.change(ctx.field('Problema detectado'), 'Problema QA');
  await ctx.change(ctx.field('Acciones realizadas'), 'Acciones QA');
  await ctx.change(ctx.field('Estado observado del servicio'), 'En Mantencion');
  await ctx.submit('Guardar y resolver ticket');
  assert.deepEqual(ctx.calls, [['post', '/tickets/1/diagnosis', { causaRaiz: 'Causa QA', descripcionProblema: 'Problema QA',
    accionesRealizadas: 'Acciones QA', estadoFinalServicio: 'En Mantencion', observaciones: '' }]]);
  assert.match(ctx.text(), /El ticket está resuelto/);
  assert.equal(ctx.button('Guardar y resolver ticket'), undefined);
  assert.equal(ctx.refreshed(), 1);
});

test('OT pendiente bloquea resolucion directa pero conserva notas y escalamiento comercial', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, hasOpenWorkOrder: true,
    workOrders: [{ idOt: 80, tipoOt: 'Reparacion', estado: 'Pendiente' }] }], categories: [], permissions });
  await ctx.change(ctx.field('Estado del ticket'), 'Resuelto');
  assert.equal(ctx.button('Guardar cambios').props.disabled, true);
  await ctx.submit('Guardar cambios');
  assert.equal(ctx.calls.length, 0);
  await ctx.click('Resolución');
  assert.equal(ctx.button('Guardar y resolver ticket').props.disabled, true);
  await ctx.submit('Guardar y resolver ticket');
  assert.equal(ctx.calls.length, 0);
  assert.match(ctx.text(), /orden técnica está pendiente/);
  assert.doesNotMatch(ctx.text(), /G3|ratifica/);
  await ctx.click('Gestión');
  await ctx.change(ctx.field('Estado del ticket'), 'Escalado');
  await ctx.submit('Guardar cambios');
  await ctx.click('Seguimiento1');
  await ctx.change(ctx.field('Nueva observación'), 'Seguimiento QA');
  await ctx.submit('Agregar observación');
  assert.deepEqual(ctx.calls, [
    ['patch', '/tickets/1/status', { estado: 'Escalado', comentario: '' }],
    ['post', '/tickets/1/technical-notes', { observacion: 'Seguimiento QA' }],
  ]);
});

for (const estado of ['Pendiente', 'Completada']) {
  test(`OT reparacion ${estado}: conserva consulta historica y elimina cierre local`, async t => {
    const ctx = await harness(t, 'WorkOrdersPanel', { workOrders: [{ idOt: 80, idTicket: 1, idCliente: 100,
      tipoOt: 'Reparacion', estado, prioridad: 'Media', observaciones: 'HISTORICO_QA', fechaCompletada: '2026-10-01',
      ticket: { codigoSeguimiento: 'TK-QA' }, cliente: { nombreCompleto: 'QA' } }] });
    assert.match(ctx.text(), /OT-REP-000080/);
    assert.match(ctx.text(), /TK-QA/);
    assert.match(ctx.text(), /solo lectura/);
    assert.match(ctx.text(), estado === 'Completada' ? /antecedentes del trabajo técnico/ : /pendiente de confirmación/);
    assert.doesNotMatch(ctx.text(), /G3|ratificado|LEGACY_LOCAL/);
    assert.equal(ctx.button('Completar orden y resolver ticket'), undefined);
    assert.equal(ctx.calls.length, 0);
  });
}

test('panel sin permisos permite consultar antecedentes sin ofrecer edicion', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions: {} });
  assert.equal(ctx.button('Resolución'), undefined);
  assert.equal(ctx.button('Guardar cambios'), undefined);
  await ctx.click('Seguimiento1');
  assert.equal(ctx.button('Agregar observación'), undefined);
  assert.match(ctx.text(), /Nota historica/);
  assert.equal(ctx.calls.length, 0);
});

test('guardar cambios envia solo campos editados y mantiene los contratos existentes', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [{ idCategoria: 2, nombre: 'Internet lento' }], permissions });
  // Creation and management have labels in common; scope fields to the modal tab.
  const panel = ctx.tree.root.findByProps({ id: 'ticket-panel-management' });
  const select = value => panel.findAllByType('select').find(node => node.props.value === value);
  await ctx.change(select('1'), '2');
  await ctx.change(select('Media'), 'Alta');
  await ctx.change(ctx.field('Estado del ticket'), 'Escalado');
  await ctx.change(ctx.field('Motivo del cambio'), 'Seguimiento telefónico');
  await ctx.submit('Guardar cambios');
  assert.deepEqual(ctx.calls, [
    ['patch', '/tickets/1/category', { idCategoria: 2 }],
    ['patch', '/tickets/1/priority', { prioridad: 'Alta' }],
    ['patch', '/tickets/1/status', { estado: 'Escalado', comentario: 'Seguimiento telefónico' }],
  ]);
  assert.equal(ctx.button('Guardar cambios').props.disabled, true);
  assert.equal(ctx.refreshed(), 1);
});

test('fallo parcial conserva pendientes y reintenta solo lo que falta', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [{ idCategoria: 2, nombre: 'Internet lento' }], permissions });
  const panel = ctx.tree.root.findByProps({ id: 'ticket-panel-management' });
  await ctx.change(panel.findAllByType('select').find(node => node.props.value === '1'), '2');
  await ctx.change(panel.findAllByType('select').find(node => node.props.value === 'Media'), 'Alta');
  ctx.failNext('/tickets/1/priority');
  await ctx.submit('Guardar cambios');
  assert.match(ctx.text(), /Quedan cambios pendientes/);
  assert.equal(ctx.button('Guardar cambios').props.disabled, false);
  await ctx.submit('Guardar cambios');
  assert.deepEqual(ctx.calls.map(call => call[1]), ['/tickets/1/category', '/tickets/1/priority', '/tickets/1/priority']);
});

test('un error conserva la observacion escrita y presenta un mensaje formal', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions });
  await ctx.click('Seguimiento1');
  await ctx.change(ctx.field('Nueva observación'), 'Contacto con el cliente');
  ctx.failNext('/tickets/1/technical-notes', 'G3 pendiente de ratificacion');
  await ctx.submit('Agregar observación');
  assert.equal(ctx.field('Nueva observación').props.value, 'Contacto con el cliente');
  assert.match(ctx.text(), /No se pudo guardar/);
  assert.doesNotMatch(ctx.text(), /G3|ratificacion/);
  assert.equal(ctx.refreshed(), 0);
});

test('cambiar o reabrir un ticket limpia los borradores anteriores', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions });
  await ctx.click('Seguimiento1');
  await ctx.change(ctx.field('Nueva observación'), 'Borrador');
  await ctx.click('Cerrar');
  await ctx.click('Gestionar');
  await ctx.click('Seguimiento1');
  assert.equal(ctx.field('Nueva observación').props.value, '');
  assert.equal(ctx.calls.length, 0);
});

test('una orden pendiente secundaria tambien impide resolver', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, workOrders: [
    { idOt: 1, estado: 'Completada' }, { idOt: 2, estado: 'Pendiente' },
  ] }], categories: [], permissions });
  await ctx.click('Resolución');
  assert.equal(ctx.button('Guardar y resolver ticket').props.disabled, true);
});

test('seguimiento separa el reporte y conserva notas, comentarios y diagnosticos sin duplicarlos', async t => {
  const description = 'Internet intermitente\n\n[Observacion tecnica - 2026-11-03T10:00:00.000Z - Soporte]\nSe contactó al cliente\nComentario: En revisión\n\nDiagnostico tecnico:\nCausa raiz: Cable suelto\nAcciones: Ajuste de conexión\nEstado final: Activo';
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, descripcion: description, observacionesTecnicas: [{ metadata: '2026-11-03T10:00:00.000Z - Soporte', texto: 'Se contactó al cliente\nComentario: En revisión' }] }], categories: [], permissions });
  assert.match(ctx.text(), /Internet intermitente/);
  assert.doesNotMatch(ctx.text(), /Se contactó al cliente/);
  await ctx.click('Seguimiento3');
  assert.equal((ctx.text().match(/Se contactó al cliente/g) ?? []).length, 1);
  assert.match(ctx.text(), /En revisión/);
  assert.match(ctx.text(), /Cable suelto/);
  assert.match(ctx.text(), /Estado observado: Activo/);
});
