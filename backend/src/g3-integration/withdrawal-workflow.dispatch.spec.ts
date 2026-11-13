import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { sha256Payload } from './g3-integration.utils';
import { ServiceWithdrawalService } from './service-withdrawal.service';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { comercial, created, orderRead, replayed, withdrawalHarness } from './__fixtures__/withdrawal-harness';

// Phase 2: eligibility, atomic initiation, dispatch after commit, tracking and cancellation.
// G3 is a scripted double; nothing leaves the process.
function setup(options: Parameters<typeof withdrawalHarness>[0] = {}) {
  const h = withdrawalHarness(options);
  const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage);
  const start = () => service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
  return { ...h, service, start };
}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Baja por morosidad: inicio atómico', () => {
  it('crea solicitud, ticket, vínculo, auditoría y snapshot exacto, sin llamar a G3 si el despacho está apagado', async () => {
    const h = setup({ dispatch: false });
    const result = await h.start();
    expect(result.repetido).toBe(false);
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.requests[0]).toMatchObject({ estado: 'REGISTRADA', motivo: 'MOROSIDAD', idServicio: 61, idEmpresa: 1, estadoDespachoTecnico: 'PENDIENTE_ENVIO_G3' });
    expect(h.state.tickets).toHaveLength(1);
    expect(h.state.links[0]).toMatchObject({ idSolicitudRetiro: 15, idTicket: 77, idAviso: 9 });
    const dispatch = h.state.dispatches[0];
    expect(dispatch.payloadSnapshot).toMatchObject({ request_id: 'g8-retiro-1-15', tipo_ot: 'BAJA', motivo: 'MOROSIDAD', rut_cliente: '12345678-5',
      direccion_retiro: 'Calle QA 123', comuna_retiro: 'Ñuñoa', id_solicitud_retiro_externa: 15, id_ticket_externo: 77, id_servicio_externo: 61 });
    expect(dispatch.traceId).toMatch(UUID_V4);
    expect(dispatch.payloadHash).toBe(sha256Payload(dispatch.payloadSnapshot));
    expect(h.state.audits.map(a => a.accion)).toEqual(['CREAR_SOLICITUD_RETIRO_SERVICIO', 'VINCULAR_TICKET_SOLICITUD_RETIRO']);
    expect(h.g3Calls).toHaveLength(0);
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('doble clic o reintento devuelve la misma operación, sin otro ticket ni snapshot', async () => {
    const h = setup({ dispatch: false });
    const [first, second] = await Promise.all([h.start(), h.start()]);
    const third = await h.start();
    expect([first.repetido, second.repetido].sort()).toEqual([false, true]);
    expect(third.repetido).toBe(true);
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.tickets).toHaveLength(1);
    expect(h.state.dispatches).toHaveLength(1);
  });

  it.each([
    ['deuda pagada', (h: any) => { h.state.invoices[0].pagos = [{ monto: 20000 }]; }, 'DEUDA_VENCIDA'],
    ['deuda cubierta por convenio activo', (h: any) => { h.state.invoices[0].conveniosPago = [{ estado: 'ACTIVO' }]; }, 'DEUDA_VENCIDA'],
    ['sin aviso previo', (h: any) => { h.state.notices = h.state.notices.filter((n: any) => n.idServicio !== 61); }, 'AVISO_PREVIO'],
    ['servicio activo', (h: any) => { h.state.services[0].estadoOperativo = 'Activo'; }, 'SERVICIO_SUSPENDIDO'],
    ['RUT inválido', (h: any) => { h.state.customers[0].rut = '123456789'; }, 'RUT_CLIENTE'],
    ['comuna ausente', (h: any) => { h.state.addresses[0].comuna = ''; }, 'DIRECCION_RETIRO'],
    ['contrato de otra empresa', (h: any) => { h.state.contracts[0].idEmpresa = 2; }, 'CONTRATO'],
  ])('no inicia con %s y no escribe nada', async (_name, mutate, requisito) => {
    const h = setup({ dispatch: false });
    mutate(h);
    await expect(h.start()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_NOT_ELIGIBLE', requisito } });
    expect(h.state.requests).toHaveLength(0);
    expect(h.state.tickets).toHaveLength(0);
    expect(h.state.dispatches).toHaveLength(0);
    expect(h.state.audits).toHaveLength(0);
  });

  it('sin el almacenamiento privado aprobado responde bloqueado y no escribe', async () => {
    const h = setup({ storage: false });
    await expect(h.start()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE' } });
    expect(h.state.requests).toHaveLength(0);
  });

  it('una falla del ticket o de la auditoría revierte solicitud, vínculo y snapshot', async () => {
    const h = setup({ dispatch: false });
    (h.state as any).failTicket = true;
    await expect(h.start()).rejects.toThrow('TICKET_FAILED');
    expect([h.state.requests.length, h.state.links.length, h.state.dispatches.length, h.state.audits.length]).toEqual([0, 0, 0, 0]);
    const h2 = setup({ dispatch: false });
    (h2.state as any).failAuditOn = 'VINCULAR_TICKET_SOLICITUD_RETIRO';
    await expect(h2.start()).rejects.toThrow('AUDIT_FAILED');
    expect([h2.state.requests.length, h2.state.tickets.length, h2.state.links.length, h2.state.dispatches.length]).toEqual([0, 0, 0, 0]);
  });

  it('un usuario de otra empresa no puede iniciar ni consultar el servicio', async () => {
    const h = setup({ dispatch: false });
    await expect(h.service.initiate({ idServicio: 61, observaciones: 'Intento de otra empresa QA' }, comercial(2))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.eligibility(61, comercial(2))).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.state.requests).toHaveLength(0);
  });

  it('dos empresas: cada solicitud usa su propia clave g8-retiro-{empresa}-{solicitud}', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    await h.service.initiate({ idServicio: 71, observaciones: 'Cliente Cable Mágico sin pago tras aviso' }, comercial(2));
    expect(h.state.dispatches.map(d => d.requestId)).toEqual(['g8-retiro-1-15', 'g8-retiro-2-16']);
    expect(h.state.dispatches[1].payloadSnapshot).toMatchObject({ id_empresa: 2, comuna_retiro: 'Viña del Mar' });
  });
});

describe('Baja por morosidad: despacho a G3 después del commit', () => {
  it('con el despacho habilitado, envía después del commit y registra la OT aceptada (201)', async () => {
    const h = setup();
    h.g3Replies.push(created());
    const result: any = await h.start();
    expect(h.g3Calls).toEqual([{ op: 'create', args: [h.state.dispatches[0].payloadSnapshot] }]);
    expect(result.despacho).toMatchObject({ estadoDespacho: 'ACEPTADA', idOtG3: 930, intentos: 1 });
    expect(h.state.requests[0]).toMatchObject({ estado: 'EN_GESTION', estadoDespachoTecnico: 'ENVIADA_G3' });
  });

  it('si G3 falla (503) la solicitud queda creada y el reintento reenvía exactamente el mismo snapshot (200 duplicado)', async () => {
    const h = setup();
    h.g3Replies.push({ status: 503, body: null });
    await h.start();
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'REINTENTABLE', ultimoErrorStatus: 503 });
    await expect(h.service.dispatch(15, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DISPATCH_RETRY_TOO_SOON' } });
    h.state.dispatches[0].ultimoIntentoEn = new Date(Date.now() - 2 * 60_000);
    h.g3Replies.push(replayed());
    const result: any = await h.service.dispatch(15, comercial());
    expect(result.despacho).toMatchObject({ estadoDespacho: 'ACEPTADA', idOtG3: 930, intentos: 2 });
    expect(h.g3Calls[1].args[0]).toEqual(h.g3Calls[0].args[0]);
  });

  it('timeout después de que G3 creó la OT: el reintento obtiene la misma OT y no crea otra', async () => {
    const h = setup();
    h.g3Replies.push({ status: null, body: null });
    await h.start();
    h.state.dispatches[0].ultimoIntentoEn = new Date(Date.now() - 2 * 60_000);
    h.g3Replies.push(replayed('g8-retiro-1-15', 930, 'ASIGNADA'));
    await h.service.dispatch(15, comercial());
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'ACEPTADA', idOtG3: 930 });
    expect(h.g3Calls.filter(c => c.op === 'create')).toHaveLength(2);
  });

  it('dos despachos simultáneos producen un solo POST a G3', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    (h.config as any).internalConfig.G3_WITHDRAWAL_DISPATCH_ENABLED = 'true';
    let release!: () => void;
    h.g3Replies.push(() => new Promise(resolve => { release = () => resolve(created()); }));
    const first = h.service.dispatch(15, comercial());
    await new Promise(resolve => setImmediate(resolve));
    const second = await h.service.dispatch(15, comercial());
    expect(second.enviado).toBe(false);
    release();
    await first;
    expect(h.g3Calls.filter(c => c.op === 'create')).toHaveLength(1);
  });

  it.each([
    [409, 'REQUEST_ID_CON_OTRO_CONTENIDO'], [409, 'OT_BAJA_ACTIVA'], [404, 'CLIENTE_NO_ENCONTRADO'], [422, 'DIRECCION_INVALIDA'], [403, 'EMPRESA_NO_CORRESPONDE'],
  ])('%s %s queda RECHAZADA, requiere revisión y no se reintenta solo', async (status, codigo) => {
    const h = setup();
    h.g3Replies.push({ status, body: { codigo } });
    await h.start();
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'RECHAZADA', ultimoErrorCodigo: codigo });
    expect(h.state.requests[0].estadoDespachoTecnico).toBe('REVISION_G3');
    const again = await h.service.dispatch(15, comercial());
    expect(again.enviado).toBe(false);
    expect(h.g3Calls).toHaveLength(1);
  });

  it('un 2xx con otra correlación queda INCONSISTENTE, no aceptado', async () => {
    const h = setup();
    h.g3Replies.push(created('g8-retiro-1-99'));
    await h.start();
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'INCONSISTENTE', idOtG3: null });
  });

  it('pago antes del despacho: no se envía y se pide cancelar la solicitud', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    (h.config as any).internalConfig.G3_WITHDRAWAL_DISPATCH_ENABLED = 'true';
    h.state.invoices[0].pagos = [{ monto: 20000 }];
    await expect(h.service.dispatch(15, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DEBT_REGULARIZED', accion: 'CANCELAR_SOLICITUD' } });
    expect(h.g3Calls).toHaveLength(0);
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'PENDIENTE', intentos: 0 });
  });

  it('un snapshot alterado no se envía', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    (h.config as any).internalConfig.G3_WITHDRAWAL_DISPATCH_ENABLED = 'true';
    (h.state.dispatches[0].payloadSnapshot as any).comuna_retiro = 'Otra';
    const result = await h.service.dispatch(15, comercial());
    expect(result.enviado).toBe(false);
    expect(h.state.dispatches[0].estadoDespacho).toBe('INCONSISTENTE');
    expect(h.g3Calls).toHaveLength(0);
  });

  it('agota los reintentos automáticos y exige revisión', async () => {
    const h = setup();
    h.g3Replies.push({ status: 503, body: null });
    await h.start();
    h.state.dispatches[0].intentos = 6;
    await expect(h.service.dispatch(15, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DISPATCH_ATTEMPTS_EXHAUSTED' } });
  });

  it('con el despacho apagado, despachar responde deshabilitado', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    await expect(h.service.dispatch(15, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DISPATCH_DISABLED' } });
  });
});

describe('Baja por morosidad: seguimiento y cancelación', () => {
  async function accepted() {
    const h = setup();
    h.g3Replies.push(created());
    await h.start();
    return h;
  }

  it('el GET registra COMPLETADA y limita la frecuencia de consulta', async () => {
    const h = await accepted();
    h.g3Replies.push(orderRead('COMPLETADA'));
    const result: any = await h.service.refreshOrder(15, comercial());
    expect(result).toMatchObject({ consultado: true, despacho: { estadoOt: 'COMPLETADA', cancelable: false } });
    expect(h.g3Calls.at(-1)).toEqual({ op: 'read', args: [930, 1] });
    const cached: any = await h.service.refreshOrder(15, comercial());
    expect(cached.consultado).toBe(false);
    expect(h.g3Calls.filter(c => c.op === 'read')).toHaveLength(1);
    expect(h.state.audits.some(a => a.accion === 'ACTUALIZAR_ESTADO_OT_RETIRO_G3')).toBe(true);
  });

  it('nunca enviada: se cancela localmente sin llamar a G3', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    await h.service.cancel(15, 'Cliente pagó la deuda', comercial());
    expect(h.state.requests[0].estado).toBe('CANCELADA');
    expect(h.state.dispatches[0].estadoDespacho).toBe('CANCELADA');
    expect(h.g3Calls).toHaveLength(0);
  });

  it('aceptada y cancelable: G3 cancela y la solicitud queda CANCELADA (doble cancelación idempotente)', async () => {
    const h = await accepted();
    h.g3Replies.push({ status: 200, body: { success: true, data: { request_id: 'g8-retiro-1-15', id_ot: 930, estado: 'CANCELADA', duplicado: false } } });
    await h.service.cancel(15, 'Cliente pagó la deuda', comercial());
    expect(h.g3Calls.at(-1)).toEqual({ op: 'cancel', args: ['g8-retiro-1-15', { motivo: 'Cliente pagó la deuda' }] });
    expect(h.state.requests[0].estado).toBe('CANCELADA');
    const again = await h.service.cancel(15, 'Cliente pagó la deuda', comercial());
    expect(again.cancelada).toBe(true);
    expect(h.g3Calls.filter(c => c.op === 'cancel')).toHaveLength(1);
  });

  it('cancelación tardía (409 CANCELACION_NO_APLICABLE) no simula que el retiro no ocurrió', async () => {
    const h = await accepted();
    h.g3Replies.push({ status: 409, body: { codigo: 'CANCELACION_NO_APLICABLE' } });
    await expect(h.service.cancel(15, 'Cliente pagó tarde', comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CANCEL_TOO_LATE' } });
    expect(h.state.requests[0].estado).toBe('EN_GESTION');
    expect(h.state.dispatches[0].estadoDespacho).toBe('CANCELACION_NO_APLICABLE');
    expect(h.state.audits.some(a => a.accion === 'CANCELACION_RETIRO_NO_APLICABLE')).toBe(true);
  });

  it('intento con timeout y G3 sin registro (404): se cancela localmente', async () => {
    const h = setup();
    h.g3Replies.push({ status: null, body: null });
    await h.start();
    h.g3Replies.push({ status: 404, body: { codigo: 'SOLICITUD_NO_ENCONTRADA' } });
    await h.service.cancel(15, 'Cliente pagó la deuda', comercial());
    expect(h.state.requests[0].estado).toBe('CANCELADA');
    expect(h.g3Calls.map(c => c.op)).toEqual(['create', 'cancel']);
  });

  it('con un envío en curso no se cancela hasta conocer su resultado', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    h.state.dispatches[0].estadoDespacho = 'ENVIANDO';
    await expect(h.service.cancel(15, 'Cliente pagó la deuda', comercial())).rejects.toBeInstanceOf(ConflictException);
  });

  it('el motivo de cancelación es obligatorio', async () => {
    const h = setup({ dispatch: false });
    await h.start();
    await expect(h.service.cancel(15, ' ', comercial())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el cambio manual de estado (PATCH) no puede cancelar una solicitud gestionada con G3', async () => {
    const h = await accepted();
    const legacy = new ServiceWithdrawalService(h.prisma, h.audit, h.storage);
    await expect(legacy.update(15, { estado: 'CANCELADA' }, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_MANAGED_BY_G3' } });
    expect(h.state.requests[0].estado).toBe('EN_GESTION');
  });

  it('ningún paso escribe pagos, facturas, firmas ni inventario G1', async () => {
    const h = await accepted();
    h.g3Replies.push(orderRead('EN_CURSO'));
    await h.service.refreshOrder(15, comercial());
    expect(h.state.forbiddenWrites).toEqual([]);
  });
});
