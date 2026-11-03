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
const mocks = {
  '../../lib': { expiryAlertKey: () => '', expiryUrgency: () => '', formatDateOnly: v => v },
  '../../shared/components': {
    DashboardStatCard: ({ label, value, description }) => React.createElement('article', { 'data-label': label, 'data-value': value }, description),
    ExpiryBadge: () => null, ExpiryCustomerCard: () => null, Modal: () => null, QuickActionCard: () => null,
  },
};
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
new Function('require', 'exports', compiled)(name => name in mocks ? mocks[name] : require(name), exports);

async function render(metricas, check) {
  let tree;
  await act(async () => { tree = create(React.createElement(exports.DashboardHome, {
    summary: { metricas: { clientes: 0, prospectos: 0, instalacionesPendientes: 0, ...metricas } },
    prospects: [], customers: [], tickets: [], workOrders: [], billingOverview: null, permissions: {}, onNavigate: () => {},
  })); });
  try { check(tree); } finally { await act(async () => tree.unmount()); }
}

test('CU47 presents effective-date total without adding undated completions to pending execution', async () => {
  await render({ instalacionesMensuales: 2, instalacionesSinFechaTecnica: 3 }, tree => {
    const cards = tree.root.findAllByType('article');
    const monthly = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Instalaciones del mes'));
    assert.equal(monthly.findByType('strong').props.children, 2);
    assert.equal(cards.find(c => c.props['data-label'] === 'Instalaciones pendientes').props['data-value'], 0);
    const rendered = JSON.stringify(tree.toJSON());
    assert.match(rendered, /Pendiente de fecha técnica/);
    assert.match(rendered, /ni representan trabajo pendiente de ejecución/);
    assert.match(rendered, /Por fecha técnica efectiva \(Santiago\)/);
  });
});

test('inconsistent installation evidence is visible and older summary responses remain compatible', async () => {
  await render({ instalacionesMensuales: 0, instalacionesRequierenRevision: 1 }, tree => {
    assert.match(JSON.stringify(tree.toJSON()), /requieren revisión de fecha o relaciones/);
  });
  await render({ instalacionesMensuales: 4 }, tree => {
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Pendiente de fecha técnica|requieren revisión de fecha o relaciones/);
    const monthly = tree.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.props.children === 'Instalaciones del mes'));
    assert.equal(monthly.findByType('strong').props.children, 4);
  });
});
