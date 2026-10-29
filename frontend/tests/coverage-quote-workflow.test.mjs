import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks) {
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={};new Function('require','exports',out)(name=>{
    if(name in mocks)return mocks[name];if(name.endsWith('.css'))return {};if(name.startsWith('.'))throw Error(name);return require(name);
  },exports);return exports;
}
async function harness(t,{company=1,state='Factible',quoted=false,outside=false}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  const saved={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver};
  globalThis.window={setTimeout,clearTimeout,open:()=>{pdfOpened++;}};
  globalThis.document={createElement:()=>({textContent:''})};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  t.mock.method(globalThis,'fetch',()=>{throw Error('NO EXTERNAL TRAFFIC');});
  t.mock.method(URL,'createObjectURL',()=> 'blob:qa');
  let pdfOpened=0,tree,props;
  const calls=[],maps=[],tiles=[];
  const leaflet={map:()=>{const m={zones:[],pins:[],views:[],bounds:[],handlers:{},setView(p){this.views.push(p);return this;},getZoom:()=>12,
    fitBounds(p){this.bounds.push(p);},on(k,v){this.handlers[k]=v;},invalidateSize(){},remove(){}};maps.push(m);return m;},
    tileLayer:()=>{const tile={handlers:{},addTo(){return this;},on(k,v){this.handlers[k]=v;return this;},off(){}};tiles.push(tile);return tile;},
    layerGroup:()=>({addTo(map){this.map=map;return this;},clearLayers(){this.map.zones=[];this.map.pins=[];}}),
    polygon:p=>({bindTooltip(){return this;},addTo(g){g.map.zones.push(p);return this;}}),
    circleMarker:p=>({bindTooltip(){return this;},addTo(g){g.map.pins.push(p);return this;}}),latLngBounds:p=>p};
  const zone=n=>({idZonaPago:n,idEmpresa:n,activo:true,nombreZona:'Zona '+n,tipoZona:'COBERTURA_GENERAL',poligonoGeojson:{type:'Polygon',coordinates:[[[n,0],[n,1],[n+0.1,1],[n,0]]]}});
  let persisted={idProspecto:10,idCliente:null,nombreCompleto:'QA',empresa:{idEmpresa:company},estadoPipeline:state,
    latitud:outside?-35:-33.475,longitud:company===1?-70.675:-70.475,cotizaciones:quoted?[{idCotizacion:1,idPlan:company,fechaEnvio:'2026-10-28'}]:[],contratos:[]};
  const api={get:async(path,options)=>{calls.push({path,options});
    if(path==='/coverage/status')return {data:{configurado:true}};
    if(path==='/coverage/zones')return {data:[zone(1),zone(2),{...zone(1),idZonaPago:3,activo:false}]};
    if(path==='/qa.pdf')return {data:new Blob(['%PDF-qa'])};throw Error(path);},
    post:async(path,body)=>{calls.push({path,body});
      if(path==='/coverage/check')return {data:{estado:body.latitud===-35?'NO_FACTIBLE':'FACTIBLE',motivo:'QA',consultadoEn:'2026-10-28',
        coberturaComercial:body.latitud!==-35,zona:null,microzona:null,cajas:[],planes:body.latitud===-35?[]:[{idPlan:body.idEmpresa,nombre:'QA',precioAplicable:19990},{idPlan:3,nombre:'Inactivo',precioAplicable:1},{idPlan:4,nombre:'Sin cotizar',precioAplicable:1}]}};
      if(path.endsWith('/quotes')){persisted={...persisted,estadoPipeline:'Cotizacion Enviada',cotizaciones:[{idCotizacion:1,idPlan:body.planId,fechaEnvio:'2026-10-28'}]};return {data:{pdfUrl:'/qa.pdf',envioEmail:'disabled'}};}
      if(path.endsWith('/contracts'))return {data:{contrato:{idContrato:20,estado:'Pendiente firma contrato'}}};throw Error(path);
    }};
  const mocks={'../../api':{api,apiErrorMessage:()=> 'QA error'},leaflet};
  const {CoveragePicker}=load('features/coverage/CommercialCoveragePicker.tsx',mocks);
  const {ProspectWorkflowPanel:Workflow}=load('features/prospects/ProspectWorkflowPanel.tsx',{
    ...mocks,'../coverage':{CoveragePicker},'../../shared/components':{StatusBadge:({value})=>React.createElement('span',null,value),Modal:()=>null}});
  props={prospect:persisted,plans:[{idPlan:1,idEmpresa:1,activo:true,nombreComercial:'Internet QA 1'},{idPlan:2,idEmpresa:2,activo:true,nombreComercial:'Internet QA 2'},
    {idPlan:3,idEmpresa:company,activo:false,nombreComercial:'Inactivo'},{idPlan:4,idEmpresa:company,activo:true,nombreComercial:'Sin cotizar'}],
    permissions:{verifyFeasibility:true,generateQuotes:true,contractPlans:true},onChanged(){props={...props,prospect:persisted};tree.update(React.createElement(Workflow,props));}};
  const mount=()=>create(React.createElement(Workflow,props),{createNodeMock:()=>({})});
  await act(async()=>{tree=mount();});
  const tick=async()=>{await act(async()=>{t.mock.timers.tick(350);});};await tick();
  t.after(async()=>{await act(async()=>tree.unmount());Object.assign(globalThis,saved);});
  return {calls,maps,tiles,tick,get tree(){return tree;},pdfOpened:()=>pdfOpened,
    select:async(index,value)=>{await act(async()=>{tree.root.findAllByType('select')[index].props.onChange({target:{value:String(value)}});});},
    button:label=>tree.root.findAllByType('button').find(b=>b.children.join('')===label),
    remount:async()=>{await act(async()=>tree.unmount());props={...props,prospect:JSON.parse(JSON.stringify(persisted))};await act(async()=>{tree=mount();});await tick();},
    company:async n=>{props={...props,prospect:{...persisted,idProspecto:11,empresa:{idEmpresa:n},latitud:-33.475,longitud:-70.475}};await act(async()=>tree.update(React.createElement(Workflow,props)));await tick();},
    optionIds:index=>tree.root.findAllByType('select')[index].findAllByType('option').map(o=>o.props.value).filter(Boolean),
    text:()=>JSON.stringify(tree.toJSON())};
}
test('React: FACTIBLE → PDF → Cotizacion Enviada conserva plan; reabrir/nueva sesión recupera cotización persistida',async t=>{
  const h=await harness(t);assert.deepEqual(h.optionIds(0),[1,4]);assert.deepEqual(h.optionIds(1),[]);
  await h.select(0,1);await act(async()=>h.button('Generar cotización').props.onClick());
  assert.equal(h.pdfOpened(),1);assert.deepEqual(h.optionIds(1),[1]);
  assert.equal(h.tree.root.findAllByProps({placeholder:'-33.57'})[0].props.disabled,true);
  await h.select(1,1);assert.equal(h.button('Confirmar contratación').props.disabled,false);
  await h.remount();assert.deepEqual(h.optionIds(1),[1]);await h.select(1,1);
  await act(async()=>h.button('Confirmar contratación').props.onClick());
  assert.equal(h.calls.filter(c=>c.path.endsWith('/contracts')).length,1);
  assert.equal(h.calls.find(c=>c.path.endsWith('/contracts')).body.planId,1);
});
test('React: cotizado sin cotización persistida, perdido y NO_FACTIBLE no fabrican autorización',async t=>{
  const h=await harness(t,{state:'Cotizacion Enviada'});assert.deepEqual(h.optionIds(1),[]);
  await h.select(1,1);assert.equal(h.button('Confirmar contratación').props.disabled,true);
});
for(const state of ['Perdido','No Factible'])test('React bloquea '+state,async t=>{
  const h=await harness(t,{state,quoted:true,outside:state==='No Factible'});await h.select(1,1);
  assert.equal(h.button('Confirmar contratación').props.disabled,true);
});
test('React: sin tiles y fuera de cobertura muestra zonas propias; centrar no mueve pin y coordenadas recalculan',async t=>{
  const h=await harness(t,{outside:true});assert.ok(h.text().includes('NO FACTIBLE'));
  assert.equal(h.maps[0].zones.length,1);assert.equal(h.maps[0].zones[0][0][1],1);
  await act(async()=>h.tiles[0].handlers.tileerror());assert.ok(h.text().includes('No se pudo cargar la cartografía'));
  const before=h.maps[0].pins.slice();await act(async()=>h.button('Ver zonas disponibles').props.onClick());
  assert.equal(h.maps[0].bounds.length,1);assert.deepEqual(h.maps[0].pins,before);
  await act(async()=>{h.tree.root.findByProps({placeholder:'-33.57'}).props.onChange({target:{value:'-33.475'}});});
  await act(async()=>h.button('Ubicar punto').props.onClick());await h.tick();
  assert.deepEqual(h.optionIds(0),[1,4]);assert.ok(h.calls.some(c=>c.path==='/coverage/check'&&c.body.latitud===-33.475));
  await h.company(2);assert.equal(h.maps.at(-1).zones.length,1);assert.equal(h.maps.at(-1).zones[0][0][1],2);
  assert.deepEqual(h.optionIds(0),[2]);
});
