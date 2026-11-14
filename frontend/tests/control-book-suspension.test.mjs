import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : (node?.children ?? []).map(textOf).join('');
function compile(file, mocks = {}) {
  const source = readFileSync(new URL('../src/features/commercial/' + file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports); return exports;
}
const model = compile('control-book-model.ts');
const Modal = ({ title, children }) => React.createElement('section', { 'aria-label': title }, children);
// Same shape as BillingService.suspensionEligibility() (CU-30: automatic eligibility, manual execution).
const eligibility = (over = {}) => ({
  idContrato: 31, elegible: true, yaSuspendido: false, motivo: null, umbralDias: 5, motivoSuspension: 'NO PAGO',
  facturas: [{ idFactura: 80, saldoExigible: 19990, diasAtraso: 12, fechaVencimientoEfectiva: '2026-11-01' }],
  deuda: { facturasVencidas: 2, cubiertasPorConvenio: 1, bajoUmbral: 0, facturasSobreUmbral: 1, totalExigibleSobreUmbral: 19990, maxDiasAtraso: 12 },
  serviciosAfectados: [{ idServicio: 41, tipoServicio: 'Internet' }, { idServicio: 42, tipoServicio: 'TV' }],
  empresa: { idEmpresa: 1, nombre: 'FiNet' }, contrato: { idContrato: 31, estado: 'Moroso' }, cliente: { idCliente: 10, nombre: 'Cliente de prueba' }, ...over,
});

async function suspension(t, options = {}) {
  const reads = [], patches = [], saved = [];
  const api = {
    get: async path => { reads.push(path); return { data: options.eligibility ?? eligibility() }; },
    patch: async (...args) => { patches.push(args); return options.patch ? options.patch(...args) : { data: { yaSuspendido: false, serviciosSuspendidos: [41, 42] } }; },
  };
  const { ControlBookSuspension } = compile('ControlBookSuspension.tsx', { '../../api': { api, apiErrorMessage: e => e.message }, './control-book-model': model, './ControlBookModal': { ControlBookModal: Modal } });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookSuspension, { contractId: 31, customerName: 'Cliente de prueba', plan: 'Fibra 400', canManage: options.canManage ?? true,
    onClose() {}, onSaved: m => saved.push(m), onBusyChange() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const text = () => textOf(tree.toJSON());
  const confirm = () => act(async () => tree.root.findAllByType('input').find(n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } }));
  const observe = value => act(async () => tree.root.findByType('textarea').props.onChange({ target: { value } }));
  const submit = () => act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const submitButton = () => tree.root.findAllByType('button').find(n => n.props.type === 'submit');
  return { tree, reads, patches, saved, text, confirm, observe, submit, submitButton };
}

test('resumen compacto con empresa, contrato, servicios, saldo, atraso y motivo, sin explicaciones de requisitos', async t => {
  const h = await suspension(t);
  assert.deepEqual(h.reads, ['/billing/contracts/31/suspension-eligibility']);
  for (const value of ['FiNet', '#31 · Moroso', 'Internet, TV', '12 días', 'NO PAGO']) assert.ok(h.text().includes(value), value);
  assert.doesNotMatch(h.text(), /Umbral|cubierta\(s\)|No corresponde suspender|Cumple/);
  assert.ok(!/\bG[0-9]\b/.test(h.text()));
});

test('exige confirmación explícita; la observación es opcional y se envía recortada', async t => {
  const h = await suspension(t);
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit(); assert.equal(h.patches.length, 0);
  await h.observe('  Sin respuesta a tres llamados  '); await h.confirm();
  assert.equal(h.submitButton().props.disabled, false);
  await h.submit();
  assert.deepEqual(h.patches, [['/billing/contracts/31/suspend', { observacion: 'Sin respuesta a tres llamados' }]]);
  assert.equal(h.saved[0], 'Servicio suspendido por no pago (2 servicios).');
});

test('sin observación no envía el campo', async t => {
  const h = await suspension(t);
  await h.confirm(); await h.submit();
  assert.deepEqual(h.patches, [['/billing/contracts/31/suspend', { observacion: undefined }]]);
});

test('no elegible: no añade el motivo ni permite suspender', async t => {
  const h = await suspension(t, { eligibility: eligibility({ elegible: false, facturas: [], motivo: { code: 'BAJO_UMBRAL_CORTE', message: 'No existen facturas con saldo que cumplan los días de corte (5 días de atraso)' } }) });
  assert.doesNotMatch(h.text(), /No corresponde suspender|No existen facturas/);
  assert.equal(h.tree.root.findAllByType('textarea').length, 0);
  await h.submit(); assert.equal(h.patches.length, 0);
});

test('sin permiso de facturación no ofrece confirmar', async t => {
  const h = await suspension(t, { canManage: false });
  assert.equal(h.tree.root.findAllByType('input').length, 0);
  await h.submit(); assert.equal(h.patches.length, 0);
});

test('el backend revalida: su rechazo se muestra y no se anuncia suspensión', async t => {
  const h = await suspension(t, { patch: () => Promise.reject(new Error('La deuda vencida está cubierta por un convenio de pago activo')) });
  await h.confirm(); await h.submit();
  assert.ok(h.text().includes('cubierta por un convenio de pago activo'));
  assert.equal(h.saved.length, 0);
});

test('doble clic en curso suspende una sola vez; una respuesta idempotente lo informa', async t => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = await suspension(t, { patch: () => pending.then(() => ({ data: { yaSuspendido: true, serviciosSuspendidos: [] } })) });
  await h.confirm();
  let first; act(() => { first = h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  await h.submit();
  assert.equal(h.patches.length, 1);
  await act(async () => { release(); await first; });
  assert.deepEqual(h.saved, ['El contrato ya estaba suspendido; no se modificó nada.']);
});

test('una respuesta de otro contrato se descarta', async t => {
  const h = await suspension(t, { eligibility: eligibility({ idContrato: 99 }) });
  assert.ok(h.text().includes('no corresponde al contrato'));
  assert.equal(h.submitButton().props.disabled, true);
});
