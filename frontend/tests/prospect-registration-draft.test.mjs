import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const user = { idUsuario: 1, idEmpresa: 1, nombreCompleto: 'Administrador QA', email: 'qa@example.invalid', roles: ['Administrador'] };
const companies = [{ idEmpresa: 1, nombre: 'Empresa QA 1' }, { idEmpresa: 2, nombre: 'Empresa QA 2' }];
const fields = {
  '12345678-5': '12345678-5',
  'Nombre Apellido': 'Prospecto de prueba',
  'correo@ejemplo.cl': 'prospecto@example.invalid',
  '+56912345678': '+56912345678',
  'Av. Siempre Viva 123, Comuna': 'Av. de Prueba 123',
  Comuna: 'La Florida',
  Region: 'Metropolitana de Santiago',
};
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');

async function harness(t, post = async () => ({ data: { idProspecto: 101 } })) {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  const storage = new Map([['finet_user', JSON.stringify(user)], ['finet_token', 'test-only']]);
  const listeners = new Map();
  globalThis.window = {
    setTimeout, clearTimeout,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  t.mock.method(globalThis, 'fetch', () => { throw new Error('External traffic prohibited in tests'); });
  const calls = [];
  const api = {
    get: async path => ({ data: path === '/companies' ? companies : path === '/companies/summary' ? { empresas: companies, metricas: {} } : path === '/billing/overview' ? null : [] }),
    post: (...args) => { calls.push(args); return post(...args); },
  };
  const CoveragePicker = () => null;
  const mocks = new Map([
    [resolve(sourceRoot, 'api.ts'), { api, apiErrorMessage: error => error.message }],
    [resolve(sourceRoot, 'shared/components/index.ts'), { Modal: () => null, TablePagination: () => null, ToastNotice: ({ message }) => message ? React.createElement('aside', { role: 'status', 'data-testid': 'toast' }, message) : null }],
    [resolve(sourceRoot, 'features/coverage/index.tsx'), { CoveragePicker, CoverageZonesPanel: () => null }],
    [resolve(sourceRoot, 'features/auth/index.ts'), { LoginScreen: ({ onLogin }) => React.createElement('button', { onClick: () => onLogin(user) }, 'Iniciar sesión de prueba') }],
  ]);
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (mocks.has(path)) return mocks.get(path);
    if (cache.has(path)) return cache.get(path);
    if (path.includes(`${resolve(sourceRoot, 'features')}`) && !['ProspectsPanel.tsx', 'index.ts'].some(name => path === resolve(sourceRoot, 'features/prospects', name))) {
      return new Proxy({}, { get: () => () => null });
    }
    const exports = {};
    cache.set(path, exports);
    const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'exports', output)(name => {
      if (!name.startsWith('.')) return require(name);
      if (name.endsWith('.css')) return {};
      const base = resolve(dirname(path), name);
      const target = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map(extension => base + extension).find(existsSync);
      if (!target) throw new Error(`Unresolved dependency: ${name}`);
      return load(target);
    }, exports);
    return exports;
  }
  const { default: App } = load(resolve(sourceRoot, 'App.tsx'));
  let tree;
  const mount = async () => { await act(async () => { tree = create(React.createElement(App)); }); };
  await mount();
  t.after(async () => {
    await act(async () => tree.unmount());
    globalThis.window = previousWindow;
    globalThis.localStorage = previousStorage;
  });
  const button = label => tree.root.findAllByType('button').find(node => text(node).trim() === label);
  const click = async label => { await act(async () => button(label).props.onClick()); };
  const input = placeholder => ['Region', 'Comuna'].includes(placeholder) ? tree.root.findByProps({ 'aria-label': placeholder === 'Region' ? 'Región' : 'Comuna' }) : tree.root.findByProps({ placeholder });
  const change = async (placeholder, value) => { await act(async () => input(placeholder).props.onChange({ target: { value } })); };
  const fill = async () => {
    for (const [placeholder, value] of Object.entries(fields)) await change(placeholder, value);
    await act(async () => tree.root.findByProps({ 'aria-label': 'Origen de contacto' }).props.onChange({ target: { value: 'Referido' } }));
  };
  await click('Prospectos');
  return {
    calls, input, change, click, fill, storage,
    tree: () => tree,
    submit: async () => { await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} })); },
    startSubmit: async () => { let pending; await act(async () => { pending = tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); return { pending }; },
    navigate: async () => { await click('Clientes'); await click('Prospectos'); },
    company: async id => { await act(async () => tree.root.findByProps({ 'aria-label': 'Seleccionar empresa' }).props.onChange({ target: { value: String(id) } })); },
    point: async value => { await act(async () => tree.root.findByType(CoveragePicker).props.onChange(value)); },
    location: () => tree.root.findByType(CoveragePicker).props.value,
    reload: async () => { await act(async () => tree.unmount()); await mount(); await click('Prospectos'); },
    expire: async () => { await act(async () => listeners.get('finet:auth-expired')()); },
  };
}

test('conserva el RUT escrito sin guion al ir a Cobertura y regresar a Prospectos', async t => {
  const h = await harness(t);
  await h.change('12345678-5', '123456785');
  await h.click('Cobertura');
  await h.click('Prospectos');
  assert.equal(h.input('12345678-5').props.value, '12345678-5');
  assert.equal(h.input('Nombre Apellido').props.value, '');
  assert.equal(h.calls.length, 0);
});

test('el campo RUT impide agregar más de nueve caracteres y permite corregirlos', async t => {
  const h = await harness(t);
  await h.change('12345678-5', '123456785');
  assert.equal(h.input('12345678-5').props.value, '12345678-5');
  await h.change('12345678-5', '12345678-59');
  assert.equal(h.input('12345678-5').props.value, '12345678-5');
  await h.change('12345678-5', '123945678-5');
  assert.equal(h.input('12345678-5').props.value, '12345678-5');
  await h.change('12345678-5', '12.345.678-k');
  assert.equal(h.input('12345678-5').props.value, '12345678-K');
  await h.change('12345678-5', '12345678');
  assert.equal(h.input('12345678-5').props.value, '1234567-8');
  await h.change('12345678-5', '');
  assert.equal(h.input('12345678-5').props.value, '');
});

test('celular agrega +569 al escribir, reconoce números pegados y conserva el valor al navegar', async t => {
  const h = await harness(t);
  const phone = '+56912345678';
  for (const firstDigit of ['0', '5', '6', '9']) {
    await h.change(phone, firstDigit);
    assert.equal(h.input(phone).props.value, '+569' + firstDigit);
  }
  await h.change(phone, '6');
  for (const digit of '1234567') await h.change(phone, h.input(phone).props.value + digit);
  assert.equal(h.input(phone).props.value, '+56961234567');
  await h.navigate();
  assert.equal(h.input(phone).props.value, '+56961234567');
  for (const pasted of ['61234567', '961234567', '56961234567', '+56 9 6123-4567']) {
    await h.change(phone, pasted);
    assert.equal(h.input(phone).props.value, '+56961234567');
  }
  await h.change(phone, '9');
  for (const digit of '61234567') await h.change(phone, h.input(phone).props.value + digit);
  assert.equal(h.input(phone).props.value, '+56961234567');
  await h.change(phone, '+569');
  await h.change(phone, '+56');
  assert.equal(h.input(phone).props.value, '');
  await h.change(phone, '');
  assert.equal(h.input(phone).props.value, '');
});

test('conserva todos los campos, origen y ubicación al cambiar de apartado del CRM', async t => {
  const h = await harness(t);
  await h.fill();
  const point = { latitud: -33.58, longitud: -70.63 };
  await h.point(point);
  await h.navigate();
  for (const [placeholder, value] of Object.entries(fields)) assert.equal(h.input(placeholder).props.value, value);
  assert.equal(h.tree().root.findByProps({ 'aria-label': 'Origen de contacto' }).props.value, 'Referido');
  assert.deepEqual(h.location(), point);
  assert.equal(h.calls.length, 0, 'navegar no registra el prospecto');
  assert.deepEqual([...h.storage.keys()].sort(), ['finet_token', 'finet_user']);
});

test('al recargar la aplicación se descarta el borrador sin afectar la sesión autenticada', async t => {
  const h = await harness(t);
  await h.fill();
  await h.point({ latitud: -33.58, longitud: -70.63 });
  await h.reload();
  for (const placeholder of Object.keys(fields)) assert.equal(h.input(placeholder).props.value, '');
  assert.equal(h.location(), null);
  assert.equal(h.tree().root.findByProps({ 'aria-label': 'Origen de contacto' }).props.value, 'Formulario web');
});

test('mantiene un borrador independiente por empresa y vuelve a recuperar el anterior', async t => {
  const h = await harness(t);
  await h.fill();
  await h.point({ latitud: -33.58, longitud: -70.63 });
  await h.company(2);
  assert.equal(h.input('Nombre Apellido').props.value, '');
  assert.equal(h.location(), null);
  await h.change('Nombre Apellido', 'Prospecto de otra empresa');
  await h.company(1);
  assert.equal(h.input('Nombre Apellido').props.value, fields['Nombre Apellido']);
  assert.deepEqual(h.location(), { latitud: -33.58, longitud: -70.63 });
  await h.company(2);
  assert.equal(h.input('Nombre Apellido').props.value, 'Prospecto de otra empresa');
});

test('un registro exitoso limpia el borrador y conserva el envío correcto a la API', async t => {
  const h = await harness(t);
  await h.fill();
  await h.point({ latitud: -33.58, longitud: -70.63 });
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], '/prospects');
  assert.equal(h.calls[0][1].idEmpresa, 1);
  assert.equal(h.calls[0][1].nombreCompleto, fields['Nombre Apellido']);
  assert.equal(h.calls[0][1].telefono, fields['+56912345678']);
  assert.deepEqual(h.calls[0][1].ubicacion, { latitud: -33.58, longitud: -70.63 });
  await h.navigate();
  for (const placeholder of Object.keys(fields)) assert.equal(h.input(placeholder).props.value, '');
  assert.equal(h.location(), null);
});

test('errores de validación o guardado conservan los datos al salir y regresar', async t => {
  const h = await harness(t, async () => { throw new Error('No se pudo registrar'); });
  await h.change('Nombre Apellido', fields['Nombre Apellido']);
  await h.submit();
  assert.equal(h.calls.length, 0);
  await h.navigate();
  assert.equal(h.input('Nombre Apellido').props.value, fields['Nombre Apellido']);
  await h.fill();
  await h.submit();
  await h.navigate();
  for (const [placeholder, value] of Object.entries(fields)) assert.equal(h.input(placeholder).props.value, value);
});

test('cambiar la dirección invalida la ubicación conservada', async t => {
  const h = await harness(t);
  await h.fill();
  await h.point({ latitud: -33.58, longitud: -70.63 });
  await h.navigate();
  await h.change('Av. Siempre Viva 123, Comuna', 'Av. de Prueba 456');
  assert.equal(h.location(), null);
});

test('navegar durante un registro mantiene el bloqueo y evita un segundo envío', async t => {
  let finish;
  const h = await harness(t, () => new Promise(resolve => { finish = resolve; }));
  await h.fill();
  const { pending } = await h.startSubmit();
  await h.navigate();
  assert.equal(h.input('Nombre Apellido').props.disabled, true);
  await h.submit();
  assert.equal(h.calls.length, 1);
  await act(async () => { finish({ data: { idProspecto: 101 } }); await pending; });
  assert.equal(h.input('Nombre Apellido').props.value, '');
  assert.equal(h.input('Nombre Apellido').props.disabled, false);
});

test('la respuesta de otra empresa limpia solamente el borrador del registro enviado', async t => {
  let finish;
  const h = await harness(t, () => new Promise(resolve => { finish = resolve; }));
  await h.fill();
  const { pending } = await h.startSubmit();
  await h.company(2);
  await h.change('Nombre Apellido', 'Borrador de segunda empresa');
  await act(async () => { finish({ data: { idProspecto: 101 } }); await pending; });
  assert.equal(h.input('Nombre Apellido').props.value, 'Borrador de segunda empresa');
  await h.company(1);
  assert.equal(h.input('Nombre Apellido').props.value, '');
});

test('cerrar sesión o expirar el acceso elimina los borradores de la sesión anterior', async t => {
  const h = await harness(t);
  await h.fill();
  await h.click('Cerrar sesión');
  await h.click('Iniciar sesión de prueba');
  await h.click('Prospectos');
  assert.equal(h.input('Nombre Apellido').props.value, '');
  await h.fill();
  await h.expire();
  await h.click('Iniciar sesión de prueba');
  await h.click('Prospectos');
  assert.equal(h.input('Nombre Apellido').props.value, '');
});


test('crear un prospecto muestra un aviso global breve y desaparece a los tres segundos', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await harness(t);
  await h.fill(); await h.submit();
  assert.equal(h.tree().root.findByProps({ 'data-testid': 'toast' }).props.children, 'Prospecto creado');
  await h.click('Cobertura');
  assert.equal(h.tree().root.findByProps({ 'data-testid': 'toast' }).props.children, 'Prospecto creado');
  await act(async () => t.mock.timers.tick(2999));
  assert.equal(h.tree().root.findAllByProps({ 'data-testid': 'toast' }).length, 1);
  await act(async () => t.mock.timers.tick(1));
  assert.equal(h.tree().root.findAllByProps({ 'data-testid': 'toast' }).length, 0);
});
