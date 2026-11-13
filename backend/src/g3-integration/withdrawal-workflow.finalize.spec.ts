import 'reflect-metadata';
import { withdrawalClosure } from './g3-withdrawal-closure-contract';
import { WithdrawalWorkflowService } from './withdrawal-workflow.service';
import { g3WithdrawalClosure } from './__fixtures__/g3-closure-8a8e5dd0';
import { g1Reception } from './__fixtures__/g1-reception';
import { comercial, created, orderRead, withdrawalHarness } from './__fixtures__/withdrawal-harness';

// Phase 4: effective withdrawal. Full flow with doubles: initiate -> G3 201 -> BAJA closure -> GET COMPLETADA ->
// G1 reception COMPLETA -> finalize. Synthetic data only; nothing leaves the process.
async function readyToFinalize(options: Parameters<typeof withdrawalHarness>[0] = { finalize: true }, prepare?: (h: ReturnType<typeof withdrawalHarness>) => void) {
  const h = withdrawalHarness(options);
  prepare?.(h);
  const g1 = { configured: () => true, getReceptions: jest.fn(async () => ({ status: 200, durationMs: 1, data: g1Reception() })) };
  const g1Inventory = { getEquipmentByService: jest.fn(async () => ({ status: 200, durationMs: 1, data: [] as Array<{ numero_serie: string }> })) };
  const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage, g1, g1Inventory as never);
  h.g3Replies.push(created());
  await service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
  h.g3Replies.push(orderRead('COMPLETADA'));
  await service.receiveWithdrawalClosure(withdrawalClosure(g3WithdrawalClosure(1, { trace_id: h.state.dispatches[0].traceId })));
  await service.syncReception(15, comercial());
  return { ...h, service, g1, g1Inventory, finalize: (user = comercial()) => service.finalize(15, user) };
}
const snapshot = (h: { state: any }) => JSON.stringify({ s: h.state.services, c: h.state.contracts, k: h.state.customers, r: h.state.requests, d: h.state.dispatches.map((d: any) => d.aplicadoEn) });

describe('Baja efectiva por morosidad', () => {
  it('camino feliz: servicio Baja, contrato conservado (otro servicio operativo), cliente recalculado, solicitud CERRADA', async () => {
    const h = await readyToFinalize();
    h.g3Replies.push(orderRead('COMPLETADA'));
    const result = await h.finalize();
    expect(result).toMatchObject({ aplicado: true, yaAplicado: false, idServicio: 61, contratoDeBaja: false, retornoProspectos: 'SIN_REGLA_VIGENTE' });
    expect(h.state.services.find((s: any) => s.idServicio === 61).estadoOperativo).toBe('Baja');
    expect(h.state.services.find((s: any) => s.idServicio === 62).estadoOperativo).toBe('Activo');
    expect(h.state.contracts[0].estado).toBe('Suspendido');
    expect(h.state.requests[0]).toMatchObject({ estado: 'CERRADA', estadoDespachoTecnico: 'COMPLETADA_G3' });
    expect(h.state.dispatches[0].aplicadoEn).toBeInstanceOf(Date);
    expect(h.state.audits.find(a => a.accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD')).toMatchObject({ idUsuario: 7, idEntidadAfectada: 61 });
    expect(h.state.forbiddenWrites).toEqual([]);
    expect(h.g1Inventory.getEquipmentByService).toHaveBeenCalledWith(61, 1);
  });

  it('último servicio del contrato: contrato Baja y cliente Baja; repetir es idempotente', async () => {
    const h = await readyToFinalize({ finalize: true }, x => { x.state.services = x.state.services.filter((s: any) => s.idServicio !== 62); });
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.finalize();
    expect(h.state.contracts[0].estado).toBe('Baja');
    expect(h.state.customers[0].estado).toBe('Baja');
    const again = await h.finalize();
    expect(again).toMatchObject({ aplicado: false, yaAplicado: true });
    expect(h.state.audits.filter(a => a.accion === 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD')).toHaveLength(1);
  });

  it('cliente con servicio en otra empresa: el estado se recalcula con ambas y no se toca lo ajeno', async () => {
    const h = await readyToFinalize({ finalize: true }, x => {
      x.state.services = x.state.services.filter((s: any) => s.idServicio !== 62);
      x.state.services.push({ idServicio: 80, idCliente: 33, idEmpresa: 2, idContrato: 40, idDireccion: 6, estadoOperativo: 'Activo', tipoServicio: 'TV' });
      x.state.contracts.push({ idContrato: 40, idCliente: 33, idEmpresa: 2, estado: 'Activo' });
    });
    h.g3Replies.push(orderRead('COMPLETADA'));
    await h.finalize();
    expect(h.state.contracts[0].estado).toBe('Baja');
    expect(h.state.services.find((s: any) => s.idServicio === 80).estadoOperativo).toBe('Activo');
    expect(h.state.contracts.find((c: any) => c.idContrato === 40).estado).toBe('Activo');
    expect(h.state.customers[0].estado).not.toBe('Baja');
  });

  it('apagada por defecto: responde deshabilitada sin escribir', async () => {
    const h = await readyToFinalize({ finalize: false });
    const before = snapshot(h);
    await expect(h.finalize()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_FINALIZE_DISABLED' } });
    expect(snapshot(h)).toBe(before);
  });

  it('deuda regularizada después del retiro: no aplica la baja ni reactiva; pide decisión comercial', async () => {
    const h = await readyToFinalize();
    h.state.invoices[0].pagos = [{ monto: 20000 }];
    h.g3Replies.push(orderRead('COMPLETADA'));
    const before = snapshot(h);
    await expect(h.finalize()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_DEBT_REGULARIZED', accion: 'DECISION_COMERCIAL_REQUERIDA' } });
    expect(snapshot(h)).toBe(before);
  });

  it.each([
    ['G3 aún en PENDIENTE_APROBACION', (h: any) => { h.g3Replies.push(orderRead('PENDIENTE_APROBACION')); }, 'CIERRE_NO_CONFIRMADO'],
    ['equipo aún asociado al servicio en G1', (h: any) => { h.g3Replies.push(orderRead('COMPLETADA')); h.g1Inventory.getEquipmentByService.mockResolvedValueOnce({ status: 200, durationMs: 1, data: [{ numero_serie: 'QA-OTRO' }] }); }, 'RETIRO_PARCIAL'],
  ])('bloquea sin escribir: %s', async (_name, prepare, code) => {
    const h = await readyToFinalize();
    prepare(h);
    const before = snapshot(h);
    await expect(h.finalize()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_CLOSURE_BLOCKED', motivos: expect.arrayContaining([expect.objectContaining({ code })]) } });
    expect(snapshot(h)).toBe(before);
  });

  it('recepción G1 parcial o con faltantes bloquea', async () => {
    const partial = await readyToFinalize({ finalize: true });
    partial.state.receptions.forEach((r: any) => { r.estadoRecepcion = 'PARCIAL'; });
    partial.g3Replies.push(orderRead('COMPLETADA'));
    await expect(partial.finalize()).rejects.toMatchObject({ response: { motivos: expect.arrayContaining([expect.objectContaining({ code: 'RECEPCION_G1_INCOMPLETA' })]) } });
    const missing = await readyToFinalize({ finalize: true });
    missing.state.dispatches[0].equiposFaltantes = [{ numeroSerie: 'QA-NO-ENTREGADA', motivo: 'Cliente no la entregó' }];
    missing.g3Replies.push(orderRead('COMPLETADA'));
    await expect(missing.finalize()).rejects.toMatchObject({ response: { motivos: expect.arrayContaining([expect.objectContaining({ code: 'EQUIPOS_FALTANTES' })]) } });
  });

  it('G1 de inventario no disponible: no se aplica', async () => {
    const h = await readyToFinalize();
    h.g3Replies.push(orderRead('COMPLETADA'));
    h.g1Inventory.getEquipmentByService.mockRejectedValueOnce(new Error('down'));
    await expect(h.finalize()).rejects.toMatchObject({ response: { code: 'G1_INVENTARIO_NO_DISPONIBLE' } });
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('servicio reactivado por un pago concurrente: no se da de baja', async () => {
    const h = await readyToFinalize();
    h.state.services[0].estadoOperativo = 'Activo';
    h.g3Replies.push(orderRead('COMPLETADA'));
    await expect(h.finalize()).rejects.toMatchObject({ response: { code: 'WITHDRAWAL_SERVICE_STATE_CHANGED' } });
  });

  it('una falla de auditoría revierte servicio, contrato, cliente y solicitud', async () => {
    const h = await readyToFinalize({ finalize: true }, x => { x.state.services = x.state.services.filter((s: any) => s.idServicio !== 62); });
    h.state.failAuditOn = 'APLICAR_BAJA_POR_RETIRO_MOROSIDAD';
    h.g3Replies.push(orderRead('COMPLETADA'));
    const before = snapshot(h);
    await expect(h.finalize()).rejects.toThrow('AUDIT_FAILED');
    expect(snapshot(h)).toBe(before);
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
    expect(h.state.contracts[0].estado).toBe('Suspendido');
  });

  it('otra empresa no puede aplicar la baja', async () => {
    const h = await readyToFinalize();
    await expect(h.finalize(comercial(2))).rejects.toMatchObject({ status: 403 });
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
  });

  it('una solicitud cancelada no se finaliza', async () => {
    const h = withdrawalHarness({ finalize: true, dispatch: false });
    const service = new WithdrawalWorkflowService(h.prisma, h.audit, h.tickets as never, h.config, h.g3, h.storage);
    await service.initiate({ idServicio: 61, observaciones: 'Cliente sin pago tras aviso previo del 01-11' }, comercial());
    await service.cancel(15, 'Cliente pagó la deuda', comercial());
    await expect(service.finalize(15, comercial())).rejects.toMatchObject({ response: { motivos: [{ code: 'SIN_OT' }] } });
    expect(h.state.services[0].estadoOperativo).toBe('Suspendido');
  });
});
