import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// FINET 13-11-2026: «Término de servicio» from Tickets (voluntary termination). Synthetic data only.
const require = createRequire(import.meta.url);
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const attention = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza', 'Facturación y cobro', 'Consulta general', 'Baja de servicio']
  .map((nombre, i) => ({ idCategoria: 10 + i, nombre, nombreAtencion: nombre, tipo: 'ATENCION', tipoDisponible: true }));
const termination = { idCategoria: 40, nombre: 'Término de servicio', nombreAtencion: 'Término de servicio', tipo: 'ATENCION', tipoDisponible: true };
const services = [{ idServicio: 62, idCliente: 33, idEmpresa: 1, idContrato: 20, tipoServicio: 'TV', estadoOperativo: 'Activo' }];

async function panel(t, { categories = [...attention, termination], post } = {}) {
  const calls = [];
  const api = {
    get: async path => { calls.push(['get', path]); return { data: path === '/customers/search' ? { idCliente: 33, nombreCompleto: 'Cliente QA', rut: '12345678-5', estado: 'Moroso' } : services }; },
    post: async (...args) => { calls.push(['post', ...args]); return post ? post(...args) : { data: { repetido: false, ticket: { idTicket: 77, codigoSeguimiento: 'TK-TERM' }, retiroTecnico: 'NUEVA_SOLICITUD', despachoPendiente: 'pendiente' } }; },
  };
  const mocks = {
    '../../api': { api, apiErrorMessage: error => error.message },
    '../../constants': { rutPattern: /^[0-9]+-[0-9kK]$/ },
    '../../lib': { normalizeRutInput: value => value, formatWorkOrderValue: value => value ?? '-' },
    '../../shared/components': { StatusBadge: ({ value }) => React.createElement('span', {}, value) },
    './TicketManagementModal': { TicketManagementModal: () => null },
  };
  function load(file) {
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    const exports = {};
    new Function('require', 'exports', outputText)(name => {
      if (mocks[name]) return mocks[name];
      if (name.startsWith('.')) { const base = resolve(dirname(file), name); return load(existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
      return require(name);
    }, exports);
    return exports;
  }
  const { TicketsPanel } = load(fileURLToPath(new URL('../src/features/tickets/TicketsPanel.tsx', import.meta.url)));
  let tree;
  await act(async () => { tree = create(React.createElement(TicketsPanel, { tickets: [], categories, permissions: { createTickets: true }, onChanged() {} })); });
  t.after(async () => { await act(async () => tree.unmount()); });
  const form = () => tree.root.findByProps({ className: 'ticket-create-form stack' });
  const field = label => tree.root.findAllByType('label').find(node => textOf(node).startsWith(label))?.findAll(node => ['input', 'select', 'textarea'].includes(node.type))[0];
  const change = async (node, value) => { await act(async () => node.props.onChange({ target: { value, checked: value } })); };
  const submit = async () => { await act(async () => { await form().props.onSubmit({ preventDefault() {} }); }); };
  const lookup = async () => { await change(field('RUT cliente'), '12345678-5'); await act(async () => { await tree.root.findAllByType('button').find(n => textOf(n) === 'Buscar datos del cliente').props.onClick(); }); };
  return { tree, calls, field, change, submit, lookup, text: () => textOf(tree.toJSON()) };
}
const optionsOf = select => select.findAllByType('option').map(textOf);

test('el alta ofrece «Término de servicio» solo si el catálogo la habilita; nunca «Baja de servicio»', async t => {
  const enabled = await panel(t);
  const options = optionsOf(enabled.field('Categoría'));
  assert.ok(options.includes('Término de servicio'));
  assert.ok(!options.includes('Baja de servicio'));
  const absent = await panel(t, { categories: attention });
  assert.ok(!optionsOf(absent.field('Categoría')).includes('Término de servicio'), 'sin la inserción autorizada no se ofrece');
  const ambiguous = await panel(t, { categories: [...attention, termination, { ...termination, idCategoria: 41 }] });
  assert.ok(!optionsOf(ambiguous.field('Categoría')).includes('Término de servicio'), 'duplicada no se habilita');
});

test('con «Término de servicio» pide canal, fecha y hora, solicitante, evidencia e identidad, y registra por el flujo de término', async t => {
  const h = await panel(t);
  await h.lookup();
  await h.change(h.field('Categoría'), '40');
  for (const label of ['Canal del requerimiento', 'Fecha y hora del requerimiento', 'Solicitante', 'Evidencia del requerimiento']) assert.ok(h.field(label), label);
  assert.match(h.text(), /sin esperar la visita técnica/);
  await h.change(h.field('Descripción'), 'El titular pide terminar el servicio de TV.');
  await h.submit();
  assert.match(h.text(), /Selecciona el servicio que el titular pide terminar/);
  await h.change(h.field('Servicio asociado'), '62');
  await h.change(h.field('Evidencia del requerimiento'), 'Llamada grabada N° 5521');
  await h.submit();
  assert.match(h.text(), /Confirma que verificaste la identidad/);
  assert.equal(h.calls.filter(call => call[0] === 'post').length, 0);
  await h.change(h.tree.root.findAllByType('input').find(n => n.props.type === 'checkbox'), true);
  await h.submit();
  const posts = h.calls.filter(call => call[0] === 'post');
  assert.equal(posts.length, 1);
  assert.equal(posts[0][1], '/service-withdrawals/voluntary');
  assert.deepEqual({ ...posts[0][2], requerimientoEn: typeof posts[0][2].requerimientoEn }, { rut: '12345678-5', idServicio: 62, canal: 'TELEFONO', solicitante: 'TITULAR',
    requerimientoEn: 'string', evidencia: 'Llamada grabada N° 5521', descripcion: 'El titular pide terminar el servicio de TV.', confirmacionIdentidad: true });
  assert.ok(!h.calls.some(call => call[1] === '/tickets'), 'no crea un ticket general');
  assert.match(h.text(), /Término registrado y aplicado \(ticket TK-TERM\).*La deuda existente se conserva/);
  assert.ok(!/\bG[0-9]\b/.test(h.text()));
});

test('un rechazo del backend (identidad no corresponde) se muestra y no anuncia término', async t => {
  const h = await panel(t, { post: () => Promise.reject(new Error('El RUT indicado no corresponde al titular del servicio')) });
  await h.lookup();
  await h.change(h.field('Categoría'), '40');
  await h.change(h.field('Descripción'), 'El titular pide terminar el servicio de TV.');
  await h.change(h.field('Servicio asociado'), '62');
  await h.change(h.field('Evidencia del requerimiento'), 'Correo del titular');
  await h.change(h.tree.root.findAllByType('input').find(n => n.props.type === 'checkbox'), true);
  await h.submit();
  assert.match(h.text(), /no corresponde al titular/);
  assert.ok(!/Término registrado/.test(h.text()));
});

test('las demás categorías siguen creando tickets generales', async t => {
  const h = await panel(t);
  await h.lookup();
  await h.change(h.field('Categoría'), '15');
  await h.change(h.field('Descripción'), 'Consulta general sintética del cliente.');
  await h.submit();
  assert.equal(h.calls.filter(call => call[0] === 'post')[0][1], '/tickets');
  assert.equal(h.field('Evidencia del requerimiento'), undefined);
});
