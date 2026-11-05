'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { providers } = require('./p0-07-qa-providers.cjs');
const { cleanEnv } = require('./p0-05-qa-isolation.cjs');

test('operator preparation rejects external origins before credentials or database access', async () => {
  const prepare=require('./p0-07-qa-prepare.cjs');
  for(const origin of ['https://example.invalid','http://127.0.0.2:3000','http://127.0.0.1.example.invalid']) {
    await assert.rejects(()=>prepare({origin}),{code:'ERR_ASSERTION'});
  }
});

test('QA guard rejects nonlocal destinations before any connection, and forces loopback listen', () => {
  const script = `const a=require('node:assert/strict');
    a.throws(()=>fetch('https://example.invalid'),/QA_EXTERNAL_FETCH_BLOCKED/);
    a.throws(()=>require('node:net').connect({host:'203.0.113.1',port:443}),/QA_EXTERNAL_CONNECTION_BLOCKED/);
    a.throws(()=>require('node:net').connect({host:'127.0.0.1',port:9999}),/QA_EXTERNAL_CONNECTION_BLOCKED/);
    const s=require('node:http').createServer();s.listen(0,'0.0.0.0',()=>{a.equal(s.address().address,'127.0.0.1');s.close();});`;
  execFileSync(process.execPath, ['--require', path.join(__dirname,'p0-07-qa-network.cjs'), '-e', script], {
    env:{...cleanEnv(),QA_LOOPBACK_PORTS:'12345'},stdio:'pipe',windowsHide:true,
  });
});
test('local G3/G1 contracts: company scope, immutable request, approved closure, idempotent activation', async () => {
  const stub=await providers([1,2]);
  const call=async(route,body,key=stub.key)=>{
    const r=await fetch(stub.origin+route,{method:body?'POST':'GET',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:r.status,body:await r.json()};
  };
  try {
    const p={id_empresa:1,request_id:'qa-request',trace_id:'qa-trace',id_contrato:11,id_prospecto:12,id_plan:13,persona:{},direccion:{}};
    assert.equal((await call('/api/integraciones/tipos-equipo?id_empresa=1',null,'bad')).status,401);
    const first=await call('/api/integraciones/instalaciones',p);assert.equal(first.status,201);
    const id=first.body.data.id_ot;
    assert.equal((await call('/api/integraciones/instalaciones',p)).body.data.duplicado,true);
    assert.equal((await call('/api/integraciones/instalaciones',{...p,id_contrato:14})).status,409);
    assert.equal((await call(`/api/integraciones/ordenes/${id}`)).status,403);
    assert.equal((await call(`/api/integraciones/ordenes/${id}?id_empresa=2`)).status,404);
    assert.equal((await call(`/api/integraciones/ordenes/${id}/cierre?id_empresa=1`)).status,409);
    const closure=stub.approve(id);assert.deepEqual(stub.approve(id),closure);
    assert.equal((await call(`/api/integraciones/ordenes/${id}/cierre?id_empresa=1`)).body.data.id_contrato,11);
    const activation={event_id:'qa-event',trace_id:p.trace_id,id_empresa:1,id_ot:id,id_cliente:1,id_servicio:1,id_contrato:11,equipos:closure.equipos_instalados};
    assert.equal((await call('/api/integraciones/activaciones',activation)).body.data.duplicado,false);
    assert.equal((await call('/api/integraciones/activaciones',activation)).body.data.duplicado,true);
    assert.equal((await call('/api/integraciones/activaciones',{...activation,id_servicio:2})).status,409);
    assert.equal(stub.activations.size,1);
    assert.equal((await call('/api/integraciones/equipos?id_empresa=2&id_servicio=1')).body.data.length,0);
  } finally { stub.server.closeAllConnections();await new Promise(r=>stub.server.close(r)); }
});
