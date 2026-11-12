import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/session.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const session = {};
new Function('require', 'exports', outputText)(() => ({ normalizeAuthUser: user => user }), session);
const token = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;

function environment(t) {
  let now = 1800000000000;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  const timers = new Map(); let timerId = 0;
  win.setInterval = callback => { timers.set(++timerId, callback); return timerId; };
  win.clearInterval = id => timers.delete(id);
  for (const [key, value] of Object.entries({ localStorage: storage, window: win, document: doc })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  t.mock.method(Date, 'now', () => now);
  const user = { idUsuario: 1, roles: ['Administrador'] };
  session.saveSession(token(now / 1000 + 8 * 3600), user);
  return { values, win, doc, timers, user, advance: ms => { now += ms; }, tick: () => [...timers.values()].forEach(callback => callback()) };
}

test('sesión válida tolera pausas normales y vence a la hora de inactividad aunque se reabra la pestaña', t => {
  const env = environment(t);
  env.advance(45 * 60000);
  assert.deepEqual(session.restoreSession(), env.user);
  env.advance(15 * 60000);
  assert.equal(session.restoreSession(), null);
  assert.equal(env.values.size, 0);
});

test('volver a una pestaña inactiva no revive una sesión vencida', t => {
  const env = environment(t); let expired = 0;
  const stop = session.monitorSession(() => expired++);
  env.doc.visibilityState = 'hidden'; env.advance(61 * 60000);
  env.doc.visibilityState = 'visible'; env.doc.dispatchEvent(new Event('visibilitychange'));
  env.win.dispatchEvent(new Event('pointerdown'));
  assert.equal(expired, 1); assert.equal(env.values.has('finet_token'), false);
  stop(); assert.equal(env.timers.size, 0);
});

test('actividad renueva la inactividad, pero no extiende el vencimiento real del JWT', t => {
  const env = environment(t); let expired = 0;
  const stop = session.monitorSession(() => expired++);
  for (let i = 0; i < 15; i++) { env.advance(30 * 60000); env.win.dispatchEvent(new Event('keydown')); }
  assert.equal(expired, 0);
  env.advance(30 * 60000); env.win.dispatchEvent(new Event('keydown'));
  assert.equal(expired, 1); stop();
});

test('consultas periódicas y pestañas ocultas no cuentan como actividad; salir se propaga a otras pestañas', t => {
  const env = environment(t); let expired = 0;
  const stop = session.monitorSession(() => expired++);
  const original = env.values.get('finet_last_activity');
  env.advance(20 * 60000); env.tick();
  assert.equal(env.values.get('finet_last_activity'), original);
  env.doc.visibilityState = 'hidden'; env.win.dispatchEvent(new Event('scroll'));
  assert.equal(env.values.get('finet_last_activity'), original);
  env.values.delete('finet_token'); env.win.dispatchEvent(new Event('storage'));
  assert.equal(expired, 1); stop();
});

test('credenciales corruptas y JWT ya vencido no restauran sesión', t => {
  const env = environment(t);
  env.values.set('finet_token', 'corrupto');
  assert.equal(session.restoreSession(), null);
  assert.equal(session.sessionHasExpired(token(Date.now() / 1000 - 1), Date.now()), true);
});
