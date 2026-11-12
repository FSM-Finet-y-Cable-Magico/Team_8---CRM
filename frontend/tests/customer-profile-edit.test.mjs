import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {act,create} from 'react-test-renderer';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const textOf=node=>typeof node==='string'?node:(node?.children??[]).map(textOf).join('');
const customer={idCliente:10,nombreCompleto:'Nombre original',email:'correo@example.invalid',telefono:'+56900000000',rut:'99901019-9',estado:'Activo'};
async function render(t,fail=false){
  const calls=[],events=[];
  const source=readFileSync(new URL('../src/features/customers/CustomerProfileForm.tsx',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mocks={'../../api':{api:{patch:async(...args)=>{calls.push(args);if(fail)throw Error('falló');return {data:{...customer,nombreCompleto:'Nombre actualizado'}};}},apiErrorMessage:()=> 'No se pudo guardar'},'./CustomerStatusBadge':{CustomerStatusSummary:()=>null}};
  const exports={};new Function('require','exports',output)(name=>mocks[name]??require(name),exports);
  let tree;await act(async()=>{tree=create(React.createElement(exports.CustomerProfileForm,{customer,onCancel(){},onBusy:value=>events.push(value),onSaved:value=>events.push(value)}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  await act(async()=>tree.root.findAllByType('input')[0].props.onChange({target:{value:'Nombre actualizado'}}));
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  return {tree,calls,events};
}
test('edición dentro de la ficha guarda solo campos admitidos y libera bloqueo antes de actualizar la vista',async t=>{
  const h=await render(t);
  assert.equal(h.tree.root.findByType('form').props.className,'customer-profile-overview customer-profile-edit');
  assert.deepEqual(h.calls[0],['/customers/10/profile',{nombreCompleto:'Nombre actualizado'},{timeout:15000}]);
  assert.deepEqual(h.events.slice(0,2),[true,false]);
  assert.equal(h.events[2].nombreCompleto,'Nombre actualizado');
});
test('error conserva datos editados y habilita reintento sin quedar congelado',async t=>{
  const h=await render(t,true);
  assert.deepEqual(h.events,[true,false]);
  assert.equal(h.tree.root.findAllByType('input')[0].props.value,'Nombre actualizado');
  assert.ok(textOf(h.tree.toJSON()).includes('No se pudo guardar'));
  assert.equal(h.tree.root.findAllByType('button').find(node=>node.props.type==='submit').props.disabled,false);
});

test('modal completo alterna editar, cancelar y guardar sin duplicar la ficha ni conservar formularios bloqueados',async t=>{
  function compile(path,mocks={}){
    const source=readFileSync(new URL('../src/features/customers/'+path,import.meta.url),'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const exports={};new Function('require','exports',output)(name=>mocks[name]??require(name),exports);return exports;
  }
  const patches=[],warnings=[];
  t.mock.method(console,'error',(...args)=>warnings.push(args.join(' ')));
  const apiMock={'../../api':{api:{get:async()=>({data:[]}),patch:async(path,fields)=>{patches.push(fields);return {data:{...customer,...fields}};}},apiErrorMessage:()=> 'Error'}};
  const status={'./CustomerStatusBadge':{CustomerStatusSummary:()=>null,CUSTOMER_STATUS_DIMENSION_LABELS:{global:'Estado del cliente',empresa:'Estado del servicio en esta empresa'},customerStatusValues:c=>c.estado?[c.estado]:[]}};
  const profile=compile('CustomerProfileForm.tsx',{...apiMock,...status});
  const {CustomersPanel}=compile('CustomersPanel.tsx',{
    ...apiMock,...status,
    '../../constants':{captureOriginOptions:[],equipmentModeOptions:[],serviceStatusOptions:[],serviceTypeOptions:[]},
    '../../lib':{emptyServiceForm:()=>({}),dateInputValue:()=> '2026-11-12',addYearsToInputDate:v=>v,normalizeWorkOrderValue:v=>String(v??'').toLowerCase(),formatWorkOrderValue:v=>v},
    '../../shared/components':{Modal:({open,children})=>open?React.createElement('section',{role:'dialog'},children):null,TablePagination:()=>null},
    './CustomerContractWorkflow':{CustomerContractWorkflow:()=>React.createElement('div',{'data-contracts':true},'Contratos')},
    './CustomerPendingInstallations':{CustomerPendingInstallations:()=>null},
    './CustomerProfileForm':profile,
    './customer-services-state':compile('customer-services-state.ts'),
  });
  let tree;await act(async()=>{tree=create(React.createElement(CustomersPanel,{customers:[{...customer,idEmpresa:1,contratos:[]}],plans:[],scope:'1',permissions:{manageContracts:true},profileEditor:{admin:true,idEmpresa:1},onChanged(){},onManageInstallation(){}}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  const click=async name=>act(async()=>tree.root.findAllByType('button').find(node=>textOf(node)===name||node.props['aria-label']===name).props.onClick());
  const count=()=>tree.root.findAllByType('form').filter(node=>node.props['aria-label']==='Editar ficha del cliente').length;
  await click('Gestionar');
  for(let round=0;round<3;round++){
    await click('Editar datos del cliente');assert.equal(count(),1);
    await click('Cancelar');assert.equal(count(),0);
    assert.equal(tree.root.findAllByProps({className:'customer-profile-overview'}).length,1);
    await click('Editar datos del cliente');
    await act(async()=>tree.root.findByType('form').findAllByType('input')[0].props.onChange({target:{value:'Nombre actualizado '+round}}));
    await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
    assert.equal(count(),0);
    assert.equal(tree.root.findAllByProps({className:'customer-profile-overview'}).length,1);
    assert.ok(textOf(tree.root.findByProps({role:'dialog'})).includes('Nombre actualizado '+round));
    assert.ok(!textOf(tree.toJSON()).includes('Guardando…'));
  }
  assert.equal(patches.length,3);
  assert.ok(!warnings.some(value=>value.includes('same key')));
});
