import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/installations/G3InstallationStatus.tsx', import.meta.url), 'utf8');
const transientMessage = {};
const hookSource = readFileSync(new URL('../src/shared/hooks/useTransientMessage.ts', import.meta.url), 'utf8');
const hookCode = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'exports', 'window', hookCode)(require, transientMessage, { setTimeout, clearTimeout });
const ToastNotice = ({ message }) => message ? React.createElement('p', { role: 'status' }, message) : null;
function component(api, form = false) {
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  const mocks = { '../../api': { api, apiErrorMessage: e => e.message }, '../../lib': { formatDateTime: value => value ?? '-', ...require('./helpers/user-facing-messages.cjs') }, '../../shared/components': { StatusBadge: () => null, ToastNotice }, '../../shared/hooks/useTransientMessage': transientMessage };
  new Function('require', 'exports', out)(name => name in mocks ? mocks[name] : require(name), exports);
  if (!form) return exports.G3InstallationStatus;
  const formExports = {};
  const formSource = readFileSync(new URL('../src/features/installations/InstallOrderForm.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(formSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => name === './G3InstallationStatus' ? exports : require(name), formExports);
  return formExports.InstallOrderForm;
}
async function mount({ missing = true, error = false, tracking = null, mayComplete = true, compact = false, installationSummary = false, service } = {}) {
  const calls = [];
  const api = {
    get: async path => { calls.push(['GET', path]); return { data: tracking }; },
    post: async (path, body) => {
      calls.push(['POST', path, body]);
      if (path.endsWith('installation-requirements')) {
        if (error) throw Error('Factibilidad requerida');
        return { data: { idContrato: 4, comunaFaltante: missing, puedeCompletarComuna: mayComplete } };
      }
      return { data: path.endsWith('/reconcile') ? { available: false } : { idIntegracion: 2, estadoPresentacion: 'PENDIENTE' } };
    },
    patch: async (path, body) => { calls.push(['PATCH', path, body]); return { data: { idContrato: 4, comunaFaltante: false } }; },
  };
  let tree; await act(async () => { tree = create(React.createElement(component(api), { prospectId: 2, canRequest: true, compact, installationSummary, service })); });
  const button = label => tree.root.findAllByType('button').find(b => b.props.children === label);
  return { tree, calls, button, close: async () => act(async () => tree.unmount()) };
}
test('missing comuna blocks installation and requires explicit same-address confirmation', async () => {
  const h = await mount();
  try {
    assert.equal(h.button('Solicitar instalación').props.disabled, true);
    assert.equal(h.button('Guardar comuna').props.disabled, true);
    const inputs = h.tree.root.findAllByType('input'); assert.equal(inputs[0].props.value, '');
    await act(async () => inputs[0].props.onChange({ target: { value: 'Santiago' } }));
    assert.equal(h.button('Guardar comuna').props.disabled, true);
    await act(async () => inputs[1].props.onChange({ target: { checked: true } }));
    await act(async () => h.button('Guardar comuna').props.onClick());
    assert.deepEqual(h.calls.find(c => c[0] === 'PATCH'), ['PATCH', '/integrations/g3/contracts/4/installation-data', { comuna: 'Santiago', confirmarMismaDireccion: true }]);
    assert.equal(h.button('Solicitar instalación').props.disabled, false);
    assert.equal(h.calls.filter(c => c[1] === '/integrations/g3/installations').length, 0);
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('El contrato firmado y su PDF conservan sus datos'));
  } finally { await h.close(); }
});
test('failed preflight does not enable installation', async () => {
  const h = await mount({ error: true });
  try { assert.equal(h.button('Solicitar instalación').props.disabled, true); assert.ok(JSON.stringify(h.tree.toJSON()).includes('Factibilidad requerida')); }
  finally { await h.close(); }
});
test('support must ask an authorized commercial role to complete missing data', async () => {
  const h = await mount({ mayComplete: false });
  try {
    assert.equal(h.button('Guardar comuna'), undefined);
    assert.equal(h.button('Solicitar instalación').props.disabled, true);
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('Comercial o Administración'));
  } finally { await h.close(); }
});
test('validated installation still needs an explicit request', async () => {
  const h = await mount({ missing: false });
  try {
    assert.equal(h.button('Solicitar instalación').props.disabled, false);
    await act(async () => h.button('Solicitar instalación').props.onClick());
    assert.deepEqual(h.calls.find(c => c[1] === '/integrations/g3/installations'), ['POST', '/integrations/g3/installations', { idProspecto: 2 }]);
  } finally { await h.close(); }
});
test('pending closure is visible without losing the tracking', async () => {
  const h = await mount({ tracking: { idIntegracion: 2, idOtG3: '9700002', estadoPresentacion: 'PENDIENTE', estadoIntegracion: 'ENVIADA' } });
  try {
    await act(async () => h.button('Consultar cierre').props.onClick());
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('Orden de instalación enviada a terreno'));
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('cierre técnico aún no está confirmado'));
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('9700002'));
    assert.equal(h.calls.some(c => c[1].endsWith('installation-requirements')), false);
  } finally { await h.close(); }
});

test('seguimiento presenta estados y fallas remotas con mensajes de producción', async () => {
  const h = await mount({ tracking: { idIntegracion: 2, estadoPresentacion: 'EN_SEGUIMIENTO', estadoIntegracion: 'FALLIDA_REINTENTABLE',
    estadoRemotoG3: 'CODIGO_DESCONOCIDO_G3', estadoOriginalRemotoG3: 'G3_X', estadoOriginalG3: 'G3_Y', ultimoErrorSanitizado: 'INTEGRACION_G3_NO_CONFIGURADA' } });
  try {
    const visible = JSON.stringify(h.tree.toJSON());
    assert.match(visible, /Pendiente de revisión/);
    assert.match(visible, /No se pudo actualizar la instalación/);
    assert.doesNotMatch(visible, /G3|INTEGRACION|CODIGO_DESCONOCIDO/);
    assert.ok(!visible.includes('Orden de instalación enviada a terreno'));
    assert.ok(h.button('Reintentar envío'));
  } finally { await h.close(); }
});

test('el refresco compacto consulta el estado y el cierre sigue siendo una acción explícita', async () => {
  const h = await mount({ compact: true, tracking: { idIntegracion: 2, idOtG3: '9700002', estadoPresentacion: 'ASIGNADA',
    estadoIntegracion: 'ENVIADA', ultimoErrorSanitizado: 'INTEGRACION_G3_NO_CONFIGURADA' } });
  try {
    const toast = () => h.tree.root.findByType(ToastNotice);
    assert.match(toast().props.message, /No se pudo actualizar la instalación/);
    assert.equal(toast().props.tone, 'error');
    await act(async () => toast().props.onDismiss());
    assert.equal(toast().props.message, '');

    const refresh = h.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' });
    await act(async () => refresh.props.onClick());
    assert.deepEqual(h.calls.slice(1), [['GET', '/integrations/g3/installations/2']]);
    assert.equal(h.button('Detalle'), undefined);

    const options = h.tree.root.findByType('details');
    assert.equal(options.props.open, undefined);
    const closure = options.findByType('button');
    assert.equal(closure.props.children, 'Consultar cierre');
    await act(async () => closure.props.onClick());
    assert.equal(h.calls.filter(([method, path]) => method === 'POST' && path === '/integrations/g3/installations/2/reconcile').length, 1);
    assert.match(toast().props.message, /cierre técnico aún no está confirmado/);
    assert.equal(toast().props.tone, 'info');
  } finally { await h.close(); }
});

test('el resumen muestra el cierre de la orden correlacionada y sus equipos declarados', async () => {
  const tracking = { idIntegracion: 2, idOtG3: '9700002', idServicio: 12, estadoPresentacion: 'COMPLETADA', estadoIntegracion: 'COMPLETADA' };
  const service = { idServicio: 12, instalacion: { fuente: 'G3', idTecnicoG3: 8, fechaCompletada: '2026-11-10T17:45:00Z' },
    datosTecnicos: { resultadoInstalacion: { equipos_instalados: [{ numero_serie: 'ONT-DEMO' }] }, potenciaOpticaDbm: -20 } };
  const h = await mount({ compact: true, installationSummary: true, tracking, service });
  try {
    const visible = JSON.stringify(h.tree.toJSON());
    for (const value of ['9700002', 'ID #8', '2026-11-10T17:45:00Z', 'Equipos declarados en la orden', 'ONT-DEMO']) assert.ok(visible.includes(value));
    assert.equal(h.button('Consultar cierre'), undefined);
    assert.equal(h.button('Detalle'), undefined);
    assert.equal(h.calls.length, 1);
  } finally { await h.close(); }
});

async function workflow(t, { state = 'Firmado', canRequest = true, contractId = 17, preflight, tracking = null, pendingRequest = false } = {}) {
  const calls = []; let finish;
  const requestResult = { data: { idIntegracion: 7, idOtG3: 'QA-17', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'PENDIENTE' } };
  const api = {
    get: async path => { calls.push(['GET', path]); return { data: tracking }; },
    post: async (path, body) => {
      calls.push(['POST', path, body]);
      if (path.endsWith('installation-requirements')) {
        if (preflight instanceof Error) throw preflight;
        return { data: preflight ?? { idContrato: 17, comunaFaltante: false } };
      }
      return pendingRequest ? new Promise(resolve => { finish = () => resolve(requestResult); }) : requestResult;
    },
  };
  const View = component(api, true);
  const props = { prospect: { idProspecto: 2, contratos: [{ idContrato: 99, estado: 'Firmado' }, { idContrato: 17, estado: state }] }, contractId, canRequest, onChanged() {} };
  let tree; await act(async () => { tree = create(React.createElement(View, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return { tree, calls, finish: () => finish?.(), request: () => tree.root.findAllByType('button').find(b => b.props.children === 'Solicitar instalación') };
}

test('postfirma consulta, valida y solicita el contrato mostrado, sin elegir el de mayor ID', async t => {
  const h = await workflow(t, { pendingRequest: true });
  assert.deepEqual(h.calls, [['GET', '/integrations/g3/contracts/17/installation'], ['POST', '/integrations/g3/installation-requirements', { idContrato: 17 }]]);
  assert.equal(h.request().props.disabled, false);
  const click = h.request().props.onClick;
  await act(async () => { click(); click(); });
  assert.equal(h.calls.filter(c => c[1] === '/integrations/g3/installations').length, 1);
  assert.deepEqual(h.calls.at(-1), ['POST', '/integrations/g3/installations', { idContrato: 17 }]);
  await act(async () => h.finish());
  assert.equal(h.request(), undefined);
  assert.match(JSON.stringify(h.tree.toJSON()), /QA-17/);
});

for (const state of ['Pendiente firma contrato', 'Suspendido', 'Moroso']) test(`contrato ${state} bloquea la solicitud sin invocar preflight`, async t => {
  const h = await workflow(t, { state });
  assert.equal(h.request().props.disabled, true);
  assert.equal(h.calls.length, 1);
  assert.match(JSON.stringify(h.tree.toJSON()), /no permite solicitar/);
});

test('sin permiso o sin contrato no crea solicitudes ni inventa un contrato válido', async t => {
  const denied = await workflow(t, { canRequest: false });
  assert.equal(denied.request().props.disabled, true);
  assert.equal(denied.calls.length, 1);
  assert.match(JSON.stringify(denied.tree.toJSON()), /No tienes permisos/);
  const missing = await workflow(t, { contractId: 50 });
  assert.equal(missing.calls.length, 0);
  assert.match(JSON.stringify(missing.tree.toJSON()), /No existe un contrato asociado/);
});

test('fallo real de factibilidad y comuna ausente quedan visibles y bloquean la solicitud', async t => {
  const failed = await workflow(t, { preflight: new Error('Factibilidad requerida') });
  assert.match(JSON.stringify(failed.tree.toJSON()), /Factibilidad requerida/);
  assert.equal(failed.request().props.disabled, true);
  const missing = await workflow(t, { preflight: { idContrato: 17, comunaFaltante: true, puedeCompletarComuna: false } });
  assert.equal(missing.request().props.disabled, true);
  assert.match(JSON.stringify(missing.tree.toJSON()), /Falta la comuna/);
});

test('tracking existente muestra seguimiento y omite preflight y solicitud nueva', async t => {
  const h = await workflow(t, { tracking: { idIntegracion: 7, idOtG3: 'QA-17', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'PENDIENTE' } });
  assert.equal(h.request(), undefined);
  assert.equal(h.calls.length, 1);
});

test('una respuesta de requisitos de otro contrato nunca habilita enviar', async t => {
  const h = await workflow(t, { preflight: { idContrato: 99, comunaFaltante: false } });
  assert.equal(h.request().props.disabled, true);
  assert.equal(h.calls.some(c => c[1] === '/integrations/g3/installations'), false);
});
