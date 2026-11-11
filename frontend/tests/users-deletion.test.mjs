import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/users/UsersPanel.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;

async function setup(t, fail = false) {
  const calls = [];
  const api = {
    delete: async path => { calls.push(['delete', path]); if (fail) throw Error('No se pudo eliminar'); },
    patch: async (path, data) => { calls.push(['patch', path, data]); },
  };
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../shared/components': {
      StatusBadge: ({ value }) => React.createElement('span', null, value),
      Modal: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null,
    },
    '../../shared/hooks/useTransientMessage': { useTransientMessage: () => {
      const [message, showMessage] = React.useState('');
      return { message, showMessage, clearMessage: () => showMessage('') };
    } },
  };
  const exports = {};
  new Function('require', 'exports', compiled)(name => mocks[name] ?? require(name), exports);
  const tree = create(React.createElement(exports.UsersPanel, {
    users: [{ idUsuario: 2, nombreCompleto: 'Usuario de prueba', email: 'qa@example.invalid',
      activo: true, idEmpresa: 1, roles: [{ idRol: 2, nombreRol: 'Comercial' }] }],
    roles: [], companies: [], currentUserId: 1, onUpdated() {},
  }));
  t.after(() => act(() => tree.unmount()));
  return { tree, calls };
}

test('eliminar retira la fila tras confirmar aunque la recarga aún conserve los datos anteriores', async t => {
  const { tree, calls } = await setup(t);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Eliminar a Usuario de prueba' }).props.onClick());
  assert.equal(calls.length, 0);
  await act(async () => tree.root.findAllByType('button').find(node => node.props.className === 'user-delete-confirm').props.onClick());
  assert.deepEqual(calls, [['delete', '/users/2']]);
  assert.equal(tree.root.findAllByType('tbody')[0].findAllByType('tr').length, 0);
});

test('un fallo de eliminación conserva la fila y muestra el error', async t => {
  const { tree } = await setup(t, true);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Eliminar a Usuario de prueba' }).props.onClick());
  await act(async () => tree.root.findByProps({ className: 'user-delete-confirm' }).props.onClick());
  assert.equal(tree.root.findAllByType('tbody')[0].findAllByType('tr').length, 1);
  assert.match(JSON.stringify(tree.toJSON()), /No se pudo eliminar/);
});

test('el toggle desactiva al usuario y conserva su fila', async t => {
  const { tree, calls } = await setup(t);
  await act(async () => tree.root.findByProps({ role: 'switch' }).props.onClick());
  assert.equal(calls[0][0], 'patch');
  assert.equal(calls[0][2].activo, false);
  assert.equal(tree.root.findAllByType('tbody')[0].findAllByType('tr').length, 1);
});
