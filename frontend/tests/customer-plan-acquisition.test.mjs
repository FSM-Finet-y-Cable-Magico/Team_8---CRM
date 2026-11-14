import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => name.endsWith('.css') ? {} : mocks[name] ?? require(name), exports);
  return exports;
}
const Picker = () => null;
const Toast = () => null;
const coverage = { coberturaComercial: true, estado: 'FACTIBLE', planes: [
  { idPlan: 7, nombre: 'Plan QA', precioAplicable: 19990 }, { idPlan: 8, nombre: 'Plan extra', precioAplicable: 24990 },
], zona: { idZonaPago: 8 } };
const customer = { idCliente: 10, idEmpresa: 1, nombreCompleto: 'Cliente QA', direcciones: [{ direccionCompleta: 'Dirección actual 123', comuna: 'Santiago' }] };
const savedQuote = (id, plan = 7, extra = {}) => ({ idCotizacion: id, idProspecto: id + 100, idPlan: plan, idEmpresa: 1,
  codigo: 'COT-' + id, fechaEnvio: '2026-11-13T18:00:00Z', planNombre: plan === 7 ? 'Plan QA' : 'Plan extra', vigente: true,
  direccion: 'Dirección actual 123', comuna: 'Santiago', region: 'Metropolitana de Santiago', latitud: -33.4, longitud: -70.6, contrato: null, ...extra });
async function mount(t, { post, history = [], delivery = 'sent', customerData = customer } = {}) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const calls = [], reads = [], created = [], previews = [];
  globalThis.window = { setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id), open: url => previews.push(url) };
  globalThis.document = { createElement: () => ({ click() {} }), addEventListener() {}, removeEventListener() {} };
  let nextQuote = 30;
  const api = {
    patch: async (path, body) => { calls.push({ path, body }); return { data: { direccionesOmitidas: [body.ocultarDireccion.direccion.toLowerCase() + '|' + body.ocultarDireccion.comuna.toLowerCase()] } }; },
    get: async (path, options) => { reads.push({ path, options }); return { data: path === '/prospects/customer-quotes' ? history : new Blob(['%PDF-QA']) }; },
    post: async (path, body) => {
      calls.push({ path, body });
      const id = nextQuote++;
      return post ? post(path, body) : { data: path === '/contracts' ? { idContrato: 40 } : { idCotizacion: id,
        idProspecto: id + 100, idPlan: body.planId, codigo: 'COT-' + id, envioEmail: delivery } };
    },
  };
  const { CustomerPlanForm } = load('features/customers/CustomerPlanForm.tsx', {
    '../../api': { api, apiErrorMessage: error => error.message }, '../coverage': { CoveragePicker: Picker },
    '../../shared/data/chile-territories': load('shared/data/chile-territories.ts'), '../../lib': { formatDateTime: String },
    '../../shared/components': { ToastNotice: Toast }, '../../shared/hooks/useTransientMessage': load('shared/hooks/useTransientMessage.ts'),
  });
  let tree;
  await act(async () => { tree = create(React.createElement(CustomerPlanForm, { customer: customerData, services: [],
    plans: [{ idPlan: 7, idEmpresa: 1, nombreComercial: 'Plan QA', activo: true, empresa: { nombre: 'FiNet' } }],
    onCancel() {}, onCreated: async row => created.push(row),
  })); });
  t.after(async () => { await act(async () => tree.unmount()); globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const button = text => tree.root.findAllByType('button').find(item => item.props.children === text);
  const label = text => tree.root.findAllByType('label').find(item => item.props.children[0] === text);
  const openAddresses = async () => { const trigger=tree.root.findByProps({'aria-label':'Dirección de instalación'}); if(!trigger.props['aria-expanded']) await act(async()=>trigger.props.onClick()); };
  const addressButtons = () => tree.root.findAllByType('button').filter(item=>item.props.className?.includes('customer-address-option'));
  return { tree, calls, reads, created, previews, button, label,
    openAddresses,
    addressChoices: async()=>{await openAddresses();return addressButtons().map(item=>item.props.children);},
    chooseAddress: async text=>{await openAddresses();await act(async()=>addressButtons().find(item=>item.props.children===text).props.onClick());},
    toast: () => tree.root.findByType(Toast).props,
    locate: async (point = { latitud: -33.4, longitud: -70.6 }, result = coverage) => {
      await act(async () => tree.root.findByType(Picker).props.onChange(point));
      await act(async () => tree.root.findByType(Picker).props.onResult(result));
    },
    selectPlan: async (value = '7') => act(async () => label('Plan a cotizar').findByType('select').props.onChange({ target: { value } })),
    acceptPlan: async (value = '7') => act(async () => label('Plan aceptado').findByType('select').props.onChange({ target: { value } })),
    quoteRows: () => tree.root.findAllByProps({className:'prospect-document-list'}).flatMap(item=>item.findAllByType('li')),
  };
}
test('exige cobertura y un plan cotizado antes de habilitar contratación', async t => {
  const h = await mount(t);
  assert.equal((await h.addressChoices())[0], 'Dirección actual 123');
  assert.equal(h.label('Plan a cotizar'), undefined);
  assert.equal(h.label('Plan aceptado'), undefined);
  assert.equal(h.label('Región').findByType('select').props.value, 'Metropolitana de Santiago');
  assert.equal(h.tree.root.findByType(Picker).props.simpleSummary, true);
  await h.locate(); await h.selectPlan();
  assert.equal(h.button('Enviar cotización'), undefined);
  assert.equal(h.label('Plan aceptado'), undefined);
  await act(async () => h.button('Generar cotización').props.onClick());
  assert.equal(h.calls[0].path, '/prospects/customer-quotes');
  assert.equal(h.previews.length, 1);
  assert.equal(h.toast().message, 'Cotización enviada');
  assert.equal(h.tree.root.findAllByProps({ type: 'checkbox' }).length, 0);
  assert.equal(h.button('Confirmar contratación').props.disabled, true);
  assert.deepEqual(h.label('Plan aceptado').findAllByType('option').map(item => item.props.value), ['', 7]);
  await h.acceptPlan();
  assert.equal(h.button('Confirmar contratación').props.disabled, false);
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(h.calls.at(-1), { path: '/contracts', body: { idCliente: 10, idPlan: 7, idCotizacion: 30, observacion: undefined } });
  assert.deepEqual(h.created, [{ idContrato: 40 }]);
});

test('quitar una dirección adicional la omite del selector sin borrar contratos ni documentos', async t => {
  const customerData = { ...customer, contratos: [{ idContrato: 99, direccionInstalacion: 'Otra calle 456', comunaInstalacion: 'Santiago' }] };
  const h = await mount(t, { customerData, history: [savedQuote(20)] });
  await h.chooseAddress('Otra calle 456'); await h.openAddresses();
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Quitar dirección Otra calle 456' }).props.onClick());
  assert.deepEqual(h.calls.at(-1), { path: '/customers/10/profile', body: { ocultarDireccion: { direccion: 'Otra calle 456', comuna: 'Santiago' } } });
  assert.ok(!(await h.addressChoices()).includes('Otra calle 456'));
  assert.equal(customerData.contratos[0].direccionInstalacion, 'Otra calle 456');
  assert.equal(h.quoteRows().length, 1);
  assert.equal(h.label('Dirección').findByType('input').props.value, 'Dirección actual 123');
});

test('un borrador de dirección se descarta sin enviar cambios al servidor', async t => {
  const h = await mount(t);
  await h.chooseAddress('Agregar nueva dirección');
  await act(async () => h.label('Dirección').findByType('input').props.onChange({ target: { value: 'Dirección sobrante 999' } }));
  await h.chooseAddress('Dirección actual 123');
  assert.equal(h.calls.length, 0);
  assert.equal(h.label('Dirección').findByType('input').props.value, 'Dirección actual 123');
});

test('la X está dentro de la lista y permite quitar otra dirección sin seleccionarla', async t => {
  const h=await mount(t,{customerData:{...customer,contratos:[{idContrato:99,direccionInstalacion:'Otra calle 456',comunaInstalacion:'Santiago'}]}});
  assert.equal(h.tree.root.findAllByProps({'aria-label':'Quitar dirección Otra calle 456'}).length,0);
  await h.openAddresses();
  const remove=h.tree.root.findByProps({'aria-label':'Quitar dirección Otra calle 456'});
  assert.equal(remove.parent.type,'li');
  await act(async()=>remove.props.onClick());
  assert.equal(h.label('Dirección').findByType('input').props.value,'Dirección actual 123');
  assert.ok(!(await h.addressChoices()).includes('Otra calle 456'));
});

test('al reabrir conserva la dirección actual y no vuelve a ofrecer las direcciones quitadas', async t => {
  const h = await mount(t, { customerData: { ...customer, direccionActual: { direccion: 'Domicilio actual 789', comuna: 'Ñuñoa' },
    direccionesOmitidas: ['otra calle 456|santiago'], contratos: [{ idContrato: 99, direccionInstalacion: 'Otra calle 456', comunaInstalacion: 'Santiago' }] } });
  const choices = await h.addressChoices();
  assert.equal(choices[0], 'Domicilio actual 789');
  assert.ok(choices.includes('Dirección actual 123'));
  assert.ok(!choices.includes('Otra calle 456'));
  assert.equal(h.label('Dirección').findByType('input').props.value, 'Domicilio actual 789');
  assert.equal(h.label('Comuna').findByType('select').props.value, 'Ñuñoa');
});
test('permite varias cotizaciones y contratar un plan cotizado distinto del último plan enviado', async t => {
  const h = await mount(t); await h.locate(); await h.selectPlan();
  await act(async () => h.button('Generar cotización').props.onClick());
  await act(async () => h.label('Observación opcional').findByType('textarea').props.onChange({ target: { value: 'Para el nuevo domicilio' } }));
  await h.selectPlan('8');
  await act(async () => h.button('Generar cotización').props.onClick());
  assert.equal(h.quoteRows().length, 2);
  assert.match(JSON.stringify(h.tree.toJSON()), /COT-30/);
  assert.match(JSON.stringify(h.tree.toJSON()), /COT-31/);
  assert.deepEqual(new Set(h.label('Plan aceptado').findAllByType('option').map(item => item.props.value)), new Set(['', 7, 8]));
  await h.acceptPlan('7');
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(h.calls.at(-1).body.idCotizacion, 30);
  assert.equal(h.calls.at(-1).body.idPlan, 7);
  assert.equal(h.calls.at(-1).body.observacion, 'Para el nuevo domicilio');
});
test('recupera historial al volver a abrir y no ofrece planes ya contratados o de otra dirección', async t => {
  const h = await mount(t, { history: [savedQuote(20), savedQuote(21, 8, { contrato: { idContrato: 40, estado: 'Firmado' } }), savedQuote(22, 8, { direccion: 'Otro domicilio 456' })] });
  assert.equal(h.quoteRows().length, 3);
  assert.equal(h.reads[0].options.params.idCliente, 10);
  await h.locate();
  assert.deepEqual(h.label('Plan aceptado').findAllByType('option').map(item => item.props.value), ['', 7]);
  const choose = h.tree.root.findAllByProps({ className: 'customer-quote-choice' }).find(item => item.findByType('strong').props.children === 'COT-22');
  await act(async () => choose.props.onClick());
  assert.equal(h.label('Dirección').findByType('input').props.value, 'Otro domicilio 456');
  await act(async () => h.tree.root.findByType(Picker).props.onResult(coverage));
  assert.equal(h.label('Plan aceptado').findByType('select').props.value, '8');
  assert.equal(h.button('Confirmar contratación').props.disabled, false);
});
test('dirección nueva invalida la contratación sin eliminar el historial de documentos', async t => {
  const h = await mount(t); await h.locate(); await h.selectPlan();
  await act(async () => h.button('Generar cotización').props.onClick()); await h.acceptPlan();
  await h.chooseAddress('Agregar nueva dirección');
  assert.equal(h.button('Confirmar contratación'), undefined);
  assert.equal(h.quoteRows().length, 1);
  assert.equal(h.tree.root.findByType(Picker).props.value, null);
  assert.equal(customer.direcciones[0].direccionCompleta, 'Dirección actual 123');
  await act(async () => h.label('Dirección').findByType('input').props.onChange({ target: { value: 'Nueva Dirección 999' } }));
  await act(async () => h.label('Región').findByType('select').props.onChange({ target: { value: 'Metropolitana de Santiago' } }));
  await act(async () => h.label('Comuna').findByType('select').props.onChange({ target: { value: 'Santiago' } }));
  await h.locate(); await h.selectPlan();
  assert.equal(h.label('Plan aceptado'), undefined);
  await act(async () => h.button('Generar cotización').props.onClick());
  assert.equal(h.calls.at(-1).body.direccion, 'Nueva Dirección 999');
});
test('seleccionar una cotización concreta conserva su documento aunque el mismo plan se haya cotizado después', async t => {
  const h = await mount(t, { history: [savedQuote(21), savedQuote(20)] });
  const choice = h.tree.root.findAllByProps({ className: 'customer-quote-choice' }).find(item => item.findByType('strong').props.children === 'COT-20');
  await act(async () => choice.props.onClick());
  await act(async () => h.tree.root.findByType(Picker).props.onResult(coverage));
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(h.calls.at(-1).body.idCotizacion, 20);
});
test('sin cobertura oculta cotización y contratación pero conserva documentos históricos', async t => {
  const h = await mount(t, { history: [savedQuote(20)] });
  await h.locate({ latitud: -33.9, longitud: -70.1 }, { ...coverage, coberturaComercial: false, planes: [] });
  assert.equal(h.label('Plan a cotizar'), undefined); assert.equal(h.label('Plan aceptado'), undefined);
  assert.equal(h.button('Generar cotización'), undefined); assert.equal(h.button('Confirmar contratación'), undefined);
  assert.equal(h.quoteRows().length, 1);
});
test('en un entorno sin correo muestra aviso estándar sin afirmar un envío real', async t => {
  const h = await mount(t, { delivery: 'not_configured' }); await h.locate(); await h.selectPlan();
  await act(async () => h.button('Generar cotización').props.onClick());
  assert.equal(h.toast().message, 'Cotización generada');
  assert.doesNotMatch(h.toast().message, /confirmó|simulado|entorno/);
});
test('aviso estándar de cotización desaparece a los tres segundos y los documentos permanecen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = await mount(t); await h.locate(); await h.selectPlan();
  await act(async () => h.button('Generar cotización').props.onClick());
  assert.equal(h.toast().message, 'Cotización enviada');
  await act(async () => t.mock.timers.tick(2999)); assert.equal(h.toast().message, 'Cotización enviada');
  await act(async () => t.mock.timers.tick(1)); assert.equal(h.toast().message, '');
  assert.equal(h.quoteRows().length, 1);
});
test('un doble clic no repite envío ni contratación', async t => {
  let finish;
  const h = await mount(t, { post: () => new Promise(resolve => { finish = resolve; }) });
  await h.locate(); await h.selectPlan(); const send = h.button('Generar cotización').props.onClick;
  await act(async () => { send(); send(); }); assert.equal(h.calls.length, 1);
  await act(async () => finish({ data: { idCotizacion: 30, idProspecto: 130, idPlan: 7, envioEmail: 'sent' } }));
  await h.acceptPlan(); const submit = h.tree.root.findByType('form').props.onSubmit;
  await act(async () => { submit({ preventDefault() {} }); submit({ preventDefault() {} }); });
  assert.equal(h.calls.filter(call => call.path === '/contracts').length, 1);
  await act(async () => finish({ data: { idContrato: 40 } }));
});
