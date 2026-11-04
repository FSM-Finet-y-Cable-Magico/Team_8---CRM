import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { File } from 'node:buffer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const output = ts.transpileModule(readFileSync(new URL('../src/features/import/ImportPanel.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const imported = { status: 'completada', importedRows: 8, rejectedRows: 2, errors: [{ rowNumber: 4, reason: 'RUT ya existe en base de datos' }] };
const upload = name => new File(['rut,nombre_completo,telefono,direccion,tipo_registro\n'], name);
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');

async function harness(t, post = async () => ({ data: imported })) {
  t.mock.method(globalThis, 'fetch', () => { throw Error('Real traffic prohibited'); });
  const calls = []; let refreshed = 0;
  const mocks = { '../../api': { api: { post: (...args) => { calls.push(args); return post(...args); } }, apiErrorMessage: error => error.message } };
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  const Component = exports.ImportPanel;
  let props = { writeCompanyId: 1, onImported: () => { refreshed++; } };
  let tree; await act(async () => { tree = create(React.createElement(Component, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const selectFile = async file => { await act(async () => tree.root.findByType('input').props.onChange({ target: { files: file ? [file] : [] } })); };
  const submit = async () => { await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} })); };
  return { tree, calls, selectFile, submit, refreshed: () => refreshed, text: () => JSON.stringify(tree.toJSON()), button: () => tree.root.findByType('button'),
    company: async () => { props = { ...props, writeCompanyId: 2 }; await act(async () => tree.update(React.createElement(Component, props))); },
  };
}

test('tarjeta unica de clientes y prospectos conserva el endpoint y muestra filas rechazadas', async t => {
  const h = await harness(t);
  assert.equal(h.tree.root.findAllByType('form').length, 1);
  assert.equal(h.tree.root.findAllByType('input').length, 1);
  assert.equal(h.tree.root.findAllByType('select').length, 0);
  assert.doesNotMatch(h.text(), /Libro de control|preview|Hoja a revisar|Contenido del archivo/);
  assert.equal(text(h.button()), 'Importar');
  assert.equal(h.button().props.disabled, true);
  await h.selectFile(upload('clientes.csv')); await h.submit();
  assert.equal(h.calls[0][0], '/imports/clients');
  assert.equal(h.calls[0][1].get('file').name, 'clientes.csv');
  assert.deepEqual(h.calls[0][2].params, { idEmpresa: 1 });
  assert.match(text(h.tree.root.findByProps({ role: 'status' })), /8 registros importados y 2 filas rechazadas/);
  assert.match(h.text(), /RUT ya existe/);
  assert.equal(h.refreshed(), 1);
  assert.equal(h.button().props.disabled, true);
});

test('un lote fallido no se presenta como importado ni refresca los datos', async t => {
  const h = await harness(t, async () => ({ data: { ...imported, status: 'fallida', importedRows: 0, rejectedRows: 5 } }));
  await h.selectFile(upload('datos.xlsx')); await h.submit();
  assert.match(h.text(), /Importación no realizada/);
  assert.doesNotMatch(h.text(), /Importación completada/);
  assert.equal(h.refreshed(), 0);
});

test('errores conservan el archivo para reintentar y los formatos invalidos no se envian', async t => {
  let fail = true;
  const h = await harness(t, async () => { if (fail) throw Error('No se pudo importar'); return { data: imported }; });
  for (const name of ['archivo.pdf', 'excel-antiguo.xls']) { await h.selectFile(upload(name)); await h.submit(); }
  assert.equal(h.calls.length, 0);
  await h.selectFile(upload('clientes.csv')); await h.submit();
  assert.match(h.text(), /No se pudo importar/);
  assert.equal(h.button().props.disabled, false);
  fail = false; await h.submit();
  assert.equal(h.calls.length, 2);
  assert.match(h.text(), /Importación completada/);
});

test('envio en curso bloquea duplicados y descarta respuestas de otra empresa', async t => {
  let finish; const h = await harness(t, () => new Promise(resolve => { finish = resolve; }));
  await h.selectFile(upload('clientes.csv'));
  let active; await act(async () => { active = h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(text(h.button()), 'Importando…');
  await h.submit(); assert.equal(h.calls.length, 1);
  await h.company(); assert.equal(h.calls[0][2].signal.aborted, true);
  await act(async () => { finish({ data: imported }); await active; });
  assert.doesNotMatch(h.text(), /Importación completada/);
  assert.equal(h.refreshed(), 0);
  assert.equal(h.button().props.disabled, true);
});
