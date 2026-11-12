import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/features/tickets/ticket-presentation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);
const { ticketAttentionAvailability } = exports;

// Fixtures reproduce the response observed in QA; IDs are test data, not a mapping to adopt.
const row = (idCategoria, nombre, nombreAtencion, extra = {}) =>
  ({ idCategoria, nombre, slaHoras: 24, tipo: null, tipoDisponible: false, nombreAtencion, ...extra });

test('catálogo QA observado: 4 de 7, Facturación y Baja faltan y Consulta no la habilita el servidor', () => {
  const result = ticketAttentionAvailability([
    row(1, 'Falla de internet', 'Falla de Internet'),
    row(2, 'Falla de TV', 'Falla de TV'),
    row(3, 'Consulta', null),
    row(4, 'Cambio de plan', 'Cambio de plan'),
    row(5, 'Mudanza', 'Mudanza'),
    row(6, 'CAMBIO_CREDENCIALES_WIFI', null),
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.options.map(option => option.idCategoria), [1, 2, 4, 5]);
  assert.deepEqual(result.issues.map(issue => [issue.name, issue.reason]), [
    ['Facturación y cobro', 'Falta en el catálogo'],
    ['Consulta general', 'No habilitada por el catálogo del servidor'],
    ['Baja de servicio', 'Falta en el catálogo'],
  ]);
});

test('si el servidor proyecta el alias Consulta, queda elegible con su ID original', () => {
  const result = ticketAttentionAvailability([row(3, 'Consulta', 'Consulta general')]);
  assert.deepEqual(result.options.map(option => [option.idCategoria, option.nombre]), [[3, 'Consulta']]);
});

test('una categoría técnica o interna nunca completa el catálogo de atención', () => {
  for (const tipo of ['TECNICA', 'INTERNA']) {
    const result = ticketAttentionAvailability([row(9, 'Baja de servicio', null, { tipo, tipoDisponible: true })]);
    assert.equal(result.options.length, 0);
    assert.equal(result.issues.find(issue => issue.name === 'Baja de servicio').reason, 'Clasificación incompatible con atención');
  }
});
