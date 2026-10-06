import {test} from 'node:test';
import assert from 'node:assert/strict';
import {main as read} from './smoke-g1-readonly.mjs';
import {main as write} from './smoke-g1-activation.mjs';
import {g1Config} from './g1-smoke-common.mjs';
const env={G1_API_URL:'https://g1.example.test',G1_API_KEY:['test','opaque','value'].join('-'),G1_SMOKE_COMPANY_ID:'1'};
test('write gate aborts before fetch, even with credentials',async()=>{
 let calls=0;const logs=[];
 assert.equal(await write(env,async()=>{calls++;},s=>logs.push(s)),2);
 assert.equal(calls,0);assert.match(logs[0],/ACTIVATION_WRITE_NOT_ALLOWED/);
});
test('401 stops reads and never leaks key or response',async()=>{
 let calls=0;const logs=[];
 const code=await read({...env,G1_SMOKE_SERIAL:'unit-private'},async(_url,init)=>{
 calls++;assert.equal(init.headers['X-API-KEY'],env.G1_API_KEY);assert.equal(init.redirect,'error');
 return new Response(JSON.stringify({password:'private-response'}),{status:401});
 },s=>logs.push(s));
 assert.equal(code,1);assert.equal(calls,1);assert.match(logs[0],/AUTH_CONFIGURATION_MISMATCH/);
 assert.ok(!logs.join('').includes(env.G1_API_KEY));assert.ok(!logs.join('').includes('private-response'));
});
test('read smoke validates envelope and only GET',async()=>{
 const calls=[];assert.equal(await read({...env,G1_SMOKE_SERVICE_ID:'2'},async(url,init)=>{
 calls.push(url);assert.equal(init.method,undefined);return new Response(JSON.stringify({success:true,data:[]}));
 },()=>{}),0);assert.equal(calls.length,2);
});
test('reject ambiguous origins',()=>{
 for(const suffix of ['/api','//','?query=1','#hash'])assert.throws(()=>g1Config({...env,G1_API_URL:env.G1_API_URL+suffix}),/G1_INVALID_URL/);
});
test('activation payload rejects textual OT before POST',async()=>{
 let calls=0;
 const payload={event_id:'event',trace_id:'trace',id_empresa:1,id_ot:'G3-901',id_cliente:1,rut_cliente:'test',id_servicio:1,id_contrato:1,equipos:[{numero_serie:'S1'}]};
 assert.equal(await write({...env,ALLOW_G1_ACTIVATION_WRITE:'1',G1_ACTIVATION_PAYLOAD_JSON:JSON.stringify(payload)},async()=>{calls++;},()=>{}),2);
 assert.equal(calls,0);
});
