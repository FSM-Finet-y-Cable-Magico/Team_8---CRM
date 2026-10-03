import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { G3ClosureProcessor } from './g3-closure.processor';

function setup(idEmpresa = 1) {
  const tracking: any = {
    idIntegracion: 1, idEmpresa, idProspecto: 10, idCliente: null, idContrato: 20, idPlan: 7, idServicio: null,
    requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', estadoIntegracion: 'ENVIADA', estadoOtG3: 'PENDIENTE', estadoOriginalG3: null,
    fechaSolicitud: new Date(), ultimoIntento: new Date(), fechaUltimaSincronizacion: null, intentos: 1,
    ultimoErrorSanitizado: null, payloadHash: 'a'.repeat(64), payloadSnapshot: {}, fechaCierreProcesado: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  let event: any = null;
  const events = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(event)),
    create: jest.fn().mockImplementation(({ data }) => {
      event = { idEvento: 1, ...data, processedAt: new Date() };
      return Promise.resolve(event);
    }),
  };
  const integrations = {
    findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(
      where.requestId && where.requestId !== tracking.requestId ? null : tracking,
    )),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve(Object.assign(tracking, data))),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id_integracion: 1 }]),
    integracionEventoEntrante: events,
    integracionInstalacionG3: integrations,
  };
  const prisma = {
    integracionEventoEntrante: events,
    integracionInstalacionG3: integrations,
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const activation = {
    activate: jest.fn().mockResolvedValue({ idCliente: 30, idDireccion: 40, idServicio: 50, fechaActivacion: new Date() }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const g1 = { afterG3Completion: jest.fn().mockResolvedValue(undefined) };
  const processor = new G3ClosureProcessor(prisma as never, activation as never, audit as never, g1 as never);
  const completed = {
    id_ot: 901,
    request_id: tracking.requestId,
    trace_id: tracking.traceId,
    id_empresa: idEmpresa,
    id_prospecto: 10,
    id_contrato: 20,
    id_plan: 7,
    equipos_instalados: [{ numero_serie: 'ONT-001' }],
    equipos_retirados: [],
  };
  return { processor, prisma, activation, audit, g1, tracking, completed };
}

describe('G3ClosureProcessor approval-only', () => {
  it('acepta el payload real sin estado e interpreta el cierre como COMPLETADA', async () => {
    const { processor, activation, tracking, completed } = setup();
    const result = await processor.process(completed, 'WEBHOOK');
    expect(completed).not.toHaveProperty('estado');
    expect(activation.activate).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      equipos_instalados: completed.equipos_instalados,
      equipos_retirados: completed.equipos_retirados,
    });
    expect(result).toMatchObject({ duplicate: false, result: { estado: 'COMPLETADA', activated: true } });
    expect(tracking).toMatchObject({ estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA' });
  });

  it('solo después del commit comercial solicita una activación G1', async () => {
    const { processor, g1, completed } = setup();
    await processor.process(completed, 'WEBHOOK');
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledWith(
      expect.any(Object),
      { idCliente: 30, idServicio: 50 },
      expect.not.objectContaining({ estado: expect.anything() }),
    );
  });

  it('un fallo G1 posterior al commit no revierte la activación comercial G8', async () => {
    const { processor, activation, g1, completed, tracking } = setup();
    g1.afterG3Completion.mockRejectedValueOnce(new Error('G1 no disponible'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(processor.process(completed, 'WEBHOOK')).resolves.toMatchObject({ duplicate: false });
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(tracking.estadoIntegracion).toBe('COMPLETADA');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('G1'), expect.objectContaining({ idEmpresa: 1 }));
    errorLog.mockRestore();
  });

  it('un retry idéntico no duplica Cliente, Servicio ni activación G1', async () => {
    const { processor, activation, g1, completed } = setup();
    await processor.process(completed, 'WEBHOOK');
    await expect(processor.process(completed, 'WEBHOOK')).resolves.toMatchObject({ duplicate: true });
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('reconciliación posterior al webhook no duplica efectos comerciales', async () => {
    const { processor, activation, g1, completed } = setup();
    await processor.process(completed, 'WEBHOOK');
    await processor.process(completed, 'RECONCILIACION');
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('webhook posterior a reconciliación no duplica efectos comerciales', async () => {
    const { processor, activation, g1, completed } = setup();
    await processor.process(completed, 'RECONCILIACION');
    await processor.process(completed, 'WEBHOOK');
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('rechaza un request_id que no corresponde a una instalación conocida', async () => {
    const { processor, completed } = setup();
    await expect(processor.process({ ...completed, request_id: '33333333-3333-4333-8333-333333333333' }, 'WEBHOOK'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['id_ot', 902],
    ['id_empresa', 2],
    ['id_prospecto', 11],
    ['id_contrato', 21],
    ['id_plan', 8],
    ['trace_id', '33333333-3333-4333-8333-333333333333'],
  ])('rechaza la correlación %s incompatible', async (field, value) => {
    const { processor, completed } = setup();
    await expect(processor.process({ ...completed, [field]: value }, 'WEBHOOK'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([1, 2])('procesa el cierre para una empresa autorizable %s', async (idEmpresa) => {
    const { processor, completed } = setup(idEmpresa);
    await expect(processor.process(completed, 'WEBHOOK')).resolves.toMatchObject({ duplicate: false });
  });

  it('rechaza un payload incompleto antes de activar', async () => {
    const { processor, activation, completed } = setup();
    const { equipos_retirados: _removed, ...incomplete } = completed;
    await expect(processor.process(incomplete as never, 'WEBHOOK')).rejects.toBeInstanceOf(BadRequestException);
    expect(activation.activate).not.toHaveBeenCalled();
  });

  it('un payload diferente con la misma identidad de cierre produce conflicto', async () => {
    const { processor, completed } = setup();
    await processor.process(completed, 'WEBHOOK');
    await expect(processor.process({
      ...completed,
      equipos_instalados: [{ numero_serie: 'ONT-002' }],
    }, 'RECONCILIACION')).rejects.toBeInstanceOf(ConflictException);
  });
});
