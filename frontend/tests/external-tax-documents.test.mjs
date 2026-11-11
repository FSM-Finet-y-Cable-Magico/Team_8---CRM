import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const compile = (file, mocks = {}) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  return exports;
};
const formTools = compile('../src/features/billing/external-tax-document-form.ts');
const messages = compile('../src/lib/user-facing-messages.ts');
const valid = { tipoDocumento: 'FACTURA', folioONumero: 'F-QA', emisorProveedor: 'Proveedor sintético', fechaEmision: '2026-11-11', montoTotal: '1190', montoNeto: '', montoExento: '', iva: '', estado: 'REGISTRADO', idCliente: '', idContrato: '', idFactura: '', idCargoAdicional: '', urlDocumento: '', referenciaExterna: '' };
const customers = [
  { idCliente: 10, idEmpresa: 1, nombreCompleto: 'Cliente QA', contratos: [{ idContrato: 31, idEmpresa: 1 }, { idContrato: 32, idEmpresa: 2 }] },
  { idCliente: 11, idEmpresa: 1, nombreCompleto: 'Otro QA', contratos: [{ idContrato: 33, idEmpresa: 1 }] },
];

async function render(t, options = {}) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited'); });
  const calls = [];
  const api = {
    get: async (path, config) => {
      calls.push(['get', path, config]);
      if (options.get) return options.get(path, config);
      if (path.includes('/history')) {
        const idCliente = Number(path.split('/')[4]);
        const idContrato = idCliente === 10 ? 30 + config.params.idEmpresa : 33;
        return { data: { idCliente, invoices: [{ idFactura: idCliente + 100, idContrato, fechaEmision: '2026-11-01', saldo: 1190 }] } };
      }
      if (path.startsWith('/billing/invoices/')) return { data: { idFactura: 110, idContrato: 31, contrato: { idEmpresa: 1, cliente: { idCliente: 10 } }, cargos: [{ idCargo: 51, tipo: 'RECONEXION', monto: '500', estado: 'PENDIENTE_FACTURACION' }] } };
      return { data: { items: options.documents ?? [], pagination: { totalRows: (options.documents ?? []).length } } };
    },
    post: async (...args) => { calls.push(['post', ...args]); return options.post ? options.post(...args) : { data: {} }; },
    patch: async (...args) => { calls.push(['patch', ...args]); return { data: {} }; },
  };
  const { ExternalTaxDocumentsPanel } = compile('../src/features/billing/ExternalTaxDocumentsPanel.tsx', {
    '../../api': { api, apiErrorMessage: error => messages.userFacingApiError(error.response?.data?.message, '/external-tax-documents', error.response?.status) },
    '../../lib': { formatDateOnly: value => value?.slice(0, 10) },
    '../../shared/components': { StatusBadge: ({ value }) => value, TablePagination: () => null },
    './external-tax-document-form': formTools,
  });
  let tree;
  const props = { customers, scope: '1', writeCompanyId: 1, canManage: true, ...options.props };
  await act(async () => { tree = create(React.createElement(ExternalTaxDocumentsPanel, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const field = label => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label));
  const change = async (label, value, type = 'input') => act(async () => field(label).findByType(type).props.onChange({ target: { value } }));
  const fill = async () => { for (const [label, value] of [['Folio/', valid.folioONumero], ['Emisor/', valid.emisorProveedor], ['Fecha', valid.fechaEmision], ['Monto total', valid.montoTotal]]) await change(label, value); };
  const submit = () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
  return { tree, calls, field, change, fill, submit, update: async changes => act(async () => tree.update(React.createElement(ExternalTaxDocumentsPanel, { ...props, ...changes }))) };
}

test('valida importes, fecha fiscal y referencias CRM sin aceptar operación bancaria como ID', () => {
  assert.deepEqual(formTools.validateExternalDocumentForm(valid), {});
  for (const [field, value] of [['idFactura', '987654321012'], ['fechaEmision', '2026-02-30'], ['montoTotal', ''], ['montoNeto', '-1'], ['iva', '1.001'], ['urlDocumento', 'https://user:private@example.test']]) {
    assert.ok(formTools.validateExternalDocumentForm({ ...valid, [field]: value })[field]);
  }
  assert.ok(formTools.validateExternalDocumentForm({ ...valid, montoNeto: '1000', montoExento: '0', iva: '100' }).montoTotal);
});

test('documento externo sin cliente omite vínculos y componentes; no crea pago ni emisión', async t => {
  const ctx = await render(t);
  await ctx.fill();
  await act(async () => ctx.submit());
  const posts = ctx.calls.filter(call => call[0] === 'post');
  assert.equal(posts.length, 1);
  assert.equal(posts[0][1], '/external-tax-documents');
  assert.equal(posts[0][2].idCliente, undefined);
  assert.equal(posts[0][2].montoNeto, undefined);
  assert.equal(posts[0][2].montoTotal, 1190);
  assert.match(textOf(ctx.tree.toJSON()), /no emite documentos tributarios/);
  assert.ok(!ctx.calls.some(call => /payments|tax-documents\/payments/.test(call[1])));
});

test('selecciona factura y cargo reales y limpia todos los IDs dependientes al cambiar cliente', async t => {
  const ctx = await render(t);
  await ctx.change('Cliente opcional', '10', 'select');
  const invoiceSelect = ctx.field('Factura CRM opcional').findByType('select');
  assert.deepEqual(invoiceSelect.findAllByType('option').map(option => option.props.value), ['', 110]);
  assert.match(textOf(invoiceSelect), /contrato 31.*saldo/);
  assert.equal(ctx.field('Factura CRM opcional').findAllByType('input').length, 0);
  await ctx.change('Factura CRM opcional', '110', 'select');
  assert.equal(ctx.field('Contrato opcional').findByType('select').props.value, '31');
  assert.deepEqual(ctx.field('Cargo opcional').findByType('select').findAllByType('option').map(option => option.props.value), ['', 51]);
  await ctx.change('Cargo opcional', '51', 'select');
  await ctx.change('Cliente opcional', '11', 'select');
  for (const label of ['Contrato opcional', 'Factura CRM opcional', 'Cargo opcional']) assert.equal(ctx.field(label).findByType('select').props.value, '');
});

test('cambio de empresa elimina referencias y nunca ofrece contratos ajenos', async t => {
  const ctx = await render(t);
  await ctx.change('Cliente opcional', '10', 'select');
  await ctx.change('Factura CRM opcional', '110', 'select');
  await ctx.update({ scope: '2', writeCompanyId: 2 });
  assert.equal(ctx.field('Cliente opcional').findByType('select').props.value, '');
  await ctx.change('Cliente opcional', '10', 'select');
  assert.deepEqual(ctx.field('Contrato opcional').findByType('select').findAllByType('option').map(option => option.props.value), ['', 32]);
});

test('una respuesta tardía de historial anterior no reemplaza las opciones del cliente actual', async t => {
  let previous;
  const ctx = await render(t, { get: async path => {
    if (path.includes('/customers/10/')) return new Promise(resolve => { previous = resolve; });
    if (path.includes('/customers/11/')) return { data: { idCliente: 11, invoices: [{ idFactura: 111, idContrato: 33, fechaEmision: null, saldo: 0 }] } };
    return { data: { items: [], pagination: { totalRows: 0 } } };
  } });
  await ctx.change('Cliente opcional', '10', 'select');
  await ctx.change('Cliente opcional', '11', 'select');
  await act(async () => previous({ data: { idCliente: 10, invoices: [{ idFactura: 999, idContrato: 31 }] } }));
  assert.deepEqual(ctx.field('Factura CRM opcional').findByType('select').findAllByType('option').map(option => option.props.value), ['', 111]);
});

test('doble submit no duplica registro mientras la primera petición está pendiente', async t => {
  let finish;
  const ctx = await render(t, { post: () => new Promise(resolve => { finish = resolve; }) });
  await ctx.fill();
  let first;
  await act(async () => { first = ctx.submit(); void ctx.submit(); });
  assert.equal(ctx.calls.filter(call => call[0] === 'post').length, 1);
  await act(async () => { finish({ data: {} }); await first; });
});

for (const [status, message] of [[400, ['idFactura debe identificar una factura CRM existente; no una referencia bancaria']], [403, 'El documento pertenece a otra empresa'], [409, 'Ya existe un documento con el mismo tipo, emisor y folio en esta empresa']]) {
  test(`HTTP ${status} conserva mensaje específico seguro sin afirmar que guardó`, async t => {
    const ctx = await render(t, { post: async () => { throw { response: { status, data: { message } } }; } });
    await ctx.fill(); await act(async () => ctx.submit());
    const text = textOf(ctx.tree.toJSON());
    assert.ok(text.includes(Array.isArray(message) ? message[0] : message));
    assert.ok(!text.includes('Documento tributario externo registrado.'));
  });
}

test('rol sin gestión no muestra ni ejecuta el formulario', async t => {
  const ctx = await render(t, { props: { canManage: false } });
  assert.equal(ctx.tree.root.findAllByType('form').length, 0);
  assert.equal(ctx.calls.filter(call => call[0] === 'post').length, 0);
});
