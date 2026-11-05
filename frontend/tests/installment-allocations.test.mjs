import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function harness(get, post = async () => ({})) {
  const exports = {}, mocks = { '../../api': { api: { get, post }, apiErrorMessage: () => 'Error QA' }, './control-book-model': { dateLabel: v => v } };
  const source = readFileSync(new URL('../src/features/commercial/InstallmentAllocationsPanel.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports.InstallmentAllocationsPanel;
}
const fixture = (write = true, company = 1) => ({ idConvenio: company, idEmpresa: company, idFactura: company * 10, estadoConvenio: 'APROBADO', puedeImputar: write,
  cuotas: [{ idCuota: 1, numero: 1, fechaVencimiento: '2026-01-10', monto: '3500.00', imputado: '0.00', saldo: '3500.00', estado: 'PENDIENTE' }, { idCuota: 2, numero: 2, fechaVencimiento: '2099-02-10', monto: '3500.00', imputado: '0.00', saldo: '3500.00', estado: 'PENDIENTE' }],
  pagos: [{ idPago: 1, monto: '7000.00', disponible: '7000.00', fechaPago: '2026-11-04', origen: 'QA' }], operaciones: [] });
const button = (tree, label) => tree.root.findAllByType('button').find(b => b.children.join('') === label);
const field = (tree, label) => tree.root.findByProps({ 'aria-label': label });
async function open(Component, props = { idConvenio: 1, idEmpresa: 1 }) {
  let tree; await act(async () => { tree = create(React.createElement(Component, props)); });
  await act(async () => button(tree, 'Ver cuotas e imputar pagos existentes').props.onClick()); return tree;
}
async function change(tree, label, value) { await act(async () => field(tree, label).props.onChange({ target: { value } })); }
async function prepare(tree, value = '3500') {
  await change(tree, 'Pago registrado', '1'); await change(tree, 'Importe cuota 1', value); await change(tree, 'Motivo imputación', 'Confirmacion QA');
  await act(async () => button(tree, 'Revisar operación').props.onClick());
}
test('consulta distingue imputar de cobrar y no preselecciona ni envía automáticamente', async () => {
  const posts = []; const tree = await open(harness(async () => ({ data: fixture() }), async (...args) => posts.push(args)));
  const text = JSON.stringify(tree.toJSON()); assert.match(text, /Registrar pago en factura/); assert.match(text, /Sugerencia/); assert.match(text, /7000.00/);
  assert.equal(field(tree, 'Pago registrado').props.value, ''); assert.equal(field(tree, 'Importe cuota 1').props.value, ''); assert.equal(posts.length, 0);
  await act(async () => tree.unmount());
});
test('distribución explícita exige revisión y confirmación, con importes decimales exactos', async () => {
  const posts = []; let refreshed = 0;
  const tree = await open(harness(async () => ({ data: fixture() }), async (...args) => posts.push(args)), { idConvenio: 1, idEmpresa: 1, onChanged: () => refreshed++ });
  await prepare(tree, '0.10'); assert.equal(posts.length, 0); assert.match(JSON.stringify(tree.toJSON()), /Asignar 0.10/);
  await act(async () => button(tree, 'Confirmar operación auditada').props.onClick());
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/commercial/agreements/1/allocations');
  assert.deepEqual(posts[0][1].cuotas, [{ idCuota: 1, monto: '0.10' }]); assert.ok(posts[0][1].clave); assert.equal(posts[0][1].idEmpresa, undefined);
  assert.equal(refreshed, 1); // Refresh parent history too: do not leave stale "Pendiente" alongside "Pagada".
  await act(async () => tree.unmount());
});
test('resultado incierto reintenta exactamente la misma clave y payload sin cambiar distribución', async () => {
  const posts = []; const tree = await open(harness(async () => ({ data: fixture() }), async (...args) => { posts.push(args); if (posts.length === 1) throw Error('lost response'); }));
  await prepare(tree); await act(async () => button(tree, 'Confirmar operación auditada').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /conserva su clave/);
  await act(async () => button(tree, 'Confirmar operación auditada').props.onClick()); assert.deepEqual(posts[0], posts[1]);
  await act(async () => tree.unmount());
});
test('rechaza sobreimputación, precisión inválida y falta de motivo antes de confirmar', async () => {
  const posts = []; const tree = await open(harness(async () => ({ data: fixture() }), async (...args) => posts.push(args)));
  for (const value of ['3501', '-1', '0', '0.001', '1e3']) {
    await prepare(tree, value); assert.equal(button(tree, 'Confirmar operación auditada'), undefined);
  }
  await change(tree, 'Importe cuota 1', '1'); await change(tree, 'Motivo imputación', '');
  await act(async () => button(tree, 'Revisar operación').props.onClick()); assert.equal(posts.length, 0); assert.equal(button(tree, 'Confirmar operación auditada'), undefined);
  await act(async () => tree.unmount());
});
test('usuarios de consulta e históricos sin trazabilidad no ofrecen imputación', async () => {
  const data = fixture(false); data.cuotas[0] = { ...data.cuotas[0], saldo: null, estado: 'REQUIERE_REVISION' };
  const tree = await open(harness(async () => ({ data })));
  assert.equal(button(tree, 'Revisar operación'), undefined); assert.equal(tree.root.findAllByType('input').length, 0);
  assert.match(JSON.stringify(tree.toJSON()), /Revisión requerida/); await act(async () => tree.unmount());
});
test('reversa requiere importe, motivo y confirmación; conserva el pago original', async () => {
  const posts = [], data = fixture(); data.operaciones = [{ idOperacion: 1, tipo: 'APLICAR', idUsuario: 1, idAuditoria: '1', fecha: '2026-11-04', motivo: 'QA', detalles: [{ idImputacion: 5, idCuota: 1, monto: '3500.00', reversible: '3500.00', idOriginal: null }] }];
  const tree = await open(harness(async () => ({ data }), async (...args) => posts.push(args)));
  await act(async () => button(tree, 'Preparar reversa').props.onClick()); assert.equal(posts.length, 0);
  await change(tree, 'Importe reversa', '1500.20'); await change(tree, 'Motivo imputación', 'Ajuste manual QA');
  await act(async () => button(tree, 'Revisar operación').props.onClick()); assert.match(JSON.stringify(tree.toJSON()), /no se devuelve ni se modifica/);
  await act(async () => button(tree, 'Confirmar operación auditada').props.onClick()); assert.equal(posts[0][0], '/commercial/agreements/1/allocations/5/reverse'); assert.equal(posts[0][1].monto, '1500.20');
  await act(async () => tree.unmount());
});
test('respuesta tardía de otro convenio/empresa no contamina el contexto actual', async () => {
  const pending = []; const Component = harness(() => new Promise(resolve => pending.push(resolve)));
  const tree = await open(Component);
  await act(async () => tree.update(React.createElement(Component, { idConvenio: 2, idEmpresa: 2 })));
  await act(async () => pending[1]({ data: fixture(false, 2) }));
  await act(async () => pending[0]({ data: fixture(true, 1) }));
  assert.equal(button(tree, 'Revisar operación'), undefined); assert.match(JSON.stringify(tree.toJSON()), /solo lectura/);
  await act(async () => tree.unmount());
});
