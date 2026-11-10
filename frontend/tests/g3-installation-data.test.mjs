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
function component(api) {
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  const mocks = { '../../api': { api, apiErrorMessage: e => e.message }, '../../lib': { formatDateTime: () => '-', ...require('./helpers/user-facing-messages.cjs') }, '../../shared/components': { StatusBadge: () => null, ToastNotice }, '../../shared/hooks/useTransientMessage': transientMessage };
  new Function('require', 'exports', out)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports.G3InstallationStatus;
}
async function mount({ missing = true, error = false, tracking = null, mayComplete = true, compact = false } = {}) {
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
  let tree; await act(async () => { tree = create(React.createElement(component(api), { prospectId: 2, canRequest: true, compact })); });
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
