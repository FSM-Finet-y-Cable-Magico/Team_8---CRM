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

// ---------- Ficha del Libro de Control: acción «Iniciar baja y retiro» ----------
const model = transpile('features/commercial/control-book-model.ts', {});
const times = transpile('features/commercial/control-book-contact-time.ts', {});
const row = { rowId: '10-31-51', idCliente: 10, idEmpresa: 1, idContrato: 31, numeroContrato: 'CT-31', idServicio: 41, idFactura: 51,
  nombre: 'Cliente de prueba', plan: 'Fibra 400', saldoPendiente: 19990, diasAtraso: 20, diaPago: 10 };
const Modal = ({ title, headerDetails, navigation, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, headerDetails, navigation, children);

async function drawer(t, services, { canManage = true } = {}) {
  const opened = [];
  const { ControlBookDrawer } = transpile('features/commercial/ControlBookDrawer.tsx', {
    '../../api': { api: { get: async path => ({ data: path === '/commercial/control-book' ? { items: [row], pagination: { totalPages: 1 } } : path.startsWith('/services/customer/') ? services : [] }), post: async () => ({}) }, apiErrorMessage: () => 'Error' },
    '../customers/CustomerStatusBadge': { CustomerStatusBadge: () => null },
    './ControlBookCustomerContracts': { ControlBookCustomerContracts: ({ onSelect }) => React.createElement('button', { onClick: () => onSelect(31) }, 'Seleccionar plan') },
    './ControlBookHistory': { ControlBookHistory: () => null },
    './ControlBookManualPayment': { ControlBookManualPayment: () => null },
    './ControlBookWithdrawal': { ControlBookWithdrawal: props => { opened.push(props); return React.createElement('p', null, 'MODAL_RETIRO'); } },
    './ControlBookModal': { ControlBookModal: Modal },
    './control-book-model': model, './control-book-contact-time': times,
  });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookDrawer, {
    row, revision: 0, canManage, canManagePayments: true, canViewBilling: true, canViewDocuments: true,
    onClose() {}, onSaved() {}, onBusyChange() {}, onOpenBilling() {},
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const buttons = () => tree.root.findAllByType('button').map(node => textOf(node));
  const click = label => act(async () => tree.root.findAllByType('button').find(node => textOf(node) === label).props.onClick({ currentTarget: { closest: () => null } }));
  return { tree, buttons, click, opened };
}
const suspended = { idServicio: 41, idCliente: 10, idEmpresa: 1, idContrato: 31, tipoServicio: 'Internet', estadoOperativo: 'Suspendido' };

test('la ficha solo ofrece «Iniciar baja y retiro» cuando el plan elegido tiene un servicio suspendido', async t => {
  const h = await drawer(t, [suspended]);
  assert.ok(!h.buttons().includes('Iniciar baja y retiro'), 'antes de elegir plan no aparece');
  await h.click('Seleccionar plan');
  assert.ok(h.buttons().includes('Iniciar baja y retiro'));
  await h.click('Iniciar baja y retiro');
  assert.ok(textOf(h.tree.toJSON()).includes('MODAL_RETIRO'));
  assert.deepEqual(h.opened.at(-1).services.map(s => s.idServicio), [41]);
});

test('sin servicio suspendido (activo o de otra empresa/contrato) la ficha conserva exactamente sus acciones', async t => {
  for (const services of [[{ ...suspended, estadoOperativo: 'Activo' }], [{ ...suspended, idContrato: 99 }], [{ ...suspended, idEmpresa: 2 }]]) {
    const h = await drawer(t, services);
    await h.click('Seleccionar plan');
    assert.ok(!h.buttons().includes('Iniciar baja y retiro'));
    for (const label of ['Registrar gestión', 'Crear convenio', 'Otorgar prórroga', 'Cambiar día de pago', 'Agregar cargo', 'Pago manual']) assert.ok(h.buttons().includes(label), label);
  }
});

test('sin permiso de gestión comercial no aparece la acción', async t => {
  const h = await drawer(t, [suspended], { canManage: false });
  await h.click('Seleccionar plan');
  assert.ok(!h.buttons().includes('Iniciar baja y retiro'));
});

// ---------- Prospectos: excliente con situación financiera calculada ----------
function loadPanel(api) {
  return transpile('features/prospects/ProspectsPanel.tsx', {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../lib': { emptyProspectForm: { rut: '', nombreCompleto: '', email: '', telefono: '', direccion: '', comuna: '', region: '', origenContacto: 'Formulario web' }, formatChileanMobileInput: String, formatRutInput: String, normalizeRutInput: String, validateProspectForm: () => '' },
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
