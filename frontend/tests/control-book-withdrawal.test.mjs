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
const services = [
  { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, tipoServicio: 'Internet', estadoOperativo: 'Suspendido' },
  { idServicio: 52, idCliente: 30, idEmpresa: 1, idContrato: 20, tipoServicio: 'TV', estadoOperativo: 'Baja' },
];
const checks = (failure) => ['SERVICIO', 'EMPRESA', 'SIN_BAJA_PREVIA', 'SIN_SOLICITUD_ACTIVA', 'SERVICIO_SUSPENDIDO', 'CONTRATO', 'DEUDA_VENCIDA', 'AVISO_PREVIO']
  .map(code => ({ code, label: 'Requisito ' + code, ok: code !== failure, message: code === failure ? 'Falla ' + code : '' }));
const eligibility = (over = {}) => ({
  idServicio: 50, motivo: 'MOROSIDAD', eligible: true, habilitado: true, checks: checks(), firstFailure: null,
  contexto: {
    empresa: { idEmpresa: 1, nombre: 'FiNet' }, cliente: { idCliente: 30, nombre: 'Cliente Moroso', rut: '12345678-5' },
    contrato: { idContrato: 20, estado: 'Suspendido', plan: 'Fibra 300 Hogar' }, servicio: { idServicio: 50, tipo: 'Internet', estado: 'Suspendido' },
    deuda: { overdueCount: 1, uncoveredCount: 1, coveredByAgreementCount: 0, totalExigible: 19990, maxDiasAtraso: 41 },
    aviso: { idEvento: 7, fecha: '2026-11-01T12:00:00.000Z' }, solicitudActiva: null, responsable: { idUsuario: 5, nombre: 'Comercial FiNet' },
  }, ...over,
});

async function withdrawal(t, options = {}) {
  const posts = [], saved = [], reads = [];
  const api = {
    get: async (path) => { reads.push(path); if (options.getError) throw options.getError; return { data: options.eligibility ?? eligibility() }; },
    post: async (...args) => { posts.push(args); return options.post ? options.post(...args) : { data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: 'TK-BAJA01' }, repetido: false } }; },
  };
  const { ControlBookWithdrawal } = compile('ControlBookWithdrawal.tsx', { '../../api': { api, apiErrorMessage: e => e.message }, './control-book-model': model, './ControlBookModal': { ControlBookModal: Modal } });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookWithdrawal, { services: options.services ?? services, customerName: 'Cliente Moroso', plan: 'Fibra 300 Hogar', canManage: true, onClose() {}, onSaved: m => saved.push(m), onBusyChange() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const text = () => textOf(tree.toJSON());
  const observe = value => act(async () => tree.root.findByType('textarea').props.onChange({ target: { value } }));
  const confirm = () => act(async () => tree.root.findAllByType('input').find(n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } }));
  const submit = () => act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const submitButton = () => tree.root.findAllByType('button').find(n => n.props.type === 'submit');
  return { tree, posts, saved, reads, text, observe, confirm, submit, submitButton };
}

test('consulta los requisitos del servicio suspendido y precarga empresa, cliente, contrato, deuda, aviso y responsable', async t => {
  const h = await withdrawal(t);
  assert.deepEqual(h.reads, ['/service-withdrawals/eligibility/50']);
  for (const value of ['FiNet', 'Cliente Moroso · 12345678-5', '#20 · Fibra 300 Hogar', 'Internet', 'Suspendido', '41 días', 'Morosidad', 'Comercial FiNet']) assert.ok(h.text().includes(value), value);
  assert.ok(h.text().includes('Requisito AVISO_PREVIO✓ Cumple'));
  assert.ok(!h.text().includes('TV · Baja'), 'un servicio ya dado de baja no se ofrece');
});

test('solo registra con observación suficiente y confirmación explícita; envía lo que el backend necesita', async t => {
  const h = await withdrawal(t);
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit(); assert.equal(h.posts.length, 0);
  await h.observe('corto'); await h.confirm(); await h.submit();
  assert.equal(h.posts.length, 0); assert.ok(h.text().includes('mínimo 10 caracteres'));
  await h.observe('  Cliente notificado tres veces sin pago  ');
  assert.equal(h.submitButton().props.disabled, false);
  await h.submit();
  assert.deepEqual(h.posts, [['/service-withdrawals/initiate', { idServicio: 50, idContrato: 20, observaciones: 'Cliente notificado tres veces sin pago', confirmacion: true }]]);
  assert.equal(h.saved.length, 1);
  assert.match(h.saved[0], /Solicitud de retiro N° 1000 y ticket TK-BAJA01.*sigue suspendido/);
});

test('un reintento devuelto por el backend informa que la baja ya estaba iniciada', async t => {
  const h = await withdrawal(t, { post: () => ({ data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: null }, repetido: true } }) });
  await h.observe('Cliente notificado tres veces sin pago'); await h.confirm(); await h.submit();
  assert.match(h.saved[0], /ya estaba iniciada.*#1001/);
});

test('requisito incumplido: muestra el motivo y no ofrece registrar', async t => {
  const h = await withdrawal(t, { eligibility: eligibility({ eligible: false, checks: checks('AVISO_PREVIO'), firstFailure: { code: 'AVISO_PREVIO', label: 'Aviso', ok: false, message: 'Falla AVISO_PREVIO' } }) });
  assert.ok(h.text().includes('Requisito AVISO_PREVIO✗ Falla AVISO_PREVIO'));
  assert.equal(h.tree.root.findAllByType('textarea').length, 0);
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit(); assert.equal(h.posts.length, 0);
});

test('sin el registro del vínculo habilitado lo explica y no permite registrar nada', async t => {
  const h = await withdrawal(t, { eligibility: eligibility({ habilitado: false }) });
  assert.ok(h.text().includes('aún no está habilitada'));
  assert.equal(h.tree.root.findAllByType('textarea').length, 0);
  await h.submit(); assert.equal(h.posts.length, 0);
});

test('error del backend se muestra y conserva el borrador; doble clic en curso registra una sola vez', async t => {
  const failing = await withdrawal(t, { post: () => Promise.reject(new Error('Ya existe una solicitud de retiro activa')) });
  await failing.observe('Cliente notificado tres veces sin pago'); await failing.confirm(); await failing.submit();
  assert.ok(failing.text().includes('Ya existe una solicitud de retiro activa'));
  assert.equal(failing.saved.length, 0);
  assert.equal(failing.tree.root.findByType('textarea').props.value, 'Cliente notificado tres veces sin pago');

  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = await withdrawal(t, { post: () => pending.then(() => ({ data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: 'TK' }, repetido: false } })) });
  await h.observe('Cliente notificado tres veces sin pago'); await h.confirm();
  let first; act(() => { first = h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  await h.submit();
  assert.equal(h.posts.length, 1);
  await act(async () => { release(); await first; });
  assert.equal(h.saved.length, 1);
});

test('una respuesta de otro servicio se descarta sin habilitar el registro', async t => {
  const h = await withdrawal(t, { eligibility: eligibility({ idServicio: 999 }) });
  assert.ok(h.text().includes('no corresponde al servicio'));
  assert.equal(h.tree.root.findAllByType('textarea').length, 0);
});

test('con varios servicios suspendidos exige elegir el servicio antes de consultar', async t => {
  const h = await withdrawal(t, { services: [services[0], { ...services[0], idServicio: 51, tipoServicio: 'TV' }] });
  assert.equal(h.reads.length, 0);
  await act(async () => h.tree.root.findByType('select').props.onChange({ target: { value: '51' } }));
  assert.deepEqual(h.reads, ['/service-withdrawals/eligibility/51']);
});

test('no introduce estilos nuevos: solo clases ya existentes del Libro de Control', () => {
  const source = readFileSync(new URL('../src/features/commercial/ControlBookWithdrawal.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/features/commercial/commercial-control-book.css', import.meta.url), 'utf8');
  const classes = [...source.matchAll(/className="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
  for (const name of new Set(classes)) assert.ok(css.includes('.' + name), 'clase sin estilo previo: ' + name);
  assert.ok(!/style=\{/.test(source), 'sin estilos en línea');
  assert.ok(!/import .*\.css/.test(source), 'sin hojas de estilo nuevas');
});
