import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/features/commercial/control-book-model.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { actionDisabledReason, buildInstallments, COLUMNS, ESSENTIAL, exportColumns, managementRelations, OPERATIONAL, recordContext, VIEW_ACTIONS, WORK_VIEWS } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('cuotas de fin de mes conservan el día original y respetan febrero', () => {
  const installments = buildInstallments(34991, 3, '2026-01-31');
  assert.deepEqual(installments.map((item) => item.fechaVencimiento), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(installments.reduce((sum, item) => sum + item.monto, 0), 34991);
  assert.ok(installments.every((item) => Number.isInteger(item.monto)));
  assert.equal(buildInstallments(100, 2, '2028-01-31')[1].fechaVencimiento, '2028-02-29');
});

test('cuotas conservan centavos, suma exacta y fechas en cambio de año', () => {
  const installments = buildInstallments(100.01, 3, '2026-12-30');
  assert.deepEqual(installments.map((item) => item.monto), [33.33, 33.33, 33.35]);
  assert.deepEqual(installments.map((item) => item.fechaVencimiento), ['2026-12-30', '2027-01-30', '2027-02-28']);
});

test('formularios incompletos no generan cuotas inválidas ni montos cero', () => {
  for (const args of [[0, 2, '2026-01-01'], [100, 0, '2026-01-01'], [100, 61, '2026-01-01'], [100, 1.5, '2026-01-01'], [100, 2, ''], [100, 2, '2026-02-30'], [1, 2, '2026-01-01'], [NaN, 2, '2026-01-01']]) {
    assert.deepEqual(buildInstallments(...args), []);
  }
});

test('exportación expande las celdas agrupadas sin perder identidad ni duplicar columnas', () => {
  const essential = exportColumns(ESSENTIAL);
  for (const key of ['rut', 'nombre', 'plan', 'numeroContrato', 'tipoDocumento', 'numeroDocumento', 'saldoPendiente', 'estadoComercial', 'diasAtraso']) assert.ok(essential.includes(key));
  assert.ok(exportColumns([...ESSENTIAL, 'accion']).includes('accionSugerida'));
  const all = exportColumns(Object.keys(COLUMNS));
  assert.equal(new Set(all).size, all.length);
  assert.ok(exportColumns(OPERATIONAL).includes('fechaUltimaGestion'));
  assert.ok(exportColumns(OPERATIONAL).includes('responsableUltimaGestion'));
});

test('gestiones respetan deuda, atraso y servicio requerido', () => {
  const paid = { saldoPendiente: 0, diasAtraso: 0, idServicio: null };
  for (const action of ['agreement', 'extension', 'lastNotice', 'withdrawal']) assert.ok(actionDisabledReason(action, paid));
  assert.ok(actionDisabledReason('lastNotice', { ...paid, saldoPendiente: 2000 }));
  assert.equal(actionDisabledReason('lastNotice', { idFactura: 30, saldoPendiente: 2000, diasAtraso: 7, idServicio: 1 }), '');
  assert.equal(actionDisabledReason('event', paid), '');
  assert.equal(actionDisabledReason('charge', paid), '');
});

test('cliente sin factura permite contacto y cargos, y exige relaciones para otras gestiones', () => {
  const row = { idCliente: 10, idContrato: null, idFactura: null, idServicio: null, saldoPendiente: null, diasAtraso: null };
  assert.equal(actionDisabledReason('event', row), '');
  assert.equal(actionDisabledReason('charge', row), '');
  for (const action of ['agreement', 'extension', 'lastNotice', 'paymentDay', 'withdrawal']) assert.ok(actionDisabledReason(action, row));
  assert.equal(actionDisabledReason('paymentDay', { ...row, idContrato: 20 }), '');
  assert.equal(actionDisabledReason('withdrawal', { ...row, idServicio: 40 }), '');
  assert.equal(JSON.stringify(managementRelations(row)), '{"idCliente":10}');
  assert.equal(recordContext(row), 'Sin contrato · Sin facturas');
  assert.equal(recordContext({ ...row, idContrato: 20, numeroContrato: 'C-20' }), 'Contrato C-20 · Sin facturas');
});

test('las secciones conservan todas las gestiones y limitan sus columnas', () => {
  assert.equal(new Set(Object.values(VIEW_ACTIONS).flat()).size, 7);
  for (const view of Object.values(WORK_VIEWS)) {
    assert.ok(view.columns.includes('cliente'));
    assert.ok(view.columns.length <= 6);
    assert.ok(exportColumns([...view.columns]).includes('rut'));
  }
  assert.ok(!VIEW_ACTIONS.followup.includes('agreement'));
  assert.ok(!VIEW_ACTIONS.commitments.includes('withdrawal'));
  assert.ok(VIEW_ACTIONS.general.includes('charge'));
});
