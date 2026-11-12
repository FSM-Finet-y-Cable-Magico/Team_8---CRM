import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/shared/hooks/useAutoRefresh.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exports = {};
new Function('require', 'exports', outputText)(require, exports);

test('actualización automática respeta visibilidad, pausa de formularios y limpieza al salir', async t => {
  const win = new EventTarget(), doc = new EventTarget(), timers = new Set();
  let now = 100000, count = 0;
  doc.visibilityState = 'visible';
  win.setInterval = callback => { timers.add(callback); return callback; };
  win.clearInterval = callback => timers.delete(callback);
  for (const [key, value] of Object.entries({ window: win, document: doc })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  t.mock.method(Date, 'now', () => now);
  function View({ enabled }) { exports.useAutoRefresh(() => count++, enabled); return null; }
  let tree;
  await act(async () => { tree = create(React.createElement(View, { enabled: true })); });
  assert.equal(count, 0);
  doc.visibilityState = 'hidden'; [...timers].forEach(timer => timer());
  assert.equal(count, 0);
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('focus'));
  assert.equal(count, 1);
  now += 60000; [...timers].forEach(timer => timer());
  assert.equal(count, 2);
  await act(async () => tree.update(React.createElement(View, { enabled: false })));
  now += 60000; win.dispatchEvent(new Event('focus')); [...timers].forEach(timer => timer());
  assert.equal(count, 2); assert.equal(timers.size, 0);
  await act(async () => tree.unmount());
  assert.equal(timers.size, 0);
});
