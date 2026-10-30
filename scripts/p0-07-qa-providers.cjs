'use strict';
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
async function providers(companies) {
  const key = randomBytes(32).toString('hex'), orders = new Map(), activations = new Map(), calls = [];
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers['x-api-key'] !== key) return json(res, 401, { success: false });
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) return json(res, 413, {}); chunks.push(chunk); }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      const company = Number(req.method === 'GET' ? url.searchParams.get('id_empresa') : body?.id_empresa);
      if (!companies.includes(company)) return json(res, 403, { success: false });
      const call = { method: req.method, path: url.pathname, company };
      calls.push(call); res.once('finish', () => { call.status = res.statusCode; });
      const ok = (data, code = 200) => json(res, code, { success: true, data });
      const type = { id_tipo_equipo: company, id_empresa: company, nombre: 'ONT QA simulado', categoria: 'ONT', activo: true, requiere_serie_individual: true };
      const unit = { id_unidad: company, id_empresa: company, numero_serie: `QA-I4-ONT-${company}-001`, tipo_equipo: type, estado: 'En bodega', asignacion_actual: null };
      if (req.method === 'POST' && url.pathname === '/api/integraciones/instalaciones') {
        if (!body.request_id || !body.trace_id || !body.persona || !body.direccion) return json(res, 400, { success: false });
        const old = [...orders.values()].find(o => o.payload.request_id === body.request_id);
        if (old && old.hash !== hash(body)) return json(res, 409, { success: false });
        const order = old || { payload: body, hash: hash(body), id: 9700001 + orders.size, created: new Date().toISOString(), closure: null };
        if (!old) order.series = `QA-I4-ONT-${company}-${String([...orders.values()].filter(o=>o.payload.id_empresa===company).length+1).padStart(3,'0')}`;
        orders.set(order.id, order);
        return ok({ request_id: body.request_id, trace_id: body.trace_id, id_ot: order.id,
          tipo_ot: 'INSTALACION', estado: order.closure ? 'COMPLETADA' : 'PENDIENTE', fecha_creacion: order.created, duplicado: Boolean(old) }, old ? 200 : 201);
      }
      const match = /^\/api\/integraciones\/ordenes\/(\d+)(\/cierre)?$/.exec(url.pathname);
      if (req.method === 'GET' && match) {
        const order = orders.get(Number(match[1]));
        if (!order || order.payload.id_empresa !== company) return json(res, 404, { success: false });
        if (match[2]) return order.closure ? ok(order.closure) : json(res, 409, { success: false });
        return ok({ id_ot: order.id, id_empresa: company, request_id: order.payload.request_id, trace_id: order.payload.trace_id,
          estado: order.closure ? 'COMPLETADA' : 'PENDIENTE', tipo_ot: 'INSTALACION', fecha_creacion: order.created });
      }
      if (req.method === 'POST' && url.pathname === '/api/integraciones/activaciones') {
        const old = activations.get(body.event_id);
        if (old && old.hash !== hash(body)) return json(res, 409, { success: false });
        const order=orders.get(body.id_ot);
        if (!order?.closure || order.payload.id_empresa!==company || order.payload.id_contrato!==body.id_contrato
          || order.payload.trace_id!==body.trace_id || order.payload.persona.rut!==body.rut_cliente
          || !Number.isSafeInteger(body.id_cliente) || body.id_cliente<1 || !Number.isSafeInteger(body.id_servicio) || body.id_servicio<1
          || hash(body.equipos)!==hash(order.closure.equipos_instalados)) return json(res, 409, { success: false });
        activations.set(body.event_id, { hash: hash(body), payload: body });
        return ok({ event_id: body.event_id, id_servicio: body.id_servicio, equipos_asociados: body.equipos.length, duplicado: Boolean(old) });
      }
      if (req.method === 'GET' && url.pathname === '/api/integraciones/tipos-equipo') return ok([type]);
      const requestedSeries = url.pathname.startsWith('/api/integraciones/unidades/') ? decodeURIComponent(url.pathname.split('/').pop()) : null;
      const active = [...activations.values()].map(a=>a.payload).find(a=>a.id_empresa===company
        && (requestedSeries ? a.equipos.some(e=>e.numero_serie===requestedSeries) : a.id_servicio===Number(url.searchParams.get('id_servicio'))));
      if (active) {
        unit.numero_serie = active.equipos[0].numero_serie;
        // Keep the first QA unit's identity, but never reuse it for a second series.
        unit.id_unidad = company + companies.length * (Number(unit.numero_serie.split('-').pop()) - 1);
      }
      if (active) Object.assign(unit, { estado: 'Instalado en cliente', id_ot: active.id_ot, fecha_instalacion: new Date().toISOString(),
        asignacion_actual: { id_cliente_externo: active.id_cliente, id_servicio_externo: active.id_servicio,
          id_contrato_externo: active.id_contrato, id_ot: active.id_ot } });
      if (req.method === 'GET' && url.pathname.startsWith('/api/integraciones/unidades/')) {
        if (decodeURIComponent(url.pathname.split('/').pop()) !== unit.numero_serie) return json(res, 404, { success: false });
        return ok(unit);
      }
      if (req.method === 'GET' && url.pathname === '/api/integraciones/equipos') {
        return ok(active && active.id_servicio === Number(url.searchParams.get('id_servicio')) ? [unit] : []);
      }
      return json(res, 404, { success: false });
    } catch { json(res, 400, { success: false }); }
  });
  await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
  return { key, orders, activations, calls, server, port: server.address().port,
    origin: `http://127.0.0.1:${server.address().port}`,
    approve(id) {
      const order = orders.get(id); if (!order) throw new Error('QA_ORDER_UNKNOWN');
      if (!order.closure) {
        const p = order.payload;
        order.closure = { id_ot: id, request_id: p.request_id, trace_id: p.trace_id, id_empresa: p.id_empresa,
          id_contrato: p.id_contrato, id_prospecto: p.id_prospecto, id_plan: p.id_plan,
          equipos_instalados: [{ numero_serie: order.series }], equipos_retirados: [] };
      }
      return order.closure;
    } };
}
module.exports = { providers };
