import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node?.children ?? []).map(textOf).join('');
function compile(file, mocks = {}) {
  const source = readFileSync(new URL('../src/features/commercial/' + file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports); return exports;
}
const model = compile('control-book-model.ts');
const installmentHelpers = compile('control-book-installments.ts');
const Modal = ({title,children})=>React.createElement('section',{'aria-label':title},children);
const contexts = [51,52].map((id,index)=>({rowId:'row-'+id,idFactura:id,idCliente:10,idEmpresa:2,idContrato:31,nombre:'Cliente de prueba',plan:'Fibra 400',saldoPendiente:20000,fechaVencimientoEfectiva:`2026-${11+index}-10`}));
const detail = (id=52,changes={})=>({idFactura:id,idContrato:31,contrato:{idEmpresa:2,cliente:{idCliente:10,nombreCompleto:'Cliente de prueba'}},aceptaPagos:true,saldo:20000,pagado:0,estadoCalculado:'Vencida',pagos:[],convenios:[],...changes});
async function payment(t,options={}) {
  const posts=[],saved=[],reads=[];
  const api={get:async(path,config)=>{reads.push([path,config]);return {data:path.endsWith('/allocations')?options.allocations:detail(Number(path.split('/').at(-1)),options.detail)};},post:async(...args)=>{posts.push(args);if(options.post)await options.post();}};
  const {ControlBookManualPayment}=compile('ControlBookManualPayment.tsx',{'../../api':{api,apiErrorMessage:e=>e.message},'./control-book-model':model,'./ControlBookModal':{ControlBookModal:Modal}});
  let tree;await act(async()=>{tree=create(React.createElement(ControlBookManualPayment,{contexts,contractId:31,customerId:10,companyId:2,canManage:options.canManage??true,canApprove:false,onClose(){},onSaved:m=>saved.push(m),onBusyChange(){}}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  const change=async(label,value,type='input')=>act(async()=>tree.root.findAllByType('label').find(n=>textOf(n).startsWith(label)).findByType(type).props.onChange({target:{value}}));
  const submit=()=>act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  return {tree,posts,saved,reads,change,submit};
}
test('pago manual elige fecha dentro del modal, admite abono y conserva factura, empresa y referencia',async t=>{
  const h=await payment(t);
  await h.submit();assert.equal(h.posts.length,0);assert.equal(h.reads.length,0);
  await h.change('Documento a pagar','52','select');
  assert.equal(h.reads[0][0],'/billing/invoices/52');assert.equal(h.reads[0][1].params.scope,'2');
  await h.change('Monto a registrar','10000');await h.change('Medio de pago','Efectivo','select');await h.change('Referencia','  REF-52  ');
  await h.submit();assert.deepEqual(h.posts,[['/billing/payments',{idFactura:52,monto:10000,pasarela:'Efectivo',codigoTransaccion:'REF-52'}]]);assert.equal(h.saved.length,1);
  assert.ok(!textOf(h.tree.toJSON()).includes('Simular'));assert.ok(!textOf(h.tree.toJSON()).includes('Suspender'));
});
test('rechaza importe excesivo, documento cerrado, identidad ajena y falta de permiso',async t=>{
  for(const config of [{amount:'20001'},{detail:{aceptaPagos:false}},{detail:{idContrato:99}},{detail:{contrato:{idEmpresa:1,cliente:{idCliente:10}}}},{canManage:false}]){
    const h=await payment(t,config);await h.change('Documento a pagar','52','select');
    if(config.amount)await h.change('Monto a registrar',config.amount);
    await h.submit();assert.equal(h.posts.length,0);assert.equal(h.saved.length,0);
  }
});
test('fallo de pago conserva el borrador y doble clic en curso registra una sola vez',async t=>{
  const h=await payment(t,{post:()=>Promise.reject(new Error('Referencia duplicada'))});await h.change('Documento a pagar','52','select');await h.change('Referencia','REF-52');await h.submit();
  assert.equal(h.saved.length,0);assert.ok(textOf(h.tree.toJSON()).includes('Referencia duplicada'));
  assert.equal(h.tree.root.findAllByType('input').find(n=>n.props.maxLength===100).props.value,'REF-52');
  let release;const pending=new Promise(resolve=>release=resolve);const next=await payment(t,{post:()=>pending});await next.change('Documento a pagar','51','select');
  let first;act(()=>{first=next.tree.root.findByType('form').props.onSubmit({preventDefault(){}});});await next.submit();assert.equal(next.posts.length,1);await act(async()=>{release();await first;});
});
test('documento tributario solo consulta pagos completados y muestra pendiente sin emitir ni enviar',async t=>{
  for(const state of ['Vencida','Pagada']){
    const calls=[];const api={get:async path=>{calls.push(path);return {data:path.startsWith('/billing')?detail(52,{estadoCalculado:state,saldo:state==='Pagada'?0:20000,pagado:state==='Pagada'?20000:0,pagos:[{idPago:7,fechaPago:'2026-11-12'}]}):{intention:null}};}};
    const {ControlBookTaxDocument}=compile('ControlBookTaxDocument.tsx',{'../../api':{api,apiErrorMessage:e=>e.message},'./control-book-model':model,'./control-book-installments':installmentHelpers,'./ControlBookModal':{ControlBookModal:Modal}});
    let tree;await act(async()=>{tree=create(React.createElement(ControlBookTaxDocument,{invoice:{idFactura:52,idCliente:10,idEmpresa:2},scope:'2',onClose(){}}));});
    t.after(async()=>{await act(async()=>tree.unmount());});
    assert.equal(calls.includes('/tax-documents/payments/7'),state==='Pagada');
    assert.ok(textOf(tree.toJSON()).includes(state==='Pagada'?'Documento tributario pendiente':'cuando la factura esté pagada'));
    assert.equal(tree.root.findAllByType('a').length,0);
  }
});

test('pago de cuota conserva su identidad y limita el abono a su saldo real',async t=>{
  const allocations={idConvenio:18,idEmpresa:2,idFactura:52,estadoConvenio:'APROBADO',cuotas:[{idCuota:81,numero:1,monto:'10000',imputado:'5000',saldo:'5000',fechaVencimiento:'2026-12-10',estado:'PARCIAL'}],operaciones:[]};
  const h=await payment(t,{detail:{convenios:[{idConvenio:18,estado:'APROBADO'}]},allocations});
  await h.change('Documento a pagar','52','select');await h.change('Aplicar pago a','81','select');
  assert.equal(h.tree.root.findAllByType('input').find(n=>n.props.type==='number').props.value,'5000');
  await h.change('Monto a registrar','5001');await h.submit();assert.equal(h.posts.length,0);
  await h.change('Monto a registrar','5000');await h.submit();assert.equal(h.posts[0][1].idCuota,81);assert.equal(h.posts[0][1].idFactura,52);
  assert.ok(!textOf(h.tree.toJSON()).includes('aprobación'));
});

test('pagar convenio completo envía una sola operación con su convenio',async t=>{
  const allocations={idConvenio:18,idEmpresa:2,idFactura:52,estadoConvenio:'APROBADO',cuotas:[1,2].map(numero=>({idCuota:80+numero,numero,monto:'10000',imputado:'0',saldo:'10000',fechaVencimiento:'2026-12-10',estado:'PENDIENTE'})),operaciones:[]};
  const h=await payment(t,{detail:{convenios:[{idConvenio:18,estado:'APROBADO'}]},allocations});
  await h.change('Documento a pagar','52','select');
  assert.equal(h.tree.root.findAllByType('label').find(n=>textOf(n).startsWith('Aplicar pago a')).findByType('select').props.value,'agreement-18');
  await h.submit();assert.equal(h.posts.length,1);assert.equal(h.posts[0][1].idConvenio,18);assert.equal(h.posts[0][1].monto,20000);assert.equal(h.posts[0][1].idCuota,undefined);
});

test('cuota pagada consulta solo sus comprobantes aunque la factura general siga pendiente',async t=>{
  const calls=[];
  const allocations={idConvenio:18,idEmpresa:2,idFactura:52,cuotas:[{idCuota:81,numero:1,estado:'PAGADA',saldo:'0',imputado:'10000'}],operaciones:[{idPago:7,tipo:'APLICAR',detalles:[{idCuota:81,monto:'10000'}]},{idPago:8,tipo:'APLICAR',detalles:[{idCuota:82,monto:'10000'}]}]};
  const api={get:async path=>{calls.push(path);return {data:path.startsWith('/billing')?detail(52,{pagos:[{idPago:7},{idPago:8}]}):path.endsWith('/allocations')?allocations:{intention:null}};}};
  const {ControlBookTaxDocument}=compile('ControlBookTaxDocument.tsx',{'../../api':{api,apiErrorMessage:e=>e.message},'./control-book-model':model,'./control-book-installments':installmentHelpers,'./ControlBookModal':{ControlBookModal:Modal}});
  let tree;await act(async()=>{tree=create(React.createElement(ControlBookTaxDocument,{invoice:{idFactura:52,idCliente:10,idEmpresa:2,idConvenio:18,idCuota:81},scope:'2',onClose(){}}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  assert.ok(calls.includes('/tax-documents/payments/7'));assert.ok(!calls.includes('/tax-documents/payments/8'));assert.ok(textOf(tree.toJSON()).includes('Cuota 1'));
});
