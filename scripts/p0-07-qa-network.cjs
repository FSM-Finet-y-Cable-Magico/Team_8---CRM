'use strict';
// QA preload only. Production entrypoints/configuration remain untouched.
const net = require('node:net');
const allowed = new Set((process.env.QA_LOOPBACK_PORTS || '').split(',').map(Number));
if (!allowed.size || allowed.has(0)) throw new Error('QA_NETWORK_ALLOWLIST_REQUIRED');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof normalized[0] === 'object' ? normalized[0] : {
    port: normalized[0], host: typeof normalized[1] === 'string' ? normalized[1] : 'localhost',
  };
  if (options.path || !['127.0.0.1', 'localhost'].includes(options.host || 'localhost') || !allowed.has(Number(options.port))) {
    throw new Error('QA_EXTERNAL_CONNECTION_BLOCKED');
  }
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !allowed.has(Number(url.port))) {
    throw new Error('QA_EXTERNAL_FETCH_BLOCKED');
  }
  return originalFetch(input, { ...init, redirect: 'error' });
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
  } else if (typeof args[0] === 'object') args[0] = { ...args[0], host: '127.0.0.1' };
  else throw new Error('QA_LISTEN_NOT_TCP');
  return originalListen.apply(this, args);
};
