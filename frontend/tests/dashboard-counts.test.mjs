import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/features/dashboard/DashboardHome.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const Card = () => null;
const exports = {};
new Function('require', 'exports', code)(name => name === '../../api' ? {} : name === '../../shared/components' ? {
  DashboardStatCard: Card, Modal: () => null, QuickActionCard: () => null,
} : name === '../../lib' ? {
  isInstallationWorkOrder: () => true, isTerminalWorkOrder: () => false, isInProgressWorkOrder: () => false,
  isCompletedWorkOrder: () => false,
} : require(name), exports);

test('contadores usan totales del servidor y distinguen instalaciones de personas y órdenes', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(exports.DashboardHome, {
    summary: { metricas: { clientes: 15, clientesRegistrados: 28, prospectos: 180, pendientesActivacion: 7,
      instalacionesPendientes: 7, ticketsAbiertos: 190, clientesMorosos: 9 } },
    prospects: [], customers: [], tickets: [], workOrders: [{ estado: 'Pendiente' }], billingOverview: null,
    permissions: {}, onNavigate() {}, onOpenTicket() {},
  })); });
  const cards = new Map(tree.root.findAllByType(Card).map(card => [card.props.label, card.props]));
  assert.equal(cards.get('Clientes activos').value, 15);
  assert.match(cards.get('Clientes activos').description, /28 registrados/);
  assert.equal(cards.get('Prospectos activos').value, 180);
  assert.equal(cards.get('Instalaciones pendientes').value, 7);
  assert.equal(cards.get('Tickets abiertos').value, 190);
  await act(async () => tree.unmount());
});

test('resumen no disponible no muestra ceros ni reemplaza totales por listas parciales', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(exports.DashboardHome, {
    summary: null, prospects: [], customers: [], tickets: [], workOrders: [], billingOverview: null,
    permissions: {}, onNavigate() {}, onOpenTicket() {},
  })); });
  const cards = tree.root.findAllByType(Card);
  assert.equal(cards.length, 6);
  assert.ok(cards.every(card => card.props.value === '—'));
  await act(async () => tree.unmount());
});
