import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function harness(get) {
  const exports = {};
  const mocks = { '../../api': { api: { get } }, '../../shared/components': { TablePagination: () => null } };
  const source = readFileSync(new URL('../src/features/installations/InstallationHistoryPanel.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports.InstallationHistoryPanel;
}
const row = (company, date) => ({ key: `${company}:901`, idEmpresa: company, idOt: '901', fuente: 'G3', idContrato: company * 10, idServicio: company * 50,
  clasificacionFecha: date ? 'FECHA_TECNICA_CONFIRMADA' : 'PENDIENTE_FECHA_TECNICA', fechasTecnicasOriginales: date ? [date] : [], ordenesLocales: [],
  solicitudesG3: [{ idIntegracion: company, requestId: `request-${company}`, traceId: `trace-${company}`, fechaCierreProcesado: '2026-11-03T12:00:00Z' }] });
test('historial React muestra cierre sin OT local, fecha original y completada sin fecha, con filtro', async () => {
  const calls = [];
  const Component = harness(async (...args) => { calls.push(args); return { data: { items: [row(1, '2026-10-01T12:00:00Z'), row(2, null)] } }; });
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: 'consolidado' })); });
  assert.deepEqual(calls[0][1], { params: { scope: 'consolidado' } });
  const text = JSON.stringify(tree.toJSON());
  assert.match(text, /Sin OT local/); assert.match(text, /2026-10-01T12:00:00Z/);
  assert.match(text, /Pendiente de fecha técnica/); assert.match(text, /no significa pendiente de ejecución/);
  await act(async () => tree.root.findByType('select').props.onChange({ target: { value: 'PENDIENTE_FECHA_TECNICA' } }));
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-1/);
  await act(async () => tree.unmount());
});
test('respuesta tardía de otra empresa no contamina la vista actual; error no afirma que falten cierres', async () => {
  const pending = [];
  const Component = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: '1' })); });
  await act(async () => tree.update(React.createElement(Component, { scope: '2' })));
  await act(async () => pending[1].resolve({ data: { items: [row(2, null)] } }));
  await act(async () => pending[0].resolve({ data: { items: [row(1, null)] } }));
  assert.match(JSON.stringify(tree.toJSON()), /request-2/); assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-1/);
  await act(async () => tree.root.findAllByType('button')[0].props.onClick());
  await act(async () => pending[2].reject(new Error('unavailable')));
  assert.match(JSON.stringify(tree.toJSON()), /cierres confirmados no han sido modificados/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-2/);
  await act(async () => tree.unmount());
});
