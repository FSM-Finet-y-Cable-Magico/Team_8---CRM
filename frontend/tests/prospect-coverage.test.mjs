import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/prospects/prospect-coverage.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { uniqueAddressLocation, registeredCoverage, prospectNeedsReview } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const point = { latitud: -33, longitud: -71.26 };

test('una dirección ambigua no elige el primer resultado ni confirma cobertura', () => {
  assert.equal(uniqueAddressLocation([point, { latitud: -33.1, longitud: -71.26 }]), null);
  assert.equal(uniqueAddressLocation([]), null);
  assert.equal(uniqueAddressLocation({ candidatos: [point] }), null);
});

test('solo acepta coordenadas válidas; resultados duplicados identifican el mismo punto', () => {
  assert.deepEqual(uniqueAddressLocation([point, { ...point }]), point);
  for (const invalid of [{ latitud: null, longitud: null }, { latitud: '0', longitud: '0' }, { latitud: NaN, longitud: -71 }, { latitud: 91, longitud: -71 }, { latitud: -33, longitud: -181 }]) {
    assert.equal(uniqueAddressLocation([invalid]), null);
  }
});

test('un estado comercial anterior sin coordenadas no confirma ni descarta cobertura', () => {
  for (const estadoPipeline of ['Factible', 'No Factible', 'Cotizacion Enviada', 'Servicio Activo']) {
    assert.equal(registeredCoverage({ estadoPipeline, latitud: null, longitud: null }), 'pending');
  }
  assert.equal(registeredCoverage({ ...point, estadoPipeline: 'Factible' }), 'covered');
  assert.equal(registeredCoverage({ ...point, estadoPipeline: 'No Factible' }), 'outside');
});

test('servicio activo sin cliente asociado requiere revisión del registro', () => {
  assert.equal(prospectNeedsReview({ estadoPipeline: 'Servicio Activo', idCliente: null }), true);
  assert.equal(prospectNeedsReview({ estadoPipeline: 'Servicio Activo', idCliente: 10 }), false);
  assert.equal(prospectNeedsReview({ estadoPipeline: 'Cotizacion Enviada', idCliente: null }), false);
});
