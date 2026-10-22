import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { G3ClosureProcessor } from './g3-closure.processor';
import { sha256Payload } from './g3-integration.utils';

function setup(idEmpresa = 1) {
  const tracking: any = {
    idIntegracion: 1, idEmpresa, idProspecto: 10, idCliente: null, idContrato: 20, idPlan: 7, idServicio: null,
    requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', estadoIntegracion: 'ENVIADA', estadoOtG3: 'PENDIENTE', estadoOriginalG3: null,
    fechaSolicitud: new Date(), ultimoIntento: new Date(), fechaUltimaSincronizacion: null, intentos: 1,
    ultimoErrorSanitizado: null, payloadHash: 'a'.repeat(64), payloadSnapshot: {}, fechaCierreProcesado: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  tracking.payloadSnapshot = {
    request_id: tracking.requestId, trace_id: tracking.traceId,
    id_empresa: idEmpresa, id_prospecto: 10, id_contrato: 20, id_plan: 7,
    persona: { rut: '12345678-5', nombre_completo: 'Prueba', telefono: '+56912345678' },
    direccion: { direccion_completa: 'Direccion de prueba', comuna: 'Comuna de prueba' },
  };
  tracking.payloadHash = sha256Payload(tracking.payloadSnapshot);
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
  return { processor, prisma, tx, activation, audit, g1, tracking, completed,
    getEvent: () => event, setEvent: (value: unknown) => { event = value; } };
}

describe('G3ClosureProcessor approval-only', () => {
  it('trackingHint no permite un request_id diferente en reconciliacion', async () => {
    const { processor, completed, activation, prisma, g1 } = setup();
    await expect(processor.process({ ...completed, request_id: 'otra-solicitud' }, 'RECONCILIACION', 1))
      .rejects.toThrow('request_id');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(activation.activate).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it.each(['requestId', 'traceId', 'idEmpresa', 'idContrato', 'idProspecto', 'idPlan', 'idOtG3'])
    ('revalida %s del tracking despues del lock existente', async (field) => {
      const { processor, completed, tracking, tx, activation, g1 } = setup();
      tx.$queryRaw.mockImplementationOnce(async () => {
        tracking[field] = typeof tracking[field] === 'number' ? 99 : 'otro';
        return [{ id_integracion: 1 }];
      });
      await expect(processor.process(completed, 'WEBHOOK')).rejects.toBeInstanceOf(BadRequestException);
      expect(activation.activate).not.toHaveBeenCalled();
      expect(tx.integracionEventoEntrante.create).not.toHaveBeenCalled();
      expect(g1.afterG3Completion).not.toHaveBeenCalled();
    });

  it.each(['antes', 'despues'])('rechaza snapshot alterado %s del bloqueo', async (moment) => {
    const { processor, completed, tracking, tx, activation, g1 } = setup();
    const alter = () => { tracking.payloadSnapshot.id_plan = 99; };
    if (moment === 'antes') alter();
    else tx.$queryRaw.mockImplementationOnce(async () => { alter(); return [{ id_integracion: 1 }]; });
    await expect(processor.process(completed, 'WEBHOOK')).rejects.toThrow('snapshot');
    expect(activation.activate).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it('no reactiva un historico completado sin evidencia de evento', async () => {
    const { processor, completed, tracking, activation, g1 } = setup();
    tracking.estadoIntegracion = 'COMPLETADA';
    tracking.fechaCierreProcesado = new Date();
    await expect(processor.process(completed, 'RECONCILIACION', 1)).rejects.toBeInstanceOf(ConflictException);
    expect(activation.activate).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it('un evento historico identico sigue siendo duplicate aunque el snapshot antiguo no sea completo', async () => {
    const { processor, completed, tracking, activation, g1 } = setup();
    await processor.process(completed, 'WEBHOOK');
    tracking.payloadSnapshot = {};
    await expect(processor.process(completed, 'RECONCILIACION')).resolves.toMatchObject({ duplicate: true });
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('deduplica un cierre que aparece mientras se esperaba el lock', async () => {
    const { processor, completed, tx, activation, g1 } = setup();
    tx.$queryRaw.mockImplementationOnce(async () => {
      await tx.integracionEventoEntrante.create({ data: { payloadHash: sha256Payload(completed), result: { activated: true } } });
      return [{ id_integracion: 1 }];
    });
    await expect(processor.process(completed, 'WEBHOOK')).resolves.toMatchObject({ duplicate: true });
    expect(activation.activate).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it('dos cierres concurrentes se serializan por el lock simulado y activan una sola vez', async () => {
    const { processor, completed, prisma, tx, activation, g1 } = setup();
    let tail = Promise.resolve();
    prisma.$transaction.mockImplementation(async (callback) => {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { release = resolve; });
      try {
        return await callback({ ...tx, $queryRaw: async () => { await previous; return [{ id_integracion: 1 }]; } });
      } finally {
        release();
      }
    });
    const results = await Promise.all([
      processor.process(completed, 'WEBHOOK'), processor.process(completed, 'RECONCILIACION', 1),
    ]);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(tx.integracionEventoEntrante.create).toHaveBeenCalledTimes(1);
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('un cierre concurrente con hash diferente mantiene el conflicto', async () => {
    const { processor, completed, tx, activation, g1 } = setup();
    tx.$queryRaw.mockImplementationOnce(async () => {
      await tx.integracionEventoEntrante.create({ data: { payloadHash: 'otro-hash', result: {} } });
      return [{ id_integracion: 1 }];
    });
    await expect(processor.process(completed, 'WEBHOOK')).rejects.toBeInstanceOf(ConflictException);
    expect(activation.activate).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it.each(['evento', 'commit'])('un fallo de %s no sale hacia G1 ni confirma el resultado (transaccion simulada)', async (failure) => {
    const { processor, completed, tracking, tx, prisma, activation, audit, g1, getEvent, setEvent } = setup();
    const before = structuredClone(tracking);
    const eventBefore = structuredClone(getEvent());
    prisma.$transaction.mockImplementationOnce(async (callback) => {
      try {
        const result = await callback(tx);
        if (failure === 'commit') throw new Error('Fallo de commit simulado');
        return result;
      } catch (error) {
        Object.assign(tracking, before);
        setEvent(eventBefore);
        throw error;
      }
    });
    if (failure === 'evento') tx.integracionEventoEntrante.create.mockRejectedValueOnce(new Error('Fallo de evento simulado'));
    await expect(processor.process(completed, 'WEBHOOK')).rejects.toThrow('simulado');
    expect(activation.activate).toHaveBeenCalledTimes(1);
    expect(tracking).toEqual(before);
    expect(getEvent()).toEqual(eventBefore);
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('espera la confirmacion de la transaccion antes de cualquier comunicacion G1', async () => {
    const { processor, completed, prisma, tx, g1 } = setup();
    let commit!: () => void;
    let prepared!: () => void;
    const pendingCommit = new Promise<void>((resolve) => { commit = resolve; });
    const preparedTransaction = new Promise<void>((resolve) => { prepared = resolve; });
    prisma.$transaction.mockImplementationOnce(async (callback) => {
      const result = await callback(tx);
      prepared();
      await pendingCommit;
      return result;
    });
    const processing = processor.process(completed, 'WEBHOOK');
    await preparedTransaction;
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
    commit();
    await processing;
    expect(g1.afterG3Completion).toHaveBeenCalledTimes(1);
  });

  it('una inelegibilidad comercial no se convierte en exito approval-only ni en llamada G1', async () => {
    const { processor, completed, activation, tracking, tx, g1 } = setup();
    activation.activate.mockRejectedValueOnce(new BadRequestException('El estado del contrato no permite activar la instalacion'));
    await expect(processor.process(completed, 'WEBHOOK')).rejects.toBeInstanceOf(BadRequestException);
    expect(tracking.estadoIntegracion).toBe('ENVIADA');
    expect(tx.integracionEventoEntrante.create).not.toHaveBeenCalled();
    expect(tx.integracionInstalacionG3.update).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

  it('configura espera y timeout solo en la transaccion atomica del cierre', async () => {
    const { processor, prisma, completed } = setup();

    await processor.process(completed, 'WEBHOOK');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 20_000,
    });
  });

  it('un fallo dentro de la activacion no confirma tracking, evento, auditoria ni G1', async () => {
    const { processor, tx, activation, audit, g1, completed } = setup();
    activation.activate.mockRejectedValueOnce(new Error('Fallo de activacion'));

    await expect(processor.process(completed, 'WEBHOOK')).rejects.toThrow('Fallo de activacion');

    expect(tx.integracionInstalacionG3.update).not.toHaveBeenCalled();
    expect(tx.integracionEventoEntrante.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(g1.afterG3Completion).not.toHaveBeenCalled();
  });

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

  it('valida y entrega a la activacion los datos tecnicos opcionales autorizados', async () => {
    const { processor, activation, completed } = setup();
    const enriched = {
      ...completed,
      fecha_completada: '2026-10-07T12:00:00.000Z',
      id_tecnico: 77,
      potencia_optica_dbm: -19.4,
      resultado_llamada: 'CONTACTADO',
      resuelto_remotamente: false,
      materiales: [{ nombre: 'Conector' }],
    };

    await processor.process(enriched, 'WEBHOOK');

    expect(activation.activate).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      equipos_instalados: completed.equipos_instalados,
      equipos_retirados: completed.equipos_retirados,
      fecha_completada: enriched.fecha_completada,
      id_tecnico: 77,
      potencia_optica_dbm: -19.4,
      resultado_llamada: 'CONTACTADO',
      resuelto_remotamente: false,
      materiales: enriched.materiales,
    });
  });

  it.each([
    ['fecha_completada', 'no-es-fecha'],
    ['id_tecnico', 0],
    ['potencia_optica_dbm', Number.NaN],
    ['resultado_llamada', '   '],
    ['resuelto_remotamente', 'false'],
    ['materiales', {}],
  ])('rechaza el dato tecnico opcional invalido %s', async (field, value) => {
    const { processor, activation, completed } = setup();
    await expect(processor.process({ ...completed, [field]: value }, 'WEBHOOK'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(activation.activate).not.toHaveBeenCalled();
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
