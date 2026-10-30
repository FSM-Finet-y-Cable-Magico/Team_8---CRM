'use strict';
// Preloaded only by local QA. Mocked transports still work; real sockets must be loopback.
const net = require('node:net');
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
const blocked = () => { const e = new Error('QA_NON_LOOPBACK_CONNECTION_BLOCKED'); e.code = 'QA_NETWORK_BLOCKED'; throw e; };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...input) {
  const args = Array.isArray(input[0]) ? input[0] : input;
  const first = args[0];
  if (first && typeof first === 'object') {
    if (first.path || !local(first.host ?? first.hostname ?? 'localhost')) blocked();
  } else {
    if (!/^\d+$/.test(String(first)) || !local(typeof args[1] === 'string' ? args[1] : 'localhost')) blocked();
  }
  return connect.apply(this, input);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === 'object') {
    if (args[0].path || (args[0].host && !local(args[0].host))) blocked();
  } else {
    if (!/^\d+$/.test(String(args[0]))) blocked();
    if (typeof args[1] === 'string') { if (!local(args[1])) blocked(); }
  }
  return listen.apply(this, args);
};
// Preserve synchronous listen(0)/address() used by Supertest. Supplying a host
// to listen() would defer binding through lookup and make address() return null.
const listenHandle = net.Server.prototype._listen2;
net.Server.prototype._listen2 = function (address, port, family, ...rest) {
  if (address != null && !local(address)) blocked();
  return listenHandle.call(this, address ?? '127.0.0.1', port, address == null ? 4 : family, ...rest);
};
