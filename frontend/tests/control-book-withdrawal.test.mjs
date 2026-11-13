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
// Same codes and response shape as WithdrawalWorkflowService.eligibility() (consolidated backend, not PR #81).
const checks = (failure) => ['SERVICIO', 'EMPRESA', 'SIN_BAJA_PREVIA', 'SIN_SOLICITUD_ACTIVA', 'SERVICIO_SUSPENDIDO', 'CONTRATO', 'DEUDA_VENCIDA', 'AVISO_PREVIO', 'RUT_CLIENTE', 'DIRECCION_RETIRO']
  .map(code => ({ code, label: 'Requisito ' + code, ok: code !== failure, message: code === failure ? 'Falla ' + code : '' }));
const eligibility = (over = {}) => ({
  idServicio: 50, motivo: 'MOROSIDAD', eligible: true, habilitado: true, despachoG3Habilitado: false, checks: checks(), firstFailure: null,
  contexto: {
    empresa: { idEmpresa: 1, nombre: 'FiNet' }, cliente: { idCliente: 30, nombre: 'Cliente Moroso', rut: '12345678-5' },
    contrato: { idContrato: 20, estado: 'Suspendido' }, servicio: { idServicio: 50, tipo: 'Internet', estado: 'Suspendido' },
    deuda: { overdueCount: 1, uncoveredCount: 1, coveredByAgreementCount: 0, totalExigible: 19990, maxDiasAtraso: 41 },
    aviso: { idEvento: 7, fecha: '2026-11-01T12:00:00.000Z' }, direccionRetiro: { direccion: 'Calle QA 123', comuna: 'Ñuñoa' }, solicitudActiva: null, responsable: { idUsuario: 5, nombre: 'Comercial FiNet' },
  }, ...over,
});

async function withdrawal(t, options = {}) {
  const posts = [], saved = [], reads = [];
  const api = {
    get: async (path) => { reads.push(path); if (options.getError) throw options.getError; return { data: options.eligibility ?? eligibility() }; },
    post: async (...args) => { posts.push(args); return options.post ? options.post(...args) : { data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: 'TK-BAJA01' }, repetido: false,
      despacho: { estadoDespacho: 'PENDIENTE', idOtG3: null } } }; },
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
  // FINET 13-11-2026: three steps (requirements -> data -> confirmation); «Continuar» submits the form to advance.
  const next = submit;
  const toConfirmation = async (value = 'Cliente notificado tres veces sin pago') => { await next(); await observe(value); await next(); await confirm(); };
  const button = label => tree.root.findAllByType('button').find(n => textOf(n) === label);
  return { tree, posts, saved, reads, text, observe, confirm, submit, submitButton, next, toConfirmation, button };
}

test('consulta los requisitos del servicio suspendido y precarga empresa, cliente, contrato, deuda, aviso y responsable', async t => {
  const h = await withdrawal(t);
  assert.deepEqual(h.reads, ['/service-withdrawals/eligibility/50']);
  for (const value of ['FiNet', 'Cliente Moroso · 12345678-5', '#20 · Fibra 300 Hogar', 'Internet', 'Suspendido', '41 días', 'Calle QA 123, Ñuñoa', 'Morosidad', 'Comercial FiNet']) assert.ok(h.text().includes(value), value);
  assert.ok(h.text().includes('Requisito AVISO_PREVIO✓ Cumple'));
  assert.ok(!h.text().includes('TV · Baja'), 'un servicio ya dado de baja no se ofrece');
});

test('tres pasos: requisitos, datos con observación suficiente y confirmación explícita; envía lo que el backend necesita', async t => {
  const h = await withdrawal(t);
  assert.ok(h.text().includes('Requisitos') && h.text().includes('Datos de la baja') && h.text().includes('Confirmación'));
  assert.equal(h.tree.root.findAllByType('textarea').length, 0, 'paso 1: solo requisitos');
  assert.equal(textOf(h.submitButton()), 'Continuar');
  await h.next();
  assert.equal(h.posts.length, 0);
  assert.equal(h.submitButton().props.disabled, true, 'paso 2 sin observación');
  await h.observe('corto'); await h.next();
  assert.equal(h.posts.length, 0); assert.ok(h.text().includes('mínimo 10 caracteres'));
  await h.observe('  Cliente notificado tres veces sin pago  '); await h.next();
  assert.equal(textOf(h.submitButton()), 'Crear solicitud y ticket');
  assert.equal(h.submitButton().props.disabled, true, 'paso 3 sin confirmar');
  await h.submit(); assert.equal(h.posts.length, 0);
  await h.confirm();
  assert.equal(h.submitButton().props.disabled, false);
  await h.submit();
  assert.deepEqual(h.posts, [['/service-withdrawals/initiate', { idServicio: 50, idContrato: 20, observaciones: 'Cliente notificado tres veces sin pago', confirmacion: true }]]);
  assert.equal(h.saved.length, 1);
  assert.match(h.saved[0], /Solicitud de retiro N° 1000 y ticket TK-BAJA01.*pendiente de envío.*sigue suspendido/);
});

test('«Atrás» vuelve al paso anterior conservando la observación', async t => {
  const h = await withdrawal(t);
  await h.next(); await h.observe('Cliente notificado tres veces sin pago'); await h.next();
  await act(async () => h.button('Atrás').props.onClick());
  assert.equal(h.tree.root.findByType('textarea').props.value, 'Cliente notificado tres veces sin pago');
});

test('con la orden técnica aceptada informa su número sin nombrar sistemas internos', async t => {
  const h = await withdrawal(t, { post: () => ({ data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: 'TK' }, repetido: false,
    despacho: { estadoDespacho: 'ACEPTADA', idOtG3: 930 } } }) });
  await h.toConfirmation(); await h.submit();
  assert.match(h.saved[0], /Orden de retiro técnico N° 930 creada\..*sigue suspendido/);
  assert.ok(!/\bG[0-9]\b/.test(h.saved[0]));
});

test('requisitos de identificación y dirección para el retiro técnico se muestran como cualquier otro requisito', async t => {
  const h = await withdrawal(t, { eligibility: eligibility({ eligible: false, checks: checks('DIRECCION_RETIRO'),
    firstFailure: { code: 'DIRECCION_RETIRO', label: 'Dirección', ok: false, message: 'Falla DIRECCION_RETIRO' } }) });
  assert.ok(h.text().includes('Requisito DIRECCION_RETIRO✗ Falla DIRECCION_RETIRO'));
  assert.equal(h.submitButton().props.disabled, true);
});

test('un reintento devuelto por el backend informa que la baja ya estaba iniciada', async t => {
  const h = await withdrawal(t, { post: () => ({ data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: null }, repetido: true } }) });
  await h.toConfirmation(); await h.submit();
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
  await failing.toConfirmation(); await failing.submit();
  assert.ok(failing.text().includes('Ya existe una solicitud de retiro activa'));
  assert.equal(failing.saved.length, 0);
  assert.ok(failing.text().includes('Cliente notificado tres veces sin pago'), 'el borrador se conserva en la confirmación');

  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = await withdrawal(t, { post: () => pending.then(() => ({ data: { solicitud: { idSolicitudRetiro: 1000 }, ticket: { idTicket: 1001, codigoSeguimiento: 'TK' }, repetido: false } })) });
  await h.toConfirmation();
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

// Existing request: the same access follows it (no second registration) with the real states and possible actions.
const followUp = (over = {}) => eligibility({ eligible: false, checks: checks('SIN_SOLICITUD_ACTIVA'), bajaAutomaticaHabilitada: false, despachoG3Habilitado: true,
  seguimiento: { idSolicitudRetiro: 44, estado: 'EN_GESTION', flujoGuiado: true, ticket: { idTicket: 77, codigoSeguimiento: 'TK-BAJA77', estado: 'Abierto' },
    despacho: { estadoDespacho: 'ACEPTADA', idOtG3: 930, estadoOt: 'PENDIENTE_APROBACION', cancelable: false, cierreRecibido: true, aplicado: false } }, ...over });

test('solicitud existente: muestra su seguimiento real sin pasos ni nueva alta', async t => {
  const h = await withdrawal(t, { eligibility: followUp() });
  for (const value of ['N° 44 · En gestión', 'TK-BAJA77 · Abierto', 'Orden aceptada · N° 930', 'Cerrada por el técnico; pendiente de aprobación', 'pendiente de aprobación', 'baja efectiva automática está deshabilitada']) assert.ok(h.text().includes(value), value);
  assert.equal(h.submitButton(), undefined, 'no ofrece crear otra solicitud');
  assert.equal(h.button('Cancelar retiro'), undefined, 'una orden ya cerrada por el técnico no se cancela');
  assert.ok(!/\bG[0-9]\b/.test(h.text()));
  await act(async () => h.button('Consultar estado de la orden').props.onClick());
  assert.deepEqual(h.posts, [['/service-withdrawals/44/order-status', {}]]);
  assert.equal(h.reads.length, 2, 'vuelve a leer el estado verdadero');
});

test('seguimiento: envío pendiente se puede reintentar y la cancelación exige motivo', async t => {
  const h = await withdrawal(t, { eligibility: followUp({ seguimiento: { idSolicitudRetiro: 44, estado: 'REGISTRADA', flujoGuiado: true, ticket: null,
    despacho: { estadoDespacho: 'REINTENTABLE', idOtG3: null, estadoOt: null, cancelable: true, cierreRecibido: false, aplicado: false } } }) });
  await act(async () => h.button('Enviar orden de retiro').props.onClick());
  assert.deepEqual(h.posts.at(-1), ['/service-withdrawals/44/dispatch', {}]);
  await act(async () => h.button('Cancelar retiro').props.onClick());
  assert.equal(h.posts.length, 1); assert.ok(h.text().includes('motivo de la cancelación'));
  await h.observe('Cliente pagó la deuda');
  await act(async () => h.button('Cancelar retiro').props.onClick());
  assert.deepEqual(h.posts.at(-1), ['/service-withdrawals/44/cancel', { motivo: 'Cliente pagó la deuda' }]);
  assert.match(h.saved.at(-1), /Retiro cancelado: solicitud N° 44.*sigue suspendido/);
});

test('seguimiento con el envío deshabilitado lo explica y no ofrece enviar', async t => {
  const h = await withdrawal(t, { eligibility: followUp({ despachoG3Habilitado: false, seguimiento: { idSolicitudRetiro: 44, estado: 'REGISTRADA', flujoGuiado: true, ticket: null,
    despacho: { estadoDespacho: 'PENDIENTE', idOtG3: null, estadoOt: null, cancelable: true, cierreRecibido: false, aplicado: false } } }) });
  assert.ok(h.text().includes('envío de la orden técnica está deshabilitado'));
  assert.equal(h.button('Enviar orden de retiro'), undefined);
});

for (const file of ['ControlBookWithdrawal.tsx', 'ControlBookSuspension.tsx']) {
  test(`no introduce estilos nuevos (${file}): solo clases ya existentes del Libro de Control`, () => {
    const source = readFileSync(new URL('../src/features/commercial/' + file, import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/features/commercial/commercial-control-book.css', import.meta.url), 'utf8');
    const classes = [...source.matchAll(/className="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
    for (const name of new Set(classes)) assert.ok(css.includes('.' + name), 'clase sin estilo previo: ' + name);
    assert.ok(!/style=\{/.test(source), 'sin estilos en línea');
    assert.ok(!/import .*\.css/.test(source), 'sin hojas de estilo nuevas');
  });
}
