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
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => mocks[name] ?? require(name), exports);
  return exports;
}
const model = compile('control-book-model.ts');
const times = compile('control-book-contact-time.ts');
const row = { rowId: '10-31-51', idCliente: 10, idEmpresa: 1, idContrato: 31, numeroContrato: 'CT-31', idServicio: 41, idFactura: 51,
  nombre: 'Cliente de prueba', plan: 'Fibra 400', saldoPendiente: 19990, diasAtraso: 20, diaPago: 10 };
const Modal = ({ title, headerDetails, navigation, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, headerDetails, navigation, children);

test('toda la fila selecciona y deselecciona el plan', async t => {
  const selected=[];
  const {ControlBookCustomerContracts}=compile('ControlBookCustomerContracts.tsx',{'../../lib':{formatWorkOrderValue:value=>value},'../../shared/components':{StatusBadge:({value})=>value},'./control-book-model':model});
  const props={row,contracts:[{idContrato:31,plan:{nombreComercial:'Fibra'},estado:'Activo'}],services:[],loading:false,error:false,onRetry(){},selectedContractId:null,onSelect:id=>selected.push(id)};
  let tree;await act(async()=>{tree=create(React.createElement(ControlBookCustomerContracts,props));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  await act(async()=>tree.root.findByType('tbody').findByType('tr').props.onClick());
  await act(async()=>tree.update(React.createElement(ControlBookCustomerContracts,{...props,selectedContractId:31})));
  await act(async()=>tree.root.findByType('tbody').findByType('tr').props.onClick());
  assert.deepEqual(selected,[31,null]);
});

async function drawer(t, changes = {}, portfolioRows) {
  const posts = [], saved = [];
  const { ControlBookDrawer } = compile('ControlBookDrawer.tsx', {
    '../../api': { api: { get: async path => ({ data: path === '/commercial/control-book' ? { items: portfolioRows ?? [{ ...row, ...changes }], pagination: { totalPages: 1 } } : [] }), post: async (...args) => posts.push(args) }, apiErrorMessage: () => 'No se pudo guardar' },
    '../customers/CustomerStatusBadge': { CustomerStatusSummary: () => null },
    './ControlBookCustomerContracts': { ControlBookCustomerContracts: ({ onSelect }) => React.createElement('button', { onClick: () => onSelect(portfolioRows?.[0]?.idContrato ?? 31) }, 'Seleccionar plan') },
    './ControlBookHistory': { ControlBookHistory: () => null },
    './ControlBookManualPayment': { ControlBookManualPayment: () => null },
    './ControlBookModal': { ControlBookModal: Modal },
    './control-book-model': model, './control-book-contact-time': times,
  });
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookDrawer, {
    row: { ...row, ...changes }, revision: 0, canManage: true, canManagePayments: true, canViewBilling: true, canViewDocuments: true,
    onClose() {}, onSaved: value => saved.push(value), onBusyChange() {}, onOpenBilling() {},
  })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const click = async label => act(async () => tree.root.findAllByType('button').find(node => textOf(node) === label).props.onClick({ currentTarget: { closest: () => null } }));
  const change = async (label, value, type = 'input') => act(async () => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label)).findByType(type).props.onChange({ target: { value } }));
  const submit = async () => act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.ok(tree.root.findAllByType('button').find(node => textOf(node) === 'Registrar gestión').props.disabled);
  await click('Seleccionar plan');
  return { tree, posts, saved, click, change, submit };
}

test('una sola entrada conserva los tres motivos, sus endpoints y la hora real del contacto', async t => {
  for (const [reason, endpoint, tipo] of [['event', '/commercial/events', 'CONTACTO_CLIENTE'], ['lastNotice', '/commercial/events', 'ULTIMO_AVISO_CORTE'], ['withdrawal', '/commercial/withdrawal-notices', 'AVISO_PREVIO_RETIRO']]) {
    const h = await drawer(t);
    assert.equal(h.tree.root.findAllByType('button').filter(node => textOf(node) === 'Registrar gestión').length, 1);
    assert.ok(!h.tree.root.findAllByType('button').some(node => textOf(node) === 'Registrar último aviso'));
    await h.click('Registrar gestión');
    await h.change('Motivo', reason, 'select');
    await h.change('Canal utilizado', 'WHATSAPP', 'select');
    await h.change('Fecha y hora', '2026-11-12T20:25');
    await h.change('Qué se informó', 'Se conversó con el cliente', 'textarea');
    await h.submit();
    assert.deepEqual(h.posts, [[endpoint, { idCliente: 10, idContrato: 31, idServicio: 41, idFactura: 51, tipo, canal: 'WHATSAPP', fecha: '2026-11-12T23:25:00.000Z', observacion: 'Se conversó con el cliente' }]]);
    assert.equal(h.saved.length, 1);
  }
});

test('motivos no disponibles conservan las restricciones; historial no repite las gestiones', async t => {
  const h = await drawer(t, { idFactura: null, idServicio: null, saldoPendiente: 0, diasAtraso: 0 });
  await h.click('Registrar gestión');
  const options = h.tree.root.findAllByType('label').find(node => textOf(node).startsWith('Motivo')).findAllByType('option');
  assert.equal(options.find(node => node.props.value === 'lastNotice').props.disabled, true);
  assert.equal(options.find(node => node.props.value === 'withdrawal').props.disabled, true);
  await h.change('Motivo', 'withdrawal', 'select');
  assert.equal(h.tree.root.findAllByType('label').find(node => textOf(node).startsWith('Motivo')).findByType('select').props.value, 'event');
  assert.ok(!h.tree.root.findAllByType('option').some(node => node.props.value === 'SMS'));
  await h.click('Cancelar');
  await h.click('Contactos y acuerdos');
  assert.ok(!textOf(h.tree.toJSON()).includes('Gestiones comerciales'));
});

test('las acciones y Pago manual aparecen únicamente en la ficha del cliente',async t=>{
  const h=await drawer(t);
  assert.ok(textOf(h.tree.toJSON()).includes('Pago manual'));
  for(const view of ['Facturas y pagos','Contactos y acuerdos','Documentos tributarios']){
    await h.click(view);
    assert.equal(h.tree.root.findAllByProps({'aria-label':'Acciones del cliente'}).length,0);
    assert.ok(!textOf(h.tree.toJSON()).includes('Pago manual'));
  }
});

test('cambiar día conserva el contrato y valor elegidos, sin modificar facturas existentes', async t => {
  const h = await drawer(t);
  await h.click('Cambiar día de pago');
  await h.change('Nuevo día de pago', '25');
  await h.change('Motivo / observación', 'Solicitado por el cliente', 'textarea');
  await h.submit();
  assert.deepEqual(h.posts, [['/commercial/payment-condition-changes', { idCliente: 10, idContrato: 31, tipoCambio: 'DIA_PAGO', valorNuevo: '25', justificacion: 'Solicitado por el cliente' }]]);
});

test('convenio se confirma en dos pasos y usa el plan seleccionado, sin crear pagos', async t => {
  const selected = { ...row, rowId: '10-32-52', idContrato: 32, numeroContrato: 'CT-32', idServicio: 42, idFactura: 52, plan: 'Otro plan' };
  const h = await drawer(t, {}, [selected]);
  await h.click('Crear convenio');
  await h.change('Condiciones', 'Pago en dos cuotas', 'textarea');
  await h.submit();
  assert.equal(h.posts.length, 0);
  assert.ok(textOf(h.tree.toJSON()).includes('Cuotas del convenio'));
  assert.ok(!textOf(h.tree.toJSON()).includes('Revisión'));
  await h.submit();
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0][0], '/commercial/agreements');
  assert.equal(h.posts[0][1].idContrato, 32);
  assert.equal(h.posts[0][1].idFactura, 52);
  assert.equal(h.posts[0][1].cuotas.length, 2);
  assert.equal(h.posts[0][1].cuotas.reduce((sum, item) => sum + item.monto, 0), 19990);
});

test('el plan habilita acciones y la factura se elige dentro del modal con su fecha', async t => {
  const h = await drawer(t, {}, [{...row,fechaVencimientoEfectiva:'2026-11-10'}, {...row, rowId: '10-31-52', idFactura: 52,fechaVencimientoEfectiva:'2026-12-10'}]);
  assert.equal(h.tree.root.findAllByType('button').find(node => textOf(node) === 'Crear convenio').props.disabled, false);
  assert.equal(h.tree.root.findAllByType('select').length,0);
  await h.click('Otorgar prórroga');
  const selector=h.tree.root.findAllByType('label').find(node=>textOf(node).startsWith('Documento')).findByType('select');
  assert.ok(!textOf(selector).includes('·'));
  await h.submit();
  assert.equal(h.posts.length,0);
  await h.change('Documento', '10-31-52', 'select');
  await h.change('Nueva fecha', '2026-12-25');
  await h.change('Motivo / observación', 'Solicitud del cliente', 'textarea');
  await h.submit();
  assert.deepEqual(h.posts,[['/commercial/extensions',{idFactura:52,nuevaFecha:'2026-12-25',motivo:'Solicitud del cliente'}]]);
});

test('cuotas se consultan como calendario en facturas, sin ofrecer imputaciones en el historial', async t => {
  const calls = [];
  const movement = {key:'agreement-18',tipo:'CONVENIO',estado:'PENDIENTE',idContrato:31,idFactura:51,fecha:'2026-11-12T10:00:00Z',fechaRegistro:'2026-11-12T10:00:00Z',cuotas:[1,2].map(numero=>({numero,monto:9995,fechaVencimiento:'2026-12-25',estado:'PENDIENTE'}))};
  const {ControlBookHistory} = compile('ControlBookHistory.tsx', {
    '../../api': {api:{get:async path=>{calls.push(path);return {data:path.endsWith('/allocations')?{idConvenio:18,idEmpresa:1,idFactura:51,cuotas:movement.cuotas.map(q=>({...q,monto:'9995',imputado:'0',saldo:'9995'}))}:{invoices:[{idFactura:51,idContrato:31,periodoMes:11,periodoAnio:2026,folio:'B-51',plan:'Fibra',monto:19990,pagado:0,saldo:19990,estado:'Pendiente'}],movements:[movement]}};}},apiErrorMessage:()=> 'Error'},
    '../../shared/hooks/useAutoRefresh':{useAutoRefresh(){}}, './control-book-model':model,'./control-book-contact-time':times,
  });
  let tree;
  await act(async()=>{tree=create(React.createElement(ControlBookHistory,{row,revision:0,view:'invoices'}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  assert.ok(!calls.includes('/commercial/agreements/18/allocations'));
  assert.ok(!textOf(tree.toJSON()).includes('Cuota 1 de 2'));
  await act(async()=>tree.root.findAllByType('button').find(node=>node.props['aria-expanded']===false).props.onClick({stopPropagation(){}}));
  assert.ok(calls.includes('/commercial/agreements/18/allocations'));
  assert.ok(textOf(tree.toJSON()).includes('Cuota 1 de 2'));
  assert.ok(textOf(tree.toJSON()).includes('Cuota 2 de 2'));
  assert.ok(!textOf(tree.toJSON()).includes('Ver cuotas'));
  assert.ok(!textOf(tree.toJSON()).includes('Imputar'));
  assert.equal(tree.root.findAllByType('table').length, 2); // invoices and activity; no separate quota table
  await act(async()=>tree.root.findAllByType('button').find(node=>node.props['aria-expanded']===true).props.onClick({stopPropagation(){}}));
  assert.ok(!textOf(tree.toJSON()).includes('Cuota 1 de 2'));
});

test('el encabezado del convenio solo muestra su número y cada cuota tiene su propio documento',async t=>{
  const opened=[];
  const movement={key:'agreement-18',tipo:'CONVENIO',estado:'APROBADO',idFactura:51,cuotas:[1,2].map(numero=>({numero,monto:9995,fechaVencimiento:'2026-12-25',estado:'PENDIENTE'}))};
  const {ControlBookHistory}=compile('ControlBookHistory.tsx',{'../../api':{api:{get:async path=>({data:path.endsWith('/allocations')?{idConvenio:18,idEmpresa:1,idFactura:51,cuotas:movement.cuotas.map(q=>({...q,idCuota:80+q.numero,imputado:q.numero===1?'9995':'0',saldo:q.numero===1?'0':'9995',estado:q.numero===1?'PAGADA':'PENDIENTE'}))}:{invoices:[{idFactura:51,idContrato:31,periodoMes:11,periodoAnio:2026,monto:19990,pagado:9995,saldo:9995,estado:'Parcial'}],movements:[movement]}})},apiErrorMessage:()=> 'Error'},'../../shared/hooks/useAutoRefresh':{useAutoRefresh(){}},'./control-book-model':model,'./control-book-contact-time':times});
  let tree;await act(async()=>{tree=create(React.createElement(ControlBookHistory,{row,revision:0,view:'invoices',onOpenInvoice:focus=>opened.push(focus)}));});
  t.after(async()=>{await act(async()=>tree.unmount());});
  await act(async()=>tree.root.findAllByType('button').find(n=>n.props['aria-expanded']===false).props.onClick({stopPropagation(){}}));
  assert.equal(textOf(tree.root.findByProps({className:'control-agreement-caption'})),'Convenio #18');
  const button=tree.root.findByProps({'aria-label':'Documento tributario de cuota 1'});
  assert.equal(button.props.disabled,false);assert.equal(tree.root.findByProps({'aria-label':'Documento tributario de cuota 2'}).props.disabled,true);
  await act(async()=>button.props.onClick());
  assert.deepEqual(opened,[{idFactura:51,idCliente:10,idEmpresa:1,idConvenio:18,idCuota:81}]);
});

test('fecha y hora chilenas conservan el instante en verano, invierno y cambio de día', () => {
  for (const [input, iso] of [['2026-11-12T23:25', '2026-11-13T02:25:00.000Z'], ['2026-06-12T20:25', '2026-06-13T00:25:00.000Z']]) {
    assert.equal(times.contactDateTimeISO(input), iso);
    assert.equal(times.contactDateTimeInput(new Date(iso)), input);
    assert.equal(times.contactTimeLabel(iso), input.slice(11));
  }
  assert.equal(times.contactDateTimeISO(''), null);
  assert.equal(times.contactDateTimeISO('2026-02-30T10:00'), null);
});

test('tabla separa columnas y abre la factura pulsada, sin repetir resumen; historial muestra hora y canal', async t => {
  const opened = [];
  const invoices = [51, 52].map(id => ({ idFactura: id, idContrato: id === 51 ? 31 : 32, plan: 'Fibra ' + id, periodoMes: 11, periodoAnio: 2026, tipoDocumento: 'BOLETA', folio: 'B-' + id, monto: 19990, pagado: id===52?19990:0, saldo: id===52?0:19990, estado: id===52?'Pagada':'Vencida', fechaVencimientoEfectiva: '2026-11-10', pagos: [] }));
  const { ControlBookHistory } = compile('ControlBookHistory.tsx', {
    '../../api': { api: { get: async () => ({ data: { invoices, movements: [{ key: 'event-1', tipo: 'CONTACTO_CLIENTE', fecha: '2026-11-13T02:25:00Z', fechaRegistro: '2026-11-13T02:26:00Z', estado: 'REGISTRADO', canal: 'WHATSAPP', responsable: 'Comercial', detalle: 'Observación', idContrato: 31, idFactura: 51 }] } }) }, apiErrorMessage: () => 'Error' },
    '../../shared/hooks/useAutoRefresh': { useAutoRefresh() {} },
    './control-book-model': model, './control-book-contact-time': times, './InstallmentAllocationsPanel': { InstallmentAllocationsPanel: () => null },
  });
  const props = { row, contracts: [{ idContrato: 31, numeroContratoExterno: 'CT-31' }, { idContrato: 32, numeroContratoExterno: 'CT-32' }], revision: 0, view: 'invoices', onOpenInvoice: invoice => opened.push(invoice) };
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookHistory, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const invoiceTable = tree.root.findByProps({ 'aria-label': 'Facturas del cliente' });
  assert.deepEqual(invoiceTable.findByType('thead').findAllByType('th').map(textOf), ['Mes', 'Documento', 'Servicio', 'Contrato', 'Monto', 'Pagado', 'Pendiente', 'Estado', 'Vencimiento', 'Documento tributario']);
  assert.ok(invoiceTable.findAllByType('td').some(node => textOf(node) === 'CT-32'));
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Detalle de la factura seleccionada' }).length, 0);
  assert.equal(invoiceTable.findAllByType('button')[0].props.disabled,true);
  await act(async()=>invoiceTable.findAllByType('button')[0].props.onClick({stopPropagation(){}}));
  assert.equal(opened.length,0);
  await act(async () => invoiceTable.findAllByType('button')[1].props.onClick({stopPropagation(){}}));
  assert.deepEqual(opened, [{ idFactura: 52, idCliente: 10, idEmpresa: 1 }]);
  await act(async () => tree.update(React.createElement(ControlBookHistory, { ...props, view: 'activity' })));
  assert.ok(textOf(tree.toJSON()).includes('23:25'));
  assert.ok(textOf(tree.toJSON()).includes('WhatsApp'));
});

test('la hojita abre solamente el documento tributario y no ofrece avisos ni suspensión', async t => {
  const selected = { idFactura: 52, idContrato: 32 };
  const { ControlBookFinancePanel } = compile('ControlBookFinancePanel.tsx', {
    '../../api': {},
    './ControlBookTaxDocument': {ControlBookTaxDocument:({invoice})=>React.createElement('p',null,'Documento '+invoice.idFactura)},
    '../billing/ExternalTaxDocumentsPanel': { ExternalTaxDocumentsPanel: () => null },
    './ControlBookModal': { ControlBookModal: Modal },
  });
  const props = { row, scope: '1', customers: [], permissions: { viewBilling: true }, revision: 0, onChanged() {}, focusedInvoice: null, onFocusConsumed() {}, view: 'invoices' };
  let tree;
  await act(async () => { tree = create(React.createElement(ControlBookFinancePanel, props)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  assert.equal(tree.toJSON(), null);
  await act(async () => tree.update(React.createElement(ControlBookFinancePanel, { ...props, focusedInvoice: selected })));
  assert.equal(textOf(tree.toJSON()),'Documento 52');
  assert.equal(tree.root.findAllByType('button').length,0);
});
