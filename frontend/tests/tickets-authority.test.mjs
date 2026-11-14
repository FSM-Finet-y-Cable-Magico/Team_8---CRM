import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const formatting = {};
const rutFormatting = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/rut.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(rutFormatting);
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(formatting);
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const permissions = { createTickets: true, classifyTickets: true, updateTicketStatus: true, diagnoseTickets: true, registerTechnicalNotes: true };
const ticket = { idTicket: 1, idEmpresa: 2, idCliente: 100, idServicio: 2, idCategoria: 1,
  codigoSeguimiento: 'TK-QA', prioridad: 'Media', estado: 'En progreso', cliente: { nombreCompleto: 'QA' },
  categoria: { nombre: 'Soporte QA' }, workOrders: [], observacionesTecnicas: [{ metadata: 'QA', texto: 'Nota historica' }] };

test('buscador de tickets combina campos y encuentra RUT, códigos y cualquier OT sin alterar el listado original', async t => {
  const target = { ...ticket, idTicket: 15, codigoSeguimiento: 'FIN-2026-000015', prioridad: 'Crítica',
    descripcion: 'Internet intermitente', cliente: { nombreCompleto: 'José Muñoz', rut: '12345678-5', email: 'jose@example.cl', telefono: '+56912345678' },
    categoria: { nombre: 'Facturación y cobro' }, workOrders: [{ idOt: 14, codigoSeguimiento: 'OT-REP-000014', estado: 'COMPLETADA' }, { idOt: 27, estado: 'PENDIENTE' }] };
  const ctx = await harness(t, 'TicketsPanel', { tickets: [target, { ...ticket, idTicket: 16 }], categories: [], permissions }, { openManually: false });
  const search = ctx.tree.root.findByProps({ 'aria-label': 'Buscar ticket' });
  const rows = () => ctx.tree.root.findByType('tbody').findAllByType('tr');
  for (const query of ['jose facturacion', '12.345.678-5', 'FIN2026000015', 'ot 27', 'OT-REP-000014', 'critica', 'intermitente', 'jose@example.cl', '+56 9 1234 5678']) {
    await ctx.change(search, query);
    assert.equal(rows().length, 1, query);
    assert.match(textOf(rows()[0]), /FIN-2026-000015/, query);
  }
  await ctx.change(search, 'sin coincidencias');
  assert.match(textOf(rows()[0]), /No se encontraron tickets/);
  await ctx.change(search, '');
  assert.equal(rows().length, 2);
  assert.deepEqual(ctx.calls, []);
});

test('búsqueda disponible en modo de consulta, con datos incompletos y sin formulario de registro', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, cliente: null, categoria: null, workOrders: null }], categories: [], permissions: {} }, { openManually: false });
  assert.equal(ctx.tree.root.findAllByType('form').length, 0);
  await ctx.change(ctx.tree.root.findByProps({ 'aria-label': 'Buscar ticket' }), 'en progreso');
  assert.match(textOf(ctx.tree.root.findByType('tbody')), /TK-QA/);
  assert.deepEqual(ctx.calls, []);
});

async function harness(t, name, props, { openManually = true } = {}) {
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
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
    '../../lib': { ...formatting, ...rutFormatting, normalizeRutInput: value => value, formatWorkOrderValue: value => value ?? '-',
      normalizeWorkOrderValue: value => (value ?? '').toLowerCase(), formatDateTime: value => value ?? '-',
      formatDateOnly: value => value ?? '-', formatConnectionType: value => value ?? '-' },
    '../../shared/components': {
      Modal: ({ open, children }) => open ? React.createElement('section', {}, children) : null,
      StatusBadge: ({ value }) => React.createElement('span', {}, value),
      ToastNotice: () => null,
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
      if (name.startsWith('.')) { const base = resolve(dirname(file), name); return load(existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
      return require(name);
    }, exports);
    return exports;
  }
  const exports = load(fileURLToPath(new URL(`../src/features/${name === 'TicketsPanel' ? 'tickets' : 'work-orders'}/${name}.tsx`, import.meta.url)));
  let tree;
  await act(async () => { tree = create(React.createElement(exports[name], { ...props, onChanged: () => { refreshed++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); globalThis.window = originalWindow; });
  const button = label => tree.root.findAllByType('button').find(node => textOf(node) === label);
  const click = async label => { await act(async () => { button(label).props.onClick(); }); };
  const field = label => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label)).findAll(node => ['input', 'select', 'textarea'].includes(node.type))[0];
  const submit = async label => {
    let form = button(label); while (form.type !== 'form') form = form.parent;
    await act(async () => { await form.props.onSubmit({ preventDefault() {} }); });
  };
  if (openManually) await click('Gestionar');
  return { tree, calls, button, click, field, submit, text: () => JSON.stringify(tree.toJSON()), refreshed: () => refreshed,
    failNext: (path, message = 'No se pudo guardar el cambio.') => { failure = { path, message }; },
    change: async (node, value) => { await act(async () => node.props.onChange({ target: { value } })); } };
}

test('dashboard abre el ticket seleccionado sin perder la validación del catálogo', async t => {
  let consumed = 0;
  const target = { ...ticket, idTicket: 42, codigoSeguimiento: 'TK-42' };
  const ctx = await harness(t, 'TicketsPanel', {
    tickets: [ticket, target], categories: [], permissions, focusedTicketId: 42,
    onFocusConsumed: () => { consumed++; },
  }, { openManually: false });
  const modal = ctx.tree.root.find(node => node.type.name === 'TicketManagementModal');
  assert.equal(modal.props.ticket.idTicket, 42);
  assert.equal(consumed, 1);
  // Sin categorías habilitadas no se ofrece ninguna opción ni se puede crear, y no hay aviso de catálogo.
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  assert.equal(form.findAllByType('select')[0].findAllByType('option').length, 1);
  assert.equal(ctx.button('Crear ticket').props.disabled, true);
  assert.doesNotMatch(ctx.text(), /categorías oficiales no disponibles|Pendientes:/);
  assert.deepEqual(ctx.calls, []);
});

test('C2: catálogo QA confirmado conserva Consulta y ofrece solo lo habilitado, sin aviso de catálogo', async t => {
  const base = [
    { idCategoria: 1, nombre: 'Falla de internet', nombreAtencion: 'Falla de Internet', slaHoras: 24 },
    { idCategoria: 2, nombre: 'Falla de TV', nombreAtencion: 'Falla de TV', slaHoras: 24 },
    { idCategoria: 3, nombre: 'Consulta', nombreAtencion: 'Consulta general', slaHoras: 72 },
    { idCategoria: 4, nombre: 'Cambio de plan', nombreAtencion: 'Cambio de plan', slaHoras: 72 },
    { idCategoria: 5, nombre: 'Mudanza', nombreAtencion: 'Mudanza', slaHoras: 120 },
    { idCategoria: 6, nombre: 'CAMBIO_CREDENCIALES_WIFI', nombreAtencion: null, slaHoras: null },
  ].map(row => ({ ...row, tipo: null, tipoDisponible: false }));
  const before = structuredClone(base);
  const partial = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: base, permissions });
  // El aviso del catálogo se retiró de la pantalla: solo quedan las cinco opciones habilitadas.
  assert.doesNotMatch(partial.text(), /categorías oficiales no disponibles|Disponibles:|Pendientes:|Revisar catálogo de atención/);
  const form = partial.tree.root.findByProps({ className: 'ticket-create-form stack' });
  assert.deepEqual(form.findAllByType('select')[0].findAllByType('option').slice(1).map(textOf),
    ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza', 'Consulta general']);
  const consultation = form.findAllByType('select')[0].findAllByType('option').find(node => textOf(node) === 'Consulta general');
  assert.equal(consultation.props.value, 3);
  const complete = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [...base,
    { idCategoria: 144, nombre: 'Facturación y cobro', nombreAtencion: 'Facturación y cobro', tipo: null, tipoDisponible: false },
    { idCategoria: 251, nombre: 'Baja de servicio', nombreAtencion: 'Baja de servicio', tipo: null, tipoDisponible: false }], permissions });
  assert.doesNotMatch(complete.text(), /categorías oficiales no disponibles/);
  // FINET 13-11-2026: «Baja de servicio» stays in the catalogue but is reserved to the Libro de Control (6 options + placeholder).
  const completeOptions = complete.tree.root.findByProps({ className: 'ticket-create-form stack' }).findAllByType('select')[0].findAllByType('option');
  assert.equal(completeOptions.length, 7);
  assert.ok(!completeOptions.some(node => node.props.value === 251));
  assert.deepEqual(base, before); assert.equal(complete.calls.length, 0); assert.equal(partial.calls.length, 0);
});

test('C2: siete u ocho filas ambiguas no habilitan selección manipulada', async t => {
  const names = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza', 'Facturación y cobro', 'Consulta general'];
  const categories = [...names.map((nombreAtencion, i) => ({ idCategoria: 100 + i, nombre: nombreAtencion, nombreAtencion, tipo: 'ATENCION', tipoDisponible: true })),
    { idCategoria: 300, nombre: 'Consulta', nombreAtencion: 'Consulta general', tipo: 'ATENCION', tipoDisponible: true },
    { idCategoria: 400, nombre: 'Asistente virtual', nombreAtencion: 'Baja de servicio', tipo: 'INTERNA', tipoDisponible: true }];
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories, permissions });
  assert.doesNotMatch(ctx.text(), /categorías oficiales no disponibles|duplicado/);
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  const select = form.findAllByType('select')[0];
  assert.ok(select.findAllByType('option').every(node => ![105, 300, 400].includes(node.props.value)));
  await ctx.change(form.findAllByType('input')[0], '11111111-1'); await ctx.change(select, '300');
  await ctx.change(form.findByType('textarea'), 'Consulta sintética de catálogo'); await ctx.submit('Crear ticket');
  assert.equal(ctx.calls.length, 0);
});

test('C2: rol operativo no ve diagnóstico administrativo de IDs o tipos ni ofrece una categoría no habilitada', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [
    { idCategoria: 999, nombre: 'Consulta', nombreAtencion: null, tipo: 'TECNICA', tipoDisponible: true }], permissions });
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  assert.equal(form.findAllByType('select')[0].findAllByType('option').length, 1);
  assert.doesNotMatch(ctx.text(), /Revisar catálogo de atención|ID 999|Clasificación incompatible/);
  assert.equal(ctx.calls.length, 0);
});

test('alta comercial ofrece las seis categorías manuales G8/G2 con IDs del catálogo (Baja de servicio reservada al Libro de Control)', async t => {
  const names = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
    'Facturación y cobro', 'Consulta general', 'Baja de servicio'];
  const categories = [...names.map((nombreAtencion, i) => ({ idCategoria: 410 + i * 19,
    nombre: nombreAtencion.toUpperCase(), nombreAtencion, slaHoras: 12, tipo: 'ATENCION', tipoDisponible: true })),
  { idCategoria: 309, nombre: 'FIBRA_CORTADA', nombreAtencion: null, slaHoras: 2, tipo: 'TECNICA', tipoDisponible: true },
  { idCategoria: 990, nombre: 'CAMBIO_CREDENCIALES_WIFI', nombreAtencion: null, tipo: 'INTERNA', tipoDisponible: true },
  { idCategoria: 991, nombre: 'Asistente virtual', nombreAtencion: null, tipo: 'INTERNA', tipoDisponible: true }];
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, idCategoria: 309,
    estado: 'DERIVADO_OT', categoria: categories[7] }], categories, permissions });
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  const select = form.findAllByType('select')[0];
  const options = select.findAllByType('option').slice(1);
  assert.deepEqual(options.map(textOf), names.slice(0, 6));
  assert.deepEqual(options.map(node => node.props.value), categories.slice(0, 6).map(row => row.idCategoria));
  assert.ok(!options.some(node => node.props.value === categories[6].idCategoria), '«Baja de servicio» no se ofrece en el alta manual');
  assert.match(ctx.text(), /FIBRA_CORTADA/); // Listado y modal históricos, no opción de alta.
  assert.equal(ctx.calls.length, 0);
  await ctx.change(form.findAllByType('input')[0], '11111111-1');
  await ctx.change(select, String(categories[4].idCategoria));
  await ctx.change(form.findByType('textarea'), 'Consulta de cobro sintética');
  await ctx.submit('Crear ticket');
  assert.deepEqual(ctx.calls, [['post', '/tickets', { rut: '11111111-1', idCategoria: categories[4].idCategoria,
    idServicio: undefined, prioridad: 'Media', descripcion: 'Consulta de cobro sintética' }]]);
});

test('catálogo incompleto no inventa categorías y selección técnica manipulada no envía POST', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [
    { idCategoria: 807, nombre: 'Consulta general', nombreAtencion: 'Consulta general' },
    { idCategoria: 309, nombre: 'FIBRA_CORTADA', nombreAtencion: null },
  ], permissions });
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  assert.doesNotMatch(textOf(form), /categorías oficiales no disponibles/);
  assert.equal(form.findAllByType('select')[0].findAllByType('option').length, 2);
  await ctx.change(form.findAllByType('input')[0], '11111111-1');
  await ctx.change(form.findAllByType('select')[0], '309');
  await ctx.change(form.findByType('textarea'), 'Consulta sintética QA');
  assert.equal(ctx.button('Crear ticket').props.disabled, true);
  await ctx.submit('Crear ticket');
  assert.equal(ctx.calls.length, 0);
  assert.match(ctx.text(), /Selecciona una categoría oficial/);
});

test('tipo clasificado bloquea selección comercial técnica o interna aunque llegue una etiqueta inconsistente', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, idCategoria: 991,
    categoria: { nombre: 'Asistente virtual' } }], categories: [
    { idCategoria: 800, nombre: 'Consulta general', nombreAtencion: 'Consulta general', tipo: 'ATENCION', tipoDisponible: true },
    { idCategoria: 801, nombre: 'Mudanza', nombreAtencion: 'Mudanza', tipo: 'TECNICA', tipoDisponible: true },
    { idCategoria: 802, nombre: 'Baja de servicio', nombreAtencion: 'Baja de servicio', tipo: 'INTERNA', tipoDisponible: true },
    { idCategoria: 803, nombre: 'Falla de TV', nombreAtencion: 'Falla de TV', tipo: null, tipoDisponible: true },
  ], permissions });
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  const options = form.findAllByType('select')[0].findAllByType('option').slice(1);
  assert.deepEqual(options.map(node => node.props.value), [800]);
  assert.match(ctx.text(), /Asistente virtual/); // Históricos internos siguen legibles.
  assert.equal(ctx.calls.length, 0);
});

test('catálogo de backend anterior sin clasificación no ofrece IDs supuestos y conserva histórico', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [
    { idCategoria: 309, nombre: 'FIBRA_CORTADA' },
  ], permissions });
  const form = ctx.tree.root.findByProps({ className: 'ticket-create-form stack' });
  assert.equal(form.findAllByType('select')[0].findAllByType('option').length, 1);
  assert.equal(ctx.button('Crear ticket').props.disabled, true);
  // El modal conserva la categoría histórica actual aunque no figure en el catálogo.
  assert.ok(ctx.tree.root.findAllByType('option').some(node => node.props.value === String(ticket.idCategoria) && textOf(node) === 'Soporte QA'));
  assert.equal(ctx.calls.length, 0);
});

test('gestión excluye internas de opciones manuales y conserva la categoría actual sin cambiarla', async t => {
  const categories = [
    { idCategoria: 800, nombre: 'Consulta general', tipo: 'ATENCION', tipoDisponible: true },
    { idCategoria: 801, nombre: 'FIBRA_CORTADA', tipo: 'TECNICA', tipoDisponible: true },
    { idCategoria: 990, nombre: 'CAMBIO_CREDENCIALES_WIFI', tipo: 'INTERNA', tipoDisponible: true },
    { idCategoria: 991, nombre: 'Asistente virtual', tipo: 'INTERNA', tipoDisponible: true },
  ];
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, idCategoria: 991,
    categoria: categories[3] }], categories, permissions });
  const form = ctx.tree.root.findByProps({ id: 'ticket-panel-management' });
  const options = form.findAllByType('select')[0].findAllByType('option');
  assert.deepEqual(options.filter(node => !node.props.disabled).map(node => node.props.value), [800, 801]);
  assert.ok(options.some(node => node.props.disabled && node.props.value === '991' && textOf(node) === 'Asistente virtual'));
  assert.equal(ctx.calls.length, 0);
  await ctx.change(form.findAllByType('select')[1], 'Alta');
  await ctx.submit('Guardar cambios');
  assert.deepEqual(ctx.calls, [['patch', '/tickets/1/priority', { prioridad: 'Alta' }]]);
});

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

test('ticket compartido G3 conserva estado y consulta sin ofrecer escrituras ni otro POST', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, estado: 'DERIVADO_OT', origen: 'CRM',
    estadoPresentacion: 'Derivado a OT', soloLecturaTecnica: true }], categories: [], permissions });
  assert.match(ctx.text(), /Derivado a OT/);
  assert.match(ctx.text(), /Solo consulta/);
  assert.equal(ctx.button('Resolución'), undefined);
  assert.equal(ctx.button('Guardar cambios'), undefined);
  await ctx.click('Seguimiento1');
  assert.match(ctx.text(), /Nota historica/);
  assert.equal(ctx.button('Agregar observación'), undefined);
  assert.equal(ctx.calls.length, 0);
});

test('backend anterior no convierte EN_PROGRESO ni estado desconocido en opcion CRM editable', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, estado: 'EN_PROGRESO' }], categories: [], permissions });
  assert.match(ctx.text(), /Solo consulta/);
  assert.equal(ctx.button('Guardar cambios'), undefined);
  assert.equal(ctx.button('Resolución'), undefined);
  assert.equal(ctx.calls.length, 0);
});

test('diagnostico conserva payload compatible y anuncia la resolucion', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, estadoPresentacion: 'En progreso' }], categories: [], permissions });
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
  assert.match(textOf(ctx.tree.root.findByProps({ className: 'ticket-overview-heading' })), /Resuelto/);
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
    assert.doesNotMatch(ctx.text(), /Consulta de solo lectura/);
    assert.doesNotMatch(ctx.text(), /G3|ratificado|LEGACY_LOCAL/);
    assert.equal(ctx.button('Completar orden y resolver ticket'), undefined);
    const detail = ctx.tree.root.findByProps({ className: 'work-order-detail' });
    assert.equal(detail.findByProps({ 'aria-label': `Estado: ${estado}` }).children.length, 1);
    assert.doesNotMatch(textOf(detail), /Prioridad|Trabajo completado|Pendiente de cierre/);
    assert.equal(textOf(detail).split('OT-REP-000080').length, 2);
    assert.equal(detail.findAllByType('form').length, 0);
    await ctx.click('Cerrar');
    assert.equal(ctx.tree.root.findAllByProps({ className: 'work-order-detail' }).length, 0);
    assert.equal(ctx.calls.length, 0);
  });
}

test('OT: el resumen conserva potencia cero, resolución negativa e identificadores separados', async t => {
  const ctx = await harness(t, 'WorkOrdersPanel', { workOrders: [{ idOt: 80,
    tipoOt: 'INSTALACION', estado: 'COMPLETADA', prioridad: 'Media', antecedenteTecnico: {
      idOt: 80, fechaCompletada: '2026-11-10T12:00:00Z', potenciaOpticaDbm: 0,
      resueltoRemotamente: false, idTecnicoRegistrado: 0, idTecnicoExterno: 54,
      equiposDeclarados: { instalados: ['ONT-QA'], retirados: ['ONT-ANTERIOR'] },
    } }] });
  const result = ctx.tree.root.findByProps({ 'aria-label': 'Resumen técnico' });
  const value = label => result.findAllByType('dt').find(node => textOf(node) === label).parent.findByType('dd');
  assert.equal(textOf(value('Potencia óptica')), '0dBm');
  assert.equal(textOf(value('Resolución remota')), 'No');
  assert.equal(result.findByType('time').props.dateTime, '2026-11-10T12:00:00Z');
  assert.match(textOf(result), /ONT-QA/);
  assert.match(textOf(result), /ONT-ANTERIOR/);
  const additional = ctx.tree.root.findByProps({ 'aria-label': 'Información adicional' });
  assert.equal(ctx.tree.root.findAllByType('details').length, 0);
  const references = additional.findAllByType('dt');
  assert.equal(textOf(references.find(node => textOf(node) === 'ID del técnico en OT').parent.findByType('dd')), '0');
  assert.equal(textOf(references.find(node => textOf(node) === 'ID del técnico externo').parent.findByType('dd')), '54');
  assert.equal(ctx.calls.length, 0);
});

test('OT: conserva la estructura visible y usa guiones para los datos ausentes', async t => {
  const ctx = await harness(t, 'WorkOrdersPanel', { workOrders: [{ idOt: 81,
    tipoOt: 'INSTALACION', estado: 'Asignada', prioridad: 'Media',
    observacionesAgenda: 'Consultar acceso al edificio', antecedenteTecnico: {
      idOt: 81, fechaCompletada: null, potenciaOpticaDbm: null, resueltoRemotamente: null,
      equiposDeclarados: { instalados: [], retirados: [] },
    } }] });
  const result = ctx.tree.root.findByProps({ 'aria-label': 'Resumen técnico' });
  assert.deepEqual(result.findAllByType('dd').map(textOf), ['—', '—', '—', '—', '—', '—']);
  assert.match(textOf(result), /Equipos declarados · Instalados/);
  assert.match(textOf(result), /Equipos declarados · Retirados/);
  assert.doesNotMatch(textOf(result), /Sin resultados|Instalación completada|dBm|No registrad/);
  const additional = ctx.tree.root.findByProps({ 'aria-label': 'Información adicional' });
  assert.match(textOf(additional), /Consultar acceso al edificio/);
  assert.deepEqual(additional.findAllByType('dd').map(textOf), ['#81', '—', '—', '—', '—', '—', '—', '—']);
  assert.equal(ctx.tree.root.findAllByType('details').length, 0);
  assert.equal(ctx.calls.length, 0);
});

test('OT: ordena con clic directo en la cabecera y conserva la búsqueda de solo lectura', async t => {
  const ctx = await harness(t, 'WorkOrdersPanel', { workOrders: [
    { idOt: 10, tipoOt: 'Reparacion', codigoSeguimiento: 'OT-QA-10', idTicket: 12, estado: 'Pendiente', prioridad: 'Alta',
      fechaProgramada: '2026-11-07', horaVisita: '10:00', ticket: { codigoSeguimiento: 'TK-ESPECIAL' } },
    { idOt: 2, tipoOt: 'Instalacion', codigoSeguimiento: 'OT-QA-2', idCliente: 100, estado: 'Completada', prioridad: 'Media',
      fechaProgramada: '2026-11-07T00:00:00.000Z', horaVisita: '09:00', cliente: { nombreCompleto: 'Cliente QA', rut: '12.345.678-5' } },
    { idOt: 90, tipoOt: 'Instalacion', codigoSeguimiento: 'OT-QA-90', estado: 'Asignada', prioridad: 'Baja' },
  ] });
  const table = ctx.tree.root.findByType('table');
  const rowCodes = () => table.findByType('tbody').findAllByType('tr').map(row => textOf(row.findAllByType('td')[0]));
  const sortBy = label => act(async () => table.findAllByType('button').find(node => textOf(node).trim() === label).props.onClick());
  const search = () => ctx.tree.root.findByProps({ 'aria-label': 'Buscar órdenes de trabajo' });

  assert.equal(textOf(table.findAllByType('th')[0]).trim(), 'Código registro');
  assert.equal(textOf(table.findAllByType('th')[2]), 'Cliente');
  assert.doesNotMatch(textOf(table.findByType('tbody')), /Histórico/);
  assert.equal(table.findAllByType('select').length, 0);
  assert.deepEqual(rowCodes(), ['OT-QA-10', 'OT-QA-2', 'OT-QA-90']);
  await sortBy('Código registro');
  assert.deepEqual(rowCodes(), ['OT-QA-2', 'OT-QA-10', 'OT-QA-90']);
  await sortBy('Código registro');
  assert.deepEqual(rowCodes(), ['OT-QA-90', 'OT-QA-10', 'OT-QA-2']);
  await sortBy('Tipo');
  assert.deepEqual(rowCodes(), ['OT-QA-2', 'OT-QA-90', 'OT-QA-10']);
  await sortBy('Fecha');
  assert.deepEqual(rowCodes(), ['OT-QA-2', 'OT-QA-10', 'OT-QA-90']);
  await sortBy('Fecha');
  assert.equal(table.findAllByType('th')[4].props['aria-sort'], 'descending');
  assert.deepEqual(rowCodes(), ['OT-QA-10', 'OT-QA-2', 'OT-QA-90']);
  await ctx.change(search(), '123456785');
  assert.deepEqual(rowCodes(), ['OT-QA-2']);
  await ctx.change(search(), 'tk-especial');
  assert.deepEqual(rowCodes(), ['OT-QA-10']);
  await ctx.click('Limpiar búsqueda');
  assert.deepEqual(rowCodes(), ['OT-QA-10', 'OT-QA-2', 'OT-QA-90']);
  assert.equal(ctx.calls.length, 0);
});

test('panel sin permisos permite consultar antecedentes sin ofrecer edicion', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [ticket], categories: [], permissions: {} });
  assert.equal(ctx.button('Resolución'), undefined);
  assert.equal(ctx.button('Guardar cambios'), undefined);
  await ctx.click('Seguimiento1');
  assert.equal(ctx.button('Agregar observación'), undefined);
  assert.match(ctx.text(), /Nota historica/);
  assert.equal(ctx.calls.length, 0);
});

for (const estado of ['COMPLETADA', 'EN_CURSO', 'CANCELADA']) {
  test(`OT INSTALACION ${estado}: antecedente técnico de solo lectura sin asignación oficial ni cierre automático`, async t => {
    const ctx = await harness(t, 'WorkOrdersPanel', { workOrders: [{ idOt: 2, idEmpresa: 1, idServicio: null,
      idCliente: null, tipoOt: 'INSTALACION', estado, prioridad: 'Media', antecedenteTecnico: {
        idOt: 2, idEmpresa: 1, fechaCompletada: estado === 'COMPLETADA' ? '2026-10-02T12:00:00Z' : null,
        potenciaOpticaDbm: -19.5, resueltoRemotamente: false,
        equiposDeclarados: { instalados: ['ONT-DECLARADA-OT-2'], retirados: [] },
      } }] });
    assert.match(ctx.text(), /ONT-DECLARADA-OT-2/);
    assert.match(ctx.text(), /Equipos declarados/);
    assert.doesNotMatch(ctx.text(), /no acreditan asignación oficial/);
    const detail = ctx.tree.root.findByProps({ className: 'work-order-detail' });
    assert.match(textOf(detail.findByProps({ className: 'work-order-detail-status' })), new RegExp(estado));
    assert.doesNotMatch(textOf(detail), /Instalación completada|Instalación no completada|Prioridad/);
    assert.equal(ctx.calls.length, 0);
  });
}

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

test('OT COMPLETADA no bloquea el diagnostico comercial ni cambia el estado tecnico por lectura', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, hasOpenWorkOrder: false,
    workOrders: [{ idOt: 80, estado: 'COMPLETADA' }] }], categories: [], permissions });
  assert.equal(ctx.calls.length, 0);
  await ctx.click('Resolución');
  await ctx.change(ctx.field('Causa raíz'), 'Causa QA');
  assert.equal(ctx.button('Guardar y resolver ticket').props.disabled, false);
  await ctx.submit('Guardar y resolver ticket');
  assert.deepEqual(ctx.calls.map(call => call.slice(0, 2)), [['post', '/tickets/1/diagnosis']]);
});

test('OT COMPLETADA secundaria no oculta EN_CURSO ni habilita cierre', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, workOrders: [
    { idOt: 80, estado: 'COMPLETADA' }, { idOt: 81, estado: 'EN_CURSO' },
  ] }], categories: [], permissions });
  const order = ctx.tree.root.findByProps({ 'aria-label': 'Orden técnica asociada' });
  assert.match(textOf(order), /Orden #81/);
  await ctx.click('Resolución');
  assert.equal(ctx.button('Guardar y resolver ticket').props.disabled, true);
  assert.equal(ctx.calls.length, 0);
});

test('la equivalencia visual no ignora un bloqueo conservador informado por backend', async t => {
  const ctx = await harness(t, 'TicketsPanel', { tickets: [{ ...ticket, hasOpenWorkOrder: true,
    workOrders: [{ idOt: 80, estado: 'COMPLETADA' }] }], categories: [], permissions });
  await ctx.click('Resolución');
  await ctx.change(ctx.field('Causa raíz'), 'Causa QA');
  assert.equal(ctx.button('Guardar y resolver ticket').props.disabled, true);
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
