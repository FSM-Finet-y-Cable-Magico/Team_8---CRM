import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={}) {
  const {outputText}=ts.transpileModule(readFileSync(new URL('../src/'+path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
  });
  const exports={};
  new Function('require','exports',outputText)(name=>{
    if(name in mocks)return mocks[name];
    if(name.endsWith('.css'))return {};
    if(name.startsWith('.'))throw Error('Unmocked '+name);
    return require(name);
  },exports);
  return exports;
}
const state=(mode,enabled=false,extra={})=>({enabled,policy:{mode,available:enabled,manualAllowed:mode==='manual',reason:null},solicitud:null,...extra});
function harness(initial) {
  let response=initial;const mutations=[];const timers=new Set();
  const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;
  globalThis.setInterval=fn=>{timers.add(fn);return fn;};
  globalThis.clearInterval=fn=>timers.delete(fn);
  const api={get:async()=>({data:typeof response==='function'?await response():response}),
    patch:async(...args)=>{mutations.push(args);return {data:{}};},
    post:async(...args)=>{mutations.push(args);return {data:{}};}};
  const hook=load('features/contracts/useSignatureStatus.ts',{'../../api':{api}});
  return {api,hook,mutations,set:next=>{response=next;},
    tick:async()=>{await act(async()=>{for(const fn of [...timers])fn();});},
    restore:()=>{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;},
    common:{'../../api':{api,apiErrorMessage:()=> 'No disponible'},
      '../../shared/components':{StatusBadge:({value})=>React.createElement('span',null,value),
        Modal:({open,children})=>open===false?null:React.createElement('div',null,children)},
      '../contracts/useSignatureStatus':hook,
      '../customers/ContractDocuments':{ContractDocuments:()=>React.createElement('span',null,'PDF disponible')},
      '../coverage':{CoveragePicker:()=>null},
      './ContractDateCalendar':{localDateValue:()=> '2026-11-10',ContractDateCalendar:()=>null}
    }};
}
const button=(tree,label)=>tree.root.findAllByType('button').find(node=>node.children.filter(child=>typeof child==='string').join('').trim()===label);
const prospect={idProspecto:1,estadoPipeline:'Pendiente firma',idCliente:null,
  empresa:{idEmpresa:1},contratos:[{idContrato:10,idEmpresa:1,estado:'Pendiente firma contrato'}]};
const permissions={manageContracts:true,generateQuotes:true,contractPlans:true,recordProspectLoss:true};
for(const mode of ['automatic','unknown','manual'])test('Prospectos: política real '+mode+' antes de existir cliente o servicio',async()=>{
  const h=harness(state(mode));let tree;
  try{
    const {ProspectWorkflowPanel}=load('features/prospects/ProspectWorkflowPanel.tsx',h.common);
    await act(async()=>{tree=create(React.createElement(ProspectWorkflowPanel,{prospect,plans:[],permissions,onChanged(){}}));});
    assert.ok(JSON.stringify(tree.toJSON()).includes('PDF disponible'));
    assert.equal(Boolean(button(tree,'Registrar firma manual')),mode==='manual');
    assert.equal(h.mutations.length,0);
    if(mode==='manual'){
      h.set(state('automatic'));await h.tick();
      assert.equal(button(tree,'Registrar firma manual'),undefined);
    }
  }finally{if(tree)act(()=>tree.unmount());h.restore();}
});
test('Clientes: cierra y limpia el formulario manual al cambiar a automático',async()=>{
  const h=harness(state('manual'));let tree;
  try{
    const mocks={...h.common,'../../lib':{formatDateOnly:()=> 'Fecha QA',formatWorkOrderValue:String},
      '../../shared/hooks/useTransientMessage':{useTransientMessage:()=>({message:'',showMessage(){},clearMessage(){}})},
      '../installations/G3InstallationStatus':{G3InstallationStatus:()=>null},
      './CustomerServiceActions':{CustomerServiceActions:()=>null},
      './HistoricalG3Closure':{HistoricalG3Closure:()=>null},
      './ContractDocuments':h.common['../customers/ContractDocuments'],
      './customer-services-state':load('features/customers/customer-services-state.ts')};
    const {CustomerContractWorkflow}=load('features/customers/CustomerContractWorkflow.tsx',mocks);
    const props={customer:{idCliente:1,nombreCompleto:'Cliente ficticio',contratos:prospect.contratos},
      services:[],servicesLoad:{status:'empty',customerId:1,error:''},plans:[],permissions,onRefresh:async()=>{}};
    await act(async()=>{tree=create(React.createElement(CustomerContractWorkflow,props));});
    await act(async()=>button(tree,'Ver').props.onClick());
    assert.equal(button(tree,'Ocultar').props['aria-expanded'],true);
    assert.match(JSON.stringify(tree.toJSON()), /PDF disponible/);
    await act(async()=>button(tree,'Registrar firma manual').props.onClick());
    const textareas=tree.root.findAllByType('textarea');
    assert.ok(textareas.length>0);
    await act(async()=>textareas.at(-1).props.onChange({target:{value:'Observación ficticia que debe limpiarse'}}));
    h.set(state('automatic'));await h.tick();
    assert.equal(button(tree,'Registrar firma manual'),undefined);
    assert.ok(!JSON.stringify(tree.toJSON()).includes('Observación ficticia que debe limpiarse'));
    assert.equal(h.mutations.length,0);
    h.set(state('manual'));await h.tick();
    await act(async()=>button(tree,'Registrar firma manual').props.onClick());
    assert.equal(tree.root.findAllByType('textarea').at(-1).props.value,'');
  }finally{if(tree)act(()=>tree.unmount());h.restore();}
});
test('Clientes: contratación pendiente y servicio activo conservan sus acciones propias', async () => {
  const h = harness(state('automatic'));
  let tree;
  const InstallationStatus = () => React.createElement('p', null, 'Seguimiento de instalación');
  const ServiceActions = () => React.createElement('button', null, 'Dar de baja');
  try {
    const { CustomerContractWorkflow } = load('features/customers/CustomerContractWorkflow.tsx', {
      ...h.common,
      '../../lib': { formatDateOnly: () => 'Fecha QA', formatWorkOrderValue: String },
      '../../shared/hooks/useTransientMessage': { useTransientMessage: () => ({ message: '', showMessage() {}, clearMessage() {} }) },
      '../installations/G3InstallationStatus': { G3InstallationStatus: InstallationStatus },
      './CustomerServiceActions': { CustomerServiceActions: ServiceActions },
      './HistoricalG3Closure': { HistoricalG3Closure: () => null },
      './ContractDocuments': h.common['../customers/ContractDocuments'],
      './customer-services-state': load('features/customers/customer-services-state.ts'),
    });
    await act(async () => { tree = create(React.createElement(CustomerContractWorkflow, {
      customer: { idCliente: 1, nombreCompleto: 'Cliente ficticio', contratos: [{ idContrato: 10, estado: 'Firmado' }, { idContrato: 11, estado: 'Activo' }] },
      services: [{ idContrato: 10, idServicio: 20, estadoOperativo: 'Pendiente Instalacion' }, { idContrato: 11, idServicio: 21, estadoOperativo: 'Activo' }],
      servicesLoad: { status: 'success', customerId: 1, error: '' }, plans: [], permissions: { ...permissions, createInstallOrders: true },
      onRefresh: async () => {},
    })); });
    const manage = index => tree.root.findAllByType('button').filter(node => node.props['aria-expanded'] === false && node.props.className?.includes('customer-contract-toggle'))[index];
    await act(async () => manage(0).props.onClick());
    assert.equal(tree.root.findAllByProps({ className: 'customer-contract-detail-row' }).length, 1);
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Gestionar contratación|Garantías del servicio|Ver facturas y pagos/);
    assert.equal(button(tree, 'Dar de baja'), undefined);
    assert.equal(tree.root.findByType(InstallationStatus).props.contractId, 10);
    assert.equal(tree.root.findByType(InstallationStatus).props.canRequest, true);
    assert.equal(tree.root.findByType(InstallationStatus).props.compact, true);
    await act(async () => button(tree, 'Ocultar').props.onClick());
    await act(async () => manage(1).props.onClick());
    assert.equal(tree.root.findByType(ServiceActions).props.service.idServicio, 21);
    assert.equal(tree.root.findByType(InstallationStatus).props.canRequest, false);
    assert.ok(button(tree, 'Dar de baja'));
    assert.deepEqual(h.mutations, []);
  } finally {
    if (tree) act(() => tree.unmount());
    h.restore();
  }
});
test('firma confirmada refresca una vez y conserva descarga con el envío apagado',async()=>{
  const signed=state('automatic',false,{signedDownloadAvailable:true,
    solicitud:{idSolicitud:'qa-request',estado:'FIRMADA',correoEstado:'ENVIADO',firmaCorreoEstado:'INDETERMINADO'}});
  const h=harness(signed);let tree,changes=0;
  try{
    const {ContractSignatureActions}=load('features/contracts/ContractSignatureActions.tsx',{
      '../../api':h.common['../../api'],'./useSignatureStatus':h.hook});
    await act(async()=>{tree=create(React.createElement(ContractSignatureActions,{idContrato:10,canSend:true,revision:0,onChanged(){changes++;}}));});
    assert.equal(changes,1);
    assert.ok(button(tree,'Descargar contrato con constancia'));
    assert.equal(button(tree,'Enviar a firma'),undefined);
    assert.equal(button(tree,'Reintentar entrega confirmada como fallida'),undefined);
    await h.tick();assert.equal(changes,1);
    h.set({...signed,enabled:true,solicitud:{...signed.solicitud,firmaCorreoEstado:'FALLIDO'}});await h.tick();
    assert.ok(button(tree,'Reintentar entrega confirmada como fallida'));
  }finally{if(tree)act(()=>tree.unmount());h.restore();}
});
test('un fallo tardío de otra ficha no elimina la política del contrato actual',async()=>{
  const h=harness(state('manual'));let tree,rejectOld;
  function Probe({id}){const {status}=h.hook.useSignatureStatus(id);return React.createElement('span',null,status?.policy.mode??'cargando');}
  try{
    h.set(()=>new Promise((_,reject)=>{rejectOld=reject;}));
    await act(async()=>{tree=create(React.createElement(Probe,{id:10}));});
    h.set(state('automatic'));
    await act(async()=>tree.update(React.createElement(Probe,{id:20})));
    await act(async()=>rejectOld(Error('QA stale')));
    assert.equal(tree.root.findByType('span').children.join(''),'automatic');
  }finally{if(tree)act(()=>tree.unmount());h.restore();}
});

test('no ofrece enviar sin documento elegible ni repetir un documento anulado',async()=>{
  const h=harness(state('automatic',true,{sendAllowed:false,solicitud:{estado:'ANULADA'}}));let tree;
  try{
    const {ContractSignatureActions}=load('features/contracts/ContractSignatureActions.tsx',{
      '../../api':h.common['../../api'],'./useSignatureStatus':h.hook});
    await act(async()=>{tree=create(React.createElement(ContractSignatureActions,{idContrato:10,canSend:true,revision:0}));});
    assert.equal(button(tree,'Enviar a firma'),undefined);
    h.set(state('automatic',true,{sendAllowed:true,solicitud:{estado:'BORRADOR'}}));await h.tick();
    assert.ok(button(tree,'Enviar a firma'));
  }finally{if(tree)act(()=>tree.unmount());h.restore();}
});

test('motivo seguro automático se muestra sin ofrecer firma manual o envío bloqueado', async () => {
  const reason = 'Existe deuda pendiente en esta empresa. Regulariza el saldo antes de enviar o confirmar la firma.';
  const h = harness(state('automatic', true, { sendAllowed: false,
    policy: { mode: 'automatic', available: true, manualAllowed: false, reason } })); let tree;
  try {
    const { ContractSignatureActions } = load('features/contracts/ContractSignatureActions.tsx', {
      '../../api': h.common['../../api'], './useSignatureStatus': h.hook,
    });
    await act(async () => { tree = create(React.createElement(ContractSignatureActions, { idContrato: 10, canSend: true, revision: 0 })); });
    assert.ok(JSON.stringify(tree.toJSON()).includes(reason));
    assert.equal(button(tree, 'Enviar a firma'), undefined);
    assert.equal(button(tree, 'Registrar firma manual'), undefined);
    assert.deepEqual(h.mutations, []);
  } finally { if (tree) act(() => tree.unmount()); h.restore(); }
});

test('error al consultar firma queda visible sin exponer respuesta interna ni habilitar acciones', async () => {
  const h = harness(() => Promise.reject(Error('PRIVATE_STORAGE_ROW'))); let tree;
  try {
    const { ContractSignatureActions } = load('features/contracts/ContractSignatureActions.tsx', {
      '../../api': h.common['../../api'], './useSignatureStatus': h.hook,
    });
    await act(async () => { tree = create(React.createElement(ContractSignatureActions, { idContrato: 10, canSend: true, revision: 0 })); });
    assert.match(JSON.stringify(tree.toJSON()), /No se pudo consultar el estado de firma/);
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /PRIVATE_STORAGE_ROW/);
    assert.equal(button(tree, 'Enviar a firma'), undefined);
    h.set(state('automatic', true, { sendAllowed: true }));
    await act(async () => button(tree, 'Consultar estado de firma').props.onClick());
    assert.ok(button(tree, 'Enviar a firma'));
    assert.deepEqual(h.mutations, []);
  } finally { if (tree) act(() => tree.unmount()); h.restore(); }
});

test('modalidad manual con veto muestra el motivo sin inventar botón de firma electrónica', async () => {
  const reason = 'Se requiere revisión financiera en esta empresa antes de enviar o confirmar la firma.';
  const h = harness(state('manual', false, { policy: { mode: 'manual', available: false, manualAllowed: false, reason } })); let tree;
  try {
    const { ContractSignatureActions } = load('features/contracts/ContractSignatureActions.tsx', {
      '../../api': h.common['../../api'], './useSignatureStatus': h.hook,
    });
    await act(async () => { tree = create(React.createElement(ContractSignatureActions, { idContrato: 10, canSend: true, revision: 0 })); });
    assert.ok(JSON.stringify(tree.toJSON()).includes(reason));
    assert.equal(button(tree, 'Enviar a firma'), undefined);
    assert.deepEqual(h.mutations, []);
  } finally { if (tree) act(() => tree.unmount()); h.restore(); }
});

test('descarga histórica sigue disponible aunque ya no exista modalidad para nuevas firmas', async () => {
  const h = harness(state('unknown', false, { signedDownloadAvailable: true,
    solicitud: { idSolicitud: 'qa-historical-signature', estado: 'FIRMADA', correoEstado: 'ENVIADO' } })); let tree;
  try {
    const { ContractSignatureActions } = load('features/contracts/ContractSignatureActions.tsx', {
      '../../api': h.common['../../api'], './useSignatureStatus': h.hook,
    });
    await act(async () => { tree = create(React.createElement(ContractSignatureActions, { idContrato: 10, canSend: true, revision: 0 })); });
    assert.ok(button(tree, 'Descargar contrato con constancia'));
    assert.equal(button(tree, 'Enviar a firma'), undefined);
    assert.deepEqual(h.mutations, []);
  } finally { if (tree) act(() => tree.unmount()); h.restore(); }
});
