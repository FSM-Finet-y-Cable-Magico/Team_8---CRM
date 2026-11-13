import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', out)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) throw new Error('Unmocked dependency: ' + name);
    return require(name);
  }, exports);
  return exports;
}
const territories = load('shared/data/chile-territories.ts');
const candidate = { etiqueta: 'Dirección QA, Chile', latitud: -33.58, longitud: -70.63 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (candidatos = [candidate]) => ({ data: { candidatos, mensaje: null } });
const result = (estado = 'FACTIBLE') => ({
  estado, motivo: 'Decisión comercial del backend', consultadoEn: '2026-11-04T00:00:00Z',
  coberturaComercial: estado === 'FACTIBLE', zona: null, microzona: null, cajas: [],
  planes: estado === 'FACTIBLE' ? [{ idPlan: 1, nombre: 'Plan backend', precioAplicable: 15990 }] : [],
});

async function harness(t, { geocode = async () => response(), check = async () => ({ data: result() }), picker = null } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const old = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  const events = new EventTarget();
  globalThis.window = { setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  globalThis.document = { hidden: false, createElement: () => ({ textContent: '' }),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited in tests'); });
  const calls = [], maps = [];
  const api = {
    get: async (path, options) => {
      calls.push({ path, options });
      if (path === '/coverage/zones') return { data: [] };
      assert.equal(path, '/coverage/status'); return { data: { configurado: true } };
    },
    post: async (path, body, options) => {
      calls.push({ path, body, options });
      if (path === '/coverage/geocode') return geocode(body, options);
      if (path === '/coverage/check') return check(body, options);
      if (path === '/prospects') return { data: { idProspecto: 101 } };
      throw new Error('Unexpected API call: ' + path);
    },
  };
  const leaflet = {
    map: () => {
      const map = { views: [], markers: [], handlers: {}, getZoom: () => 12, invalidateSize() {}, remove() {},
        setView(point, zoom) { this.views.push({ point, zoom }); return this; },
        on(name, handler) { this.handlers[name] = handler; } };
      maps.push(map); return map;
    },
    tileLayer: () => ({ addTo() { return this; }, on() { return this; }, off() {} }),
    layerGroup: () => ({ addTo(map) { this.map = map; return this; }, clearLayers() { this.map.markers = []; } }),
    circleMarker: point => ({ bindTooltip() { return this; }, addTo(group) { group.map.markers.push(point); } }),
    polygon: () => ({ bindTooltip() { return this; }, addTo() {} }),
  };
  const { CoveragePicker } = load('features/coverage/CommercialCoveragePicker.tsx', {
    '../../shared/hooks/useTransientMessage': load('shared/hooks/useTransientMessage.ts',{}),
    leaflet, '../../api': { api, apiErrorMessage: () => 'Error local' }, '../../lib/user-facing-messages': require('./helpers/user-facing-messages.cjs'),
  });
  const { ProspectsPanel } = load('features/prospects/ProspectsPanel.tsx', {
    '../../shared/hooks/useTransientMessage': load('shared/hooks/useTransientMessage.ts',{}),
    '../../api': { api },
    '../../lib': {
      emptyProspectForm: { rut: '', nombreCompleto: '', email: '', telefono: '', direccion: '', comuna: '', region: '', origenContacto: 'Formulario web' },
      validateProspectForm: () => '', normalizeRutInput: value => value, formatRutInput: value => value,
    },
    '../../shared/data/chile-territories': territories,
    '../../shared/components': { Modal: () => null, TablePagination: () => null },
    './ProspectWorkflowPanel': { ProspectWorkflowPanel: () => null }, '../coverage': { CoveragePicker },
  });
  let props = picker ? { idEmpresa: 1, direccion: 'Calle QA 123, La Florida, Metropolitana, Chile', value: null,
    autoGeocode: true, onChange(value) { props = { ...props, value }; tree.update(React.createElement(CoveragePicker, props)); }, ...picker }
    : { prospects: [], loading: false, loadError: '', plans: [], writeCompanyId: 1,
      permissions: { createProspects: true }, onReload() {}, onCreated() {} };
  const Component = picker ? CoveragePicker : ProspectsPanel;
  let tree;
  await act(async () => { tree = create(React.createElement(Component, props), { createNodeMock: () => ({}) }); });
  t.after(async () => { await act(async () => tree.unmount()); Object.assign(globalThis, old); });
  const input = label => ['Región', 'Comuna'].includes(label) ? tree.root.findByProps({ 'aria-label': label }) : tree.root.findByProps({ placeholder: label });
  const tick = async ms => { await act(async () => { t.mock.timers.tick(ms); }); };
  const change = async (label, value) => { await act(async () => input(label).props.onChange({ target: { value } })); };
  const button = label => tree.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.join('') === label);
  const click = async label => { await act(async () => button(label).props.onClick()); };
  return {
    tree, calls, maps, input, change, tick, button, click,
    location: () => tree.root.findByType(CoveragePicker).props.value,
    requests: path => calls.filter(call => call.path === path), text: () => JSON.stringify(tree.toJSON()),
    fill: async () => { await change('Av. Siempre Viva 123, Comuna', 'Av. Prueba 123'); await change('Región', 'Metropolitana de Santiago'); await change('Comuna', 'La Florida'); },
    submit: async () => { await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} })); },
    blur: async () => { await act(async () => input('Av. Siempre Viva 123, Comuna').props.onBlur()); },
    update: async next => { props = { ...props, ...next }; await act(async () => tree.update(React.createElement(Component, props))); },
    event: async (name, detail) => { await act(async () => events.dispatchEvent(new CustomEvent(name, { detail }))); },
    mapClick: async (latitud, longitud) => { await act(async () => maps[0].handlers.click({ latlng: { lat: latitud, lng: longitud } })); },
  };
}

test('registro ubica domicilio completo al seleccionar comuna y muestra solo estado, sin mapa ni botón manual', async t => {
  const pending = deferred();
  const h = await harness(t, { geocode: () => pending.promise });
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Consulta de cobertura comercial' }).length, 0);
  await h.change('Av. Siempre Viva 123, Comuna', 'Av. Prueba 123');
  await h.change('Región', 'Metropolitana de Santiago');
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Consulta de cobertura comercial' }).length, 0);
  await h.fill(); await h.tick(699); assert.equal(h.requests('/coverage/geocode').length, 0);
  await h.tick(1); assert.equal(h.requests('/coverage/geocode').length, 1);
  assert.deepEqual(h.requests('/coverage/geocode')[0].body, { direccion: 'Av. Prueba 123, La Florida, Metropolitana de Santiago, Chile' });
  assert.equal(h.maps.length, 0); assert.equal(h.button('Ubicar dirección'), undefined);
  assert.equal(h.button('Registrar prospecto').props.disabled, true);
  await h.submit(); assert.equal(h.requests('/prospects').length, 0);
  await act(async () => pending.resolve(response())); await h.tick(350);
  assert.deepEqual(h.location(), { latitud: -33.58, longitud: -70.63 });
  assert.ok(h.text().includes('Cobertura factible')); assert.equal(h.button('Registrar prospecto').props.disabled, false);
  assert.equal(h.button('Actualizar cobertura'), undefined);
  await h.change('Nombre Apellido', 'Prospecto de prueba');
  assert.ok(h.text().includes('Cobertura factible'), 'el resultado permanece al seguir rellenando el formulario');
  await h.submit(); assert.deepEqual(h.requests('/prospects')[0].body.ubicacion, { latitud: -33.58, longitud: -70.63 });
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Consulta de cobertura comercial' }).length, 0);
});

test('editar la calle espera a terminar, invalida ubicación y no busca por cada tecla', async t => {
  const h = await harness(t); await h.fill(); await h.tick(700); await h.tick(350);
  for (const street of ['C', 'Calle', 'Calle Nueva 456']) { await h.change('Av. Siempre Viva 123, Comuna', street); await h.tick(1000); }
  assert.equal(h.location(), null); assert.equal(h.requests('/coverage/geocode').length, 1);
  await h.blur(); await h.tick(700); await h.tick(350);
  assert.equal(h.requests('/coverage/geocode').length, 2);
  assert.ok(h.requests('/coverage/geocode').at(-1).body.direccion.startsWith('Calle Nueva 456,'));
});

test('región limita comunas; cambiarla borra la comuna anterior y no consulta un domicilio incompleto', async t => {
  const h = await harness(t); await h.fill(); await h.tick(700); await h.tick(350);
  assert.ok(!h.input('Comuna').findAllByType('option').some(option => option.props.value === 'Valparaíso'));
  await h.change('Región', 'Valparaíso'); await h.tick(1000);
  assert.equal(h.input('Comuna').props.value, ''); assert.equal(h.location(), null);
  assert.equal(h.requests('/coverage/geocode').length, 1);
  await h.change('Comuna', 'Valparaíso'); await h.tick(700); assert.equal(h.requests('/coverage/geocode').length, 2);
});

test('sin cobertura permite registrar; el registro conserva las coordenadas', async t => {
  const h = await harness(t, { check: async () => ({ data: result('NO_FACTIBLE') }) });
  await h.fill(); await h.tick(700); await h.tick(350);
  assert.ok(h.text().includes('Sin cobertura comercial')); assert.equal(h.button('Registrar prospecto').props.disabled, false);
  assert.equal(h.tree.root.findByProps({ role: 'status' }).findAllByType('p').length, 0);
  await h.submit(); assert.equal(h.requests('/prospects').length, 1);
  assert.deepEqual(h.requests('/prospects')[0].body.ubicacion, { latitud: -33.58, longitud: -70.63 });
});

test('sin resultados no inventa coordenadas o factibilidad y permite corregir la dirección o registrar para revisión', async t => {
  const h = await harness(t, { geocode: async () => response([]) });
  await h.fill(); await h.tick(700); await h.tick(350);
  assert.equal(h.location(), null); assert.equal(h.requests('/coverage/check').length, 0);
  assert.equal(h.button('Registrar prospecto').props.disabled, false); assert.ok(h.text().includes('No se pudo ubicar la dirección'));
  assert.equal(h.button('Actualizar cobertura'), undefined);
  await h.change('Av. Siempre Viva 123, Comuna', 'Av. Prueba 456'); await h.blur(); await h.tick(700);
  assert.equal(h.requests('/coverage/geocode').length, 2);
  await h.submit(); assert.equal(h.requests('/prospects')[0].body.ubicacion, undefined);
});

test('respuestas de una dirección o empresa anterior no cambian ubicación ni estado actuales', async t => {
  const first = deferred(), second = deferred(); let attempt = 0;
  const h = await harness(t, { geocode: () => (++attempt === 1 ? first.promise : second.promise) });
  await h.fill(); await h.tick(700); await h.change('Comuna', 'Puente Alto'); await h.tick(700);
  assert.equal(h.requests('/coverage/geocode')[0].options.signal.aborted, true);
  await act(async () => second.resolve(response([{ ...candidate, latitud: -33.61 }])));
  await act(async () => first.resolve(response())); await h.tick(350);
  assert.equal(h.location().latitud, -33.61);
  await h.update({ writeCompanyId: 2 }); assert.equal(h.location(), null); assert.ok(!h.text().includes('Cobertura factible'));
});

test('coverage/check decide factibilidad y no el geocoder', async t => {
  const pending = deferred();
  const h = await harness(t, { geocode: async () => ({ data: { ...response().data, estado: 'FACTIBLE' } }), check: () => pending.promise });
  await h.fill(); await h.tick(700); await h.tick(350); assert.ok(!h.text().includes('Cobertura factible'));
  await act(async () => pending.resolve({ data: result('NO_FACTIBLE') })); assert.ok(h.text().includes('Sin cobertura comercial'));
});

test('mapa resumido conserva punto, es de solo lectura y actualiza sin geocodificar de nuevo', async t => {
  let outside = false;
  const h = await harness(t, { picker: { presentation: 'summary', value: candidate }, check: async () => ({ data: result(outside ? 'NO_FACTIBLE' : 'FACTIBLE') }) });
  await h.tick(350); assert.deepEqual(h.maps[0].markers, [[-33.58, -70.63]]);
  await h.mapClick(-34, -71); assert.equal(h.location().latitud, -33.58);
  assert.equal(h.button('Ubicar dirección'), undefined); assert.ok(!h.text().includes('Pin azul'));
  assert.equal(h.button('Actualizar cobertura'), undefined);
  outside = true; await h.event('focus'); await h.tick(350); assert.ok(h.text().includes('Sin cobertura comercial'));
  assert.equal(h.requests('/coverage/geocode').length, 0);
  const checks = h.requests('/coverage/check').length;
  await h.event('finet:coverage-updated', { idEmpresa: 2 }); await h.tick(350); assert.equal(h.requests('/coverage/check').length, checks);
  await h.event('finet:coverage-updated', { idEmpresa: 1 }); await h.tick(350); assert.equal(h.requests('/coverage/check').length, checks + 1);
  await h.tick(30000); await h.tick(350); assert.ok(h.requests('/coverage/check').length > checks + 1);
  assert.equal(h.requests('/coverage/geocode').length, 0);
});

test('resumen editable sin ubicación: geocodificación deshabilitada muestra el motivo y permite marcar mapa o coordenadas', async t => {
  const mensaje = 'La ubicación automática no está habilitada. Marca el punto en el mapa o ingresa las coordenadas.';
  const h = await harness(t, { picker: { presentation: 'summary', allowManualLocation: true, showAddressRetry: true },
    geocode: async () => ({ data: { candidatos: [], motivo: 'PROVEEDOR_DESHABILITADO', mensaje } }) });
  await h.tick(700); await h.tick(0);
  assert.equal(h.requests('/coverage/geocode').length, 1);
  assert.ok(h.text().includes(mensaje), 'muestra el motivo real, no "dirección no encontrada"');
  assert.ok(h.text().includes('No se pudo ubicar la dirección'));
  assert.equal(h.requests('/coverage/check').length, 0, 'sin punto no se consulta ni se supone cobertura');
  assert.ok(!h.text().includes('Cobertura factible'));
  assert.ok(h.text().includes('Ingresar coordenadas'));
  await h.mapClick(-33.45, -70.63); await h.tick(350);
  assert.deepEqual(h.location(), { latitud: -33.45, longitud: -70.63 });
  assert.equal(h.requests('/coverage/check').length, 1, 'la cobertura la decide /coverage/check con el punto marcado');
  assert.ok(h.text().includes('Cobertura factible'));
});

test('resumen editable acepta coordenadas válidas y rechaza fuera de rango sin consultar', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', allowManualLocation: true, autoGeocode: false } });
  await h.tick(0);
  await h.change('-33.57', '123'); await h.change('-70.61', '-70.6'); await h.click('Ubicar punto');
  assert.equal(h.location(), null); assert.ok(h.text().includes('Ingresa una latitud entre -90 y 90'));
  assert.equal(h.requests('/coverage/check').length, 0);
  await h.change('-33.57', '-33.46'); await h.click('Ubicar punto'); await h.tick(350);
  assert.deepEqual(h.location(), { latitud: -33.46, longitud: -70.6 });
  assert.equal(h.requests('/coverage/geocode').length, 0);
});

test('resumen sin permiso de ubicación manual sigue de solo lectura', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', allowManualLocation: true, disabled: true, autoGeocode: false } });
  await h.tick(0); await h.mapClick(-33.45, -70.63);
  assert.equal(h.location(), null); assert.ok(!h.text().includes('Ingresar coordenadas'));
});

test('proveedor MANUAL: sin "Reintentar dirección" y sin volver a consultar al cambiar la dirección; alternativa manual visible', async t => {
  const mensaje = 'La ubicación automática no está habilitada. Marca el punto en el mapa o ingresa las coordenadas.';
  const h = await harness(t, { picker: { presentation: 'summary', allowManualLocation: true, showAddressRetry: true },
    geocode: async () => ({ data: { candidatos: [], motivo: 'PROVEEDOR_DESHABILITADO', mensaje } }) });
  await h.tick(700); await h.tick(0);
  assert.equal(h.requests('/coverage/geocode').length, 1);
  assert.equal(h.button('Reintentar dirección'), undefined, 'reintentar nunca funcionaría con el proveedor apagado');
  assert.ok(h.text().includes('Ingresar coordenadas'));
  await h.update({ direccion: 'Otra Calle QA 9, La Florida, Metropolitana, Chile' }); await h.tick(700); await h.tick(0);
  assert.equal(h.requests('/coverage/geocode').length, 1, 'no repite consultas que no pueden resolverse');
  assert.ok(!h.text().includes('Ubicando dirección'), 'no queda esperando una ubicación automática');
});

test('proveedor caído (PROVEEDOR_NO_DISPONIBLE): el reintento sigue disponible', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', allowManualLocation: true, showAddressRetry: true },
    geocode: async () => ({ data: { candidatos: [], motivo: 'PROVEEDOR_NO_DISPONIBLE', mensaje: 'El servicio de ubicación automática no respondió. Reintenta o marca el punto en el mapa.' } }) });
  await h.tick(700); await h.tick(0);
  assert.ok(h.button('Reintentar dirección'));
  await h.click('Reintentar dirección'); await h.tick(0);
  assert.equal(h.requests('/coverage/geocode').length, 2);
});

test('alta con proveedor MANUAL explica que el punto se marca en la ficha', async t => {
  const h = await harness(t, { picker: { presentation: 'status' },
    geocode: async () => ({ data: { candidatos: [], motivo: 'PROVEEDOR_DESHABILITADO', mensaje: 'x' } }) });
  await h.tick(700); await h.tick(0);
  assert.ok(h.text().includes('No se pudo ubicar la dirección'));
  assert.equal(h.requests('/coverage/check').length, 0);
});

test('editor completo conserva corrección manual, coordenadas y atribución en los otros módulos', async t => {
  const pending = deferred();
  const h = await harness(t, { picker: {}, geocode: () => pending.promise });
  await h.tick(0); await h.mapClick(-33.7, -70.8); assert.equal(h.requests('/coverage/geocode')[0].options.signal.aborted, true);
  await act(async () => pending.resolve(response())); await h.tick(350);
  assert.deepEqual(h.location(), { latitud: -33.7, longitud: -70.8 });
  assert.ok(h.button('Ubicar dirección')); assert.ok(h.text().includes('Nominatim'));
  await h.change('-33.57', '-33.9'); await h.click('Ubicar punto'); await h.tick(350);
  assert.equal(h.location().latitud, -33.9); assert.ok(h.text().includes('OpenStreetMap contributors'));
});

test('actualizar en segundo plano mantiene el estado visible hasta recibir el resultado y descarta cobertura antigua si falla', async t => {
  const pending = deferred(); let attempts = 0;
  const h = await harness(t, { picker: { presentation: 'summary', value: candidate },
    check: async () => ++attempts === 1 ? { data: result() } : pending.promise });
  await h.tick(350); assert.ok(h.text().includes('Cobertura factible'));
  await h.event('focus'); await h.tick(350);
  assert.ok(h.text().includes('Cobertura factible'), 'no desmonta los formularios durante una consulta silenciosa');
  await act(async () => pending.resolve({ data: result('NO_FACTIBLE') }));
  assert.ok(h.text().includes('Sin cobertura comercial'));
});
