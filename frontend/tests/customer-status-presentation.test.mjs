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
const { customerStatusPresentation, CustomerStatusBadge } = loadComponent(
  '../src/features/customers/CustomerStatusBadge.tsx', { '../../shared/components': { StatusBadge } },
);
const render = (value, compact = false) => renderToStaticMarkup(React.createElement(CustomerStatusBadge, { value, compact }));

test('el marcador empresarial se presenta como privacidad de estado global, sin cambiar el valor API', () => {
  const state = 'Restringido por empresa';
  const presentation = customerStatusPresentation(state);
  assert.equal(presentation.label, 'Estado global no compartido');
  assert.match(presentation.explanation, /contratos y servicios de la empresa autorizada/);
  assert.match(presentation.explanation, /consulta el estado de cada contrato o servicio/);
  assert.equal(state, 'Restringido por empresa');
  assert.equal(customerStatusPresentation('  RESTRINGIDO POR EMPRESA  ').label, presentation.label);
});

test('la ficha explica el alcance sin presentar un bloqueo de acceso al cliente autorizado', () => {
  const html = render('Restringido por empresa');
  assert.match(html, /Estado global no compartido/);
  assert.match(html, /<small[^>]*display:block[^>]*>Se muestran los contratos y servicios/);
  assert.match(html, /aria-describedby=/);
  assert.doesNotMatch(html, /Restringido por empresa|Sin acceso|Permiso denegado/);
});

test('la tabla compacta conserva explicación accesible y tooltip sin mostrar un estado inventado', () => {
  const html = render('Restringido por empresa', true);
  assert.match(html, /title="Se muestran los contratos y servicios/);
  assert.match(html, /tabindex="0"/);
  const descriptionId = /aria-describedby="([^"]+)"/.exec(html)?.[1];
  assert.ok(descriptionId);
  assert.ok(html.includes(`id="${descriptionId}"`));
  assert.match(html, /clip-path:inset\(50%\)/);
  assert.doesNotMatch(html, />Activo<|>Suspendido<|>Moroso</);
});

test('estados globales realmente disponibles conservan texto y presentación original', () => {
  for (const state of ['Activo', 'Moroso', 'Suspendido', 'Baja', 'Pendiente Instalacion']) {
    assert.deepEqual(customerStatusPresentation(state), { label: state, explanation: null });
    assert.equal(render(state), renderToStaticMarkup(React.createElement(StatusBadge, { value: state })));
  }
});

test('ausencia de dato sigue siendo ausencia, sin inferir estado ni permiso', () => {
  for (const state of [null, undefined]) {
    assert.deepEqual(customerStatusPresentation(state), { label: 'Sin dato', explanation: null });
    assert.match(render(state), />Sin dato</);
    assert.doesNotMatch(render(state), /empresa autorizada|Activo|Moroso|Suspendido/);
  }
});
