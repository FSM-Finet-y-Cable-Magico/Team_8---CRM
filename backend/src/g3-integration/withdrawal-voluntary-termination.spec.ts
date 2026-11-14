import 'reflect-metadata';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { comercial, created, orderRead, withdrawalHarness } from './__fixtures__/withdrawal-harness';

/**
 * FINET 13-11-2026 (adjustment to Documento 2): two causes, one withdrawal engine.
 *  - MOROSIDAD: unchanged (suspension, notice, debt; commercial baja only after G3 approves).
 *  - VOLUNTARIA: started from Tickets; the COMMERCIAL termination is applied at registration (it never waits for the
 *    technical visit, G1 or G3) and the technical withdrawal (OT BAJA, motivo VOLUNTARIA) follows the same G3 path; its
 *    closure only closes the request and tickets, it never touches the terminated relationship again.
 * Synthetic data only; nothing leaves the process.
 */
const NOW = new Date('2026-11-13T15:00:00.000Z');
const request = (over: Record<string, unknown> = {}) => ({
  rut: '12.345.678-5', idServicio: 62, canal: 'TELEFONO', solicitante: 'TITULAR', requerimientoEn: '2026-11-13T14:30:00.000Z',
  evidencia: 'Llamada grabada N° 5521', descripcion: 'El titular pide terminar el servicio de TV por mudanza.', confirmacionIdentidad: true, ...over,
});
function engine(options: Parameters<typeof withdrawalHarness>[0] = {}, prepare?: (h: ReturnType<typeof withdrawalHarness>) => void) {
  const h = withdrawalHarness(options);
  prepare?.(h);
  const g1 = { configured: () => true, getReceptions: jest.fn(async () => { throw new Error('G1 sin recepción'); }) };
  const g1Inventory = { getEquipmentByService: jest.fn(async () => ({ status: 200, durationMs: 1, data: [] as Array<{ numero_serie: string }> })) };
  const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage, g1 as never, g1Inventory as never);
  const snapshot = () => JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, r: h.state.requests, t: h.state.tickets, p: h.state.prospects, x: h.state.terminations });
  return { ...h, service, g1, snapshot, terminate: (over: Record<string, unknown> = {}, user = comercial()) => service.terminateVoluntarily(request(over) as never, user) };
}
const svc = (h: { state: any }, id: number) => h.state.services.find((s: any) => s.idServicio === id);

beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] }));
afterEach(() => jest.useRealTimers());

describe('Término voluntario: el término comercial no espera a la visita técnica, a G1 ni a G3', () => {
  it('con deuda: registra ticket, requerimiento y evidencia, aplica el término y conserva la deuda; el retiro queda preparado', async () => {
    const h = engine();
    const invoicesBefore = JSON.stringify(h.state.invoices);
    const result = await h.terminate();
    expect(result).toMatchObject({ repetido: false, retiroTecnico: 'NUEVA_SOLICITUD', ticket: { idTicket: 77, categoria: 'Término de servicio', estado: 'Abierto' },
      comercial: { contratoDeBaja: false }, despachoPendiente: expect.stringMatching(/ratifique el motivo voluntario/) });
    expect(svc(h, 62).estadoOperativo).toBe('Baja');
    expect(svc(h, 61).estadoOperativo).toBe('Suspendido'); // other service of the same contract untouched
    expect(h.state.requests[0]).toMatchObject({ motivo: 'VOLUNTARIA', estado: 'REGISTRADA', estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3', idServicio: 62 });
    expect(h.state.links[0]).toMatchObject({ causa: 'VOLUNTARIA', idAviso: null, idTicket: 77 });
    expect(h.state.dispatches[0].payloadSnapshot).toMatchObject({ tipo_ot: 'BAJA', motivo: 'VOLUNTARIA', id_servicio_externo: 62, id_ticket_externo: 77 });
    expect(h.state.terminations[0]).toMatchObject({ idServicio: 62, idTicket: 77, idSolicitudRetiro: 15, canal: 'TELEFONO', solicitante: 'TITULAR',
      evidencia: 'Llamada grabada N° 5521', requerimientoEn: new Date('2026-11-13T14:30:00.000Z') });
    expect(h.state.audits.find(a => a.accion === 'TERMINO_VOLUNTARIO_SERVICIO').valorNuevo).toMatchObject({ deudaConservada: true, esperaG3: false, estadoNuevo: 'Baja' });
    expect(JSON.stringify(h.state.invoices)).toBe(invoicesBefore);
    expect(h.state.forbiddenWrites).toEqual([]);
    expect(h.g3Calls).toEqual([]); // VOLUNTARIA is never sent before G3 ratifies it, and never disguised as MOROSIDAD
    expect(h.state.notices).toHaveLength(2); // no collection notice is fabricated
  });

  it('sin deuda y última relación en la empresa: contrato y cliente de baja, excliente en Prospectos (sin suspensión ni aviso previos)', async () => {
    const h = engine({}, x => { x.state.services = x.state.services.filter((s: any) => s.idServicio !== 61); x.state.invoices = []; x.state.notices = []; x.state.contracts[0].estado = 'Activo'; });
    const result = await h.terminate();
    expect(result).toMatchObject({ comercial: { contratoDeBaja: true, estadoCliente: 'Baja', retornoProspectos: 'CREADO' } });
    expect(h.state.contracts[0].estado).toBe('Baja');
    expect(h.state.prospects).toEqual([expect.objectContaining({ idCliente: 33, idEmpresa: 1 })]);
  });

  it('doble clic o reintento: la misma operación, sin segundo ticket, solicitud ni OT', async () => {
    const h = engine();
    const [a, b] = await Promise.all([h.terminate(), h.terminate()]);
    const repeated = [a, b].find(r => r.repetido)!;
    expect(repeated.ticket).toMatchObject({ idTicket: 77 });
    expect(h.state.tickets).toHaveLength(1);
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.terminations).toHaveLength(1);
    expect(h.state.dispatches).toHaveLength(1);
  });

  it.each([
    ['RUT que no es del titular', { rut: '11.111.111-1' }, 'TERMINATION_IDENTITY_MISMATCH'],
    ['sin confirmar identidad y autorización', { confirmacionIdentidad: false }, 'TERMINATION_IDENTITY_NOT_CONFIRMED'],
    ['requerimiento con fecha futura', { requerimientoEn: '2026-11-14T10:00:00.000Z' }, 'TERMINATION_REQUIREMENT_DATE_INVALID'],
    ['sin evidencia', { evidencia: ' - ' }, 'TERMINATION_EVIDENCE_REQUIRED'],
    ['canal desconocido', { canal: 'SMS' }, 'TERMINATION_CHANNEL_INVALID'],
    ['solicitante desconocido', { solicitante: 'VECINO' }, 'TERMINATION_REQUESTER_INVALID'],
    ['contrato de otro servicio', { idContrato: 30 }, undefined],
  ])('rechaza sin escribir: %s', async (_name, over, code) => {
    const h = engine();
    const before = h.snapshot();
    const promise = h.terminate(over);
    if (code) await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
    else await expect(promise).rejects.toThrow();
    expect(h.snapshot()).toBe(before);
    expect(h.state.audits).toEqual([]);
  });

  it('otra empresa no registra términos ajenos', async () => {
    const h = engine();
    await expect(h.terminate({}, comercial(2))).rejects.toMatchObject({ status: 403 });
    expect(svc(h, 62).estadoOperativo).toBe('Activo');
  });

  it('servicio ya dado de baja sin término registrado: no se registra otro término', async () => {
    const h = engine({}, x => { x.state.services.find((s: any) => s.idServicio === 62).estadoOperativo = 'Baja'; });
    await expect(h.terminate()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SERVICE_ALREADY_TERMINATED' }) });
  });

  it('sin la migración 003 responde bloqueado y no escribe nada', async () => {
    const h = engine({ termination: false });
    const before = h.snapshot();
    await expect(h.terminate()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE' }) });
    expect(h.snapshot()).toBe(before);
  });

  it('datos de retiro incompletos (sin dirección): el término comercial igual se aplica; el retiro queda pendiente de datos', async () => {
    const h = engine({}, x => { x.state.services.find((s: any) => s.idServicio === 62).idDireccion = null; x.state.contracts[0].direccionInstalacion = null; });
    const result = await h.terminate();
    expect(result).toMatchObject({ retiroTecnico: 'DATOS_INCOMPLETOS', requisito: 'DIRECCION_INVALIDA' });
    expect(svc(h, 62).estadoOperativo).toBe('Baja');
    expect(h.state.dispatches).toEqual([]);
    expect(h.state.terminations[0].idSolicitudRetiro).toBeNull();
  });

  it('un fallo de auditoría revierte todo: ticket, solicitud, vínculo, término y estado del servicio', async () => {
    const h = engine();
    h.state.failAuditOn = 'TERMINO_VOLUNTARIO_SERVICIO';
    const before = h.snapshot();
    await expect(h.terminate()).rejects.toThrow('AUDIT_FAILED');
    expect(h.snapshot()).toBe(before);
  });
});

describe('Retiro técnico del término voluntario: mismo recorrido G3, sin volver a tocar la relación comercial', () => {
  async function ratified(prepare?: (h: ReturnType<typeof withdrawalHarness>) => void) {
    const h = engine({ voluntary: true, finalize: true }, prepare);
    h.g3Replies.push(created('g8-retiro-1-15', 931));
    const result = await h.terminate();
    return { h, result };
  }

  it('ratificado el motivo: envía la OT BAJA con motivo VOLUNTARIA (nunca MOROSIDAD)', async () => {
    const { h, result } = await ratified();
    expect(result).toMatchObject({ despacho: { estadoDespacho: 'ACEPTADA', idOtG3: 931 } });
    expect(h.g3Calls[0]).toMatchObject({ op: 'create', args: [expect.objectContaining({ motivo: 'VOLUNTARIA', tipo_ot: 'BAJA' })] });
  });

  it('sin ratificar el motivo, el despacho manual tampoco envía: lo informa y no llama a G3', async () => {
    const h = engine();
    await h.terminate();
    await expect(h.service.dispatch(15, comercial())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'G3_VOLUNTARY_NOT_RATIFIED' }) });
    expect(h.g3Calls).toEqual([]);
  });

  it('falla o retraso de G3: el término comercial ya está aplicado; el envío queda reintentable', async () => {
    const h = engine({ voluntary: true });
    h.g3Replies.push({ status: 503, body: null });
    const result = await h.terminate();
    expect(svc(h, 62).estadoOperativo).toBe('Baja');
    expect(result).toMatchObject({ despacho: { estadoDespacho: 'REINTENTABLE' } });
  });

  it('G3 aún en PENDIENTE_APROBACION: no cierra nada técnico (el término comercial no dependía de esto)', async () => {
    const { h } = await ratified();
    h.g3Replies.push(orderRead('PENDIENTE_APROBACION', 931));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { id_ot: 931, clave_idempotencia: 'baja:931', id_servicio: 62, id_ticket_externo: 77, trace_id: h.state.dispatches[0].traceId })));
    h.g3Replies.push(orderRead('PENDIENTE_APROBACION', 931));
    // Nothing was applied, so the unavailable G1 reception is reported and the follow-up retries later.
    await expect(h.service.track(15)).rejects.toMatchObject({ status: 503 });
    h.g1.getReceptions.mockRejectedValue(Object.assign(new Error('404'), { name: 'G1IntegrationError' }));
    await expect(h.service.finalizeApprovedBySystem(15)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_CLOSURE_BLOCKED' }) });
    expect(svc(h, 62).estadoOperativo).toBe('Baja');
    expect(h.state.requests[0].estado).not.toBe('CERRADA');
    expect(h.state.tickets[0].estado).toBe('Abierto');
  });

  it('G3 COMPLETADA + cierre correlacionado (G1 sin recepción): cierra solicitud y ticket sin modificar servicio, contrato, cliente ni Prospectos', async () => {
    const { h } = await ratified();
    h.g3Replies.push(orderRead('COMPLETADA', 931));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { id_ot: 931, clave_idempotencia: 'baja:931', id_servicio: 62, id_ticket_externo: 77, trace_id: h.state.dispatches[0].traceId })));
    const commercialBefore = JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, p: h.state.prospects });
    h.g3Replies.push(orderRead('COMPLETADA', 931));
    await expect(h.service.track(15)).resolves.toMatchObject({ baja: 'APLICADA' });
    expect(h.state.requests[0].estado).toBe('CERRADA');
    expect(h.state.tickets[0]).toMatchObject({ idTicket: 77, estado: 'Cerrado' });
    expect(h.state.terminations[0].cierreTecnicoEn).toBeInstanceOf(Date);
    expect(JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, p: h.state.prospects })).toBe(commercialBefore);
    const audit = h.state.audits.find(a => a.accion === 'CERRAR_RETIRO_TECNICO_TRAS_TERMINO');
    expect(audit).toMatchObject({ idUsuario: null, valorNuevo: expect.objectContaining({ actor: 'SISTEMA_G8_SEGUIMIENTO_RETIROS', relacionComercialModificada: false,
      avisos: expect.arrayContaining(['RECEPCION_G1_PENDIENTE']) }) });
    expect(h.state.audits.some(a => a.accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD')).toBe(false);
  });
});

describe('Cambio de motivo: retiro por morosidad activo y término voluntario del mismo servicio', () => {
  it('morosidad nunca enviada a G3: se cancela y la reemplaza el término voluntario (una sola OT, motivo VOLUNTARIA)', async () => {
    const h = engine({ dispatch: false });
    await h.service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    const result = await h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' });
    expect(h.state.requests.map((r: any) => [r.motivo, r.estado])).toEqual([['MOROSIDAD', 'CANCELADA'], ['VOLUNTARIA', 'REGISTRADA']]);
    expect(result).toMatchObject({ retiroTecnico: 'NUEVA_SOLICITUD' });
    expect(svc(h, 61).estadoOperativo).toBe('Baja');
    expect(h.state.dispatches.find((d: any) => d.idSolicitudRetiro === 16)?.payloadSnapshot.motivo).toBe('VOLUNTARIA');
    expect(h.state.audits.find(a => a.accion === 'CANCELAR_SOLICITUD_RETIRO').valorNuevo).toMatchObject({ reemplazadaPorTermino: true });
  });

  it('morosidad ya enviada a G3: reutiliza esa OT (sin segunda OT); su cierre solo cierra los dos tickets', async () => {
    const h = engine({ finalize: true });
    h.g3Replies.push(created());
    await h.service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    const result = await h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' });
    expect(result).toMatchObject({ retiroTecnico: 'REUTILIZA_SOLICITUD_EXISTENTE', solicitud: { idSolicitudRetiro: 15, motivo: 'MOROSIDAD' } });
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.terminations[0]).toMatchObject({ idSolicitudRetiro: 15, idTicket: 78 });
    expect(svc(h, 61).estadoOperativo).toBe('Baja');
    expect(h.g3Calls.filter(c => c.op === 'create')).toHaveLength(1);
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
    h.g3Replies.push(orderRead('COMPLETADA'));
    const closed = await h.service.finalizeApprovedBySystem(15);
    expect(closed).toMatchObject({ aplicado: true, tipo: 'CIERRE_TECNICO', tickets: [{ idTicket: 77, action: 'CERRADO' }, { idTicket: 78, action: 'CERRADO' }] });
    expect(h.state.audits.some(a => a.accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD')).toBe(false);
  });

  it('un término voluntario activo impide iniciar una baja por morosidad del mismo servicio', async () => {
    const h = engine();
    await h.terminate({ idServicio: 62 });
    const view = await h.service.eligibility(62, comercial());
    expect(view.eligible).toBe(false);
  });

  it('varios servicios del mismo cliente: cada término es independiente y no crea OT duplicadas', async () => {
    const h = engine({ dispatch: false });
    await h.terminate({ idServicio: 62 });
    await h.terminate({ idServicio: 61, descripcion: 'El titular también termina Internet.' });
    expect(h.state.terminations.map((t: any) => t.idServicio)).toEqual([62, 61]);
    expect(new Set(h.state.dispatches.map((d: any) => d.requestId)).size).toBe(2);
    expect(h.state.contracts[0].estado).toBe('Baja');
  });
});

describe('Revisión FINET 13-11: reutilización de la OT, concurrencia y resultado de cada ticket', () => {
  async function morosityDispatched(reply = created(), options: Parameters<typeof withdrawalHarness>[0] = { finalize: true }) {
    const h = engine(options);
    h.g3Replies.push(reply);
    await h.service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    return h;
  }
  const closeApproved = async (h: ReturnType<typeof engine>) => {
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
    h.g3Replies.push(orderRead('COMPLETADA'));
    return h.service.finalizeApprovedBySystem(15);
  };

  it('nunca reutiliza la OT de otro servicio del mismo cliente: el término del servicio 62 tiene su propia solicitud', async () => {
    const h = await morosityDispatched();
    const result = await h.terminate({ idServicio: 62 });
    expect(result).toMatchObject({ retiroTecnico: 'NUEVA_SOLICITUD', solicitud: { idSolicitudRetiro: 16, idServicio: 62, motivo: 'VOLUNTARIA' } });
    expect(h.state.requests.find((r: any) => r.idSolicitudRetiro === 15)).toMatchObject({ motivo: 'MOROSIDAD', estado: 'EN_GESTION', idServicio: 61 });
    expect(h.state.terminations[0]).toMatchObject({ idServicio: 62, idSolicitudRetiro: 16 });
    expect(svc(h, 61).estadoOperativo).toBe('Suspendido');
  });

  it('OT reutilizada: conserva el motivo histórico MOROSIDAD, una sola baja comercial y cada ticket con su resultado verdadero', async () => {
    const h = await morosityDispatched();
    await h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' });
    const commercialAfterTermination = JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, p: h.state.prospects });
    await closeApproved(h);
    expect(h.state.requests[0]).toMatchObject({ idSolicitudRetiro: 15, motivo: 'MOROSIDAD', estado: 'CERRADA' });
    expect(h.state.links[0]).toMatchObject({ causa: 'MOROSIDAD', idTicket: 77 });
    expect(JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, p: h.state.prospects })).toBe(commercialAfterTermination);
    expect(h.state.audits.filter(a => a.accion === 'TERMINO_VOLUNTARIO_SERVICIO')).toHaveLength(1);
    expect(h.state.audits.filter(a => a.accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD')).toHaveLength(0);
    const closures = h.state.audits.filter(a => a.accion.startsWith('CERRAR_TICKET_'));
    expect(closures.map(a => [a.accion, a.idEntidadAfectada, a.valorNuevo.resultado])).toEqual([
      ['CERRAR_TICKET_BAJA_SERVICIO', 77, 'RETIRO_TRAS_TERMINO_VOLUNTARIO'], ['CERRAR_TICKET_TERMINO_SERVICIO', 78, 'RETIRO_TRAS_TERMINO_VOLUNTARIO']]);
    expect(h.g3Calls.filter(c => c.op === 'create')).toHaveLength(1);
    // Repeating the technical closure changes nothing.
    await expect(h.service.finalizeApprovedBySystem(15)).resolves.toMatchObject({ aplicado: false, yaAplicado: true });
    expect(h.state.audits.filter(a => a.accion === 'CERRAR_RETIRO_TECNICO_TRAS_TERMINO')).toHaveLength(1);
  });

  it('concurrencia: término voluntario y baja por morosidad simultáneos producen UNA sola terminación comercial', async () => {
    const h = await morosityDispatched();
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
    h.g3Replies.push(orderRead('COMPLETADA'));
    const outcomes = await Promise.allSettled([h.service.finalizeApprovedBySystem(15), h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' })]);
    const commercial = h.state.audits.filter(a => ['APLICAR_BAJA_POR_RETIRO_MOROSIDAD', 'TERMINO_VOLUNTARIO_SERVICIO'].includes(a.accion));
    expect(commercial).toHaveLength(1);
    expect(svc(h, 61).estadoOperativo).toBe('Baja');
    expect(h.state.prospects.length).toBeLessThanOrEqual(1);
    if (commercial[0].accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD') {
      expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ response: expect.objectContaining({ code: 'SERVICE_ALREADY_TERMINATED' }) }) });
    }
  });

  it('una OT de morosidad rechazada por G3 (no existe allá) se cancela y la reemplaza el término voluntario', async () => {
    const h = await morosityDispatched({ status: 422, body: { success: false, codigo: 'DIRECCION_FUERA_DE_COBERTURA' } });
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'RECHAZADA', idOtG3: null });
    const result = await h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' });
    expect(result).toMatchObject({ retiroTecnico: 'NUEVA_SOLICITUD', solicitud: { idSolicitudRetiro: 16, motivo: 'VOLUNTARIA' } });
    expect(h.state.requests[0].estado).toBe('CANCELADA');
  });

  it('OT reutilizada con envío reintentable: el reintento no exige deuda (servicio ya terminado) y conserva el snapshot MOROSIDAD', async () => {
    const h = await morosityDispatched({ status: 503, body: null });
    expect(h.state.dispatches[0]).toMatchObject({ estadoDespacho: 'REINTENTABLE', intentos: 1 });
    await h.terminate({ idServicio: 61, descripcion: 'El titular decide terminar el servicio de Internet.' });
    h.state.invoices.forEach((i: any) => { i.pagos = [{ monto: i.monto }]; }); // debt paid afterwards: irrelevant for the withdrawal
    jest.setSystemTime(new Date(NOW.getTime() + 2 * 60_000));
    h.g3Replies.push(created());
    await expect(h.service.dispatch(15, comercial())).resolves.toMatchObject({ enviado: true, despacho: { estadoDespacho: 'ACEPTADA' } });
    expect(h.g3Calls.at(-1)!.args[0]).toMatchObject({ motivo: 'MOROSIDAD', request_id: 'g8-retiro-1-15' });
  });

  it('sin la 003 la finalización tampoco escribe (nunca marca aplicada con la restricción incompatible de la 002)', async () => {
    const h = await morosityDispatched();
    const stale = engine({ finalize: true, termination: false }, x => { Object.assign(x.state, structuredClone(h.state)); });
    const before = stale.snapshot();
    await expect(stale.service.finalizeApprovedBySystem(15)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WITHDRAWAL_STORAGE_NOT_AVAILABLE' }) });
    expect(stale.snapshot()).toBe(before);
  });
});

