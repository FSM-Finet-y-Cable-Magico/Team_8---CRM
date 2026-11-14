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

test('mapa simple mantiene estado y ubicación automática sin textos auxiliares ni coordenadas', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', simpleSummary: true, allowManualLocation: true } });
  assert.doesNotMatch(h.text(), /Cobertura comercial|Ingresar coordenadas|Marca el domicilio/);
  assert.equal(h.tree.root.findAllByType('details').length, 0);
  await h.tick(700);
  assert.equal(h.requests('/coverage/geocode').length, 1);
  assert.deepEqual(h.location(), { latitud: candidate.latitud, longitud: candidate.longitud });
  assert.ok(h.maps[0].markers.length > 0);
  await h.tick(350);
  assert.match(h.text(), /Cobertura factible/);
});

function activeZone(id, overrides = {}) {
  return { idZonaPago: id, idEmpresa: 1, nombreZona: 'Zona QA ' + id, activo: true, tipoZona: 'COBERTURA_GENERAL',
    fechaInicio: null, fechaFin: null,
    poligonoGeojson: { type: 'Polygon', coordinates: [[[-71.7, -33.1], [-71.5, -33.1], [-71.5, -33], [-71.7, -33.1]]] }, ...overrides };
}

test('cliente de Cable Mágico inicia con cobertura de FiNet activa en el portal y cambia explícitamente de empresa', async t => {
  const point = { latitud: -33.3854635, longitud: -70.5071465 };
  const h = await harness(t, { customerForm: {
    customer: { idCliente: 10, idEmpresa: 2, nombreCompleto: 'Cliente Cable QA', direcciones: [{ direccionCompleta: 'La Quebrada 9651', comuna: 'Las Condes' }] },
    services: [], initialCompanyId: 1,
    companies: [{ idEmpresa: 1, nombre: 'FiNet' }, { idEmpresa: 2, nombre: 'Cable Mágico' }],
    plans: [{ idPlan: 1, idEmpresa: 1, activo: true, empresa: { nombre: 'FiNet' } }, { idPlan: 2, idEmpresa: 2, activo: true, empresa: { nombre: 'Cable Mágico' } }],
    onCancel() {}, onCreated() {},
  }, zones: [activeZone(4, { nombreZona: 'Cobertura FiNet' })],
    geocode: async () => response([{ ...candidate, ...point }]),
    check: async body => ({ data: result(body.idEmpresa === 1 ? 'FACTIBLE' : 'NO_FACTIBLE') }),
  });
  const company = () => h.tree.root.findAllByType('label').find(label => label.props.children[0] === 'Empresa').findByType('select');
  assert.equal(company().props.value, '1', 'hereda la empresa del portal, no la empresa principal del cliente');
  assert.deepEqual(h.requests('/coverage/zones')[0].options.params, { idEmpresa: 1 });
  assert.equal(h.maps[0].polygons.length, 1);
  await h.tick(700); await h.tick(350);
  assert.equal(h.requests('/coverage/check').at(-1).body.idEmpresa, 1);
  assert.match(h.text(), /Cobertura factible · FiNet/);
  assert.deepEqual(h.location(), point);
  await act(async () => company().props.onChange({ target: { value: '2' } }));
  assert.equal(h.location(), null);
  await h.tick(700); await h.tick(350);
  assert.equal(h.requests('/coverage/zones').at(-1).options.params.idEmpresa, 2);
  assert.equal(h.requests('/coverage/check').at(-1).body.idEmpresa, 2);
  assert.equal(h.maps.at(-1).polygons.length, 0);
  assert.match(h.text(), /Sin cobertura comercial · Cable Mágico/);
});

test('mapa consulta y encuadra zonas vigentes de su empresa sin inventar ubicación del domicilio', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', simpleSummary: true, autoGeocode: false }, zones: [
    activeZone(1), activeZone(2, { activo: null, tipoZona: 'MICROZONA_COMERCIAL' }),
    activeZone(3, { idEmpresa: 2 }), activeZone(4, { activo: false }),
    activeZone(5, { fechaFin: '2000-01-01' }), activeZone(6, { fechaInicio: '2999-01-01' }),
    activeZone(7, { poligonoGeojson: { type: 'Polygon', coordinates: [] } }),
  ] });
  assert.deepEqual(h.requests('/coverage/zones')[0].options.params, { idEmpresa: 1 });
  assert.equal(h.maps[0].polygons.length, 2);
  assert.ok(h.maps[0].polygons[0].label.includes('Zona QA 1'));
  assert.equal(h.maps[0].polygons[1].options.dashArray, '8 5');
  assert.equal(h.maps[0].bounds.length, 1);
  assert.deepEqual(h.maps[0].bounds[0].points[0], [-33.1, -71.7]);
  assert.equal(h.location(), null);
  assert.match(h.text(), /Ubicación pendiente/);
  assert.equal(h.requests('/coverage/check').length, 0);
});

test('zonas se actualizan al cambiar de empresa y refrescar sin mover un domicilio ya seleccionado', async t => {
  let rows = [activeZone(1), activeZone(2, { idEmpresa: 2, nombreZona: 'Empresa dos' })];
  const h = await harness(t, { picker: { presentation: 'summary', simpleSummary: true, autoGeocode: false }, zones: () => rows });
  await h.event('focus');
  assert.equal(h.maps[0].bounds.length, 1, 'el refresco sin cambios respeta el encuadre');
  await h.update({ idEmpresa: 2 });
  assert.equal(h.requests('/coverage/zones').at(-1).options.params.idEmpresa, 2);
  assert.equal(h.maps[0].polygons.length, 1);
  assert.match(h.maps[0].polygons[0].label, /Empresa dos/);
  await h.update({ value: { latitud: -33.04, longitud: -71.6 } });
  const frames = h.maps[0].bounds.length;
  rows = [activeZone(3, { idEmpresa: 2 })];
  await h.event('finet:coverage-updated', { idEmpresa: 2 });
  assert.equal(h.maps[0].bounds.length, frames);
  assert.deepEqual(h.maps[0].views.at(-1).point, [-33.04, -71.6]);
  assert.match(h.maps[0].polygons[0].label, /Zona QA 3/);
});

async function harness(t, { geocode = async () => response(), check = async () => ({ data: result() }), picker = null, zones = [], customerForm = null } = {}) {
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
      if (path === '/prospects/customer-quotes') return { data: [] };
      if (path === '/coverage/zones') return { data: typeof zones === 'function' ? await zones() : zones };
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
      const map = { views: [], markers: [], polygons: [], bounds: [], handlers: {}, getZoom: () => 12, invalidateSize() {}, remove() {},
        setView(point, zoom) { this.views.push({ point, zoom }); return this; },
        fitBounds(points, options) { this.bounds.push({ points, options }); return this; },
        on(name, handler) { this.handlers[name] = handler; } };
      maps.push(map); return map;
    },
    tileLayer: () => ({ addTo() { return this; }, on() { return this; }, off() {} }),
    layerGroup: () => ({ addTo(map) { this.map = map; return this; }, clearLayers() { this.map.markers = []; this.map.polygons = []; } }),
    circleMarker: point => ({ bindTooltip() { return this; }, addTo(group) { group.map.markers.push(point); } }),
    polygon: (points, options) => ({ bindTooltip(label) { this.label = label; return this; }, addTo(group) { group.map.polygons.push({ points, options, label: this.label?.textContent }); } }),
    latLngBounds: points => points,
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
  const { CustomerPlanForm } = load('features/customers/CustomerPlanForm.tsx', {
    '../../api': { api, apiErrorMessage: () => 'Error local' }, '../coverage': { CoveragePicker },
    '../../shared/data/chile-territories': territories,
    '../../lib': { formatDateTime: String },
    '../../shared/components': { ToastNotice: () => null },
    '../../shared/hooks/useTransientMessage': load('shared/hooks/useTransientMessage.ts'),
  });
  let props = customerForm ?? (picker ? { idEmpresa: 1, direccion: 'Calle QA 123, La Florida, Metropolitana, Chile', value: null,
    autoGeocode: true, onChange(value) { props = { ...props, value }; tree.update(React.createElement(CoveragePicker, props)); }, ...picker }
    : { prospects: [], loading: false, loadError: '', plans: [], writeCompanyId: 1,
      permissions: { createProspects: true }, onReload() {}, onCreated() {} });
  const Component = customerForm ? CustomerPlanForm : picker ? CoveragePicker : ProspectsPanel;
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
  assert.ok(h.text().includes('Ubicación automática no disponible'));
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
  assert.ok(h.text().includes('Ubicación automática no disponible'));
  assert.equal(h.requests('/coverage/check').length, 0);
});

test('dirección guardada con coordenadas consulta cobertura vigente sin volver a geocodificar', async t => {
  const h = await harness(t, { customerForm: {
    customer: { idCliente: 10, idEmpresa: 1, direcciones: [{ direccionCompleta: 'Domicilio QA 123', comuna: 'Las Condes' }],
      contratos: [{ idContrato: 40, idEmpresa: 1, direccionInstalacion: 'Domicilio QA 123', comunaInstalacion: 'Las Condes',
        prospecto: { idEmpresa: 1, direccion: 'Domicilio QA 123', comuna: 'Las Condes', region: 'Metropolitana de Santiago', ...candidate } }] },
    services: [], plans: [{ idPlan: 1, idEmpresa: 1, activo: true }], onCancel() {}, onCreated() {},
  } });
  await h.tick(350);
  assert.equal(h.requests('/coverage/geocode').length, 0);
  assert.equal(h.requests('/coverage/check').length, 1);
  assert.equal(h.requests('/coverage/check')[0].body.latitud, candidate.latitud);
  assert.match(h.text(), /Cobertura factible/);
});

test('una dirección no encontrada conserva el motivo y vuelve a consultarse al seleccionarla otra vez', async t => {
  const h = await harness(t, { picker: { presentation: 'summary', simpleSummary: true, allowManualLocation: true },
    geocode: async () => ({ data: { candidatos: [], motivo: 'SIN_RESULTADOS', mensaje: 'Dirección no encontrada' } }) });
  await h.tick(700); await h.tick(4000);
  assert.match(h.text(), /Dirección no encontrada/);
  assert.doesNotMatch(h.text(), /Ubicación pendiente|Sin cobertura comercial|Cobertura factible/);
  assert.equal(h.requests('/coverage/check').length, 0);
  const original = h.requests('/coverage/geocode')[0].body.direccion;
  await h.update({ direccion: 'Otra dirección QA 999, Las Condes, Chile' }); await h.tick(700);
  await h.update({ direccion: original }); await h.tick(700);
  assert.equal(h.requests('/coverage/geocode').length, 3);
});

test('una ubicación guardada recuperada durante la consulta prevalece sobre una respuesta tardía del geocodificador', async t => {
  const pending = deferred();
  const h = await harness(t, { picker: { presentation: 'summary', simpleSummary: true }, geocode: () => pending.promise });
  await h.tick(700);
  const saved = { latitud: -33.45, longitud: -70.65 };
  await h.update({ value: saved });
  await act(async () => pending.resolve(response([{ ...candidate, latitud: -35, longitud: -72 }])));
  await h.tick(350);
  assert.deepEqual(h.location(), saved);
  assert.equal(h.requests('/coverage/check').at(-1).body.latitud, saved.latitud);
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
