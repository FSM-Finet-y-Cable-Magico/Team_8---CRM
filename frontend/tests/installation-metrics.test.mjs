import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/dashboard/DashboardHome.tsx', import.meta.url), 'utf8');
const exports = {};
const formatting = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(formatting);
const mocks = {
  '../../lib': { ...formatting, expiryAlertKey: () => '', expiryUrgency: () => '', formatDateOnly: v => v },
  '../../shared/components': {
    DashboardStatCard: ({ label, value, description, onClick }) => React.createElement('article', { 'data-label': label, 'data-value': value, onClick }, description),
    ExpiryBadge: () => null, ExpiryCustomerCard: () => null, Modal: () => null, QuickActionCard: () => null,
  },
};
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
new Function('require', 'exports', compiled)(name => name in mocks ? mocks[name] : require(name), exports);

async function render(metricas, check, workOrders = [], navigation = {}) {
  let tree;
  await act(async () => { tree = create(React.createElement(exports.DashboardHome, {
    summary: { metricas: { clientes: 0, prospectos: 0, instalacionesPendientes: 0, ...metricas } },
    prospects: [], customers: [], tickets: [], workOrders, billingOverview: null, permissions: {}, onNavigate: () => {}, ...navigation,
  })); });
  try { await check(tree); } finally { await act(async () => tree.unmount()); }
}

test('CU47 presents effective-date total without adding undated completions to pending execution', async () => {
  await render({ instalacionesMensuales: 2, instalacionesSinFechaTecnica: 3 }, tree => {
    const cards = tree.root.findAllByType('article');
    const monthly = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Instalaciones del mes'));
    assert.equal(monthly.findByType('strong').props.children, 2);
    assert.equal(cards.find(c => c.props['data-label'] === 'Instalaciones pendientes').props['data-value'], 0);
    const rendered = JSON.stringify(tree.toJSON());
    assert.doesNotMatch(rendered, /Pendiente de fecha técnica/);
    assert.match(rendered, /Por fecha técnica efectiva \(Santiago\)/);
  });
});

test('gráfico de instalaciones reconoce cierre global y EN_CURSO sin contar reparación ni cancelación como completadas', async () => {
  await render({ instalacionesMensuales: 1, instalacionesPendientes: 1 }, tree => {
    const legend = tree.root.findByProps({ className: 'installation-chart-legend' });
    assert.deepEqual(legend.findAllByType('strong').map(node => Number(node.children.join(''))), [0, 1, 1]);
  }, [
    { tipoOt: 'INSTALACION', estado: 'COMPLETADA' }, { tipoOt: 'REPARACION', estado: 'COMPLETADA' },
    { tipoOt: 'INSTALACION', estado: 'EN_CURSO' }, { tipoOt: 'Instalacion', estado: 'Cancelada' },
    { tipoOt: 'Instalacion', estado: 'Cerrada' },
  ]);
});

test('older summary responses remain compatible with monthly indicator', async () => {
  await render({ instalacionesMensuales: 0, instalacionesRequierenRevision: 1 }, tree => {
    const monthly = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Instalaciones del mes'));
    assert.equal(monthly.findByType('strong').props.children, 0);
  });
  await render({ instalacionesMensuales: 4 }, tree => {
    const monthly = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Instalaciones del mes'));
    assert.equal(monthly.findByType('strong').props.children, 4);
  });
});

test('churn sin historia suficiente no presenta porcentaje ni bajas inventadas, incluso ante respuesta antigua', async () => {
  for (const values of [{}, { churnRateMensual: null, churnBajasMensuales: null, churnEstado: 'HISTORIAL_INSUFICIENTE' }, { churnRateMensual: 50, churnBajasMensuales: 1 }]) {
    await render(values, tree => {
      const churn = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Churn mensual'));
      assert.equal(churn.findByType('strong').props.children, '-');
      const rendered = JSON.stringify(tree.toJSON());
      assert.match(rendered, /Historial insuficiente/);
      assert.doesNotMatch(rendered, /50%|0%|baja\(s\) durante el mes/);
    });
  }
});

test('dashboard solicita por separado agenda técnica y contratos por activar', async () => {
  const opened = [], navigated = [];
  await render({ pendientesActivacion: 3, instalacionesPendientes: 5 }, async tree => {
    const card = label => tree.root.findByProps({ 'data-label': label });
    assert.equal(card('Pendientes de activación').props['data-value'], 3);
    assert.equal(card('Instalaciones pendientes').props['data-value'], 3);
    await act(async () => card('Instalaciones pendientes').props.onClick());
    await act(async () => card('Pendientes de activación').props.onClick());
    await act(async () => card('Clientes activos').props.onClick());
    assert.deepEqual(opened, ['agenda', 'activation']);
    assert.deepEqual(navigated, ['customers']);
  }, [], { onOpenPendingInstallations: view => opened.push(view), onNavigate: tab => navigated.push(tab) });
});

test('dashboard deriva la agenda a Instalaciones y la activación a Clientes si no recibe apertura directa', async () => {
  const navigated = [];
  await render({ pendientesActivacion: 3, instalacionesPendientes: 5 }, async tree => {
    await act(async () => tree.root.findByProps({ 'data-label': 'Instalaciones pendientes' }).props.onClick());
    await act(async () => tree.root.findByProps({ 'data-label': 'Pendientes de activación' }).props.onClick());
    assert.deepEqual(navigated, ['installations', 'customers']);
  }, [], { onNavigate: tab => navigated.push(tab) });
});

test('cada ticket del dashboard abre el registro correspondiente', async () => {
  const opened = [];
  const ticket = { idTicket: 23, estado: 'Abierto', codigoSeguimiento: 'TK-23', cliente: { nombreCompleto: 'Cliente QA' } };
  await render({}, async tree => {
    const card = tree.root.findByProps({ className: 'compact-list-item dashboard-ticket-item' });
    await act(async () => card.props.onClick());
    assert.deepEqual(opened, [23]);
  }, [], { tickets: [ticket], permissions: { viewTickets: true }, onOpenTicket: id => opened.push(id) });
});
