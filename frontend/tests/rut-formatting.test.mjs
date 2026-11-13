import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/rut.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function('exports', output)(exports);
const { formatRutInput, normalizeRutInput } = exports;

test('agrega el guion a RUT de siete u ocho dígitos y conserva los ceros', () => {
  assert.equal(formatRutInput('123456785'), '12345678-5');
  assert.equal(formatRutInput('12345674'), '1234567-4');
  assert.equal(formatRutInput('012345674'), '01234567-4');
});

test('admite pegar puntos, espacios y guion y normaliza el verificador K', () => {
  assert.equal(formatRutInput(' 12.345.678-5 '), '12345678-5');
  assert.equal(formatRutInput('12 345 678 k'), '12345678-K');
  assert.equal(formatRutInput('1234567k'), '1234567-K');
  assert.equal(formatRutInput('12345678-5'), '12345678-5');
});

test('permite vaciar y escribir parcialmente sin truncar los valores inválidos', () => {
  for (const value of ['', '1', '1234567']) assert.equal(formatRutInput(value), value);
  assert.equal(formatRutInput('1234567890'), '123456789-0');
  assert.equal(formatRutInput('1234567X'), '1234567-X');
});

test('mantiene la normalización utilizada para enviar el RUT al backend', () => {
  assert.equal(normalizeRutInput(formatRutInput('12.345.678k')), '12345678-K');
});

test('presentación de RUT externo: agrega guion solo con DV válido y nunca infiere el DV', () => {
  const { formatRutForDisplay, canonicalRut } = exports;
  for (const value of ['123456785', '12345678-5', '12.345.678-5', ' 12.345.678-5 ']) assert.equal(formatRutForDisplay(value), '12345678-5');
  assert.equal(formatRutForDisplay('12345670k'), '12345670-K');
  assert.equal(formatRutForDisplay('1234567-4'), '1234567-4');
  // Invalid DV, incomplete body or foreign formats are preserved exactly as stored.
  for (const value of ['123456789', '12345678-9', '12345678', '1234567', 'QA-1', '']) assert.equal(formatRutForDisplay(value), value);
  assert.equal(formatRutForDisplay(null), null);
  assert.equal(formatRutForDisplay(undefined), null);
  assert.equal(canonicalRut('12345678-9'), null);
  assert.equal(canonicalRut('123456785'), canonicalRut('12.345.678-5'));
});
