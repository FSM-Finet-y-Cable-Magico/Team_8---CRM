import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const evidenceExports = {};
new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../src/features/installations/WorkOrderTechnicalEvidence.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, evidenceExports);
function harness(get) {
  const exports = {};
  const mocks = { '../../api': { api: { get } }, '../../shared/components': { TablePagination: () => null }, './WorkOrderTechnicalEvidence': evidenceExports };
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

test('preserva detalle de OT local sin mezclar una OT de igual numero de otra empresa', async () => {
  const Component = harness(async () => ({ data: { items: [{ ...row(1, null), ordenesLocales: [901] }] } }));
  const localOrders = [
    { idOt: 901, idEmpresa: 1, codigoSeguimiento: 'LOCAL-QA', prioridad: 'Alta', estado: 'Completada', fechaProgramada: '2026-10-01', tecnico: { nombreCompleto: 'Tecnico QA' } },
    { idOt: 901, idEmpresa: 2, codigoSeguimiento: 'NO-MEZCLAR', tecnico: { nombreCompleto: 'AJENO' } },
  ];
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: '1', localOrders })); });
  const text = JSON.stringify(tree.toJSON());
  assert.match(text, /LOCAL-QA/); assert.match(text, /Tecnico QA/); assert.match(text, /Visita programada/);
  assert.doesNotMatch(text, /NO-MEZCLAR|AJENO/);
  await act(async () => tree.unmount());
});

test('OT histórica completada sin servicio conserva fecha y equipos solo como declaración de la orden', async () => {
  const historical = { ...row(1, '2026-10-02T12:00:00.000Z'), key: '1:2', idOt: '2', fuente: 'LEGACY_LOCAL',
    idContrato: null, idServicio: null, ordenesLocales: [2], solicitudesG3: [], antecedentesTecnicos: [{
      idEmpresa: 1, idOt: 2, fechaCompletada: '2026-10-02T12:00:00.000Z', idTecnicoRegistrado: 8,
      idTecnicoExterno: null, potenciaOpticaDbm: -19.5, resueltoRemotamente: false,
      equiposDeclarados: { instalados: ['ONT-DECLARADA-QA'], retirados: [] }, asignacionInventarioConfirmada: false,
    }] };
  const Component = harness(async () => ({ data: { items: [historical] } }));
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: '1' })); });
  const rendered = JSON.stringify(tree.toJSON());
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  for (const value of ['Histórica / local', 'Sin contrato correlacionado', 'Sin servicio correlacionado', 'ONT-DECLARADA-QA', '2026-10-02T12:00:00.000Z', 'no acreditan asignación oficial']) assert.ok(rendered.includes(value), value);
  assert.doesNotMatch(rendered, /Tracking #|Cierre de solicitud G8/);
  await act(async () => tree.unmount());
});
