import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { userFacingMessage, userFacingApiError } = require('./helpers/user-facing-messages.cjs');

test('errores internos se presentan según el contexto de inventario, instalaciones, retiro o atención', () => {
  for (const [path, raw, expected] of [
    ['/integrations/g1/equipment-types', 'INTEGRACION_G1_NO_CONFIGURADA', /inventario/],
    ['/integrations/g3/installations', 'G3 no configurado', /instalaciones/],
    ['/integrations/g2/requests', 'Grupo 2 no disponible', /atención al cliente/],
    ['/service-withdrawals', 'BLOQUEADO_CONTRATO_G3', /retiro/],
    ['/tickets/1/status', 'G3 temporalmente inaccesible', /ticket/],
    ['/customers/1', 'La operación pertenece al grupo 8', /operación/],
  ]) {
    const result = userFacingApiError(raw, path, 400);
    assert.match(result, expected);
    assert.doesNotMatch(result, /G[1238]|grupo\s*[1238]|BLOQUEADO|INTEGRACION/i);
  }
});

test('conserva validaciones útiles, permisos y el bloqueo de cierre por orden pendiente', () => {
  assert.equal(userFacingApiError('El servicio no pertenece al cliente', '/requests', 400), 'El servicio no pertenece al cliente');
  assert.equal(userFacingApiError('No tienes permisos para esta empresa', '/customers', 403), 'No tienes permisos para esta empresa');
  assert.equal(userFacingApiError('G3 acceso denegado', '/integrations/g3/installations', 403), 'No tienes permisos para realizar esta acción.');
  assert.equal(userFacingApiError(['Selecciona un plan', 'Indica una fecha'], '/contracts', 400), 'Selecciona un plan, Indica una fecha');
  assert.match(userFacingApiError('La OT asociada no consta completada. G3 administra su cierre', '/tickets/1/status', 400), /cuando esté completada/);
});

test('no expone errores técnicos ni presenta una falla como ausencia de datos', () => {
  const result = userFacingApiError('Prisma payload secret-response', '/integrations/g1/units/1', 500);
  assert.match(result, /No se pudo consultar el inventario/);
  assert.doesNotMatch(result, /secret-response|Prisma|payload|No hay equipos/);
  assert.match(userFacingApiError('Network Error', '/customers'), /No se pudo conectar/);
  assert.equal(userFacingMessage('G3 pendiente de ratificación', 'Consulta no disponible.'), 'Consulta no disponible.');
  assert.equal(userFacingMessage('Cobertura confirmada'), 'Cobertura confirmada');
});

test('las etiquetas visibles del frontend no contienen referencias a grupos ni códigos de desarrollo', () => {
  const forbidden = /\bG[1238]\b|\bgrupo\s*[1238]\b|LEGACY_LOCAL|CU-\d+|ratificaci[oó]n|\bpayload\b/i;
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(directory, item.name)) : item.name.endsWith('.tsx') ? [join(directory, item.name)] : []);
  const findings = [];
  for (const file of files(root)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      let visible = ts.isJsxText(node);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        let ancestor = node.parent;
        while (ancestor && !ts.isSourceFile(ancestor)) {
          if (ts.isBinaryExpression(ancestor)) break; // Comparisons retain protocol identifiers.
          if (ts.isJsxAttribute(ancestor)) { visible = /^(title|placeholder|aria-label|alt|hint|data-label)$/.test(ancestor.name.getText(source)); break; }
          if (ts.isJsxExpression(ancestor)) { visible = true; break; }
          ancestor = ancestor.parent;
        }
      }
      if (visible && !node.text?.startsWith('/') && forbidden.test(node.text ?? '')) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        findings.push(`${file}:${line}: ${node.text.trim()}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(findings, []);
});
