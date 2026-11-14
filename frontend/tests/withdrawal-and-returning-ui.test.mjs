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
const transpile = (relative, mocks) => {
  const source = readFileSync(new URL('../src/' + relative, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const exports = {}; new Function('require', 'exports', outputText)(name => (name in mocks ? mocks[name] : require(name)), exports); return exports;
};

// ---------- Ficha del Libro de Control: acción «Dar de baja el servicio» ----------
const model = transpile('features/commercial/control-book-model.ts', {});
const times = transpile('features/commercial/control-book-contact-time.ts', {});
const row = { rowId: '10-31-51', idCliente: 10, idEmpresa: 1, idContrato: 31, numeroContrato: 'CT-31', idServicio: 41, idFactura: 51,
  nombre: 'Cliente de prueba', plan: 'Fibra 400', saldoPendiente: 19990, diasAtraso: 20, diaPago: 10 };
const Modal = ({ title, headerDetails, navigation, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, headerDetails, navigation, children);

async function drawer(t, services, { canManage = true, canManagePayments = true, suspension = { idContrato: 31, elegible: true, motivo: null } } = {}) {
  const opened = [], suspensions = [], reads = [];
  const { ControlBookDrawer } = transpile('features/commercial/ControlBookDrawer.tsx', {
    '../../api': { api: { get: async path => { reads.push(path); return { data: path === '/commercial/control-book' ? { items: [row], pagination: { totalPages: 1 } } : path.startsWith('/services/customer/') ? services : path.endsWith('/suspension-eligibility') ? {
      umbralDias: 5, empresa: { idEmpresa: row.idEmpresa }, cliente: { idCliente: row.idCliente }, contrato: { idContrato: row.idContrato }, ...suspension,
    } : [] }; }, post: async () => ({}) }, apiErrorMessage: () => 'Error' },
    '../customers/CustomerStatusBadge': { CustomerStatusSummary: () => null },
    './ControlBookCustomerContracts': { ControlBookCustomerContracts: ({ onSelect }) => React.createElement('button', { onClick: () => onSelect(31) }, 'Seleccionar plan') },
    './ControlBookHistory': { ControlBookHistory: () => null },
    './ControlBookManualPayment': { ControlBookManualPayment: () => null },
    './ControlBookWithdrawal': { ControlBookWithdrawal: props => { opened.push(props); return React.createElement('p', null, 'MODAL_RETIRO'); } },
    './ControlBookSuspension': { ControlBookSuspension: props => { suspensions.push(props); return React.createElement('p', null, 'MODAL_SUSPENSION'); } },
    './ControlBookModal': { ControlBookModal: Modal },
    './control-book-model': model, './control-book-contact-time': times,
  });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookDrawer, {
    row, revision: 0, canManage, canManagePayments, canViewBilling: true, canViewDocuments: true,
    onClose() {}, onSaved() {}, onBusyChange() {}, onOpenBilling() {},
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const buttons = () => tree.root.findAllByType('button').map(node => textOf(node));
  const click = label => act(async () => tree.root.findAllByType('button').find(node => textOf(node) === label).props.onClick({ currentTarget: { closest: () => null } }));
  const button = label => tree.root.findAllByType('button').find(node => textOf(node) === label);
  return { tree, buttons, button, click, opened, suspensions, reads };
}
const suspended = { idServicio: 41, idCliente: 10, idEmpresa: 1, idContrato: 31, tipoServicio: 'Internet', estadoOperativo: 'Suspendido' };

test('la ficha solo ofrece «Dar de baja el servicio» cuando el plan elegido tiene un servicio suspendido', async t => {
  const h = await drawer(t, [suspended]);
  assert.ok(!h.buttons().includes('Dar de baja el servicio'), 'antes de elegir plan no aparece');
  await h.click('Seleccionar plan');
  assert.ok(h.buttons().includes('Dar de baja el servicio'));
  await h.click('Dar de baja el servicio');
  assert.ok(textOf(h.tree.toJSON()).includes('MODAL_RETIRO'));
  assert.deepEqual(h.opened.at(-1).services.map(s => s.idServicio), [41]);
});

test('sin servicio suspendido (activo o de otra empresa/contrato) la ficha conserva exactamente sus acciones', async t => {
  for (const services of [[{ ...suspended, estadoOperativo: 'Activo' }], [{ ...suspended, idContrato: 99 }], [{ ...suspended, idEmpresa: 2 }]]) {
    const h = await drawer(t, services);
    await h.click('Seleccionar plan');
    assert.ok(!h.buttons().includes('Dar de baja el servicio'));
    for (const label of ['Registrar gestión', 'Crear convenio', 'Otorgar prórroga', 'Cambiar día de pago', 'Agregar cargo', 'Pago manual']) assert.ok(h.buttons().includes(label), label);
  }
});

test('«Suspender servicio» se habilita solo si el backend calcula que corresponde el corte y abre su propio modal', async t => {
  const h = await drawer(t, [{ ...suspended, estadoOperativo: 'Activo' }]);
  assert.ok(!h.buttons().includes('Suspender servicio'), 'antes de elegir plan no aparece');
  await h.click('Seleccionar plan');
  assert.ok(h.reads.includes('/billing/contracts/31/suspension-eligibility'));
  assert.equal(h.button('Suspender servicio').props.disabled, false);
  assert.ok(!h.buttons().includes('Dar de baja el servicio'), 'sin servicio suspendido no se ofrece la baja');
  await h.click('Suspender servicio');
  assert.ok(textOf(h.tree.toJSON()).includes('MODAL_SUSPENSION'));
  assert.ok(!textOf(h.tree.toJSON()).includes('MODAL_RETIRO'));
  assert.equal(h.suspensions.at(-1).contractId, 31);
});

test('no elegible para el corte: el botón queda deshabilitado con el motivo del backend', async t => {
  const h = await drawer(t, [{ ...suspended, estadoOperativo: 'Activo' }], { suspension: { idContrato: 31, elegible: false, motivo: { code: 'DEUDA_CUBIERTA_POR_CONVENIO', message: 'La deuda vencida está cubierta por un convenio de pago activo' } } });
  await h.click('Seleccionar plan');
  assert.equal(h.button('Suspender servicio').props.disabled, true);
  assert.match(h.button('Suspender servicio').props.title, /cubierta por un convenio de pago activo/);
  assert.match(textOf(h.tree.toJSON()), /Requisito pendiente: La deuda vencida está cubierta por un convenio de pago activo/);
});

test('una respuesta de elegibilidad de otro contrato no habilita el corte', async t => {
  const h = await drawer(t, [{ ...suspended, estadoOperativo: 'Activo' }], { suspension: { idContrato: 99, elegible: true, motivo: null } });
  await h.click('Seleccionar plan');
  assert.equal(h.button('Suspender servicio').props.disabled, true);
});

test('servicio ya suspendido: la baja se abre sin anidar el modal de suspensión', async t => {
  const h = await drawer(t, [suspended], { suspension: { idContrato: 31, elegible: false, motivo: { code: 'YA_SUSPENDIDO', message: 'Ya suspendido' } } });
  await h.click('Seleccionar plan');
  await h.click('Dar de baja el servicio');
  assert.ok(textOf(h.tree.toJSON()).includes('MODAL_RETIRO'));
  assert.ok(!textOf(h.tree.toJSON()).includes('MODAL_SUSPENSION'));
});

test('sin permiso de facturación no se ofrece «Suspender servicio» ni se consulta', async t => {
  const h = await drawer(t, [{ ...suspended, estadoOperativo: 'Activo' }], { canManagePayments: false });
  await h.click('Seleccionar plan');
  assert.ok(!h.buttons().includes('Suspender servicio'));
  assert.ok(!h.reads.some(path => path.endsWith('/suspension-eligibility')));
});

test('sin permiso de gestión comercial no aparece la acción', async t => {
  const h = await drawer(t, [suspended], { canManage: false });
  await h.click('Seleccionar plan');
  assert.ok(!h.buttons().includes('Dar de baja el servicio'));
});

// ---------- Prospectos: excliente con situación financiera calculada ----------
function loadPanel(api) {
  return transpile('features/prospects/ProspectsPanel.tsx', {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../lib': { emptyProspectForm: { rut: '', nombreCompleto: '', email: '', telefono: '', direccion: '', comuna: '', region: '', origenContacto: 'Formulario web' }, formatChileanMobileInput: String, formatRutForDisplay: value => value, formatRutInput: String, normalizeRutInput: String, validateProspectForm: () => '' },
    '../../shared/components': { Modal: () => null, TablePagination: () => null },
    './ProspectWorkflowPanel': { ProspectWorkflowPanel: () => null },
    '../coverage': { CoveragePicker: () => null },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => ({ message: '', showMessage() {} }) },
    '../../shared/data/chile-territories': { chileRegions: [], findChileRegion: () => null, normalizeTerritory: String },
  }).ProspectsPanel;
}
const prospect = (id, extra = {}) => ({ idProspecto: id, idCliente: null, rut: `1111111${id}-1`, nombreCompleto: `Persona ${id}`, email: null, telefono: null, direccion: null,
  estadoPipeline: 'Prospecto Nuevo', motivoPerdida: null, origenContacto: 'Referido', empresa: { nombre: 'FiNet' }, ...extra });

test('Prospectos distingue nuevo, perdido, excliente con deuda y excliente sin deuda con la etiqueta calculada', async () => {
  const items = [
    prospect(1),
    prospect(2, { estadoPipeline: 'Perdido', motivoPerdida: 'Precio elevado' }),
    prospect(3, { idCliente: 30, estadoPipeline: 'Fuera pipeline', origenContacto: 'Excliente', excliente: { situacionFinanciera: 'CON_DEUDA', etiqueta: 'Excliente con deuda pendiente' } }),
    prospect(4, { idCliente: 31, estadoPipeline: 'Fuera pipeline', origenContacto: 'Excliente', excliente: { situacionFinanciera: 'SIN_DEUDA', etiqueta: 'Excliente sin deuda' } }),
    prospect(5, { requiereRevisionComercial: true }),
  ];
  const Panel = loadPanel({ get: async () => ({ data: { items, total: items.length, page: 1, pageSize: 20, counts: {} } }) });
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { prospects: [], loading: false, loadError: '', plans: [], writeCompanyId: 1, permissions: { createProspects: false }, onReload() {}, onCreated() {}, scope: 'consolidado' })); });
  const states = tree.root.findByType('tbody').findAllByType('tr').map(tr => textOf(tr.findAllByType('td')[2]));
  assert.deepEqual(states, ['Prospecto Nuevo', 'Perdido', 'Excliente con deuda pendiente', 'Excliente sin deuda', 'Revisión comercial requerida']);
  assert.ok(!JSON.stringify(tree.toJSON()).includes('perdidos en la cartera'), 'sin barras ni contadores nuevos');
  await act(async () => tree.unmount());
});
