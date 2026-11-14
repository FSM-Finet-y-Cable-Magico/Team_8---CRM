import 'reflect-metadata';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { G1IntegrationError } from '../g1-integration/g1-integration.types';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { g1Reception } from './__fixtures__/g1-reception';
import { comercial, created, orderRead, withdrawalHarness } from './__fixtures__/withdrawal-harness';

// Phase 3: BAJA closure notification from G3 and G1 reception. Doubles only; nothing leaves the process.
async function accepted(options: Parameters<typeof withdrawalHarness>[0] = {}) {
  const h = withdrawalHarness(options);
  const g1 = { configured: () => true, getReceptions: jest.fn() };
  const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage, g1);
  h.g3Replies.push(created());
  await service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
  const traceId = h.state.dispatches[0].traceId;
  const closure = (over: Record<string, unknown> = {}) => withdrawalClosure(g3WithdrawalClosure(1, { trace_id: traceId, ...over }));
  return { ...h, g1, service, closure };
}

describe('Cierre BAJA de G3', () => {
  it('registra la evidencia del cierre real, corrobora por GET y no aplica la baja', async () => {
    const h = await accepted();
    h.g3Replies.push(orderRead('COMPLETADA'));
    const result = await h.service.receiveWithdrawalClosure(h.closure());
    expect(result).toEqual({ received: true, processed: true, duplicate: false, aplicado: false, idSolicitudRetiro: 15, estadoOt: 'COMPLETADA' });
    expect(h.state.dispatches[0]).toMatchObject({ cierreClave: 'baja:930', equiposRetirados: [{ numeroSerie: 'QA-ONT-RET-1' }], equiposFaltantes: [] });
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
    expect(h.state.requests[0].estado).toBe('EN_GESTION');
    expect(h.state.audits.find(a => a.accion === 'RECIBIR_CIERRE_BAJA_G3')).toMatchObject({ idUsuario: null });
  });

  it('el mismo cierre repetido es duplicado; con otro contenido es 409 y conserva el original', async () => {
    const h = await accepted();
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(h.closure());
    const original = structuredClone(h.state.dispatches[0]);
    const again = await h.service.receiveWithdrawalClosure(h.closure());
    expect(again.duplicate).toBe(true);
    await expect(h.service.receiveWithdrawalClosure(h.closure({ equipos_retirados: [] }))).rejects.toMatchObject({ response: { code: 'G3_CIERRE_BAJA_DISTINTO' } });
    expect(h.state.dispatches[0].cierreHash).toBe(original.cierreHash);
  });

  it('si el GET aún no responde, el cierre igual queda registrado (la aprobación se exige al aplicar)', async () => {
    const h = await accepted();
    h.g3Replies.push({ status: 503, body: null });
    const result = await h.service.receiveWithdrawalClosure(h.closure());
    expect(result).toMatchObject({ processed: true, estadoOt: null });
    expect(h.state.dispatches[0].cierreClave).toBe('baja:930');
  });

  it.each([
    ['otra OT', { id_ot: 931, clave_idempotencia: 'baja:931' }],
    ['otro servicio', { id_servicio: 62 }],
    ['otro contrato', { id_contrato: 21 }],
    ['otro cliente', { id_cliente_externo: 34 }],
    ['otro ticket', { id_ticket_externo: 78 }],
    ['otro trace_id', { trace_id: '11111111-1111-4111-8111-111111111111' }],
  ])('rechaza un cierre que no corresponde (%s) sin guardar nada', async (_name, over) => {
    const h = await accepted();
    await expect(h.service.receiveWithdrawalClosure(h.closure(over))).rejects.toMatchObject({ response: { code: 'G3_CIERRE_BAJA_NO_CORRESPONDE' } });
    expect(h.state.dispatches[0].cierreClave).toBeNull();
  });

  it('una solicitud desconocida es 404 y una de otra empresa no coincide', async () => {
    const h = await accepted();
    await expect(h.service.receiveWithdrawalClosure(h.closure({ request_id: 'g8-retiro-1-99', id_solicitud_retiro: 99 }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(2, { request_id: 'g8-retiro-2-15' }))))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('timeout del despacho: el cierre correlacionado enseña la OT a G8', async () => {
    const h = withdrawalHarness();
    const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage);
    h.g3Replies.push({ status: null, body: null });
    await service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    h.g3Replies.push(orderRead('COMPLETADA'));
    await service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
    expect(h.state.dispatches[0]).toMatchObject({ idOtG3: 930, estadoDespacho: 'ACEPTADA', cierreClave: 'baja:930' });
  });

  it('sin almacenamiento aplicado responde 503 para que G3 reintente', async () => {
    const h = withdrawalHarness({ storage: false });
    const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage);
    await expect(service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure()))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('Recepción G1', () => {
  async function closed() {
    const h = await accepted();
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(h.closure());
    return h;
  }

  it('antes del cierre BAJA no consulta a G1', async () => {
    const h = await accepted();
    await expect(h.service.syncReception(15, comercial())).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CLOSURE_NOT_RECEIVED' } });
    expect(h.g1.getReceptions).not.toHaveBeenCalled();
  });

  it('registra la recepción completa como versión nueva y la repetida no duplica', async () => {
    const h = await closed();
    h.g1.getReceptions.mockResolvedValue({ status: 200, durationMs: 1, data: g1Reception() });
    expect(await h.service.syncReception(15, comercial())).toMatchObject({ estado: 'SINCRONIZADA', version: 'NUEVA', estadoRecepcion: 'COMPLETA', equipos: 1 });
    expect(h.g1.getReceptions).toHaveBeenCalledWith(1, { requestId: 'g8-retiro-1-15', idOt: 930 });
    expect(await h.service.syncReception(15, comercial())).toMatchObject({ version: 'REPETIDA' });
    expect(h.state.receptions).toHaveLength(1);
    expect(h.state.audits.filter(a => a.accion === 'REGISTRAR_RECEPCION_G1_RETIRO')).toHaveLength(1);
  });

  it('un cierre corregido en G1 (nueva clave_evento) queda como versión vigente y conserva la anterior', async () => {
    const h = await closed();
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: g1Reception({ estado_recepcion: 'PARCIAL' }) });
    await h.service.syncReception(15, comercial());
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: g1Reception({ clave_evento: 'g1-recepcion-1-930-502' }) });
    await h.service.syncReception(15, comercial());
    expect(h.state.dispatches[0].recepcionClaveEvento).toBe('g1-recepcion-1-930-502');
    expect(h.state.receptions.map(r => r.claveEvento)).toEqual(['g1-recepcion-1-930-501', 'g1-recepcion-1-930-502']);
  });

  it('la misma clave con otro contenido es conflicto y no reemplaza la evidencia', async () => {
    const h = await closed();
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: g1Reception() });
    await h.service.syncReception(15, comercial());
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: g1Reception({ estado_recepcion: 'PARCIAL' }) });
    await expect(h.service.syncReception(15, comercial())).rejects.toMatchObject({ response: { code: 'G1_RECEPCION_DISTINTA' } });
    expect(h.state.receptions[0].estadoRecepcion).toBe('COMPLETA');
  });

  it('404 de G1 es pendiente y no escribe; 401/403 bloquean; 5xx es reintentable', async () => {
    const h = await closed();
    h.g1.getReceptions.mockRejectedValueOnce(new G1IntegrationError('G1_NOT_FOUND', 404, false, 'x'));
    expect(await h.service.syncReception(15, comercial())).toMatchObject({ estado: 'PENDIENTE' });
    expect(h.state.receptions).toHaveLength(0);
    for (const status of [401, 403]) {
      h.g1.getReceptions.mockRejectedValueOnce(new G1IntegrationError('G1_X', status, false, 'x'));
      await expect(h.service.syncReception(15, comercial())).rejects.toMatchObject({ response: { code: 'G1_ACCESO_RECHAZADO' } });
    }
    h.g1.getReceptions.mockRejectedValueOnce(new G1IntegrationError('G1_UPSTREAM_ERROR', 502, true, 'x'));
    await expect(h.service.syncReception(15, comercial())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('una respuesta de G1 ajena o malformada no se guarda', async () => {
    const h = await closed();
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: g1Reception({ id_ot_g3: 931 }) });
    await expect(h.service.syncReception(15, comercial())).rejects.toBeInstanceOf(ConflictException);
    h.g1.getReceptions.mockResolvedValueOnce({ status: 200, durationMs: 1, data: null });
    await expect(h.service.syncReception(15, comercial())).rejects.toBeInstanceOf(ConflictException);
    expect(h.state.receptions).toHaveLength(0);
  });

  it('otra empresa no puede sincronizar la recepción', async () => {
    const h = await closed();
    await expect(h.service.syncReception(15, comercial(2))).rejects.toMatchObject({ status: 403 });
  });
});
