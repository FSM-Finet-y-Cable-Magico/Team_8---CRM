import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node?.children ?? []).map(textOf).join('');
const prospect = { idProspecto: 4, idCliente: 10, empresa: { idEmpresa: 1, nombre: 'FiNet' }, excliente: { situacionFinanciera: 'SIN_DEUDA' } };
async function harness(t, { debt = 'SIN_DEUDA', get } = {}) {
  const calls = []; let changed = 0;
  const CustomerPlanForm = () => React.createElement('section', null, 'Cotización existente');
  const api = { get: async (...args) => { calls.push(args); return get ? get(...args) : { data: args[0].startsWith('/customers/') ? { idCliente: 10 } : [] }; } };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/features/prospects/ReturningCustomerActions.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => name === '../../api' ? { api, apiErrorMessage: e => e.message }
    : name === '../customers/CustomerPlanForm' ? { CustomerPlanForm } : require(name), exports);
  let tree;
  await act(async () => { tree = create(React.createElement(exports.ReturningCustomerActions, {
    prospect: { ...prospect, excliente: { situacionFinanciera: debt } }, plans: [{ idPlan: 1, idEmpresa: 1 }, { idPlan: 2, idEmpresa: 2 }], onChanged: () => changed++,
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const click = () => act(async () => tree.root.findByType('button').props.onClick());
  return { tree, calls, click, CustomerPlanForm, changed: () => changed, text: () => textOf(tree.toJSON()) };
}
test('excliente sin deuda reutiliza identidad, acota empresa y abre el flujo existente sin crear contrato al leer', async t => {
  const h = await harness(t);
  await h.click();
  assert.deepEqual(h.calls.map(([path, options]) => [path, options.params]), [
    ['/customers/10', { scope: '1' }], ['/services/customer/10', { scope: '1' }],
  ]);
  const form = h.tree.root.findByType(h.CustomerPlanForm);
  assert.equal(form.props.customer.idCliente, 10);
  assert.equal(form.props.initialCompanyId, 1);
  assert.deepEqual(form.props.plans.map(p => p.idPlan), [1]);
  assert.equal(h.changed(), 0);
  await act(async () => form.props.onCreated({ idContrato: 20 }));
  assert.equal(h.changed(), 1);
});
for (const debt of ['CON_DEUDA', 'SALDO_POR_REVISAR', undefined]) {
  test(`saldo ${debt ?? 'desconocido'} no habilita contratar ni consulta datos`, async t => {
    const h = await harness(t, { debt: debt ?? null });
    assert.equal(h.tree.root.findByType('button').props.disabled, true);
    await h.click(); assert.deepEqual(h.calls, []);
  });
}
test('un cliente distinto en la respuesta no abre una contratación para la identidad equivocada', async t => {
  const h = await harness(t, { get: async path => ({ data: path.startsWith('/customers/') ? { idCliente: 11 } : [] }) });
  await h.click();
  assert.match(h.text(), /no corresponde al excliente/);
  assert.equal(h.tree.root.findAllByType(h.CustomerPlanForm).length, 0);
});
