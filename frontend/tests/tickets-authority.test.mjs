import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
  const source = readFileSync(new URL(`../src/features/${name === 'TicketsPanel' ? 'tickets' : 'work-orders'}/${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const calls = [];
  let refreshed = 0;
  const api = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (...args) => {
    calls.push([method, ...args]);
    return { data: {} };
  }]));
  const mocks = {
    '../../api': { api, apiErrorMessage: () => 'Error QA' },
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
  const exports = {};
  new Function('require', 'exports', outputText)(name => mocks[name] ?? require(name), exports);
  let tree;
  await act(async () => { tree = create(React.createElement(exports[name], { ...props, onChanged: () => { refreshed++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => textOf(node) === label);
  const click = async label => { await act(async () => { button(label).props.onClick(); }); };
  await click('Gestionar');
  return { tree, calls, button, click, text: () => JSON.stringify(tree.toJSON()), refreshed: () => refreshed,
    change: async (node, value) => { await act(async () => node.props.onChange({ target: { value } })); } };
}

test('Tickets conserva gestion comercial e historicos sin ofrecer creacion local de OT', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [{ idCategoria: 1, nombre: 'Soporte QA' }], permissions });
  assert.match(ctx.text(), /pendiente de ratificacion/);
  assert.match(ctx.text(), /Nota historica/);
  assert.equal(ctx.button('Generar orden de trabajo'), undefined);
  for (const label of ['Clasificar', 'Actualizar', 'Cambiar estado', 'Registrar diagnóstico', 'Registrar observación']) assert.ok(ctx.button(label), label);
  assert.equal(ctx.calls.length, 0);
});

test('diagnostico conserva payload compatible y explica que solo resuelve el ticket', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions });
  const byPlaceholder = value => ctx.tree.root.findAll(node => node.props.placeholder === value)[0];
  await ctx.change(byPlaceholder('Causa raíz'), 'Causa QA');
  await ctx.change(byPlaceholder('Problema detectado'), 'Problema QA');
  await ctx.change(byPlaceholder('Acciones realizadas'), 'Acciones QA');
  await ctx.change(ctx.tree.root.findByProps({ 'aria-label': 'Estado observado en el diagnostico' }), 'En Mantencion');
  await ctx.click('Registrar diagnóstico');
  assert.deepEqual(ctx.calls, [['post', '/tickets/1/diagnosis', { causaRaiz: 'Causa QA', descripcionProblema: 'Problema QA',
    accionesRealizadas: 'Acciones QA', estadoFinalServicio: 'En Mantencion', observaciones: '' }]]);
  assert.match(ctx.text(), /no modifica el estado financiero/);
  assert.match(ctx.text(), /resuelve solo el ticket/);
  assert.equal(ctx.refreshed(), 1);
});

test('OT pendiente bloquea resolucion directa pero conserva notas y escalamiento comercial', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, hasOpenWorkOrder: true,
    workOrders: [{ idOt: 80, tipoOt: 'Reparacion', estado: 'Pendiente' }] }], categories: [], permissions });
  assert.equal(ctx.button('Registrar diagnóstico').props.disabled, true);
  assert.match(ctx.text(), /ratificaci/);
  assert.doesNotMatch(ctx.text(), /Registra el cierre desde/);
  await ctx.change(ctx.tree.root.findAllByType('select').find(node => node.props.value === 'En progreso'), 'Resuelto');
  assert.equal(ctx.button('Cambiar estado').props.disabled, true);
  await ctx.change(ctx.tree.root.findAllByType('select').find(node => node.props.value === 'Resuelto'), 'Escalado');
  assert.equal(ctx.button('Cambiar estado').props.disabled, false);
  await ctx.click('Cambiar estado');
  await ctx.change(ctx.tree.root.findByProps({ placeholder: 'Agregar observación técnica sin cerrar el ticket' }), 'Seguimiento QA');
  await ctx.click('Registrar observación');
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
    assert.match(ctx.text(), /ratificado con G3/);
    assert.equal(ctx.button('Completar orden y resolver ticket'), undefined);
    assert.equal(ctx.calls.length, 0);
  });
}

test('panel sin permisos no ofrece diagnostico ni cambios comerciales', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions: {} });
  assert.equal(ctx.button('Registrar diagnóstico'), undefined);
  assert.equal(ctx.button('Cambiar estado'), undefined);
  assert.equal(ctx.button('Registrar observación'), undefined);
  assert.equal(ctx.calls.length, 0);
});
