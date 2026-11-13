import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// TK-08/TK-09: the type catalog and the physical-unit lookup are distinct, and the unit record shows
// only what G1 returned for the selected company. Every request here is a fake; nothing reaches G1.
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node?.children ?? []).map(textOf).join('');
const formatting = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(formatting);

function axiosError(status, data = {}) {
  return Object.assign(new Error('HTTP ' + status), { isAxiosError: true, response: { status, data } });
}
function fakeApi(units) {
  const calls = []; const pending = [];
  const api = {
    get: (path, config) => {
      calls.push([path, config.params]);
      if (path.endsWith('/equipment-types')) return Promise.resolve({ data: { data: [{ id_tipo_equipo: 1, id_empresa: config.params.idEmpresa, nombre: 'ONT QA', categoria: 'ONT', marca: 'Marca', modelo: 'M1', garantia_dias: 365, requiere_serie_individual: true }] } });
      const serial = decodeURIComponent(path.split('/').at(-1));
      const answer = units[serial];
      if (answer === 'hold') return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        config.signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { name: 'CanceledError' })));
      });
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve({ data: { fuente: 'G1', data: answer } });
    },
  };
  return { api, calls, pending };
}
function load(api) {
  const component = {};
  const mocks = {
    '../../api': { api },
    axios: { isAxiosError: error => Boolean(error?.isAxiosError) },
    '../../lib': { ...formatting, formatDateOnly: value => `fecha:${value}` },
    '../../shared/components': { TablePagination: () => null },
  };
  new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../src/features/inventory/InventoryPanel.tsx', import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), component);
  return component.InventoryPanel;
}
async function setup(t, units, companyId = 2) {
  const fake = fakeApi(units);
  const Panel = load(fake.api);
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { companyId, companyName: 'Empresa QA' })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const search = async (serial, { wait = true } = {}) => {
    await act(async () => tree.root.findByProps({ id: 'inventory-serial' }).props.onChange({ target: { value: serial } }));
    await act(async () => {
      const submitted = tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
      if (wait) await submitted;
    });
  };
  const record = () => tree.root.findAll(node => node.type === 'article' && node.props.className === 'inventory-unit-result');
  return { ...fake, tree, search, record, Panel, text: () => textOf(tree.toJSON()) };
}
const fullUnit = {
  id_unidad: 77, numero_serie: 'QA-ONT-1', id_empresa: 2, estado: 'Instalado en cliente', estadoFisicoOficial: true,
  tipo_equipo: { id_tipo_equipo: 1, id_empresa: 2, nombre: 'ONT QA', marca: 'Marca', modelo: 'M1' }, mac_address: 'AA:BB:CC:00:11:22',
  id_bodega_actual: 3, fecha_adquisicion: '2026-01-02', fecha_instalacion: '2026-03-04',
  garantia: { vigente: true, fecha_vencimiento: '2027-01-02' },
  asignacion_actual: { id_cliente: 1, id_servicio: 900001, id_contrato: 900001, id_ot: 900001, dato_privado: 'NO_MOSTRAR' },
};

test('el catálogo se presenta como tipos de equipo, distinto de la consulta de unidad física', async t => {
  const h = await setup(t, {});
  const text = h.text();
  assert.match(text, /Catálogo de tipos de equipo/);
  assert.match(text, /No es un listado de existencias ni de unidades físicas/);
  assert.match(text, /Consultar unidad física/);
  assert.deepEqual(h.tree.root.findAllByType('th').map(textOf), ['Tipo de equipo', 'Categoría', 'Marca / modelo', 'Identificación', 'Garantía estándar']);
  assert.doesNotMatch(text, /Equipo consultado|cantidad disponible|stock/i);
  assert.deepEqual(h.calls, [['/integrations/g1/equipment-types', { idEmpresa: 2, activo: true }]]);
});

test('la ficha muestra los datos que G1 devolvió, sin campos ajenos ni nombres de bodega inventados', async t => {
  const h = await setup(t, { 'QA-ONT-1': fullUnit });
  await h.search('QA-ONT-1');
  assert.deepEqual(h.calls.at(-1), ['/integrations/g1/units/QA-ONT-1', { idEmpresa: 2 }]);
  assert.equal(h.record().length, 1);
  const text = textOf(h.record()[0]);
  for (const value of ['Unidad física', 'QA-ONT-1', formatting.formatWorkOrderValue('Instalado en cliente'), 'Marca · M1', 'AA:BB:CC:00:11:22', 'Unidad #77', 'Bodega ID 3',
    'fecha:2026-01-02', 'fecha:2026-03-04', 'Vigente', 'fecha:2027-01-02', 'Cliente #1 · Servicio #900001 · Contrato #900001 · Orden de trabajo #900001']) {
    assert.ok(text.includes(value), value);
  }
  assert.doesNotMatch(text, /NO_MOSTRAR|No informado/);
  // The record lives inside the lookup panel: no extra full-width "Equipo consultado" block.
  assert.equal(h.tree.root.findByType('aside').findAll(node => node.type === 'article').length, 1);
});

test('respuesta parcial y sin asignación activa se presentan sin rellenar datos', async t => {
  const h = await setup(t, {
    'QA-PARCIAL': { numero_serie: 'QA-PARCIAL', id_empresa: 2, estado: 'En bodega' },
    'QA-LIBRE': { numero_serie: 'QA-LIBRE', id_empresa: 2, estado: 'En bodega', asignacion_actual: null },
    'QA-RARO': { numero_serie: 'QA-RARO', id_empresa: 2, estado: 'Extraviado', estadoFisicoOficial: false },
  });
  await h.search('QA-PARCIAL');
  const partial = textOf(h.record()[0]);
  assert.equal((partial.match(/No informado/g) ?? []).length, 9);
  assert.doesNotMatch(partial, /Bodega ID|Vigente|Vencida|Cliente #/);
  await h.search('QA-LIBRE');
  assert.match(textOf(h.record()[0]), /Sin asignación activa/);
  await h.search('QA-RARO');
  assert.match(textOf(h.record()[0]), /Estado por confirmar/);
  assert.doesNotMatch(textOf(h.record()[0]), /Extraviado/);
});

test('sin serie no consulta; 404, 403 y caída de G1 muestran avisos y ninguna ficha', async t => {
  const h = await setup(t, {
    'NO-EXISTE': axiosError(404), 'OTRA-EMPRESA': axiosError(403), 'CAIDA': axiosError(502, { code: 'G1_UNAVAILABLE' }),
    'SIN-CONFIG': axiosError(503, { code: 'INTEGRACION_G1_NO_CONFIGURADA' }),
  });
  await h.search('   ');
  assert.equal(h.calls.length, 1);
  assert.match(h.text(), /Ingresa un número de serie/);
  for (const [serial, message] of [['NO-EXISTE', /No encontramos ese equipo/], ['OTRA-EMPRESA', /no tiene acceso al inventario/], ['CAIDA', /No pudimos consultar el equipo/], ['SIN-CONFIG', /Inventario no disponible/]]) {
    await h.search(serial);
    assert.match(h.text(), message);
    assert.equal(h.record().length, 0);
  }
  assert.ok(h.calls.every(([path]) => path.startsWith('/integrations/g1/')));
});

test('cambiar de empresa cancela la consulta en vuelo y no muestra la unidad de la empresa anterior', async t => {
  const h = await setup(t, { 'QA-ONT-1': fullUnit, 'LENTA': 'hold' });
  await h.search('QA-ONT-1');
  assert.equal(h.record().length, 1);
  await h.search('LENTA', { wait: false });
  assert.equal(h.pending.length, 1);
  await act(async () => h.tree.update(React.createElement(h.Panel, { companyId: 3, companyName: 'Otra empresa' })));
  assert.equal(h.record().length, 0);
  assert.equal(h.tree.root.findByProps({ id: 'inventory-serial' }).props.value, '');
  await act(async () => h.pending[0]?.resolve({ data: { data: { ...fullUnit, numero_serie: 'LENTA' } } }));
  assert.equal(h.record().length, 0);
  assert.doesNotMatch(h.text(), /LENTA|QA-ONT-1/);
  assert.deepEqual(h.calls.at(-1), ['/integrations/g1/equipment-types', { idEmpresa: 3, activo: true }]);
});
