import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Exercise the actual TSX components; only their I/O and unrelated panels are replaced.
function loadComponent(path, mocks) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) throw new Error(`Unmocked dependency: ${name}`);
    return require(name);
  };
  new Function('require', 'exports', outputText)(localRequire, exports);
  return exports;
}

const candidate = { etiqueta: 'Dirección QA, Chile', latitud: -33.58, longitud: -70.63 };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const response = (candidatos = [candidate]) => ({ data: { candidatos, mensaje: null } });
const coverage = (estado = 'FACTIBLE') => ({
  estado, motivo: 'Decisión comercial del backend', consultadoEn: '2026-10-07T00:00:00Z',
  coberturaComercial: estado === 'FACTIBLE', zona: null, microzona: null, cajas: [],
  planes: estado === 'FACTIBLE' ? [{ idPlan: 1, nombre: 'Plan backend', precioAplicable: 15990, origenPrecio: 'PLAN_BASE' }] : [],
});

async function harness(t, { geocode = async () => response(), check = async () => ({ data: coverage() }) } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldWindow = globalThis.window;
  const oldObserver = globalThis.ResizeObserver;
  globalThis.window = globalThis;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  // Any accidental use of real fetch is a test failure, never real traffic.
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited in tests'); });
  const calls = [];
  const api = {
    get: async (path, options) => {
      calls.push({ path, options });
      assert.equal(path, '/coverage/status');
      return { data: { configurado: true, mensaje: 'Selecciona un domicilio' } };
    },
    post: async (path, body, options) => {
      calls.push({ path, body, options });
      if (path === '/coverage/geocode') return geocode(body, options);
      if (path === '/coverage/check') return check(body, options);
      throw new Error(`Unexpected API call: ${path}`);
    },
  };
  const maps = [];
  const leaflet = {
    map: () => {
      const map = { views: [], markers: [], handlers: {}, getZoom: () => 12, invalidateSize() {}, remove() {},
        setView(point, zoom) { this.views.push({ point, zoom }); return this; },
        on(name, handler) { this.handlers[name] = handler; },
      };
      maps.push(map);
      return map;
    },
    tileLayer: () => ({ addTo() {} }),
    layerGroup: () => {
      const group = { map: null, addTo(map) { this.map = map; return this; }, clearLayers() { this.map.markers = []; } };
      return group;
    },
    circleMarker: point => ({ bindTooltip() { return this; }, addTo(group) { group.map.markers.push(point); } }),
    polygon: () => ({ bindTooltip() { return this; }, addTo() {} }),
  };
  const { CoveragePicker } = loadComponent('features/coverage/CommercialCoveragePicker.tsx', { leaflet, '../../api': { api, apiErrorMessage: () => 'Error local' } });
  const { ProspectsPanel } = loadComponent('features/prospects/ProspectsPanel.tsx', {
    '../../api': { api },
    '../../lib': {
      emptyProspectForm: { rut: '', nombreCompleto: '', email: '', telefono: '', direccion: '', comuna: '', region: '', origenContacto: 'Formulario web' },
    },
    '../../shared/components': { Modal: () => null, TablePagination: () => null },
    './ProspectWorkflowPanel': { ProspectWorkflowPanel: () => null },
    '../coverage': { CoveragePicker },
  });
  let props = { prospects: [], loading: false, loadError: '', plans: [], writeCompanyId: 1, permissions: { createProspects: true }, onReload() {}, onCreated() {} };
  let tree;
  await act(async () => { tree = create(React.createElement(ProspectsPanel, props), { createNodeMock: () => ({}) }); });
  t.after(async () => {
    await act(async () => tree.unmount());
    globalThis.window = oldWindow;
    globalThis.ResizeObserver = oldObserver;
  });
  const input = placeholder => tree.root.findByProps({ placeholder });
  const tick = async ms => { await act(async () => { t.mock.timers.tick(ms); }); };
  const change = async (placeholder, value) => { await act(async () => input(placeholder).props.onChange({ target: { value } })); };
  const blur = async (placeholder = 'Region') => { await act(async () => input(placeholder).props.onBlur()); await tick(0); };
  const button = label => tree.root.findAllByType('button').find(node => node.children.join('') === label);
  const click = async label => { await act(async () => button(label).props.onClick()); };
  const fill = async () => {
    await change('Av. Siempre Viva 123, Comuna', 'Av. Prueba 123');
    await change('Comuna', 'La Florida');
    await change('Region', 'Metropolitana');
  };
  return {
    tree, calls, maps, input, change, blur, tick, button, click, fill,
    location: () => tree.root.findByType(CoveragePicker).props.value,
    requests: path => calls.filter(call => call.path === path),
    text: () => JSON.stringify(tree.toJSON()),
    open: async () => {
      const details = tree.root.findAllByType('details').find(node => node.props.onToggle);
      await act(async () => details.props.onToggle({ currentTarget: { open: true } }));
      await tick(0);
    },
    company: async writeCompanyId => {
      props = { ...props, writeCompanyId };
      await act(async () => tree.update(React.createElement(ProspectsPanel, props)));
    },
    mapClick: async (latitud, longitud) => {
      await act(async () => maps[0].handlers.click({ latlng: { lat: latitud, lng: longitud } }));
    },
  };
}

test('solo domicilio completo confirmado dispara geocode; pin y centro alimentan coverage/check', async t => {
  const pending = deferred();
  const h = await harness(t, { geocode: () => pending.promise });
  for (const value of ['A', 'Av.', 'Av. Prueba 123']) {
    await h.change('Av. Siempre Viva 123, Comuna', value);
    await h.tick(1000);
  }
  await h.blur('Av. Siempre Viva 123, Comuna');
  await h.change('Comuna', 'La Florida');
  await h.blur('Comuna');
  assert.equal(h.requests('/coverage/geocode').length, 0);
  await h.change('Region', 'Metropolitana');
  await h.tick(1000);
  assert.equal(h.requests('/coverage/geocode').length, 0, 'no search-as-you-type');
  await h.blur();
  assert.equal(h.requests('/coverage/geocode').length, 1);
  assert.deepEqual(h.requests('/coverage/geocode')[0].body, { direccion: 'Av. Prueba 123, La Florida, Metropolitana, Chile' });
  assert.ok(h.text().includes('Ubicando dirección...'));
  assert.equal(h.requests('/coverage/check').length, 0);
  await act(async () => pending.resolve(response()));
  assert.deepEqual(h.location(), { latitud: -33.58, longitud: -70.63 });
  assert.deepEqual(h.maps[0].markers, [[-33.58, -70.63]]);
  assert.deepEqual(h.maps[0].views.at(-1), { point: [-33.58, -70.63], zoom: 15 });
  await h.tick(350);
  assert.deepEqual(h.requests('/coverage/check')[0].body, { idEmpresa: 1, latitud: -33.58, longitud: -70.63 });
  assert.ok(h.text().includes('FACTIBLE'));
  assert.ok(h.text().includes('Plan backend'));
  assert.ok(h.text().includes('Nominatim'));
  assert.ok(h.text().includes('OpenStreetMap contributors'));
  await h.blur();
  await h.open();
  assert.equal(h.requests('/coverage/geocode').length, 1);
});

test('abrir cobertura confirma el domicilio completo sin esperar un blur', async t => {
  const h = await harness(t);
  await h.fill();
  assert.equal(h.requests('/coverage/geocode').length, 0);
  await h.open();
  assert.equal(h.requests('/coverage/geocode').length, 1);
});

test('el boton manual sin domicilio no busca solo Chile', async t => {
  const h = await harness(t);
  await h.click('Ubicar dirección');
  assert.equal(h.requests('/coverage/geocode').length, 0);
  assert.ok(h.text().includes('Ingresa una dirección'));
});

for (const [field, next] of [['Comuna', 'Puente Alto'], ['Region', 'Valparaiso'], ['Av. Siempre Viva 123, Comuna', 'Calle Nueva 456'], ['company', 2]]) {
  test(`cambiar ${field} invalida las coordenadas y requiere nueva confirmacion`, async t => {
    const h = await harness(t);
    await h.fill();
    await h.blur();
    await h.tick(350);
    await h.mapClick(-33.6, -70.7);
    if (field === 'company') await h.company(next);
    else await h.change(field, next);
    assert.equal(h.location(), null);
    assert.deepEqual(h.maps[0].markers, []);
    await h.tick(1000);
    assert.equal(h.requests('/coverage/geocode').length, 1);
    const checks = h.requests('/coverage/check').length;
    await h.blur();
    assert.equal(h.requests('/coverage/geocode').length, 2);
    await h.tick(350);
    assert.equal(h.requests('/coverage/check').length, checks + 1);
    assert.equal(h.requests('/coverage/check').at(-1).body.idEmpresa, field === 'company' ? 2 : 1);
  });
}

test('seleccion manual gana a una respuesta tardia y no se sobreescribe al volver a abrir', async t => {
  const pending = deferred();
  const h = await harness(t, { geocode: () => pending.promise });
  await h.fill();
  await h.blur();
  await h.mapClick(-33.7, -70.8);
  assert.ok(h.requests('/coverage/geocode')[0].options.signal.aborted);
  await act(async () => pending.resolve(response()));
  await h.blur();
  await h.open();
  assert.deepEqual(h.location(), { latitud: -33.7, longitud: -70.8 });
  assert.equal(h.requests('/coverage/geocode').length, 1);
  await h.change('Comuna', '  LA   FLORIDA ');
  await h.blur();
  assert.deepEqual(h.location(), { latitud: -33.7, longitud: -70.8 });
  assert.equal(h.requests('/coverage/geocode').length, 1, 'normalizacion conserva version y seleccion');
  await h.click('Quitar ubicacion');
  await h.open();
  assert.equal(h.location(), null);
  assert.equal(h.requests('/coverage/geocode').length, 1);
});

test('punto manual anterior al primer blur evita autogeocode', async t => {
  const h = await harness(t);
  await h.fill();
  await h.mapClick(-33.7, -70.8);
  await h.blur();
  assert.equal(h.requests('/coverage/geocode').length, 0);
});

test('sin resultados mantiene boton, mapa y coordenadas; el estado comercial proviene del backend', async t => {
  const h = await harness(t, { geocode: async () => response([]), check: async () => ({ data: coverage('NO_FACTIBLE') }) });
  await h.fill();
  await h.blur();
  assert.equal(h.location(), null);
  assert.ok(h.text().includes('Selecciona el punto manualmente'));
  assert.equal(h.button('Ubicar dirección').props.disabled, false);
  await h.blur();
  assert.equal(h.requests('/coverage/geocode').length, 1);
  await h.click('Ubicar dirección');
  assert.equal(h.requests('/coverage/geocode').length, 2, 'el retry explicito permanece disponible');
  await h.change('-33.57', '-33.7');
  await h.change('-70.61', '-70.8');
  await h.click('Ubicar punto');
  assert.deepEqual(h.maps[0].markers, [[-33.7, -70.8]]);
  await h.tick(350);
  assert.ok(h.text().includes('NO FACTIBLE'));
  assert.ok(h.text().includes('Decisión comercial del backend'));
  assert.ok(!h.text().includes('Plan backend'));
});

test('geocoder nunca decide factibilidad ni planes aunque incluya esos campos', async t => {
  const pendingCheck = deferred();
  const h = await harness(t, {
    geocode: async () => ({ data: { ...response().data, estado: 'FACTIBLE', planes: [{ nombre: 'Plan falso' }] } }),
    check: () => pendingCheck.promise,
  });
  await h.fill();
  await h.blur();
  await h.tick(350);
  assert.ok(!h.text().includes('FACTIBLE'));
  assert.ok(!h.text().includes('Plan falso'));
  await act(async () => pendingCheck.resolve({ data: coverage('NO_FACTIBLE') }));
  assert.ok(h.text().includes('NO FACTIBLE'));
  assert.ok(!h.text().includes('Plan falso'));
});

test('respuesta vieja de otra empresa o direccion no mueve el pin actual', async t => {
  const first = deferred();
  const second = deferred();
  let attempt = 0;
  const h = await harness(t, { geocode: () => (++attempt === 1 ? first.promise : second.promise) });
  await h.fill();
  await h.blur();
  await h.company(2);
  await h.change('Comuna', 'Puente Alto');
  await h.blur();
  assert.ok(h.requests('/coverage/geocode')[0].options.signal.aborted);
  await act(async () => second.resolve(response([{ ...candidate, latitud: -33.61 }])));
  await act(async () => first.resolve(response()));
  assert.deepEqual(h.location(), { latitud: -33.61, longitud: -70.63 });
  await h.tick(350);
  assert.deepEqual(h.requests('/coverage/check').at(-1).body, { idEmpresa: 2, latitud: -33.61, longitud: -70.63 });
});

test('error de geocoder conserva seleccion manual disponible', async t => {
  const h = await harness(t, { geocode: async () => { throw new Error('offline'); } });
  await h.fill();
  await h.blur();
  assert.ok(h.text().includes('Selecciona el punto manualmente'));
  assert.equal(h.button('Ubicar dirección').props.disabled, false);
  await h.mapClick(-33.7, -70.8);
  assert.deepEqual(h.location(), { latitud: -33.7, longitud: -70.8 });
});
