import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : (node?.children ?? []).map(text).join('');
const companies = [{ idEmpresa: 1, nombre: 'FiNet' }, { idEmpresa: 2, nombre: 'Cable Mágico' }];
const zone = company => ({ idZonaPago: company * 10, idEmpresa: company, nombreZona: company === 1 ? 'Cobertura FiNet' : 'Cobertura Cable',
  tipoZona: 'COBERTURA_GENERAL', activo: true, poligonoGeojson: { type: 'Polygon', coordinates: [[[-70, -33], [-70.1, -33], [-70.1, -33.1], [-70, -33]]] },
  precios: [{ idPlanZonaPrecio: company * 100, activo: true, precioMensual: '19990', plan: { idPlan: company * 1000, nombreComercial: company === 1 ? 'Plan FiNet' : 'Plan Cable', activo: true, tipoPlan: 'Internet' } }] });
function compile(file, mocks = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => name.endsWith('.css') ? {} : name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
async function setup(t, props = {}, get) {
  const previous = globalThis.window;
  const reads = [], writes = [], events = [];
  globalThis.window = { setTimeout, clearTimeout, dispatchEvent: event => events.push(event) };
  const { CoverageZonesPanel } = compile('features/coverage/CoverageZonesPanel.tsx', {
    leaflet: {}, '../../shared/components': { Modal: () => null },
    '../../shared/hooks/useTransientMessage': compile('shared/hooks/useTransientMessage.ts'),
    '../../api': { api: { get: async (path, options) => { reads.push({ path, ...options }); return get ? get(path, options) : { data: [zone(options.params.idEmpresa)] }; },
      post: async (...args) => { writes.push(args); return { data: {} }; } }, apiErrorMessage: error => error.message },
  });
  let current = { idEmpresa: 1, scope: 'consolidado', companies, canManage: false, ...props }, tree;
  await act(async () => { tree = create(React.createElement(CoverageZonesPanel, current)); });
  t.after(async () => { await act(async () => tree.unmount()); globalThis.window = previous; });
  return { tree, reads, writes, events,
    update: async change => { current = { ...current, ...change }; await act(async () => tree.update(React.createElement(CoverageZonesPanel, current))); },
    visible: () => text(tree.toJSON()),
  };
}

test('Consolidado consulta ambas empresas e incluye sus zonas y planes', async t => {
  const h = await setup(t);
  assert.deepEqual(h.reads.map(request => request.params.idEmpresa), [1, 2]);
  assert.match(h.visible(), /Cobertura FiNet/); assert.match(h.visible(), /Cobertura Cable/);
  assert.match(h.visible(), /Plan FiNet/); assert.match(h.visible(), /Plan Cable/);
  assert.equal(h.tree.root.findAllByProps({ className: 'coverage-zone-plan-count' }).length, 2);
  assert.deepEqual(h.writes, []);
});

test('seleccionar una empresa consulta solo esa empresa y regresar a Consolidado recupera ambas', async t => {
  const h = await setup(t, { scope: '1' });
  assert.deepEqual(h.reads.map(request => request.params.idEmpresa), [1]);
  assert.doesNotMatch(h.visible(), /Plan Cable/);
  await h.update({ scope: '2', idEmpresa: 2 });
  assert.equal(h.reads.at(-1).params.idEmpresa, 2);
  assert.doesNotMatch(h.visible(), /Plan FiNet/); assert.match(h.visible(), /Plan Cable/);
  await h.update({ scope: 'consolidado', idEmpresa: 1 });
  assert.deepEqual(h.reads.slice(-2).map(request => request.params.idEmpresa), [1, 2]);
  assert.match(h.visible(), /Plan FiNet/); assert.match(h.visible(), /Plan Cable/);
});

test('la vista consolidada conserva la empresa de la zona al cambiar su estado', async t => {
  const h = await setup(t, { canManage: true });
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Cambiar estado de Cobertura Cable' }).props.onClick());
  assert.deepEqual(h.writes, [['/coverage/zones/20/deactivate']]);
  assert.equal(h.events[0].detail.idEmpresa, 2);
});

test('crear una microzona en Consolidado ofrece solo padres de la empresa de creación', async t => {
  const h = await setup(t, { canManage: true });
  await act(async () => h.tree.root.findAllByType('button').find(button => text(button).startsWith('Nueva microzona')).props.onClick());
  const parent = h.tree.root.findAllByType('label').find(label => text(label).startsWith('Cobertura asociada')).findByType('select');
  assert.deepEqual(parent.findAllByType('option').map(option => option.props.value), ['', 10]);
});

test('una consulta antigua no repone zonas de otra empresa después de cambiar el filtro', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await setup(t, { scope: '1' }, (_path, options) => options.params.idEmpresa === 1 ? pending : { data: [zone(2)] });
  await h.update({ scope: '2', idEmpresa: 2 });
  assert.equal(h.reads[0].signal.aborted, true);
  await act(async () => finish({ data: [zone(1)] }));
  assert.doesNotMatch(h.visible(), /Plan FiNet/); assert.match(h.visible(), /Plan Cable/);
});

test('una consulta consolidada fallida no se presenta como si fuera el total de ambas empresas', async t => {
  const h = await setup(t, {}, async (_path, options) => {
    if (options.params.idEmpresa === 2) throw new Error('No se pudo consultar Cable Mágico');
    return { data: [zone(1)] };
  });
  assert.match(h.visible(), /No se pudo consultar Cable Mágico/);
  assert.equal(h.tree.root.findAllByProps({ className: 'coverage-zone-plan-count' }).length, 0);
});
