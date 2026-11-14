import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
function compile(path, mocks = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => name.endsWith('.css') ? {} : name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
const transient = compile('shared/hooks/useTransientMessage.ts');
const shared = { StatusBadge: ({ value }) => React.createElement('span', null, value), ToastNotice: () => null };
const completed = { idIntegracion: 10, idEmpresa: 1, idContrato: 1, idServicio: 1, idOtG3: 'OT-1', codigoOtG3: 'OT-1',
  estadoIntegracion: 'COMPLETADA', estadoPresentacion: 'COMPLETADA', fechaCierreProcesado: '2026-11-14T12:00:00Z',
  detalle: { idTecnicoG3: 8, fechaCompletada: '2026-11-14T11:00:00Z', potenciaOpticaDbm: -21.5 } };
const service = { idServicio: 1, idContrato: 1, idCliente: 1, idEmpresa: 1, tipoServicio: 'Internet', estadoOperativo: 'Activo',
  instalacion: { estado: 'COMPLETADA', fuente: 'G3', fechaCompletada: '2026-11-14T11:00:00Z' } };
function installation(api) {
  return compile('features/installations/G3InstallationStatus.tsx', {
    '../../api': { api, apiErrorMessage: error => error.message }, '../../shared/components': shared,
    '../../lib': { formatDateTime: String, userFacingMessage: (_message, fallback) => fallback },
    '../../shared/hooks/useTransientMessage': transient,
  });
}
const refreshButton = tree => tree.root.findByProps({ 'aria-label': 'Actualizar estado de instalación' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

test('contrato y servicio con el mismo ID no duplican instalaciones al recargar o recuperarse de un error', async t => {
  const errors = [], reads = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const g3 = installation({ get: async path => { reads.push(path); return { data: completed }; } });
  const { CustomerContractWorkflow } = compile('features/customers/CustomerContractWorkflow.tsx', {
    '../../api': {}, '../../lib': { formatDateOnly: String, formatWorkOrderValue: String },
    '../../shared/components': shared, '../../shared/hooks/useTransientMessage': transient,
    '../contracts/useSignatureStatus': { useSignatureStatus: () => ({ status: null, refresh: async () => null }) },
    '../installations/G3InstallationStatus': g3,
    './customer-services-state': compile('features/customers/customer-services-state.ts'),
    './CustomerPlanForm': { CustomerPlanForm: () => null }, './ContractDocuments': { ContractDocuments: () => null },
    './CustomerServiceActions': { CustomerServiceActions: () => React.createElement('span', null, 'Acciones del servicio') },
  });
  let props = { customer: { idCliente: 1, nombreCompleto: 'Cliente QA', contratos: [{ idContrato: 1, estado: 'Activo', plan: { nombreComercial: 'Plan QA' } }] },
    services: [service], servicesLoad: { customerId: 1, status: 'success', error: '' }, plans: [], permissions: {}, onRefresh: async () => {} };
  let tree;
  await act(async () => { tree = create(React.createElement(CustomerContractWorkflow, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => tree.root.findByProps({ className: 'customer-contract-row' }).props.onClick());
  for (const status of ['loading', 'success', 'error', 'success', 'loading', 'success']) {
    props = { ...props, customer: { ...props.customer, contratos: [...props.customer.contratos] },
      services: status === 'success' ? [{ ...service }] : [], servicesLoad: { customerId: 1, status, error: status === 'error' ? 'Error de prueba' : '' } };
    await act(async () => tree.update(React.createElement(CustomerContractWorkflow, props)));
    assert.equal(tree.root.findAllByType(g3.G3InstallationStatus).length, status === 'loading' ? 0 : 1, status);
    assert.equal(tree.root.findAllByProps({ className: 'customer-installation-summary' }).length, status === 'loading' ? 0 : 1, status);
  }
  assert.ok(!errors.some(message => /same key|misma clave/i.test(message)), errors.join('\n'));
  assert.ok(reads.every(path => path === '/integrations/g3/contracts/1/installation'));
  assert.ok(reads.length <= 6, `Consultas inesperadas: ${reads.length}`);
});

test('refrescar una instalación completada hace una consulta por clic y no recarga todo el portal', async t => {
  const reads = []; let changes = 0;
  const { G3InstallationStatus } = installation({ get: async path => { reads.push(path); return { data: completed }; } });
  let props = { contractId: 1, service, canRequest: false, compact: true, installationSummary: true, onChanged: () => { changes++; } };
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  for (let i = 0; i < 5; i++) {
    await act(async () => refreshButton(tree).props.onClick());
    props = { ...props, service: { ...service }, onChanged: () => { changes++; } };
    await act(async () => tree.update(React.createElement(G3InstallationStatus, props)));
    assert.equal(tree.root.findAllByProps({ className: 'customer-installation-summary' }).length, 1);
  }
  assert.deepEqual(reads, ['/integrations/g3/contracts/1/installation', ...Array(5).fill('/integrations/g3/installations/10')]);
  assert.equal(changes, 0);
});

test('un cierre nuevo refresca los servicios una vez; seguir consultando el cierre no vuelve a invalidarlos', async t => {
  let changes = 0;
  const pending = { ...completed, estadoIntegracion: 'ENVIADA', estadoPresentacion: 'ASIGNADA', idServicio: null, fechaCierreProcesado: null };
  const { G3InstallationStatus } = installation({ get: async path => ({ data: path.endsWith('/installation') ? pending : completed }) });
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, { contractId: 1, canRequest: false, compact: true, installationSummary: true, onChanged: () => { changes++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => refreshButton(tree).props.onClick());
  await act(async () => refreshButton(tree).props.onClick());
  assert.equal(changes, 1);
});

test('doble clic no duplica la consulta y una respuesta del contrato anterior no invade el nuevo', async t => {
  const late = deferred(), reads = []; let changes = 0;
  const { G3InstallationStatus } = installation({ get: async (path, options) => {
    reads.push({ path, signal: options?.signal });
    return path === '/integrations/g3/installations/10' ? late.promise : { data: path.includes('/contracts/2/') ? { ...completed, idContrato: 2, idIntegracion: 20, idOtG3: 'OT-2', codigoOtG3: 'OT-2' } : completed };
  } });
  const props = { contractId: 1, canRequest: false, compact: true, installationSummary: true, onChanged: () => { changes++; } };
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => { const click = refreshButton(tree).props.onClick; click(); click(); });
  assert.equal(reads.filter(item => item.path === '/integrations/g3/installations/10').length, 1);
  await act(async () => tree.update(React.createElement(G3InstallationStatus, { ...props, contractId: 2 })));
  assert.equal(reads.find(item => item.path === '/integrations/g3/installations/10').signal.aborted, true);
  await act(async () => late.resolve({ data: completed }));
  const visible = JSON.stringify(tree.toJSON());
  assert.match(visible, /OT-2/);
  assert.doesNotMatch(visible, /OT-1/);
  assert.equal(changes, 0);
});

test('cerrar el detalle aborta el refresco y no notifica cambios cuando responde la orden anterior', async t => {
  const late = deferred(); let signal, changes = 0;
  const { G3InstallationStatus } = installation({ get: async (path, options) => {
    if (path.endsWith('/installation')) return { data: completed };
    signal = options.signal; return late.promise;
  } });
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, { contractId: 1, canRequest: false,
    compact: true, installationSummary: true, onChanged: () => { changes++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => refreshButton(tree).props.onClick());
  await act(async () => tree.unmount());
  assert.equal(signal.aborted, true);
  await act(async () => late.resolve({ data: { ...completed, idServicio: 2 } }));
  assert.equal(changes, 0);
});

test('una respuesta de otra integración no reemplaza la orden completada', async t => {
  let changes = 0;
  const { G3InstallationStatus } = installation({ get: async path => ({ data: path.endsWith('/installation') ? completed
    : { ...completed, idContrato: 2, idIntegracion: 20, idOtG3: 'OT-OTRO', codigoOtG3: 'OT-OTRO' } }) });
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, { contractId: 1, canRequest: false,
    compact: true, installationSummary: true, onChanged: () => { changes++; } })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  await act(async () => refreshButton(tree).props.onClick());
  const visible = JSON.stringify(tree.toJSON());
  assert.match(visible, /OT-1/); assert.doesNotMatch(visible, /OT-OTRO/);
  assert.equal(changes, 0);
});

test('la primera consulta de otro contrato se descarta sin mostrar ni generar órdenes', async t => {
  const reads = [], writes = [];
  const { G3InstallationStatus } = installation({ get: async path => { reads.push(path); return { data: { ...completed, idContrato: 2 } }; },
    post: async (...args) => writes.push(args) });
  let tree;
  await act(async () => { tree = create(React.createElement(G3InstallationStatus, { contractId: 1, canRequest: true, compact: true, installationSummary: true })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /OT-1/);
  assert.deepEqual(reads, ['/integrations/g3/contracts/1/installation']);
  assert.deepEqual(writes, []);
});
