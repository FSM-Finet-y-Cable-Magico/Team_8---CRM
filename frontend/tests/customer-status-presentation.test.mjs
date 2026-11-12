import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadComponent(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  return exports;
}

const { StatusBadge } = loadComponent('../src/shared/components/StatusBadge.tsx');
const status = loadComponent('../src/features/customers/CustomerStatusBadge.tsx', { '../../shared/components': { StatusBadge } });
const { CustomerStatusBadge, CustomerStatusSummary, customerStatusDimension, customerStatusValues } = status;
const summary = (customer, compact = false) => renderToStaticMarkup(React.createElement(CustomerStatusSummary, { customer, compact }));
const FALSE_MARKERS = /Restringido por empresa|Estado global no compartido/;

test('consolidado presenta el estado global real sin alterar su texto', () => {
  for (const estado of ['Activo', 'Moroso', 'Suspendido', 'Baja', 'Pendiente Instalacion']) {
    const customer = { estado, estadoGlobalDisponible: true };
    assert.equal(customerStatusDimension(customer), 'global');
    assert.deepEqual(customerStatusValues(customer), [estado]);
    assert.equal(summary(customer), renderToStaticMarkup(React.createElement(StatusBadge, { value: estado })));
  }
});

test('vista por empresa muestra solo estados reales del servicio de esa empresa, rotulados', () => {
  const customer = { estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: ['Activo', 'Suspendido'] };
  assert.equal(customerStatusDimension(customer), 'empresa');
  assert.deepEqual(customerStatusValues(customer), ['Activo', 'Suspendido']);
  const html = summary(customer);
  assert.match(html, /Estado del servicio en esta empresa/);
  assert.match(html, />Activo</);
  assert.match(html, />Suspendido</);
  assert.doesNotMatch(html, FALSE_MARKERS);
  assert.doesNotMatch(html, /Moroso/);
});

test('sin servicio en la empresa no se inventa Activo ni Moroso', () => {
  for (const customer of [{ estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: [] }, { estado: null, estadoGlobalDisponible: false }]) {
    assert.deepEqual(customerStatusValues(customer), []);
    const html = summary(customer, true);
    assert.match(html, /Sin servicio en esta empresa/);
    assert.doesNotMatch(html, /Activo|Moroso|Suspendido|status-badge/);
    assert.doesNotMatch(html, FALSE_MARKERS);
  }
});

test('la tabla compacta conserva el rótulo accesible de la dimensión mostrada', () => {
  const html = summary({ estado: null, estadoGlobalDisponible: false, estadosServicioEmpresa: ['Activo'] }, true);
  assert.match(html, /title="Estado del servicio en esta empresa"/);
  assert.match(html, /clip-path:inset\(50%\)/);
});

test('ausencia de dato global sigue siendo ausencia y el marcador antiguo ya no se traduce', () => {
  for (const estado of [null, undefined]) assert.match(summary({ estado }), />Sin dato</);
  assert.match(renderToStaticMarkup(React.createElement(CustomerStatusBadge, { value: null })), />Sin dato</);
  const source = readFileSync(new URL('../src/features/customers/CustomerStatusBadge.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, FALSE_MARKERS);
});
