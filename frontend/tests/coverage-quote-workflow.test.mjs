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
async function harness(t,{company=1,state='Factible',quoted=false,outside=false,emailDelivery='disabled',g2=false,reviewAvailable=true,reviewFailure=false,commercial=true,canEdit=false,requiresReview=g2,existingContract=false,noPlans=false,geocodeFailure=false,locationFailure=false,noLocation=false,geocodeDisabled=false}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  const saved={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver};
  const events=new EventTarget();
  globalThis.window={setTimeout,clearTimeout,setInterval,clearInterval,open:()=>{pdfOpened++;},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  globalThis.document={hidden:false,createElement:()=>({textContent:''}),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  t.mock.method(globalThis,'fetch',()=>{throw Error('NO EXTERNAL TRAFFIC');});
  t.mock.method(URL,'createObjectURL',()=> 'blob:qa');
  let pdfOpened=0,tree,props,coverageOutside=outside;
  const calls=[],maps=[],tiles=[],notices=[];
  const leaflet={map:()=>{const m={zones:[],pins:[],views:[],bounds:[],handlers:{},setView(p){this.views.push(p);return this;},getZoom:()=>12,
    fitBounds(p){this.bounds.push(p);},on(k,v){this.handlers[k]=v;},invalidateSize(){},remove(){}};maps.push(m);return m;},
    tileLayer:()=>{const tile={handlers:{},addTo(){return this;},on(k,v){this.handlers[k]=v;return this;},off(){}};tiles.push(tile);return tile;},
    layerGroup:()=>({addTo(map){this.map=map;return this;},clearLayers(){this.map.zones=[];this.map.pins=[];}}),
    polygon:p=>({bindTooltip(){return this;},addTo(g){g.map.zones.push(p);return this;}}),
    circleMarker:p=>({bindTooltip(){return this;},addTo(g){g.map.pins.push(p);return this;}}),latLngBounds:p=>p};
  const zone=n=>({idZonaPago:n,idEmpresa:n,activo:true,nombreZona:'Zona '+n,tipoZona:'COBERTURA_GENERAL',poligonoGeojson:{type:'Polygon',coordinates:[[[n,0],[n,1],[n+0.1,1],[n,0]]]}});
  let persisted={idProspecto:10,idCliente:null,nombreCompleto:'QA',empresa:{idEmpresa:company},estadoPipeline:g2?(requiresReview?'NUEVO':'Prospecto Nuevo'):state,
    requiereRevisionComercial:requiresReview,revisionOrigenG2Disponible:g2&&requiresReview&&reviewAvailable,origenContacto:null,
    direccion:g2||noLocation?'Calle QA':null,comuna:noLocation?'La Florida':null,region:noLocation?'Metropolitana de Santiago':null,
    latitud:g2||noLocation?null:outside?-35:-33.475,longitud:g2||noLocation?null:company===1?-70.675:-70.475,cotizaciones:quoted?[{idCotizacion:1,idPlan:company,fechaEnvio:'2026-10-28'}]:[],contratos:existingContract?[{idContrato:20,estado:'Firmado'}]:[]};
  const api={get:async(path,options)=>{calls.push({path,options});
    if(path==='/coverage/status')return {data:{configurado:true}};
    if(path==='/coverage/zones')return {data:[zone(1),zone(2),{...zone(1),idZonaPago:3,activo:false}]};
    if(path==='/qa.pdf')return {data:new Blob(['%PDF-qa'])};throw Error(path);},
    post:async(path,body)=>{calls.push({path,body});
      if(path==='/coverage/geocode'){
        if(geocodeFailure)throw Error('QA geocoding unavailable');
        if(geocodeDisabled)return {data:{candidatos:[],motivo:'PROVEEDOR_DESHABILITADO',mensaje:'La ubicación automática no está habilitada. Marca el punto en el mapa o ingresa las coordenadas.'}};
        return {data:{candidatos:[{latitud:-33.475,longitud:-70.675}]}};
      }
      if(path.endsWith('/g2-review')){
        if(reviewFailure||!reviewAvailable||body.confirmarOrigenG2!==true)throw Error('QA review rejected');
        persisted={...persisted,estadoPipeline:'Prospecto Nuevo',requiereRevisionComercial:false,revisionOrigenG2Disponible:false};return {data:persisted};
      }
      if(path==='/coverage/check')return {data:{estado:coverageOutside?'NO_FACTIBLE':'FACTIBLE',motivo:'QA',consultadoEn:'2026-10-28',
        coberturaComercial:!coverageOutside,zona:null,microzona:null,cajas:[],planes:coverageOutside||noPlans?[]:[{idPlan:body.idEmpresa,nombre:'QA',precioAplicable:19990},{idPlan:3,nombre:'Inactivo',precioAplicable:1},{idPlan:4,nombre:'Sin cotizar',precioAplicable:1}]}};
      if(path.endsWith('/feasibility/tomodat')){persisted={...persisted,...body,idZonaPago:null,estadoPipeline:coverageOutside?'No Factible':'Factible'};return {data:persisted};}
      if(path.endsWith('/quotes')){persisted={...persisted,estadoPipeline:'Cotizacion Enviada',cotizaciones:[{idCotizacion:1,idPlan:body.planId,fechaEnvio:'2026-10-28'}]};return {data:{pdfUrl:'/qa.pdf',envioEmail:emailDelivery}};}
      if(path.endsWith('/contracts'))return {data:{contrato:{idContrato:20,estado:'Pendiente firma contrato'}}};throw Error(path);
    },patch:async(path,body)=>{calls.push({path,body});
      if(locationFailure)throw Error('QA location conflict');
      if(!path.endsWith('/location') && !/^\/prospects\/\d+$/.test(path))throw Error(path);
      const wasQuoted=persisted.estadoPipeline==='Cotizacion Enviada';
      persisted={...persisted,...body.ubicacion,...Object.fromEntries(Object.entries(body).filter(([key])=>key!=='ubicacion')),
        ...(body.ubicacion ? {estadoPipeline:coverageOutside?'No Factible':'Factible'} : {}),
        ...(wasQuoted ? {cotizaciones:persisted.cotizaciones.map(quote=>({...quote,vigente:false}))} : {})};
      return {data:{...persisted,...(wasQuoted?{cobertura:{coberturaComercial:!coverageOutside,planes:coverageOutside?[]:[{idPlan:company,precioAplicable:19990}]}}:{})}};
    }};
  const mocks={'../../shared/hooks/useTransientMessage': load('shared/hooks/useTransientMessage.ts',{}),'../../shared/data/chile-territories': load('shared/data/chile-territories.ts',{}),'../../lib': { formatDateTime: String, formatRutForDisplay: value => value ?? null },'../../api':{api,apiErrorMessage:()=> 'QA error'},leaflet,'../../lib/user-facing-messages':require('./helpers/user-facing-messages.cjs')};
  const {CoveragePicker}=load('features/coverage/CommercialCoveragePicker.tsx',mocks);
  const {ProspectWorkflowPanel:Workflow}=load('features/prospects/ProspectWorkflowPanel.tsx',{
    ...mocks,'../contracts/useSignatureStatus':{useSignatureStatus:()=>({status:null,refresh:async()=>null})},'../customers/ContractDocuments':{ContractDocuments:()=>null},'../coverage':{CoveragePicker},'../../shared/components':{StatusBadge:({value})=>React.createElement('span',null,value),Modal:()=>null}});
  props={prospect:persisted,plans:[{idPlan:1,idEmpresa:1,activo:true,nombreComercial:'Internet QA 1'},{idPlan:2,idEmpresa:2,activo:true,nombreComercial:'Internet QA 2'},
    {idPlan:3,idEmpresa:company,activo:false,nombreComercial:'Inactivo'},{idPlan:4,idEmpresa:company,activo:true,nombreComercial:'Sin cotizar'}],
    permissions:{verifyFeasibility:true,generateQuotes:true,contractPlans:true,createProspects:canEdit||(g2&&commercial)},onNotify(message){notices.push(message);},onChanged(){props={...props,prospect:persisted};tree.update(React.createElement(Workflow,props));}};
  const mount=()=>create(React.createElement(Workflow,props),{createNodeMock:()=>({})});
  await act(async()=>{tree=mount();});
  const tick=async()=>{await act(async()=>{t.mock.timers.tick(700);});await act(async()=>{t.mock.timers.tick(350);});await act(async()=>{t.mock.timers.tick(0);});};await tick();
  t.after(async()=>{await act(async()=>tree.unmount());Object.assign(globalThis,saved);});
  return {calls,maps,tiles,notices,tick,get tree(){return tree;},pdfOpened:()=>pdfOpened,
    advance:async ms=>{await act(async()=>t.mock.timers.tick(ms));},
    address:async()=>{
      const selects=tree.root.findByProps({className:'prospect-edit-form'}).findAllByType('select');
      const region=selects[0].findAllByType('option').find(item=>item.props.value?.startsWith('Metropolitana'));
      await act(async()=>selects[0].props.onChange({target:{value:region.props.value}}));
      await act(async()=>selects[1].props.onChange({target:{value:'La Florida'}}));
    },
    select:async(index,value)=>{await act(async()=>{tree.root.findAllByType('select')[index].props.onChange({target:{value:String(value)}});});},
    button:label=>tree.root.findAllByType('button').find(b=>b.props['aria-label']===label || b.children.join('')===label),
    save:async()=>{await act(async()=>tree.root.findByProps({className:'prospect-edit-form'}).props.onSubmit({preventDefault(){}}));},
    remount:async()=>{await act(async()=>tree.unmount());props={...props,prospect:JSON.parse(JSON.stringify(persisted))};await act(async()=>{tree=mount();});await tick();},
    company:async n=>{props={...props,prospect:{...persisted,idProspecto:11,empresa:{idEmpresa:n},latitud:-33.475,longitud:-70.475}};await act(async()=>tree.update(React.createElement(Workflow,props)));await tick();},
    outside:value=>{coverageOutside=value;},
    refresh:async()=>{await act(async()=>events.dispatchEvent(new Event('focus')));await tick();},
    optionIds:index=>tree.root.findAllByType('select')[index]?.findAllByType('option').map(o=>o.props.value).filter(Boolean)??[],
    text:()=>JSON.stringify(tree.toJSON()),persisted:()=>persisted,
    changeField:async(label,value)=>{const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
      const field=tree.root.findAllByType('label').find(node=>text(node).startsWith(label)).findByType('input');
      await act(async()=>field.props.onChange({target:{value}}));},
    confirmOrigin:async()=>{await act(async()=>tree.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));}};
}

test('el lápiz edita los datos del prospecto y los conserva al reabrir', async t => {
  const h = await harness(t, { g2: true, requiresReview: false });
  await act(async () => h.button('Editar prospecto').props.onClick());
  await h.changeField('Nombre completo', 'Prospecto editado QA');
  await h.changeField('Teléfono', '+56900000003');
  await h.changeField('Correo', 'editado@example.invalid');
  await h.save();
  assert.ok(h.calls.some(call => call.path === '/prospects/10' && call.body.telefono === '+56900000003'));
  await h.remount();
  assert.ok(h.text().includes('Prospecto editado QA'));
  assert.ok(h.text().includes('+56900000003'));
  assert.ok(h.text().includes('editado@example.invalid'));
  assert.ok(!h.text().includes('Pin azul:'));
});

test('cancelar descarta los datos y el punto editados sin guardar', async t => {
  const h = await harness(t, { g2: true, requiresReview: false });
  await act(async () => h.button('Editar prospecto').props.onClick());
  await h.changeField('Nombre completo', 'Borrador sin guardar');
  await h.address(); await h.tick();
  assert.deepEqual(h.maps.at(-1).pins, [[-33.475,-70.675]]);
  await act(async () => h.button('Cancelar').props.onClick());
  await h.tick();
  assert.equal(h.calls.filter(call => call.path === '/prospects/10' || call.path.endsWith('/location')).length, 0);
  assert.equal(h.persisted().latitud, null);
  assert.ok(!h.text().includes('Borrador sin guardar'));
});

test('G2 NUEVO: revisión explícita → ubicación → cobertura real del flujo → cotización → contratación', async t => {
  const h=await harness(t,{g2:true});
  assert.equal(h.button('Aprobar revisión del portal').props.disabled,true);
  assert.equal(h.button('Editar prospecto'),undefined);
  assert.equal(h.calls.filter(c=>c.path.includes('/feasibility')).length,0);
  await h.confirmOrigin();
  await act(async()=>{h.button('Aprobar revisión del portal').props.onClick();h.button('Aprobar revisión del portal').props.onClick();});
  assert.equal(h.calls.filter(c=>c.path.endsWith('/g2-review')).length,1);
  assert.equal(h.persisted().estadoPipeline,'Prospecto Nuevo');
  assert.equal(h.persisted().latitud,null);assert.equal(h.persisted().origenContacto,null);
  await act(async()=>h.button('Editar prospecto').props.onClick());
  await h.address(); await h.tick();
  assert.deepEqual(h.maps.at(-1).pins, [[-33.475,-70.675]]);
  assert.equal(h.calls.filter(c=>c.path==='/prospects/10').length,0);
  await h.save(); await h.tick();
  assert.equal(h.persisted().comuna,'La Florida');
  assert.equal(h.persisted().estadoPipeline,'Factible');
  assert.ok(h.calls.some(c=>c.path==='/coverage/check'));
  assert.deepEqual(h.optionIds(0),[1,4]);
  await h.select(0,1);await act(async()=>h.button('Generar cotización').props.onClick());
  await h.select(1,1);await act(async()=>h.button('Confirmar contratación').props.onClick());
  assert.equal(h.calls.filter(c=>c.path.endsWith('/contracts')).length,1);
  assert.equal(h.persisted().idCliente,null);
  assert.ok(h.calls.every(c=>!c.path.includes('install-orders')&&!c.path.includes('g3')));
});

for(const options of [{g2:true,reviewAvailable:false},{g2:true,commercial:false},
  {requiresReview:true,state:'Servicio Activo',reviewAvailable:false}])test('revisión sin evidencia/permisos o histórico no se desbloquea: '+JSON.stringify(options),async t=>{
  const h=await harness(t,options);assert.equal(h.button('Aprobar revisión del portal'),undefined);
  assert.equal(h.button('Editar prospecto'),undefined);assert.equal(h.button('Generar cotización'),undefined);
  assert.equal(h.calls.filter(c=>c.path.includes('/feasibility')||c.path.endsWith('/g2-review')).length,0);
});

test('rechazo de revisión y coordenadas ausentes no anuncian éxito ni envían escrituras',async t=>{
  const h=await harness(t,{g2:true,reviewFailure:true});await h.confirmOrigin();
  await act(async()=>h.button('Aprobar revisión del portal').props.onClick());
  assert.equal(h.persisted().estadoPipeline,'NUEVO');assert.equal(h.button('Editar prospecto'),undefined);
  assert.ok(h.text().includes('QA error'));
});

test('ubicación ausente tras revisión exige coordenadas y no infiere comuna o región',async t=>{
  const h=await harness(t,{g2:true});await h.confirmOrigin();await act(async()=>h.button('Aprobar revisión del portal').props.onClick());
  await act(async()=>h.button('Editar prospecto').props.onClick());
  await h.changeField('Dirección','Otra dirección QA');await h.save();
  assert.equal(h.calls.filter(c=>c.path.endsWith('/location')).length,0);
  assert.equal(h.persisted().comuna,null);assert.equal(h.persisted().region,null);
  assert.equal(h.persisted().estadoPipeline,'Prospecto Nuevo');
});


for(const options of [{existingContract:true},{commercial:false}])test('contrato o permisos insuficientes conservan resumen y el mapa no escribe: '+JSON.stringify(options),async t=>{
  const h=await harness(t,{g2:true,requiresReview:false,...options});
  assert.equal(h.tree.root.findAllByProps({placeholder:'-33.57'}).length,0);
  await act(async()=>h.maps.at(-1).handlers.click({latlng:{lat:-33.475,lng:-70.675}}));await h.tick();
  assert.equal(h.calls.filter(c=>c.path.endsWith('/location')||c.path.includes('/feasibility')).length,0);
});

for(const options of [{outside:true},{noPlans:true},{locationFailure:true}])test('cobertura negativa, falta de planes o conflicto no habilitan contratación: '+JSON.stringify(options),async t=>{
  const h=await harness(t,{g2:true,requiresReview:false,...options});
  await act(async()=>h.button('Editar prospecto').props.onClick());await h.address();await h.tick();await h.save();await h.tick();
  assert.equal(h.button('Generar cotización'),undefined);assert.equal(h.button('Confirmar contratación'),undefined);
  if(options.locationFailure)assert.equal(h.calls.filter(c=>c.path.includes('/feasibility')).length,0);
});

test('geocodificación fallida deja reintentar, quita el aviso a los tres segundos y conserva la dirección',async t=>{
  const h=await harness(t,{g2:true,requiresReview:false,geocodeFailure:true});
  await act(async()=>h.button('Editar prospecto').props.onClick());await h.address();await h.tick();
  assert.ok(h.text().includes('No se pudo ubicar la dirección'));
  assert.ok(h.button('Reintentar dirección'));
  await h.advance(3000);
  assert.ok(!h.text().includes('No se pudo ubicar la dirección'));
  assert.equal(h.persisted().latitud,null); assert.equal(h.persisted().comuna,null);
});
test('Factible heredado sin coordenadas: no habilita cotizar; ubicación manual persiste el punto y recalcula la factibilidad',async t=>{
  const h=await harness(t,{canEdit:true,noLocation:true,geocodeDisabled:true});
  assert.equal(h.persisted().estadoPipeline,'Factible');
  assert.ok(h.text().includes('La ubicación automática no está habilitada'),'explica por qué no se ubicó');
  assert.equal(h.button('Generar cotización'),undefined,'un Factible sin punto guardado no es una ubicación confirmada');
  assert.equal(h.calls.filter(c=>c.path==='/coverage/check').length,0);
  assert.ok(h.tree.root.findAllByProps({placeholder:'-33.57'}).length>0,'ofrece coordenadas manuales');
  await act(async()=>h.maps.at(-1).handlers.click({latlng:{lat:-33.475,lng:-70.675}}));await h.tick();
  const writes=h.calls.filter(c=>c.path.endsWith('/location'));
  assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{ubicacion:{latitud:-33.475,longitud:-70.675}});
  assert.equal(h.persisted().latitud,-33.475);assert.equal(h.persisted().estadoPipeline,'Factible');
  assert.ok(h.button('Generar cotización'),'cotizar solo tras punto guardado y cobertura del backend');
  assert.equal(h.tree.root.findAllByProps({placeholder:'-33.57'}).length,0,'un punto guardado solo se corrige desde Editar');
});

test('Factible heredado sin coordenadas fuera de cobertura queda No Factible y no cotiza',async t=>{
  const h=await harness(t,{canEdit:true,noLocation:true,geocodeDisabled:true,outside:true});
  await act(async()=>h.maps.at(-1).handlers.click({latlng:{lat:-35,lng:-70.675}}));await h.tick();
  assert.equal(h.persisted().estadoPipeline,'No Factible');assert.equal(h.button('Generar cotización'),undefined);
});

test('Cotizacion Enviada sin coordenadas no escribe ubicación desde el resumen: requiere Editar',async t=>{
  const h=await harness(t,{canEdit:true,noLocation:true,geocodeDisabled:true,state:'Cotizacion Enviada',quoted:true});
  assert.equal(h.tree.root.findAllByProps({placeholder:'-33.57'}).length,0);
  await act(async()=>h.maps.at(-1).handlers.click({latlng:{lat:-33.475,lng:-70.675}}));await h.tick();
  assert.equal(h.calls.filter(c=>c.path.endsWith('/location')||c.path.includes('/feasibility')).length,0);
  await act(async()=>h.button('Editar prospecto').props.onClick());
  assert.ok(h.tree.root.findAllByProps({placeholder:'-33.57'}).length>0,'al editar sí puede marcar el punto');
});

test('candidato automático guardado: la cobertura se verifica por coordenadas y el punto se corrige desde Editar',async t=>{
  const h=await harness(t,{canEdit:true,noLocation:true});
  const location=h.calls.filter(c=>c.path.endsWith('/location'));
  assert.equal(location.length,1);assert.deepEqual(location[0].body,{ubicacion:{latitud:-33.475,longitud:-70.675}});
  assert.ok(h.calls.some(c=>c.path==='/coverage/check'&&c.body.latitud===-33.475),'la factibilidad viene de /coverage/check, no del geocodificador');
  await act(async()=>h.button('Editar prospecto').props.onClick());
  const coordinate=placeholder=>h.tree.root.findAllByProps({placeholder})[0];
  assert.ok(coordinate('-33.57'),'al editar se puede corregir el punto');
  await act(async()=>coordinate('-33.57').props.onChange({target:{value:'-33.48'}}));
  await act(async()=>coordinate('-70.61').props.onChange({target:{value:'-70.68'}}));
  await act(async()=>h.button('Ubicar punto').props.onClick());await h.tick();
  await h.save();await h.tick();
  const saved=h.calls.filter(c=>/^\/prospects\/\d+$/.test(c.path)).at(-1);
  assert.deepEqual(saved.body.ubicacion,{latitud:-33.48,longitud:-70.68});
  assert.equal(h.persisted().latitud,-33.48);
});

test('React: FACTIBLE → PDF → Cotizacion Enviada conserva plan; reabrir/nueva sesión recupera cotización persistida',async t=>{
  const h=await harness(t);assert.deepEqual(h.optionIds(0),[1,4]);assert.deepEqual(h.optionIds(1),[]);
  await h.select(0,1);await act(async()=>h.button('Generar cotización').props.onClick());
  assert.equal(h.pdfOpened(),1);assert.deepEqual(h.optionIds(1),[1]);
  assert.equal(h.tree.root.findAllByProps({placeholder:'-33.57'}).length,0);
  await h.select(1,1);assert.equal(h.button('Confirmar contratación').props.disabled,false);
  await h.remount();assert.deepEqual(h.optionIds(1),[1]);await h.select(1,1);
  await act(async()=>h.button('Confirmar contratación').props.onClick());
  assert.equal(h.calls.filter(c=>c.path.endsWith('/contracts')).length,1);
  assert.equal(h.calls.find(c=>c.path.endsWith('/contracts')).body.planId,1);
});
test('React: cotizado sin cotización persistida, perdido y NO_FACTIBLE no fabrican autorización',async t=>{
  const h=await harness(t,{state:'Cotizacion Enviada'});assert.deepEqual(h.optionIds(1),[]);
  assert.equal(h.button('Confirmar contratación'),undefined);
});
test('React: editar después de cotizar invalida esa cotización y permite emitir otra',async t=>{
  const h=await harness(t,{state:'Cotizacion Enviada',quoted:true,canEdit:true});
  await act(async()=>h.button('Editar prospecto').props.onClick());
  await h.changeField('Teléfono','+56900000007');await h.save();
  assert.equal(h.persisted().estadoPipeline,'Factible');assert.equal(h.persisted().cotizaciones[0].vigente,false);
  assert.ok(h.text().includes('No vigente'));
  assert.ok(h.text().includes('La cotización anterior quedó invalidada'));
  assert.deepEqual(h.optionIds(0),[1]);assert.equal(h.button('Confirmar contratación'),undefined);
  await h.select(0,1);await act(async()=>h.button('Generar cotización').props.onClick());
  assert.equal(h.persisted().estadoPipeline,'Cotizacion Enviada');assert.equal(h.persisted().cotizaciones.length,1);
});
test('React: la contratación usa la dirección guardada y envía el plan y la observación', async t => {
  const h = await harness(t, { state: 'Cotizacion Enviada', quoted: true });
  assert.ok(!h.text().includes('Comuna de instalación'));
  assert.ok(!h.text().includes('Fecha de confirmación'));
  const observation = h.tree.root.findByProps({ maxLength: 500 });
  await act(async () => observation.props.onChange({ target: { value: 'Confirmación en sucursal' } }));
  await h.select(1, 1);
  await act(async () => h.button('Confirmar contratación').props.onClick());
  assert.deepEqual(h.calls.find(c => c.path.endsWith('/contracts')).body, { planId: 1, observacionContrato: 'Confirmación en sucursal' });
});
for(const state of ['Perdido','No Factible'])test('React bloquea '+state,async t=>{
  const h=await harness(t,{state,quoted:true,outside:state==='No Factible'});
  assert.equal(h.button('Confirmar contratación'),undefined);
  assert.equal(h.button('Generar cotización'),undefined);
});
test('React: actualizar polígonos recalcula factibilidad, persiste el cambio y mantiene el punto guardado',async t=>{
  const h=await harness(t,{state:'No Factible',outside:true});assert.deepEqual(h.optionIds(0),[]);
  assert.equal(h.maps[0].zones.length,1);assert.equal(h.maps[0].zones[0][0][1],1);
  await act(async()=>h.tiles[0].handlers.tileerror());assert.ok(h.text().includes('No se pudo cargar el mapa base'));
  const before=h.maps[0].pins.slice();h.outside(false);await h.refresh();
  assert.deepEqual(h.maps[0].pins,before);assert.deepEqual(h.optionIds(0),[1,4]);
  assert.equal(h.calls.filter(c=>c.path.endsWith('/feasibility/tomodat')).length,1);
  await h.refresh();assert.equal(h.calls.filter(c=>c.path.endsWith('/feasibility/tomodat')).length,1,'no duplica auditorías sin cambios');
  assert.equal(h.calls.filter(c=>c.path==='/coverage/geocode').length,0);
  await h.company(2);assert.equal(h.maps.at(-1).zones.length,1);assert.equal(h.maps.at(-1).zones[0][0][1],2);
  assert.deepEqual(h.optionIds(0),[2]);
});

test('React: una cotización previa no habilita contratar si la cobertura dejó de ser factible',async t=>{
  const h=await harness(t,{state:'Cotizacion Enviada',quoted:true});
  assert.ok(h.button('Confirmar contratación'));
  h.outside(true);await h.refresh();
  assert.equal(h.button('Confirmar contratación'),undefined);assert.equal(h.button('Generar cotización'),undefined);
  assert.equal(h.calls.filter(c=>c.path.endsWith('/feasibility/tomodat')).length,0,'no retrocede el estado de un prospecto cotizado');
});


for (const delivery of ['sent', 'failed', 'disabled']) test('React: aviso de cotización refleja el envío real: ' + delivery, async t => {
  const h = await harness(t, { emailDelivery: delivery });
  await h.select(0, 1); await act(async () => h.button('Generar cotización').props.onClick());
  assert.ok(!h.text().includes('SMTP'));
  if (delivery === 'sent') assert.deepEqual(h.notices, ['Cotización enviada']);
  else if (delivery === 'disabled') assert.deepEqual(h.notices, ['Cotización generada']);
  else { assert.deepEqual(h.notices, []); assert.ok(h.text().includes('No se pudo enviar la cotización.')); }
});

test('TK-07: el editor de prospecto usa el patrón del editor de clientes sin cambiar su guardado', async t => {
  const h = await harness(t, { g2: true, requiresReview: false });
  await act(async () => h.button('Editar prospecto').props.onClick());
  const form = h.tree.root.findByProps({ className: 'prospect-edit-form' });
  const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
  const labels = form.findAllByType('label').map(node => text(node).split(/(?=Seleccionar|Selecciona)/)[0]);
  assert.deepEqual(labels.map(label => label.replace(/Metropolitana.*$/, '')), ['Nombre completo', 'Origen de contacto', 'Teléfono', 'Correo', 'Dirección', 'Región', 'Comuna']);
  assert.match(text(form), /Empresa/);
  assert.equal(h.button('Cancelar').props.className, 'secondary compact');
  assert.equal(h.button('Guardar datos').props.className, 'compact');
  await h.changeField('Teléfono', '+56900000004');
  await h.save();
  assert.ok(h.calls.some(call => call.path === '/prospects/10' && call.body.telefono === '+56900000004'));
  assert.equal(h.calls.some(call => call.path.startsWith('/customers/')), false);
});
