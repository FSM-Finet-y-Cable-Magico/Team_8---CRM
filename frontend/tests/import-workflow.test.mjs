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
const preview = { formatVersion: 'LIBRO_CONTROL_HISTORICO_V2', totalRows: 10, readyRows: 8, rejectedRows: 2, skippedRows: 0, warningRows: 1, persisted: false,
  policy: 'Sin crear tickets a partir de anotaciones ambiguas.', rows: [{ rowNumber: 4, action: 'REVISAR', issues: ['RUT inválido'], warnings: [] }] };
const imported = { status: 'completada', importedRows: 8, rejectedRows: 2, skippedRows: 0, createdCustomers: 7, reusedCustomers: 1, errors: [{ rowNumber: 4, reason: 'RUT inválido' }] };
const upload = name => new File(['rut,nombre_completo,telefono,direccion\n'], name);
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');

async function harness(t, post = async path => ({ data: path.endsWith('/preview') ? preview : imported })) {
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
  return { tree, calls, selectFile, submit, refreshed: () => refreshed, text: () => text(tree.toJSON()), button: () => tree.root.findByProps({ type: 'submit' }),
    company: async () => { props = { ...props, writeCompanyId: 2 }; await act(async () => tree.update(React.createElement(Component, props))); },
  };
}

test('revisa sin escribir y exige una segunda acción para importar las filas elegibles', async t => {
  const h = await harness(t);
  assert.equal(h.button().props.disabled, true);
  await h.selectFile(upload('clientes.csv')); await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], '/imports/control-book/preview');
  assert.deepEqual(h.calls[0][2].params, { idEmpresa: 1, review: 'clients' });
  assert.equal(h.refreshed(), 0);
  assert.match(h.text(), /10 filas: .*8 listas/);
  assert.match(h.text(), /RUT inválido/);
  assert.equal(text(h.button()), 'Importar 8 filas revisadas');
  await h.submit();
  assert.equal(h.calls[1][0], '/imports/clients');
  assert.equal(h.calls[1][1].get('file').name, 'clientes.csv');
  assert.deepEqual(h.calls[1][2].params, { idEmpresa: 1 });
  assert.match(text(h.tree.root.findByProps({ role: 'status' })), /8 registros incorporados, 2 filas rechazadas/);
  assert.match(h.text(), /7 clientes nuevos y 1 historiales agregados/);
  assert.equal(h.refreshed(), 1);
  assert.equal(h.button().props.disabled, true);
});

test('una revisión sin filas elegibles impide la importación', async t => {
  const h = await harness(t, async () => ({ data: { ...preview, readyRows: 0, rejectedRows: 10 } }));
  await h.selectFile(upload('datos.xlsx')); await h.submit(); await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.refreshed(), 0);
});

test('un lote fallido no se presenta como importado ni refresca los datos', async t => {
  const h = await harness(t, async path => ({ data: path.endsWith('/preview') ? preview : { ...imported, status: 'fallida', importedRows: 0, rejectedRows: 5 } }));
  await h.selectFile(upload('datos.xlsx')); await h.submit(); await h.submit();
  assert.match(h.text(), /Importación no realizada/);
  assert.doesNotMatch(h.text(), /Importación completada/);
  assert.equal(h.refreshed(), 0);
});

test('errores conservan el archivo para reintentar y los formatos inválidos no se envían', async t => {
  let fail = true;
  const h = await harness(t, async path => { if (fail) throw Error('No se pudo revisar'); return { data: path.endsWith('/preview') ? preview : imported }; });
  for (const name of ['archivo.pdf', 'excel-antiguo.xls']) { await h.selectFile(upload(name)); await h.submit(); }
  assert.equal(h.calls.length, 0);
  await h.selectFile(upload('clientes.csv')); await h.submit();
  assert.match(h.text(), /No se pudo revisar/);
  assert.equal(h.button().props.disabled, false);
  fail = false; await h.submit();
  assert.equal(h.calls.length, 2);
  assert.doesNotMatch(h.text(), /Importación completada/);
  await h.submit();
  assert.match(h.text(), /Importación completada/);
});

for (const phase of ['revisión', 'importación']) test(`${phase} en curso bloquea duplicados y descarta respuestas de otra empresa`, async t => {
  let finish;
  let hold = false;
  const h = await harness(t, path => hold ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: path.endsWith('/preview') ? preview : imported }));
  await h.selectFile(upload('clientes.csv'));
  if (phase === 'importación') await h.submit();
  hold = true;
  let active; await act(async () => { active = h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(text(h.button()), phase === 'revisión' ? 'Revisando…' : 'Importando…');
  const count = h.calls.length;
  await h.submit(); assert.equal(h.calls.length, count);
  await h.company(); assert.equal(h.calls.at(-1)[2].signal.aborted, true);
  await act(async () => { finish({ data: phase === 'revisión' ? preview : imported }); await active; });
  assert.doesNotMatch(h.text(), /Importación completada|8 listas/);
  assert.equal(h.refreshed(), 0);
  assert.equal(h.button().props.disabled, true);
});

test('cambiar de archivo invalida la revisión anterior', async t => {
  const h = await harness(t);
  await h.selectFile(upload('uno.csv')); await h.submit();
  await h.selectFile(upload('dos.xlsx'));
  assert.equal(text(h.button()), 'Revisar archivo');
  await h.submit();
  assert.equal(h.calls[1][0], '/imports/control-book/preview');
  assert.equal(h.calls[1][1].get('file').name, 'dos.xlsx');
  assert.equal(h.refreshed(), 0);
});
