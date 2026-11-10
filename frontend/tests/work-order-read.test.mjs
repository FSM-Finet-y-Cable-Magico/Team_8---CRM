import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
const require = createRequire(import.meta.url);
const formatting = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(formatting);

test('lecturas de UI reconocen vocabulario global e histórico sin convertir reparación ni cancelación', () => {
  for (const type of ['INSTALACION', 'Instalacion', 'Instalación']) assert.equal(formatting.isInstallationWorkOrder(type), true);
  for (const type of ['REPARACION', 'PRE_INSTALACION', null]) assert.equal(formatting.isInstallationWorkOrder(type), false);
  for (const state of ['COMPLETADA', 'Completada']) assert.equal(formatting.isCompletedWorkOrder(state), true);
  for (const state of ['EN_CURSO', 'PENDIENTE_APROBACION', 'CANCELADA', 'Cerrada']) assert.equal(formatting.isCompletedWorkOrder(state), false);
  assert.equal(formatting.isTerminalWorkOrder('CANCELADA'), true);
  assert.equal(formatting.isInProgressWorkOrder('EN_CURSO'), true);
  assert.equal(formatting.formatWorkOrderValue('EN_CURSO'), 'En curso');
});

test('Inventario consulta catálogo por empresa sin presentar sus tipos como asignaciones a servicios', async () => {
  const source = readFileSync(new URL('../src/features/inventory/InventoryPanel.tsx', import.meta.url), 'utf8');
  const calls = [];
  const mocks = { '../../api': { api: { get: async (...args) => { calls.push(args); return { data: { data: [{ id_tipo_equipo: 1, id_empresa: 2, nombre: 'TIPO-QA', activo: true }] } }; } } },
    '../../lib': { ...formatting, formatDateOnly: value => value }, '../../shared/components': { TablePagination: () => null } };
  const component = {};
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText)
    (name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), component);
  let tree; await act(async () => { tree = create(React.createElement(component.InventoryPanel, { companyId: 2, companyName: 'Empresa QA' })); });
  const text = JSON.stringify(tree.toJSON());
  assert.match(text, /TIPO-QA/);
  assert.match(text, /El catálogo de tipos de equipo no acredita asignaciones a servicios/);
  assert.match(calls[0][0], /integrations\/g1\/equipment-types/);
  assert.equal(calls[0][1].params.idEmpresa, 2);
  assert.equal(calls.length, 1);
  await act(async () => tree.unmount());
});

test('Instalaciones integra historial real una vez sin convertir reparaciones ni generar solicitudes', async () => {
  const calls = [];
  const date = '2026-10-02T12:00:00.000Z';
  const row = { key: '1:2', idEmpresa: 1, idOt: '2', fuente: 'LEGACY_LOCAL', idContrato: null, idServicio: null,
    clasificacionFecha: 'FECHA_TECNICA_CONFIRMADA', fechasTecnicasOriginales: [date], ordenesLocales: [2], solicitudesG3: [] };
  const mocks = {
    '../../api': { api: { get: async (...args) => { calls.push(args); return { data: { items: [row] } }; } } },
    '../../lib': { ...formatting, formatDateOnly: value => value, formatDateTime: value => value },
    '../../shared/components': { Modal: ({ open, children }) => open ? React.createElement('dialog', null, children) : null, StatusBadge: () => null, TablePagination: () => null },
    './InstallOrderForm': { InstallOrderForm: () => null }, './InstallationCompletionForm': { InstallationCompletionForm: () => null },
  };
  function load(url) {
    const component = {};
    new Function('require', 'exports', ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText)(name => name.endsWith('.css') ? {} : mocks[name] ?? (name.startsWith('.') ? load(new URL(name + '.tsx', url)) : require(name)), component);
    return component;
  }
  const { InstallationsPanel } = load(new URL('../src/features/installations/InstallationsPanel.tsx', import.meta.url));
  const orders = [
    { idOt: 2, idEmpresa: 1, tipoOt: 'INSTALACION', estado: 'COMPLETADA', prioridad: 'Media' },
    { idOt: 3, idEmpresa: 1, tipoOt: 'REPARACION', estado: 'COMPLETADA', prioridad: 'Media' },
  ];
  let tree; await act(async () => { tree = create(React.createElement(InstallationsPanel, {
    scope: '1', prospects: [], pendingActivationProspects: [], workOrders: orders, inventory: [], canComplete: false,
    focusedProspectId: null, onFocusConsumed() {}, onChanged() {},
  })); });
  const history = tree.root.findAllByType('section').find(node => node.props.className?.includes('installation-completed'));
  assert.equal(history.findAllByType('tbody').length, 0);
  await act(async () => history.findByProps({ className: 'installation-history-trigger' }).props.onClick());
  assert.equal(history.findByType('tbody').findAllByType('tr').length, 1);
  assert.match(JSON.stringify(history.toJSON?.() ?? tree.toJSON()), /Sin servicio correlacionado/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/integrations/g3/installation-history');
  await act(async () => tree.unmount());
});
