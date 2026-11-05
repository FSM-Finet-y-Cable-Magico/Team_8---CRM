import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/customers/customer-services-state.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
new Function('exports', outputText)(exports);
const { CustomerServicesRequestGate, contractManagementTarget, serviceForContract } = exports;

const activeService = {
  idServicio: 3,
  idContrato: 22,
  estadoOperativo: 'Activo',
};

test('la primera apertura espera la carga y luego abre consistentemente el servicio activo', () => {
  assert.deepEqual(contractManagementTarget(22, [], 'loading'), { kind: 'loading' });
  assert.deepEqual(contractManagementTarget(22, [activeService], 'success'), { kind: 'service', serviceId: 3 });
});

test('una carga lenta o fallida no se interpreta como contrato sin servicio', () => {
  assert.deepEqual(contractManagementTarget(22, [], 'idle'), { kind: 'loading' });
  assert.deepEqual(contractManagementTarget(22, [], 'error'), { kind: 'error' });
});

test('un contrato firmado sin servicio gestionable conserva el workflow de contratacion', () => {
  assert.deepEqual(contractManagementTarget(22, [], 'empty'), { kind: 'contract', serviceId: null });
  assert.deepEqual(
    contractManagementTarget(22, [{ ...activeService, estadoOperativo: 'Pendiente Instalacion' }], 'success'),
    { kind: 'contract', serviceId: 3 },
  );
});

test('si un contrato tiene varios servicios prioriza el servicio gestionable', () => {
  const pending = { ...activeService, idServicio: 2, estadoOperativo: 'Pendiente Instalacion' };
  assert.equal(serviceForContract(22, [pending, activeService]).idServicio, 3);
  assert.deepEqual(contractManagementTarget(22, [pending, activeService], 'success'), { kind: 'service', serviceId: 3 });
});

test('el cambio rapido de cliente aborta y descarta la respuesta anterior fuera de orden', () => {
  const gate = new CustomerServicesRequestGate();
  const first = gate.begin(34);
  const second = gate.begin(35);

  assert.equal(first.signal.aborted, true);
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(second.customerId, 35);
});

test('cancelar al desmontar impide aplicar una respuesta tardia', () => {
  const gate = new CustomerServicesRequestGate();
  const request = gate.begin(34);
  gate.cancel();

  assert.equal(request.signal.aborted, true);
  assert.equal(gate.isCurrent(request), false);
});
