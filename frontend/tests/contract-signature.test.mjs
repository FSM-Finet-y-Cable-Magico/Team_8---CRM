import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const output = ts.transpileModule(readFileSync(new URL('../src/features/contracts/PublicSignaturePage.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const text = n => typeof n === 'string' ? n : (n.children ?? []).map(text).join('');
async function harness(t, { invalid = false, tampered = false } = {}) {
  const token = randomBytes(32).toString('base64url'), pdf = Buffer.from('%PDF-fixture-only');
  const hash = createHash('sha256').update(pdf).digest('hex');
  let signed = false; const calls = [], downloads = [], historyCalls = [];
  const old = Object.fromEntries(['window','location','history','document','fetch'].map(k => [k, globalThis[k]]));
  const location = { hash: invalid ? '#bad' : '#' + token, pathname: '/firmar' };
  globalThis.window = { location }; globalThis.location = location;
  globalThis.history = { replaceState: (...args) => historyCalls.push(args) };
  globalThis.document = { createElement: () => ({ click() { downloads.push(this.download); } }) };
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body });
    if (url.endsWith('/pdf')) return new Response(tampered ? Buffer.from('%PDF-wrong') : pdf);
    if (url.endsWith('/sign')) signed = true;
    return new Response(JSON.stringify(url.endsWith('/view') ? { estado: signed ? 'FIRMADA' : 'PENDIENTE',
      hashOriginal: hash, hashFirmado: signed ? hash : null, vence: '2099-01-01T00:00:00Z',
      correo: 'q***@example.invalid', consentimiento: 'Acepto el documento revisado', consentimientoVersion: 'fes-correo-v1' } : { enviado: true }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  const exports = {};
  new Function('require','exports',output)(name => name.endsWith('.css') ? {} : name === '../../api' ? { api: { defaults: { baseURL: '/api' } } } : require(name), exports);
  let tree; await act(async () => { tree = create(React.createElement(exports.PublicSignaturePage)); });
  t.after(async () => { await act(async () => tree.unmount()); for (const [k,v] of Object.entries(old)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  } });
  const button = label => tree.root.findAllByType('button').find(n => text(n).includes(label));
  const click = async label => { await act(async () => { await button(label).props.onClick(); }); };
  return { tree, calls, button, click, token, hash, downloads, historyCalls };
}
test('enlace inválido no hace llamadas públicas', async t => {
  const h = await harness(t, { invalid: true }); assert.equal(h.calls.length, 0);
  assert.match(JSON.stringify(h.tree.toJSON()), /Enlace inválido/);
});
test('enlace personal permite firmar sin código después de revisar y aceptar el PDF', async t => {
  const h = await harness(t);
  assert.equal(h.button('Aceptar y firmar').props.disabled, true);
  assert.equal(h.historyCalls[0][2], '/firmar');
  await h.click('Descargar');
  assert.deepEqual(h.downloads, ['contrato-para-revisar.pdf']);
  assert.equal(h.button('Aceptar y firmar').props.disabled, true);
  const inputs = h.tree.root.findAllByType('input');
  await act(async () => {
    inputs.find(i => i.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  });
  assert.equal(h.button('Aceptar y firmar').props.disabled, false);
  await act(async () => { await h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.ok(h.button('Descargar contrato firmado'));
  const sign = h.calls.find(c => c.url.endsWith('/sign'));
  assert.equal(sign.body.hashOriginal, h.hash); assert.equal(sign.body.consent, true);
  assert.equal(sign.body.code, undefined);
  assert.ok(h.calls.every(c => !c.url.endsWith('/code')));
  assert.doesNotMatch(JSON.stringify(h.tree.toJSON()), /Huella del documento|Código de seis/);
  assert.ok(h.calls.every(c => !c.url.includes(h.token) && c.options.credentials === 'omit' && c.options.referrerPolicy === 'no-referrer'));
});
test('PDF alterado no habilita firma', async t => {
  const h = await harness(t, { tampered: true }); await h.click('Descargar');
  assert.equal(h.downloads.length, 0); assert.equal(h.button('Aceptar y firmar').props.disabled, true);
  assert.match(JSON.stringify(h.tree.toJSON()), /huella del PDF no coincide/);
});
