import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/customers/HistoricalG3Closure.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
});
const response = {
  fuente: 'G3_CONSULTA_TEMPORAL', persistido: false, consultadoEn: '2026-10-08T00:00:00Z',
  estadoConsulta: 'DISPONIBLE', mensaje: 'Consulta temporal; no modifica G8.',
  datos: { fechaCompletada: '2026-10-07T12:30:00Z', idTecnicoG3: 88, potenciaOpticaDbm: -19.25,
    resultadoLlamada: 'CONTACTADO', resueltoRemotamente: false, cantidadMateriales: 1, cantidadEquiposInformados: 0 },
};

async function harness(t, get = async () => ({ data: response })) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real traffic prohibited'); });
  const calls = [];
  const mocks = {
    '../../api': { api: { get: (...args) => { calls.push(args); return get(...args); } } },
    '../../lib': { formatDateTime: value => value },
  };
  const exports = {};
  new Function('require', 'exports', outputText)(name => mocks[name] ?? require(name), exports);
  const Component = exports.HistoricalG3Closure;
  let tree;
  await act(async () => { tree = create(React.createElement(Component, { idServicio: 50 })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return {
    tree, calls,
    text: () => JSON.stringify(tree.toJSON()),
    click: async () => { await act(async () => { await tree.root.findByType('button').props.onClick(); }); },
    change: async idServicio => { await act(async () => tree.update(React.createElement(Component, { idServicio }))); },
  };
}

test('consulta por acción explícita y separa datos temporales de G8 e inventario G1', async t => {
  const ctx = await harness(t);
  assert.equal(ctx.calls.length, 0);
  await ctx.click();
  assert.equal(ctx.calls[0][0], '/integrations/g3/services/50/historical-closure');
  for (const label of ['No persistido', '2026-10-07T12:30:00Z', '88', '-19.25 dBm', 'CONTACTADO', 'no inventario']) {
    assert.ok(ctx.text().includes(label), label);
  }
  assert.match(ctx.text(), /exclusivamente en G1/);
  assert.equal(ctx.calls.length, 1);
});

test('campos ausentes no se sustituyen por datos inventados ni por la fecha de consulta', async t => {
  const ctx = await harness(t, async () => ({ data: { ...response, datos: Object.fromEntries(Object.keys(response.datos).map(key => [key, null])) } }));
  await ctx.click();
  assert.match(ctx.text(), /No informada por G3/);
  assert.match(ctx.text(), /No informado por G3/);
  assert.doesNotMatch(ctx.text(), /-19.25|12:30:00|CONTACTADO/);
});

test('error de red mantiene el mensaje de instalación confirmada sin mostrar errores remotos', async t => {
  const ctx = await harness(t, async () => { throw new Error('secret-response'); });
  await ctx.click();
  assert.match(ctx.text(), /instalación confirmada/);
  assert.doesNotMatch(ctx.text(), /secret-response|12:30:00|CONTACTADO/);
});

test('una respuesta no validada no expone datos y permite consultar de nuevo', async t => {
  const ctx = await harness(t, async () => ({ data: { ...response, estadoConsulta: 'NO_VALIDADO', mensaje: 'Referencias incompletas', datos: response.datos } }));
  await ctx.click();
  assert.match(ctx.text(), /Referencias incompletas/);
  assert.doesNotMatch(ctx.text(), /-19.25|CONTACTADO/);
  assert.equal(ctx.tree.root.findByType('button').props.disabled, false);
});

test('cambiar de servicio aborta la consulta anterior y descarta su respuesta tardía', async t => {
  let resolve;
  const ctx = await harness(t, () => new Promise(done => { resolve = done; }));
  let pending;
  await act(async () => { pending = ctx.tree.root.findByType('button').props.onClick(); });
  const signal = ctx.calls[0][1].signal;
  await ctx.change(51);
  assert.equal(signal.aborted, true);
  await act(async () => { resolve({ data: response }); await pending; });
  assert.doesNotMatch(ctx.text(), /12:30:00|CONTACTADO/);
});

test('cerrar el panel aborta la consulta pendiente', async t => {
  let resolve;
  const ctx = await harness(t, () => new Promise(done => { resolve = done; }));
  let pending;
  await act(async () => { pending = ctx.tree.root.findByType('button').props.onClick(); });
  await act(async () => ctx.tree.unmount());
  assert.equal(ctx.calls[0][1].signal.aborted, true);
  await act(async () => { resolve({ data: response }); await pending; });
});
