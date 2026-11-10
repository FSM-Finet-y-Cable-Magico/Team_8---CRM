import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const evidenceExports = {};
const dateExports = {};
const formattingExports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(formattingExports);
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/dates.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(dateExports);
new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../src/features/installations/WorkOrderTechnicalEvidence.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, evidenceExports);
function harness(get) {
  const exports = {};
  const mocks = { '../../api': { api: { get } }, '../../lib': { ...dateExports, ...formattingExports },
    '../../shared/components': { TablePagination: () => null, Modal: ({ title, open, children, onClose }) => open
      ? React.createElement('dialog', { 'aria-label': title }, React.createElement('button', { 'aria-label': 'Cerrar modal', onClick: onClose }), children) : null },
    './WorkOrderTechnicalEvidence': evidenceExports };
  const source = readFileSync(new URL('../src/features/installations/InstallationHistoryPanel.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports.InstallationHistoryPanel;
}
const row = (company, date) => ({ key: `${company}:901`, idEmpresa: company, idOt: '901', fuente: 'G3', idContrato: company * 10, idServicio: company * 50,
  clasificacionFecha: date ? 'FECHA_TECNICA_CONFIRMADA' : 'PENDIENTE_FECHA_TECNICA', fechasTecnicasOriginales: date ? [date] : [], ordenesLocales: [],
  solicitudesG3: [{ idIntegracion: company, requestId: `request-${company}`, traceId: `trace-${company}`, fechaCierreProcesado: '2026-11-03T12:00:00Z' }] });
async function openDetail(tree, index = 0) {
  if (!tree.root.findAllByType('dialog').length) await openHistory(tree);
  const button = tree.root.findAllByType('button').filter(node => node.props.children === 'Detalle')[index];
  assert.match(button.props.className, /\bcrm-table-action\b/);
  await act(async () => button.props.onClick());
}
async function openHistory(tree) {
  await act(async () => tree.root.findByProps({ className: 'installation-history-trigger' }).props.onClick());
}
async function backToHistory(tree) {
  await act(async () => tree.root.findByProps({ className: 'installation-history-back' }).props.onClick());
}

test('historial React muestra cierre sin OT local, fecha original y completada sin fecha, con filtro', async () => {
  const calls = [];
  const Component = harness(async (...args) => { calls.push(args); return { data: { items: [row(1, '2026-10-01T12:00:00Z'), row(2, null)] } }; });
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: 'consolidado' })); });
  assert.deepEqual(calls[0][1], { params: { scope: 'consolidado' } });
  assert.equal(tree.root.findAllByType('table').length, 0);
  await openHistory(tree);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-1|trace-1|Tracking #/);
  assert.match(JSON.stringify(tree.toJSON()), /Pendiente de fecha técnica|no significa pendiente de ejecución/);
  await openDetail(tree);
  const text = JSON.stringify(tree.toJSON());
  assert.match(text, /Sin OT local/); assert.match(text, /2026-10-01T12:00:00Z/);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Referencias y fechas originales' }).type, 'summary');
  assert.equal(tree.root.findAllByType('dialog').length, 1);
  await backToHistory(tree);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Fecha técnica' }).props.onChange({ target: { value: 'PENDIENTE_FECHA_TECNICA' } }));
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
  await openDetail(tree);
  assert.match(JSON.stringify(tree.toJSON()), /request-2/); assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-1/);
  await backToHistory(tree);
  await act(async () => tree.root.findByProps({ className: 'installation-refresh-button' }).props.onClick());
  await act(async () => pending[2].reject(new Error('unavailable')));
  assert.match(JSON.stringify(tree.toJSON()), /cierres confirmados no han sido modificados/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /request-2/);
  await act(async () => tree.unmount());
});

test('preserva detalle de OT local sin mezclar una OT de igual numero de otra empresa', async () => {
  const Component = harness(async () => ({ data: { items: [{ ...row(1, null), ordenesLocales: [901] }] } }));
  const localOrders = [
    { idOt: 901, idEmpresa: 1, idTecnico: 8, codigoSeguimiento: 'LOCAL-QA', prioridad: 'Alta', estado: 'Completada', fechaProgramada: '2026-10-01', tecnico: { nombreCompleto: 'Tecnico QA' } },
    { idOt: 901, idEmpresa: 2, codigoSeguimiento: 'NO-MEZCLAR', tecnico: { nombreCompleto: 'AJENO' } },
  ];
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: '1', localOrders })); });
  await openDetail(tree);
  const text = JSON.stringify(tree.toJSON());
  assert.match(text, /LOCAL-QA/); assert.match(text, /Tecnico QA/); assert.match(text, /Visita programada/);
  assert.deepEqual(tree.root.findByType('small').children, ['ID en CRM #', '8']);
  assert.doesNotMatch(text, /NO-MEZCLAR|AJENO/);
  await act(async () => tree.unmount());
});

test('OT histórica completada sin servicio conserva fecha y equipos solo como declaración de la orden', async () => {
  const historical = { ...row(1, '2026-10-02T12:00:00.000Z'), key: '1:2', idOt: '2', fuente: 'LEGACY_LOCAL',
    idContrato: null, idServicio: null, ordenesLocales: [2], solicitudesG3: [], antecedentesTecnicos: [{
      idEmpresa: 1, idOt: 2, fechaCompletada: '2026-10-02T12:00:00.000Z', idTecnicoRegistrado: 8,
      idTecnicoExterno: 0, potenciaOpticaDbm: 0, resueltoRemotamente: false,
      equiposDeclarados: { instalados: ['ONT-DECLARADA-QA'], retirados: [] }, asignacionInventarioConfirmada: false,
    }] };
  const Component = harness(async () => ({ data: { items: [historical] } }));
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: '1' })); });
  await openHistory(tree);
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  await openDetail(tree);
  const rendered = JSON.stringify(tree.toJSON());
  for (const value of ['Histórica / local', 'Sin contrato correlacionado', 'Sin servicio correlacionado', 'ONT-DECLARADA-QA', '2026-10-02T12:00:00.000Z', 'no acreditan asignación oficial']) assert.ok(rendered.includes(value), value);
  assert.doesNotMatch(rendered, /Tracking #|Cierre de solicitud G8/);
  const evidence = tree.root.findByProps({ 'aria-label': 'Antecedente técnico OT 2' });
  assert.equal(evidence.findAllByType('p').length, 0);
  const references = tree.root.findByType('details');
  assert.ok(references.findAllByType('p').some(paragraph => paragraph.children.join('').includes('no acreditan asignación oficial')));
  const fields = new Map(evidence.findAllByType('dt').map(label => [label.children.join(''), label.parent.findByType('dd').children]));
  assert.deepEqual(fields.get('Identificador técnico externo'), ['0']);
  assert.deepEqual(fields.get('Potencia óptica (dBm)'), ['0']);
  assert.deepEqual(fields.get('Resuelto remotamente'), ['No']);
  assert.deepEqual(evidence.findByType('time').children, [dateExports.formatDateTime('2026-10-02T12:00:00.000Z')]);
  await act(async () => tree.unmount());
});

test('la vista compacta conserva la fecha de calendario y solo enriquece nombres de la empresa autorizada', async () => {
  const dated = { ...row(1, '2026-10-01'), idCliente: 99 };
  const Component = harness(async () => ({ data: { items: [dated] } }));
  let tree;
  await act(async () => { tree = create(React.createElement(Component, {
    scope: '1', companies: [{ idEmpresa: 1, nombre: 'Empresa autorizada' }],
    customers: [{ idCliente: 99, idEmpresa: 2, nombreCompleto: 'NOMBRE DE OTRA EMPRESA' }],
  })); });
  await openHistory(tree);
  const visible = JSON.stringify(tree.toJSON());
  assert.match(visible, /Empresa autorizada/);
  assert.doesNotMatch(visible, /NOMBRE DE OTRA EMPRESA/);
  assert.ok(visible.includes(dateExports.formatDateOnly('2026-10-01')));
  await act(async () => tree.unmount());
});

test('buscar y filtrar el historial conserva filtros al volver del detalle y no genera solicitudes', async () => {
  let calls = 0;
  const Component = harness(async () => { calls++; return { data: { items: [row(1, null), { ...row(2, null), fuente: 'LEGACY_LOCAL' }] } }; });
  let tree; await act(async () => { tree = create(React.createElement(Component, { scope: 'consolidado' })); });
  await openHistory(tree);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar en el historial de instalaciones' }).props.onChange({ target: { value: 'Empresa 1' } }));
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Origen del historial' }).props.onChange({ target: { value: 'LEGACY_LOCAL' } }));
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 0);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Buscar en el historial de instalaciones' }).props.onChange({ target: { value: '' } }));
  await openDetail(tree);
  await backToHistory(tree);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Origen del historial' }).props.value, 'LEGACY_LOCAL');
  assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 1);
  assert.equal(calls, 1);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Cerrar modal' }).props.onClick());
  assert.equal(tree.root.findAllByType('dialog').length, 0);
  await act(async () => tree.unmount());
});
