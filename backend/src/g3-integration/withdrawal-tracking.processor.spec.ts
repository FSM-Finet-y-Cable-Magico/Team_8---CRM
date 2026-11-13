import 'reflect-metadata';
import { ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_TRACKING_INTERVAL_MS, MAX_CONSECUTIVE_FAILURES, TRACKING_BATCH, WithdrawalTrackingProcessor } from './withdrawal-tracking.processor';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { g1Reception } from './__fixtures__/g1-reception';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { comercial, created, orderRead, withdrawalHarness } from './__fixtures__/withdrawal-harness';

const processor = (workflow: Partial<Record<'trackableRequests' | 'track', jest.Mock>>, settings: Record<string, string> = { WITHDRAWAL_TRACKING_ENABLED: 'true' }) =>
  new WithdrawalTrackingProcessor(workflow as unknown as WithdrawalWorkflowService, new ConfigService(settings));

describe('seguimiento automático de retiros (procesador)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('apagado por defecto: no programa ciclos ni consulta', async () => {
    jest.useFakeTimers();
    const workflow = { trackableRequests: jest.fn(), track: jest.fn() };
    const p = processor(workflow, {});
    p.onModuleInit();
    await jest.advanceTimersByTimeAsync(DEFAULT_TRACKING_INTERVAL_MS * 3);
    await expect(p.tick()).resolves.toEqual({ skipped: true });
    expect(workflow.trackableRequests).not.toHaveBeenCalled();
  });

  it('habilitado: cada 5 minutos por defecto, intervalo configurable y acotado a 1-60 minutos', async () => {
    jest.useFakeTimers();
    const workflow = { trackableRequests: jest.fn().mockResolvedValue([]), track: jest.fn() };
    const p = processor(workflow);
    expect(p.intervalMs).toBe(300_000);
    p.onModuleInit();
    await jest.advanceTimersByTimeAsync(299_999);
    expect(workflow.trackableRequests).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(workflow.trackableRequests).toHaveBeenCalledWith(TRACKING_BATCH);
    await jest.advanceTimersByTimeAsync(300_000);
    expect(workflow.trackableRequests).toHaveBeenCalledTimes(2);
    p.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(900_000);
    expect(workflow.trackableRequests).toHaveBeenCalledTimes(2);
    expect(processor(workflow, { WITHDRAWAL_TRACKING_ENABLED: 'true', WITHDRAWAL_TRACKING_INTERVAL_MS: '1000' }).intervalMs).toBe(60_000);
    expect(processor(workflow, { WITHDRAWAL_TRACKING_ENABLED: 'true', WITHDRAWAL_TRACKING_INTERVAL_MS: '99999999' }).intervalMs).toBe(3_600_000);
    expect(processor(workflow, { WITHDRAWAL_TRACKING_ENABLED: 'true', WITHDRAWAL_TRACKING_INTERVAL_MS: 'x' }).intervalMs).toBe(300_000);
  });

  it('un ciclo nunca se superpone con el siguiente', async () => {
    let release!: () => void;
    const workflow = { trackableRequests: jest.fn().mockResolvedValue([15]), track: jest.fn(() => new Promise<void>(resolve => { release = resolve; })) };
    const p = processor(workflow);
    const first = p.tick();
    await new Promise(resolve => setImmediate(resolve));
    await expect(p.tick()).resolves.toEqual({ skipped: true });
    release();
    await expect(first).resolves.toMatchObject({ consultadas: 1 });
  });

  it('reintentos acotados: espera creciente y suspensión tras fallas consecutivas, con código y sin datos del cliente', async () => {
    const workflow = { trackableRequests: jest.fn().mockResolvedValue([15, 16]),
      track: jest.fn(async (id: number) => { if (id === 15) throw new ConflictException({ code: 'G3_UNAVAILABLE', message: 'x' }); }) };
    const p = processor(workflow);
    const attemptsOf15 = () => workflow.track.mock.calls.filter(([id]) => id === 15).length;
    const cyclesWithAttempt: number[] = [];
    for (let cycle = 1; cycle <= 40; cycle++) {
      const before = attemptsOf15();
      await p.tick();
      if (attemptsOf15() > before) cyclesWithAttempt.push(cycle);
    }
    // Attempts at cycles 1, 2, 4, 8, 16, 28 (back-off 1, 2, 4, 8, 12) and then suspended.
    expect(cyclesWithAttempt).toEqual([1, 2, 4, 8, 16, 28]);
    expect(attemptsOf15()).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(workflow.track.mock.calls.filter(([id]) => id === 16)).toHaveLength(40);
    const logs = warn.mock.calls.map(call => String(call[0])).join('\n');
    expect(logs).toMatch(/solicitud 15 suspendida tras 6 fallas consecutivas \(G3_UNAVAILABLE\)/);
    expect(logs).not.toMatch(/rut|nombre|direcci/i);
  });

  it('un éxito reinicia el contador; una solicitud que deja de estar activa libera su registro', async () => {
    const workflow = { trackableRequests: jest.fn().mockResolvedValue([15]), track: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined) };
    const p = processor(workflow);
    await p.tick(); await p.tick();
    await expect(p.tick()).resolves.toMatchObject({ consultadas: 1, enEspera: 0 });
    workflow.trackableRequests.mockResolvedValue([]);
    await expect(p.tick()).resolves.toMatchObject({ consultadas: 0 });
  });

  it('sin almacenamiento aplicado no consulta nada y avisa una sola vez por hora', async () => {
    const workflow = { trackableRequests: jest.fn().mockResolvedValue(null), track: jest.fn() };
    const p = processor(workflow);
    for (let i = 0; i < 12; i++) await p.tick();
    expect(workflow.track).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    await p.tick();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('seguimiento automático de retiros (flujo con dobles)', () => {
  async function accepted(options: Parameters<typeof withdrawalHarness>[0] = { finalize: true }) {
    const h = withdrawalHarness(options);
    const g1 = { configured: () => true, getReceptions: jest.fn(async () => ({ status: 200, durationMs: 1, data: g1Reception() })) };
    const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage, g1, { getEquipmentByService: jest.fn() } as never);
    h.g3Replies.push(created());
    await service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    return { ...h, service, g1 };
  }

  it('solo lee: GET de la OT (respetando la caché), nunca envía, cancela ni aplica la baja', async () => {
    const h = await accepted();
    expect(await h.service.trackableRequests(50)).toEqual([15]);
    h.g3Replies.push(orderRead('EN_CURSO'));
    await expect(h.service.track(15)).resolves.toEqual({ ordenConsultada: true, recepcion: 'NO_APLICA' });
    await expect(h.service.track(15)).resolves.toEqual({ ordenConsultada: false, recepcion: 'NO_APLICA' });
    expect(h.g3Calls.map(call => call.op)).toEqual(['create', 'read']);
    expect(h.state.dispatches[0].estadoOt).toBe('EN_CURSO');
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
    expect(h.state.requests[0].estado).not.toBe('CERRADA');
    expect(h.state.tickets[0].estado).toBe('Abierto');
  });

  it('con el cierre BAJA recibido sincroniza la recepción G1 de forma idempotente y no vuelve a leer una OT COMPLETADA', async () => {
    const h = await accepted();
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
    await expect(h.service.track(15)).resolves.toEqual({ ordenConsultada: false, recepcion: 'SINCRONIZADA' });
    await expect(h.service.track(15)).resolves.toEqual({ ordenConsultada: false, recepcion: 'SINCRONIZADA' });
    expect(h.state.audits.filter(a => a.accion === 'REGISTRAR_RECEPCION_G1_RETIRO')).toHaveLength(1);
    expect(h.g3Calls.filter(call => call.op === 'read')).toHaveLength(1);
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('estados terminales salen del seguimiento: cancelada, OT cancelada, cerrada o aplicada', async () => {
    const cancelled = await accepted();
    cancelled.state.dispatches[0].estadoDespacho = 'CANCELADA';
    expect(await cancelled.service.trackableRequests(50)).toEqual([]);
    const otCancelled = await accepted();
    otCancelled.state.dispatches[0].estadoOt = 'CANCELADA';
    expect(await otCancelled.service.trackableRequests(50)).toEqual([]);
    const closed = await accepted();
    closed.state.requests[0].estado = 'CERRADA';
    expect(await closed.service.trackableRequests(50)).toEqual([]);
    const applied = await accepted();
    applied.state.dispatches[0].aplicadoEn = new Date();
    expect(await applied.service.trackableRequests(50)).toEqual([]);
    const lateCancel = await accepted();
    lateCancel.state.dispatches[0].estadoDespacho = 'CANCELACION_NO_APLICABLE';
    expect(await lateCancel.service.trackableRequests(50)).toEqual([15]);
  });

  it('sin almacenamiento aplicado no hay nada que seguir', async () => {
    const h = withdrawalHarness({ storage: false });
    const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage);
    await expect(service.trackableRequests(50)).resolves.toBeNull();
  });
});
