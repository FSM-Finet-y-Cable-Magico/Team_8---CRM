import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : (node?.children ?? []).map(textOf).join('');
function compile(file, mocks = {}) {
  const source = readFileSync(new URL('../src/features/commercial/' + file, import.meta.url), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', out)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
const model = compile('control-book-model.ts'), times = compile('control-book-contact-time.ts');
const row = { rowId: 'qa-10-31-51', idCliente: 10, idEmpresa: 1, idContrato: 31, numeroContrato: 'QA-31',
  idServicio: 41, idFactura: 51, nombre: 'Cliente sintético', plan: 'Plan QA', saldoPendiente: 19990, diasAtraso: 35, diaPago: 10 };
const evaluation = (request = {}, over = {}) => ({
  idContrato: request.idContrato ?? 31, elegible: true, yaSuspendido: false, motivo: null, umbralDias: 20,
  empresa: { idEmpresa: request.idEmpresa ?? 1, nombre: 'Empresa QA' },
  cliente: { idCliente: request.idCliente ?? 10, nombre: 'Cliente sintético' },
  contrato: { idContrato: request.idContrato ?? 31, estado: 'Moroso' }, ...over,
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const Modal = ({ title, headerDetails, navigation, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, headerDetails, navigation, children);

async function setup(t, respond = request => ({ data: evaluation(request) }), initial = {}) {
  const requests = [], writes = [], modals = [];
  let props = { row, revision: 0, canManage: true, canManagePayments: true, canViewBilling: true, canViewDocuments: false,
    onClose() {}, onSaved() {}, onBusyChange() {}, onOpenBilling() {}, ...initial };
  const { ControlBookDrawer } = compile('ControlBookDrawer.tsx', {
    '../../api': { api: {
      get: async (url, options) => {
        if (url.endsWith('/suspension-eligibility')) {
          const request = { url, signal: options.signal, idContrato: Number(url.split('/')[3]),
            idEmpresa: props.row.idEmpresa, idCliente: props.row.idCliente, idServicio: props.row.idServicio };
          requests.push(request); return respond(request, requests.length);
        }
        if (url === '/commercial/control-book') return { data: { items: [{ ...props.row, idContrato: options.params.idContrato }], pagination: { totalPages: 1 } } };
        return { data: [{ idServicio: props.row.idServicio, idCliente: props.row.idCliente, idEmpresa: props.row.idEmpresa,
          idContrato: props.row.idContrato, estadoOperativo: props.row.estadoServicio ?? 'Activo', tipoServicio: 'Internet' }] };
      },
      post: async (...args) => { writes.push(args); throw Error('No escrituras en una evaluación'); },
      patch: async (...args) => { writes.push(args); throw Error('No escrituras en una evaluación'); },
    }, apiErrorMessage: error => error?.response?.data?.message ?? error.message },
    '../customers/CustomerStatusBadge': { CustomerStatusSummary: () => null },
    './ControlBookCustomerContracts': { ControlBookCustomerContracts: ({ onSelect }) => React.createElement('div', null,
      ...[31, 32].map(id => React.createElement('button', { key: id, onClick: () => onSelect(id) }, 'Elegir ' + id))) },
    './ControlBookHistory': { ControlBookHistory: () => null },
    './ControlBookManualPayment': { ControlBookManualPayment: () => null },
    './ControlBookWithdrawal': { ControlBookWithdrawal: () => null },
    './ControlBookSuspension': { ControlBookSuspension: p => { modals.push(p); return React.createElement('p', null, 'MODAL_SUSPENSION'); } },
    './ControlBookModal': { ControlBookModal: Modal },
    './control-book-model': model, './control-book-contact-time': times,
  });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookDrawer, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => textOf(node) === label);
  const click = label => act(async () => { assert(button(label), 'Falta botón ' + label); button(label).props.onClick(); });
  return { tree, requests, writes, modals, button, click, text: () => textOf(tree.toJSON()),
    update: async changes => { props = { ...props, ...changes }; await act(async () => tree.update(React.createElement(ControlBookDrawer, props))); } };
}

test('ambas acciones permanecen visibles sin selección; solo la evaluación elegible habilita suspender', async t => {
  const h = await setup(t);
  assert.equal(h.button('Suspender servicio').props.disabled, true);
  assert.equal(h.button('Dar de baja el servicio').props.disabled, true);
  await h.click('Suspender servicio'); await h.click('Dar de baja el servicio');
  assert.equal(h.modals.length, 0); assert.equal(h.requests.length, 0);
  await h.click('Elegir 31');
  assert.equal(h.button('Suspender servicio').props.disabled, false);
  assert.equal(h.button('Dar de baja el servicio').props.disabled, true);
  await h.click('Suspender servicio'); assert.equal(h.modals.at(-1).contractId, 31);
  assert.deepEqual(h.writes, []);
});

test('HTTP 200 elegible: no añade mensajes ni reintento; evaluar y abrir no escribe', async t => {
  const h = await setup(t); await h.click('Elegir 31');
  assert.doesNotMatch(h.text(), /Elegible para suspensión|Umbral|Requisito pendiente/);
  assert.equal(h.button('Reintentar evaluación'), undefined);
  assert.equal(h.button('Suspender servicio').props.disabled, false);
  await h.click('Suspender servicio'); assert.equal(h.modals.at(-1).contractId, 31);
  assert.deepEqual(h.writes, []);
});

for (const code of ['DEUDA_CUBIERTA_POR_CONVENIO', 'BAJO_UMBRAL_CORTE']) {
  test(`HTTP 200 no elegible (${code}): sin mensajes extra, confirmación inaccesible`, async t => {
    const h = await setup(t, request => ({ data: evaluation(request, { elegible: false, motivo: { code, message: 'Mensaje interno que no se debe reenviar' } }) }));
    await h.click('Elegir 31');
    assert.doesNotMatch(h.text(), /No elegible para suspensión|Requisito pendiente|Umbral/);
    assert.equal(h.button('Suspender servicio').props.disabled, true);
    await h.click('Suspender servicio'); assert.equal(h.modals.length, 0);
    assert.doesNotMatch(h.text(), /Mensaje interno/); assert.deepEqual(h.writes, []);
  });
}

for (const status of [400, 403, 404, 500]) {
  test(`HTTP ${status}: conserva la acción deshabilitada sin mensajes ni secretos del servidor`, async t => {
    const h = await setup(t, () => Promise.reject({ response: { status, data: { message: 'Prisma SQL password=SYNTHETIC_SECRET' } } }));
    await h.click('Elegir 31');
    assert.equal(h.button('Reintentar evaluación'), undefined);
    assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(h.button('Suspender servicio').props.disabled, true);
    assert.doesNotMatch(h.text(), /Prisma|SQL|SYNTHETIC_SECRET/); assert.deepEqual(h.writes, []);
  });
}

test('error de red y actualización de ficha satisfactoria: solo GET, sin escrituras', async t => {
  const h = await setup(t, (request, index) => index === 1 ? Promise.reject(Error('connect private-host:5432')) : { data: evaluation(request) });
  await h.click('Elegir 31'); assert.equal(h.button('Suspender servicio').props.disabled, true); assert.doesNotMatch(h.text(), /private-host/);
  await h.update({ revision: 1 });
  assert.equal(h.requests.length, 2); assert.equal(h.button('Suspender servicio').props.disabled, false);
  assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.deepEqual(h.writes, []);
});

test('consulta pendiente y doble clic en suspender: permanece bloqueada y no abre el modal', async t => {
  const pending = deferred();
  const h = await setup(t, () => pending.promise);
  await h.click('Elegir 31');
  await h.click('Suspender servicio'); await h.click('Suspender servicio');
  assert.equal(h.requests.length, 1); assert.equal(h.modals.length, 0);
  assert.equal(h.button('Suspender servicio').props.disabled, true);
  assert.doesNotMatch(h.text(), /Evaluando suspensión/);
  await act(async () => pending.resolve({ data: evaluation() }));
  assert.equal(h.button('Suspender servicio').props.disabled, false); assert.deepEqual(h.writes, []);
});

test('respuesta antigua de otro contrato llega después de la nueva: no reemplaza su resultado', async t => {
  const old = deferred();
  const h = await setup(t, (request, index) => index === 1 ? old.promise : { data: evaluation(request, { elegible: false, motivo: { code: 'SIN_DEUDA_VENCIDA', message: '' } }) });
  await h.click('Elegir 31'); await h.click('Elegir 32');
  assert.equal(h.requests[0].signal.aborted, true);
  await act(async () => old.resolve({ data: evaluation({ idContrato: 31 }) }));
  assert.equal(h.button('Suspender servicio').props.disabled, true);
  assert.deepEqual(h.writes, []);
});

for (const change of [{ idEmpresa: 2 }, { idServicio: 42 }, { idCliente: 11 }]) {
  test(`cambio de contexto ${Object.keys(change)[0]}: aborta y descarta la evaluación anterior`, async t => {
    const old = deferred(), current = deferred();
    const h = await setup(t, (_request, index) => index === 1 ? old.promise : current.promise);
    await h.click('Elegir 31'); await h.update({ row: { ...row, ...change } });
    assert.equal(h.requests.length, 2); assert.equal(h.requests[0].signal.aborted, true);
    await act(async () => old.resolve({ data: evaluation() }));
    assert.equal(h.button('Suspender servicio').props.disabled, true);
    await act(async () => current.resolve({ data: evaluation(h.requests[1]) }));
    assert.equal(h.button('Suspender servicio').props.disabled, false); assert.deepEqual(h.writes, []);
  });
}

for (const over of [{ idContrato: 99 }, { empresa: { idEmpresa: 2 } }, { cliente: { idCliente: 99 } }, { elegible: 'true' }]) {
  test(`respuesta incompatible ${Object.keys(over)[0]}: nunca habilita suspender`, async t => {
    const h = await setup(t, request => ({ data: evaluation(request, over) })); await h.click('Elegir 31');
    assert.equal(h.button('Suspender servicio').props.disabled, true);
    await h.click('Suspender servicio'); assert.equal(h.modals.length, 0);
    assert.equal(h.button('Reintentar evaluación'), undefined); assert.deepEqual(h.writes, []);
  });
}

test('servicio suspendido conserva ambos accesos: suspender deshabilitado y baja disponible', async t => {
  const h = await setup(t, request => ({ data: evaluation(request, { elegible: false, yaSuspendido: true }) }), { row: { ...row, estadoServicio: 'Suspendido' } });
  await h.click('Elegir 31');
  assert.equal(h.button('Suspender servicio').props.disabled, true);
  assert.equal(h.button('Dar de baja el servicio').props.disabled, false);
  assert.doesNotMatch(h.text(), /No elegible|Reintentar evaluación|Requisito pendiente/);
  assert.deepEqual(h.writes, []);
});

test('sin permiso de facturación no se consulta ni se ofrece evaluar/suspender', async t => {
  const h = await setup(t, undefined, { canManagePayments: false }); await h.click('Elegir 31');
  assert.equal(h.requests.length, 0); assert.equal(h.button('Reintentar evaluación'), undefined);
  assert.equal(h.button('Suspender servicio'), undefined); assert.deepEqual(h.writes, []);
});
