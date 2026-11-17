import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
function load(file, mocks = {}) {
  const out = ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {}; new Function('require', 'exports', out)(name => mocks[name] ?? require(name), exports); return exports;
}
const lib = { ...load('lib/dates.ts'), ...load('lib/expiry-alerts.ts'), ...load('lib/formatting.ts') };
const { ExpiryBadge } = load('shared/components/ExpiryBadge.tsx', { '../../lib': lib });
const { ExpiryCustomerCard } = load('shared/components/ExpiryCustomerCard.tsx', {
  '../../lib': lib, './ExpiryBadge': { ExpiryBadge }, './StatusBadge': { StatusBadge: ({ value }) => React.createElement('span', null, value) },
});
const { DashboardStatCard } = load('shared/components/DashboardStatCard.tsx');
const Modal = ({ open, title, children }) => open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, children) : null;
const alert = { idFactura: 5, idContrato: 4, idEmpresa: 2, idCliente: 10, cliente: 'Javier QA', rut: null, plan: 'Plan Litoral', estado: 'Saldo pendiente', fechaVencimiento: '2026-11-18', diasRestantes: 3 };
const customer = { idCliente: 10, nombreCompleto: 'Javier QA', rut: '12345678-5', telefono: '+56912345678', email: 'javier@example.invalid', origenContacto: 'Sucursal', estado: 'Activo', contratos: [{ idContrato: 4, numeroContratoExterno: 'CT-004' }] };

async function harness(t, { alerts = [alert], tickets = [], permission = true } = {}) {
  const navigations = [], ticketTargets = [], customerTargets = []; let refreshes = 0;
  const { DashboardHome } = load('features/dashboard/DashboardHome.tsx', {
    '../../lib': lib, '../../api': {}, './useDashboardFinance': { useDashboardFinance: () => ({ loading: false,
      data: { alerts, overdueBalance: 339980, totalDebt: 399980, overdueInvoiceCount: 3, overdueCustomerCount: 2 }, refresh: () => { refreshes++; } }) },
    '../../shared/components': { DashboardStatCard, ExpiryBadge, ExpiryCustomerCard, Modal, QuickActionCard: () => null },
  });
  let tree; await act(async () => { tree = create(React.createElement(DashboardHome, {
    scope: 'consolidado', companies: [{ idEmpresa: 1, nombre: 'FiNet' }, { idEmpresa: 2, nombre: 'Cable Mágico' }],
    summary: { metricas: { clientes: 14, prospectos: 8, instalacionesMensuales: 2 }, alertasVencimiento: [{ ...alert, cliente: 'Fernando ya pagó', idContrato: 999 }] },
    customers: [customer], prospects: [], tickets, workOrders: [], permissions: { viewTickets: permission, viewControlBook: permission, viewProspects: permission, viewInstallations: permission },
    onNavigate: tab => navigations.push(tab), onOpenTicket: id => ticketTargets.push(id), onOpenControlBook: item => customerTargets.push(item),
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const button = label => tree.root.findAllByType('button').find(node => text(node) === label);
  return { tree, navigations, ticketTargets, customerTargets, button, refreshes: () => refreshes };
}

test('vista rápida y Ver tickets solo muestran pendientes; código arriba y nombre debajo abren el ticket exacto', async t => {
  const tickets = [
    { idTicket: 1, codigoSeguimiento: 'TK-01', estado: 'Abierto', cliente: { nombreCompleto: 'Persona uno' } },
    { idTicket: 2, codigoSeguimiento: 'TK-02', estado: 'En progreso', cliente: { nombreCompleto: 'Persona dos' } },
    { idTicket: 3, codigoSeguimiento: 'TK-03', estado: 'Resuelto', cliente: { nombreCompleto: 'Resuelto oculto' } },
    { idTicket: 4, codigoSeguimiento: 'TK-04', estado: 'Cerrado', cliente: { nombreCompleto: 'Cerrado oculto' } },
    { idTicket: 5, codigoSeguimiento: 'TK-05', estado: 'Escalado', estadoPresentacion: 'Completada', cliente: { nombreCompleto: 'Terminado oculto' } },
  ];
  const h = await harness(t, { tickets });
  assert.doesNotMatch(text(h.tree.toJSON()), /Resuelto oculto|Cerrado oculto|Terminado oculto/);
  const cards = () => h.tree.root.findAllByProps({ className: 'compact-list-item dashboard-ticket-item' });
  assert.equal(cards().length, 2);
  assert.equal(text(cards()[0].findByType('strong')), 'TK-01');
  assert.equal(text(cards()[0].findByType('span')), 'Persona uno');
  await act(async () => h.button('Ver tickets').props.onClick());
  const dialog = h.tree.root.findByProps({ role: 'dialog', 'aria-label': 'Tickets pendientes' });
  assert.equal(dialog.findAllByType('button').length, 2);
  await act(async () => dialog.findAllByType('button')[1].props.onClick());
  assert.deepEqual(h.ticketTargets, [2]);
});

test('la tarjeta completa abre la alerta, consulta de nuevo y muestra ocho campos; nombre va al libro de la empresa correcta', async t => {
  const h = await harness(t);
  const card = h.tree.root.findAllByType('button').find(node => String(node.props.className).startsWith('expiry-alert-item '));
  assert.deepEqual(card.findAllByType('button'), [card], 'no se anidan botones dentro de la tarjeta');
  await act(async () => card.props.onClick());
  assert.equal(h.refreshes(), 1);
  const dialog = h.tree.root.findByProps({ role: 'dialog', 'aria-label': 'Próximos vencimientos' });
  assert.deepEqual(dialog.findAllByType('dt').map(text), ['RUT', 'Teléfono', 'Correo', 'Empresa', 'Origen', 'Contrato', 'Plan', 'Fecha de vencimiento']);
  assert.match(text(dialog), /Cable Mágico/); assert.match(text(dialog), /CT-004/); assert.match(text(dialog), /Plan Litoral/);
  await act(async () => dialog.findByProps({ className: 'expiry-customer-name' }).props.onClick());
  assert.equal(h.customerTargets[0].idCliente, 10); assert.equal(h.customerTargets[0].idEmpresa, 2);
});

test('un cliente pagado no reaparece por la fecha del contrato del resumen anterior', async t => {
  const h = await harness(t, { alerts: [] });
  assert.doesNotMatch(text(h.tree.toJSON()), /Fernando ya pagó|Vence hoy/);
  assert.match(text(h.tree.toJSON()), /No hay pagos pendientes/);
});

test('gráficos llevan a sus módulos y se elimina la referencia a Santiago', async t => {
  const h = await harness(t);
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Ir a instalaciones' }).props.onClick());
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Ver prospectos por origen de captación' }).props.onClick());
  assert.deepEqual(h.navigations, ['installations', 'prospects']);
  assert.match(text(h.tree.toJSON()), /Instalaciones completadas este mes/);
  assert.doesNotMatch(text(h.tree.toJSON()), /Santiago/);
});

test('resumen financiero muestra valores del libro junto a sus etiquetas y sin textos pequeños', async t => {
  const h = await harness(t);
  const summary = h.tree.root.findByProps({ 'aria-label': 'Resumen financiero' });
  assert.equal(summary.findAllByType('small').length, 0);
  assert.match(text(summary), /Saldo vencido\$339\.980/);
  assert.match(text(summary), /Saldo pendiente\$399\.980/);
  assert.doesNotMatch(text(summary), /Resumen de cobranza|Cortes programados|Total pendiente de regularizar/);
});

test('varias facturas con el mismo contrato y día mantienen claves únicas en la alerta', async t => {
  const errors = []; t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const h = await harness(t, { alerts: [alert, { ...alert, idFactura: 6 }] });
  await act(async () => h.button('Ver más').props.onClick());
  assert.ok(!errors.some(error => /same key/.test(error)), errors.join('\n'));
});
