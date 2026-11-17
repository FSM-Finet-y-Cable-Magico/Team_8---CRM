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
async function mount({ missing = true, error = false, tracking = null, mayComplete = true, compact = false, installationSummary = false, detail, service } = {}) {
  const calls = [];
  const api = {
    get: async path => { calls.push(['GET', path]); const value = path.endsWith('/installation') || detail === undefined ? tracking : detail; if (value instanceof Error) throw value; return { data: value }; },
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
    assert.equal(h.button('Generar instalación').props.disabled, true);
    assert.equal(h.button('Guardar comuna').props.disabled, true);
    const inputs = h.tree.root.findAllByType('input'); assert.equal(inputs[0].props.value, '');
    await act(async () => inputs[0].props.onChange({ target: { value: 'Santiago' } }));
    assert.equal(h.button('Guardar comuna').props.disabled, true);
    await act(async () => inputs[1].props.onChange({ target: { checked: true } }));
    await act(async () => h.button('Guardar comuna').props.onClick());
    assert.deepEqual(h.calls.find(c => c[0] === 'PATCH'), ['PATCH', '/integrations/g3/contracts/4/installation-data', { comuna: 'Santiago', confirmarMismaDireccion: true }]);
    assert.equal(h.button('Generar instalación').props.disabled, false);
    assert.equal(h.calls.filter(c => c[1] === '/integrations/g3/installations').length, 0);
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('El contrato firmado y su PDF conservan sus datos'));
  } finally { await h.close(); }
});
test('failed preflight does not enable installation', async () => {
  const h = await mount({ error: true });
  try { assert.equal(h.button('Generar instalación'), undefined); assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /No se pudo consultar|Puedes volver a intentarlo/); assert.ok(h.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' })); assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0); }
  finally { await h.close(); }
});
test('ficha de cliente sin orden muestra solamente la nota pequeña centrada', async () => {
  const h = await mount({ installationSummary: true, compact: true });
  try {
    const note = h.tree.root.findByProps({ className: 'customer-contract-note customer-installation-empty' });
    assert.equal(note.props.children, 'Sin orden de instalación registrada.');
    assert.equal(h.tree.root.findAllByType('button').length, 0);
    assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.deepEqual(h.calls.map(call => call[0]), ['GET']);
  } finally { await h.close(); }
});
test('support must ask an authorized commercial role to complete missing data', async () => {
  const h = await mount({ mayComplete: false });
  try {
    assert.equal(h.button('Guardar comuna'), undefined);
    assert.equal(h.button('Generar instalación').props.disabled, true);
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('Comercial o Administración'));
  } finally { await h.close(); }
});
test('validated installation still needs an explicit request', async () => {
  const h = await mount({ missing: false });
  try {
    assert.equal(h.button('Generar instalación').props.disabled, false);
    await act(async () => h.button('Generar instalación').props.onClick());
    assert.deepEqual(h.calls.find(c => c[1] === '/integrations/g3/installations'), ['POST', '/integrations/g3/installations', { idProspecto: 2 }]);
  } finally { await h.close(); }
});
test('abrir una orden enviada consulta su detalle sin intentar conciliar cierre', async () => {
  const h = await mount({ tracking: { idIntegracion: 2, idOtG3: '9700002', estadoPresentacion: 'PENDIENTE', estadoIntegracion: 'ENVIADA' } });
  try {
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('Orden de instalación enviada a terreno'));
    assert.ok(JSON.stringify(h.tree.toJSON()).includes('9700002'));
    assert.equal(h.button('Consultar cierre'), undefined);
    assert.deepEqual(h.calls, [['GET', '/integrations/g3/prospects/2/installation'], ['GET', '/integrations/g3/installations/2']]);
    assert.equal(h.tree.root.findAllByType('dt').length, 8);
  } finally { await h.close(); }
});

test('seguimiento conserva el estado y el reintento de envío sin reproducir errores históricos al abrir', async () => {
  const h = await mount({ tracking: { idIntegracion: 2, estadoPresentacion: 'EN_SEGUIMIENTO', estadoIntegracion: 'FALLIDA_REINTENTABLE',
    estadoRemotoG3: 'CODIGO_DESCONOCIDO_G3', estadoOriginalRemotoG3: 'G3_X', estadoOriginalG3: 'G3_Y', ultimoErrorSanitizado: 'INTEGRACION_G3_NO_CONFIGURADA' } });
  try {
    const visible = JSON.stringify(h.tree.toJSON());
    assert.match(visible, /Pendiente de revisión/);
    assert.doesNotMatch(visible, /No se pudo actualizar la instalación|G3|INTEGRACION|CODIGO_DESCONOCIDO/);
    assert.ok(h.button('Reintentar envío'));
    assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
  } finally { await h.close(); }
});

test('el refresco compacto solo consulta el detalle y no genera avisos rojos de un cierre anterior', async () => {
  const h = await mount({ compact: true, tracking: { idIntegracion: 2, idOtG3: '9700002', estadoPresentacion: 'ASIGNADA',
    estadoIntegracion: 'ENVIADA', ultimoErrorSanitizado: 'INTEGRACION_G3_NO_CONFIGURADA' } });
  try {
    const toast = () => h.tree.root.findByType(ToastNotice);
    assert.equal(toast().props.message, '');
    await act(async () => h.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' }).props.onClick());
    assert.deepEqual(h.calls, [['GET', '/integrations/g3/prospects/2/installation'], ['GET', '/integrations/g3/installations/2'], ['GET', '/integrations/g3/installations/2']]);
    assert.equal(h.button('Detalle'), undefined);
    assert.equal(h.button('Consultar cierre'), undefined);
    assert.equal(toast().props.message, '');
    assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
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
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(([method]) => method === 'GET'));
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
  return { tree, calls, finish: () => finish?.(), request: () => tree.root.findAllByType('button').find(b => b.props.children === 'Generar instalación') };
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
  assert.doesNotMatch(JSON.stringify(failed.tree.toJSON()), /No se pudo consultar|Puedes volver a intentarlo/);
  assert.ok(failed.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' }));
  assert.equal(failed.request(), undefined);
  const missing = await workflow(t, { preflight: { idContrato: 17, comunaFaltante: true, puedeCompletarComuna: false } });
  assert.equal(missing.request().props.disabled, true);
  assert.match(JSON.stringify(missing.tree.toJSON()), /Falta la comuna/);
});

test('tracking existente muestra seguimiento y omite preflight y solicitud nueva', async t => {
  const h = await workflow(t, { tracking: { idIntegracion: 7, idOtG3: 'QA-17', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'PENDIENTE' } });
  assert.equal(h.request(), undefined);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(([method]) => method === 'GET'));
});

test('una respuesta de requisitos de otro contrato nunca habilita enviar', async t => {
  const h = await workflow(t, { preflight: { idContrato: 99, comunaFaltante: false } });
  assert.equal(h.request().props.disabled, true);
  assert.equal(h.calls.some(c => c[1] === '/integrations/g3/installations'), false);
});

test('el resumen del contrato no ofrece conciliar cierre y su refresco es solo consulta', async () => {
  const h = await mount({ compact: true, installationSummary: true, tracking: { idIntegracion: 2, idOtG3: '9700002', estadoPresentacion: 'ASIGNADA', estadoIntegracion: 'ENVIADA' } });
  try {
    assert.equal(h.tree.root.findAllByType('details').length, 0);
    assert.equal(h.button('Consultar cierre'), undefined);
    await act(async () => h.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' }).props.onClick());
    assert.deepEqual(h.calls.map(([method]) => method), ['GET', 'GET', 'GET']);
  } finally { await h.close(); }
});

test('sin permiso de gestionar instalaciones no se ofrece conciliar el cierre', async t => {
  const h = await workflow(t, { canRequest: false, tracking: { idIntegracion: 7, idOtG3: 'QA-17', estadoIntegracion: 'ENVIADA', estadoPresentacion: 'ASIGNADA' } });
  assert.equal(h.tree.root.findAllByType('button').some(b => b.props.children === 'Consultar cierre'), false);
  assert.equal(h.calls.some(([method]) => method === 'POST'), false);
});

test('la solicitud conserva generar instalación sin el texto explicativo eliminado', async t => {
  const h = await workflow(t);
  assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /No activa el servicio|Genera la orden de instalación para coordinar/);
  assert.match(JSON.stringify(h.tree.toJSON()), /Generar instalación/);
});


const baseTracking = { idIntegracion: 21, idEmpresa: 1, idProspecto: 2, idContrato: 4, idServicio: null,
  idOtG3: '3', codigoOtG3: null, estadoIntegracion: 'ENVIADA', estadoPresentacion: 'EN_CURSO',
  fechaSolicitud: '2026-11-14T16:55:54Z', fechaUltimaSincronizacion: '2026-11-15T15:55:56Z', intentos: 1,
  ultimoErrorSanitizado: 'El cierre G3 aun no esta disponible.', detalle: null };
const fullTracking = { ...baseTracking, ultimoErrorSanitizado: null, estadoRemotoG3: 'EN_CURSO',
  detalle: { estado: 'EN_CURSO', tecnico: { nombre_completo: 'Técnico Dos' }, direccion: { nombre: 'Domicilio', direccion_completa: 'Av. Santa Rosa 12890' }, fechaCompletada: null } };
const fields = tree => Object.fromEntries(tree.root.findAllByType('dl').flatMap(dl => dl.findAllByType('div').filter(node => node.findAllByType('dt').length === 1).map(node => [node.findByType('dt').children.join(''), node.findByType('dd').children.join('')])));

for (const compact of [false, true]) test('apertura consulta el detalle completo y muestra ocho campos sin refresh; compacto=' + compact, async () => {
  const h = await mount({ compact, tracking: baseTracking, detail: fullTracking });
  try {
    const values = fields(h.tree);
    assert.equal(Object.keys(values).length, 8);
    assert.equal(values['Técnico'], 'Técnico Dos');
    assert.equal(values['Dirección'], 'Av. Santa Rosa 12890');
    assert.equal(values['Fecha de finalización'], 'No registrado');
    assert.equal(values['Estado informado por el equipo técnico'], 'En curso');
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(([method]) => method === 'GET'));
    assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /No se pudo actualizar|cierre G3|Consultar cierre/);
    if (compact) assert.equal(h.tree.root.findByType(ToastNotice).props.message, '');
  } finally { await h.close(); }
});

test('el resumen pendiente usa los mismos ocho campos del detalle de instalación', async () => {
  const h = await mount({ compact: true, installationSummary: true, tracking: baseTracking, detail: fullTracking });
  try {
    assert.equal(Object.keys(fields(h.tree)).length, 8);
    assert.equal(fields(h.tree)['Dirección'], 'Av. Santa Rosa 12890');
    assert.ok(h.calls.every(([method]) => method === 'GET'));
  } finally { await h.close(); }
});

test('información remota ausente conserva los ocho campos y unifica los valores vacíos', async () => {
  const h = await mount({ compact: true, tracking: baseTracking, detail: { ...baseTracking, ultimoErrorSanitizado: null } });
  try {
    const values = fields(h.tree);
    assert.equal(Object.keys(values).length, 8);
    assert.equal(values['Dirección'], 'No registrado');
    assert.equal(values['Fecha de finalización'], 'No registrado');
    assert.equal(values['Técnico'], 'No registrado');
    assert.equal(h.tree.root.findByType(ToastNotice).props.message, '');
  } finally { await h.close(); }
});

for (const address of ['  Dirección remota 456  ', { direccion_completa: 'Dirección remota 456' }, { direccionCompleta: 'Dirección remota 456' }]) test('muestra la dirección remota en su formato admitido: ' + JSON.stringify(address), async () => {
  const h = await mount({ tracking: baseTracking, detail: { ...fullTracking, detalle: { ...fullTracking.detalle, direccion: address } } });
  try { assert.equal(fields(h.tree)['Dirección'], 'Dirección remota 456'); }
  finally { await h.close(); }
});

test('cerrar y volver a abrir vuelve a consultar el detalle; actualizaciones de props no inician un bucle', async t => {
  const reads = [], mutations = []; let changes = 0;
  const View = component({ get: async (path, options) => { reads.push({ path, options }); return { data: path.endsWith('/installation') ? baseTracking : fullTracking }; },
    post: async (...args) => { mutations.push(args); throw Error('No se permiten mutaciones al abrir'); } });
  let props = { contractId: 4, canRequest: true, compact: true, onChanged: () => changes++ };
  let tree; await act(async () => { tree = create(React.createElement(View, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  assert.equal(reads.length, 2);
  for (const canRequest of [false, true, false]) {
    props = { ...props, canRequest, onChanged: () => changes++ };
    await act(async () => tree.update(React.createElement(View, props)));
  }
  assert.equal(reads.length, 2);
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(View, props)); });
  assert.equal(reads.length, 4);
  assert.equal(fields(tree)['Técnico'], 'Técnico Dos');
  assert.equal(fields(tree)['Dirección'], 'Av. Santa Rosa 12890');
  assert.equal(changes, 0); assert.equal(mutations.length, 0);
});

test('fallo real del detalle al abrir conserva seguimiento y ocho campos sin toast rojo', async () => {
  const h = await mount({ compact: true, tracking: baseTracking, detail: new Error('503') });
  try {
    assert.equal(Object.keys(fields(h.tree)).length, 8);
    assert.equal(fields(h.tree)['Orden de trabajo'], '3');
    assert.equal(h.tree.root.findByType(ToastNotice).props.message, '');
    assert.equal(h.tree.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /No se pudo consultar|Puedes volver a intentarlo|503/);
    assert.ok(h.tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' }));
  } finally { await h.close(); }
});

test('detalle previamente cargado se conserva si falla un refresh manual; una petición por clic y cero conciliaciones', async t => {
  const calls = []; let unavailable = false;
  const View = component({ get: async path => { calls.push(path); if (unavailable) throw Error('503'); return { data: path.endsWith('/installation') ? baseTracking : fullTracking }; } });
  let tree; await act(async () => { tree = create(React.createElement(View, { contractId: 4, canRequest: true, compact: true })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  unavailable = true;
  await act(async () => tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' }).props.onClick());
  assert.equal(fields(tree)['Técnico'], 'Técnico Dos');
  assert.equal(fields(tree)['Dirección'], 'Av. Santa Rosa 12890');
  assert.equal(calls.length, 3);
  assert.equal(tree.root.findByType(ToastNotice).props.message, '');
});

test('cerrar durante la consulta inicial del detalle cancela la lectura y descarta su respuesta', async t => {
  let finish, signal, changes = 0;
  const wait = new Promise(resolve => { finish = resolve; });
  const View = component({ get: async (path, options) => {
    if (path.endsWith('/installation')) return { data: baseTracking };
    signal = options.signal; return wait;
  } });
  let tree; await act(async () => { tree = create(React.createElement(View, { contractId: 4, canRequest: true, compact: true, onChanged: () => changes++ })); });
  assert.ok(signal); assert.equal(signal.aborted, false);
  await act(async () => tree.unmount());
  assert.equal(signal.aborted, true);
  await act(async () => finish({ data: { ...fullTracking, idServicio: 99, estadoIntegracion: 'COMPLETADA' } }));
  assert.equal(changes, 0);
});
