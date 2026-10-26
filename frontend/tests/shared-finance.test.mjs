import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const customers = [
  { idCliente: 10, idEmpresa: 1, nombreCompleto: 'Compartido QA', contratos: [{ idContrato: 31, idEmpresa: 1 }, { idContrato: 32, idEmpresa: 2 }] },
  { idCliente: 11, idEmpresa: 1, nombreCompleto: 'Exclusivo uno', contratos: [] },
  { idCliente: 12, idEmpresa: 2, nombreCompleto: 'Exclusivo dos', contratos: [] },
];

async function render(t, company, fixedCustomerId) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited'); });
  const source = readFileSync(new URL('../src/features/billing/ExternalTaxDocumentsPanel.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const calls = [];
  const api = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (...args) => {
    calls.push([method, ...args]); return { data: { items: [], pagination: { totalRows: 0 } } };
  }]));
  const mocks = { '../../api': { api, apiErrorMessage: () => 'QA error' }, '../../lib': { formatDateOnly: value => value },
    '../../shared/components': { StatusBadge: () => null, TablePagination: () => null } };
  const exports = {};
  new Function('require', 'exports', outputText)(name => mocks[name] ?? require(name), exports);
  let tree;
  await act(async () => { tree = create(React.createElement(exports.ExternalTaxDocumentsPanel, {
    customers, scope: String(company), writeCompanyId: company, canManage: true, fixedCustomerId,
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const select = label => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label)).findByType('select');
  return { tree, calls, select };
}

for (const company of [1, 2]) {
  test(`documentos empresa ${company}: cliente compartido seleccionable sin contratos ajenos`, async t => {
    const before = structuredClone(customers);
    const ctx = await render(t, company);
    const customerSelect = ctx.select('Cliente opcional');
    const ids = customerSelect.findAllByType('option').map(o => o.props.value);
    assert.deepEqual(ids, ['', 10, 10 + company]);
    await act(async () => customerSelect.props.onChange({ target: { value: '10' } }));
    const contractSelect = ctx.select('Contrato opcional');
    assert.deepEqual(contractSelect.findAllByType('option').map(o => o.props.value), ['', 30 + company]);
    await act(async () => contractSelect.props.onChange({ target: { value: String(30 + company) } }));
    await act(async () => ctx.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    const posted = ctx.calls.find(c => c[0] === 'post');
    assert.equal(posted[1], '/external-tax-documents');
    assert.equal(posted[2].idEmpresa, company);
    assert.equal(posted[2].idCliente, 10);
    assert.equal(posted[2].idContrato, 30 + company);
    assert.deepEqual(customers, before);
  });
}

test('documentos desde Libro Control conservan cliente fijo compartido y contrato autorizado', async t => {
  const ctx = await render(t, 2, 10);
  assert.deepEqual(ctx.select('Contrato opcional').findAllByType('option').map(o => o.props.value), ['', 32]);
  assert.equal(ctx.calls[0][2].params.idEmpresa, 2);
  assert.equal(ctx.calls[0][2].params.idCliente, 10);
});
