import { ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { G1ActivationService } from '../g1-integration/g1-activation.service';
import { G1IntegrationError } from '../g1-integration/g1-integration.types';
import { G3ClosureProcessor } from './g3-closure.processor';
import { sha256Payload } from './g3-integration.utils';

const operator = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'QA', roles: ['Administrador'] };

// Unit harness only: serialized transactions and rollback are simulated, not PostgreSQL certification.
function fixture(persisted?: string) {
  const snapshot = {
    request_id: 'qa-recovery-request', trace_id: 'qa-recovery-trace',
    id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7,
    persona: { rut: '12345678-5', nombre_completo: 'QA', telefono: '+56900000000' },
    direccion: { direccion_completa: 'QA', comuna: 'QA' },
  };
  let db: any = persisted ? JSON.parse(persisted) : {
    tracking: { idIntegracion: 1, idEmpresa: 1, idProspecto: 10, idContrato: 20, idPlan: 7,
      idCliente: null, idServicio: null, requestId: snapshot.request_id, traceId: snapshot.trace_id,
      idOtG3: '901', estadoIntegracion: 'ENVIADA', estadoOtG3: 'PENDIENTE', fechaCierreProcesado: null,
      payloadSnapshot: snapshot, payloadHash: sha256Payload(snapshot) },
    event: null, g1: null, audits: [], activations: 0,
    contract: { idEmpresa: 1, idCliente: 30 },
    service: { idEmpresa: 1, idCliente: 30, idContrato: 20 },
  };
  const copy = (value: any) => structuredClone(value);
  function matches(row: any, where: any): boolean {
    return Object.entries(where).every(([key, expected]: [string, any]) => {
      if (key === 'OR') return expected.some((clause: any) => matches(row, clause));
      if (expected instanceof Date) return +new Date(row[key]) === +expected;
      if (expected && typeof expected === 'object') {
        if ('not' in expected) return row[key] !== expected.not;
        if ('notIn' in expected) return !expected.notIn.includes(row[key]);
        if ('lt' in expected) return row[key] && +new Date(row[key]) < +expected.lt;
      }
      return row[key] === expected;
    });
  }
  const prisma: any = {
    integracionInstalacionG3: {
      findUnique: jest.fn(async () => copy(db.tracking)),
      update: jest.fn(async ({ data }) => copy(Object.assign(db.tracking, data))),
    },
    integracionEventoEntrante: {
      findUnique: jest.fn(async () => copy(db.event)),
      create: jest.fn(async ({ data }) => { db.event = { idEvento: 1, ...copy(data) }; return copy(db.event); }),
      update: jest.fn(async ({ data }) => copy(Object.assign(db.event, copy(data)))),
    },
    integracionActivacionG1: {
      upsert: jest.fn(async ({ create }) => {
        db.g1 ??= { idIntegracion: 1, intentos: 0, ultimoIntento: null, respuestaEstadoG1: null, fechaCompletado: null, ...copy(create) };
        return copy(db.g1);
      }),
      findUnique: jest.fn(async () => copy(db.g1)),
      findUniqueOrThrow: jest.fn(async () => { if (!db.g1) throw new Error('missing'); return copy(db.g1); }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!db.g1 || !matches(db.g1, where)) return { count: 0 };
        const attempts = data.intentos ? db.g1.intentos + data.intentos.increment : db.g1.intentos;
        Object.assign(db.g1, copy(data), { intentos: attempts });
        return { count: 1 };
      }),
    },
    cliente: { findUnique: jest.fn(async () => { throw new Error('Recovery must not reconstruct from mutable identity'); }) },
    contrato: { findUnique: jest.fn(async () => copy(db.contract)) },
    servicioContratado: { findUnique: jest.fn(async () => copy(db.service)) },
    logAuditoria: {
      create: jest.fn(async ({ data }) => { const row = { idLog: db.audits.length + 1, ...copy(data) }; db.audits.push(row); return row; }),
      findFirst: jest.fn(async ({ where }) => copy(db.audits.find((row: any) => row.accion === where.accion
        && row.entidadAfectada === where.entidadAfectada && row.idEntidadAfectada === where.idEntidadAfectada
        && row.valorNuevo.intento === where.valorNuevo.equals) ?? null)),
    },
    $queryRaw: jest.fn(async () => [{ id_integracion: 1 }]),
    $transaction: jest.fn(),
  };
  let tail = Promise.resolve();
  prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const before = copy(db);
    try { return await callback(prisma); }
    catch (error) { db = before; throw error; }
    finally { release(); }
  });
  const activation = { activate: jest.fn(async () => {
    db.activations++;
    return { idCliente: 30, idServicio: 50, idDireccion: 40, fechaActivacion: new Date() };
  }) };
  const client = { sendActivation: jest.fn(async (payload: any) => ({ status: 200, durationMs: 1,
    data: { event_id: payload.event_id, id_servicio: payload.id_servicio, equipos_asociados: payload.equipos.length } })) };
  const audit = new AuditService(prisma);
  const g1 = new G1ActivationService(prisma, audit, client as never);
  const processor = new G3ClosureProcessor(prisma, activation as never, audit, g1);
  const closure = { id_ot: 901, request_id: snapshot.request_id, trace_id: snapshot.trace_id,
    id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7,
    equipos_instalados: [{ numero_serie: 'QA-ONT' }], equipos_retirados: [] };
  return { prisma, processor, g1, client, activation, closure, db: () => db, serialize: () => JSON.stringify(db) };
}

describe('P0-05 recuperacion post cierre (unitaria, sin DB ni red)', () => {
  it('confirma cierre y ambas auditorias; no expone el descriptor en el resultado publico', async () => {
    const s = fixture();
    const result = await s.processor.process(s.closure, 'WEBHOOK');
    expect(result).toMatchObject({ duplicate: false, result: { activated: true } });
    expect(result).not.toHaveProperty('postClosure');
    expect(s.db().event.result.postClosure).toMatchObject({ audit: 'COMPLETADA', g1: { state: 'COMPLETADA', auditPending: false } });
    expect(result.result).not.toHaveProperty('postClosure');
    expect(s.db().audits).toHaveLength(4);
    expect(s.db().activations).toBe(1);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
    expect(s.prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('rollback del evento revierte activacion y tracking, sin auditoria ni G1', async () => {
    const s = fixture();
    s.prisma.integracionEventoEntrante.create.mockRejectedValueOnce(new Error('simulated commit failure'));
    await expect(s.processor.process(s.closure, 'WEBHOOK')).rejects.toThrow('simulated');
    expect(s.db()).toMatchObject({ activations: 0, event: null, g1: null, audits: [], tracking: { estadoIntegracion: 'ENVIADA' } });
    expect(s.client.sendActivation).not.toHaveBeenCalled();
  });

  it('auditoria G3 fallida queda pendiente independientemente del exito G1 y se recupera', async () => {
    const s = fixture();
    s.prisma.logAuditoria.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.db().event.result.postClosure).toMatchObject({ audit: 'PENDIENTE', g1: { state: 'COMPLETADA' } });
    await s.processor.recoverPostClosure(1);
    expect(s.db().event.result.postClosure.audit).toBe('COMPLETADA');
    expect(s.db().audits).toHaveLength(4);
    expect(s.db().activations).toBe(1);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it('fallo de creacion G1 se recupera tras reinicio desde JSON durable, sin cierre ni identidad mutable', async () => {
    const s = fixture();
    s.prisma.integracionActivacionG1.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.db().event.result.postClosure.g1.state).toBe('PENDIENTE_CREACION');
    const original = structuredClone(s.db().event.result.postClosure.descriptor.payload);
    const restarted = fixture(s.serialize());
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.client.sendActivation).toHaveBeenCalledWith(original);
    expect(restarted.db().g1.payloadSnapshot).toEqual(original);
    expect(restarted.db().g1.estadoIntegracion).toBe('COMPLETADA');
    expect(restarted.activation.activate).not.toHaveBeenCalled();
    expect(restarted.prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('webhook identico y reconciliacion no repiten activacion, POST ni auditorias', async () => {
    const s = fixture();
    await s.processor.process(s.closure, 'WEBHOOK');
    await expect(s.processor.process(s.closure, 'WEBHOOK')).resolves.toMatchObject({ duplicate: true });
    await s.processor.recoverPostClosure(1);
    expect(s.db().activations).toBe(1);
    expect(s.db().audits).toHaveLength(4);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it('fallo de envio se reintenta explicitamente con el mismo snapshot; el duplicado no reenvia', async () => {
    const s = fixture();
    s.client.sendActivation.mockRejectedValueOnce(new G1IntegrationError('G1_TIMEOUT', null, true, 'timeout'));
    await s.processor.process(s.closure, 'WEBHOOK');
    const original = structuredClone(s.db().g1.payloadSnapshot);
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
    const restarted = fixture(s.serialize());
    await restarted.g1.retry(1, operator);
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.client.sendActivation).toHaveBeenCalledWith(original);
    expect(restarted.db().event.result.postClosure.g1.state).toBe('COMPLETADA');
    expect(restarted.db().activations).toBe(1);
  });

  it('G1 confirmado sobrevive fallo de auditoria; reinicio recupera solo auditoria', async () => {
    const s = fixture();
    const create = s.prisma.logAuditoria.create.getMockImplementation();
    s.prisma.logAuditoria.create.mockImplementation(async (arg: any) => {
      if (arg.data.entidadAfectada === 'integracion_activacion_g1') throw new Error('audit unavailable');
      return create(arg);
    });
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.db().g1.estadoIntegracion).toBe('COMPLETADA');
    expect(s.db().event.result.postClosure.g1).toMatchObject({ state: 'COMPLETADA', auditPending: true });
    const restarted = fixture(s.serialize());
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.db().event.result.postClosure.g1.auditPending).toBe(false);
    expect(restarted.db().audits).toHaveLength(4);
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    expect(restarted.activation.activate).not.toHaveBeenCalled();
  });

  it('dos recuperaciones concurrentes crean un tracking y un envio (CAS simulado)', async () => {
    const s = fixture();
    s.prisma.integracionActivacionG1.upsert.mockRejectedValueOnce(new Error('creation unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    await Promise.all([s.processor.recoverPostClosure(1), s.processor.recoverPostClosure(1)]);
    expect(s.db().g1.intentos).toBe(1);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
    expect(s.db().activations).toBe(1);
    expect(s.db().audits).toHaveLength(4);
  });

  it('hash distinto del webhook conserva conflicto, sin nuevos efectos', async () => {
    const s = fixture();
    await s.processor.process(s.closure, 'WEBHOOK');
    await expect(s.processor.process({ ...s.closure, equipos_instalados: [] }, 'WEBHOOK')).rejects.toBeInstanceOf(ConflictException);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it.each(['idEmpresa', 'idContrato', 'idCliente', 'idServicio', 'idProspecto', 'idPlan'])('rechaza tracking alterado: %s', async field => {
    const s = fixture();
    s.prisma.integracionActivacionG1.upsert.mockRejectedValueOnce(new Error('creation unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    s.db().tracking[field] = 999;
    await expect(s.processor.recoverPostClosure(1)).rejects.toThrow('POST_CLOSURE_EVIDENCE_INCONSISTENT');
    expect(s.client.sendActivation).not.toHaveBeenCalled();
  });

  it('rechaza payload durable alterado aunque coincida el tracking', async () => {
    const s = fixture();
    await s.processor.process(s.closure, 'WEBHOOK');
    s.db().event.result.postClosure.descriptor.payload.equipos[0].numero_serie = 'altered';
    await expect(s.processor.recoverPostClosure(1)).rejects.toThrow('POST_CLOSURE_EVIDENCE_INCONSISTENT');
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it.each([['contract', 'idEmpresa'], ['contract', 'idCliente'], ['service', 'idEmpresa'], ['service', 'idContrato'], ['service', 'idCliente']])
    ('bloquea relacion %s.%s inconsistente antes de crear G1', async (entity, field) => {
      const s = fixture();
      s.db()[entity][field] = 999;
      await s.processor.process(s.closure, 'WEBHOOK');
      expect(s.db().event.result.postClosure.g1.state).toBe('ERROR_REQUIERE_REVISION');
      expect(s.db().g1).toBeNull();
      expect(s.client.sendActivation).not.toHaveBeenCalled();
    });

  it('sin serie mantiene activacion comercial y pendiente explicito de datos G1', async () => {
    const s = fixture();
    await s.processor.process({ ...s.closure, equipos_instalados: [] }, 'WEBHOOK');
    expect(s.db().g1.estadoIntegracion).toBe('PENDIENTE_DATOS_EQUIPO_G1');
    expect(s.db().activations).toBe(1);
    expect(s.client.sendActivation).not.toHaveBeenCalled();
  });

  it('historico sin descriptor requiere evidencia, sin fabricar payload ni reactivar', async () => {
    const s = fixture();
    await s.processor.process(s.closure, 'WEBHOOK');
    delete s.db().event.result.postClosure;
    const restarted = fixture(s.serialize());
    await expect(restarted.processor.recoverPostClosure(1)).resolves.toMatchObject({ postClosure: { state: 'REQUIERE_EVIDENCIA_HISTORICA' } });
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    expect(restarted.activation.activate).not.toHaveBeenCalled();
  });

  it('lease ENVIANDO sobrevive reinicio y solo expira para retry explicito', async () => {
    const s = fixture();
    s.prisma.integracionActivacionG1.upsert.mockRejectedValueOnce(new Error('creation unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    s.client.sendActivation.mockRejectedValueOnce(new G1IntegrationError('G1_TIMEOUT', null, true, 'timeout'));
    await s.processor.recoverPostClosure(1);
    Object.assign(s.db().g1, { estadoIntegracion: 'ENVIANDO', ultimoIntento: new Date() });
    const restarted = fixture(s.serialize());
    await restarted.g1.retry(1, operator);
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    restarted.db().g1.ultimoIntento = new Date(Date.now() - 300_001);
    await restarted.g1.retry(1, operator);
    expect(restarted.client.sendActivation).toHaveBeenCalledTimes(1);
    expect(restarted.db().g1.estadoIntegracion).toBe('COMPLETADA');
  });

  it('respuesta tardia de una lease vencida no degrada el exito del nuevo intento', async () => {
    const s = fixture();
    let rejectFirst!: (error: Error) => void;
    let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    s.client.sendActivation.mockImplementationOnce(() => {
      started();
      return new Promise((_resolve, reject) => { rejectFirst = reject; });
    });
    const processing = s.processor.process(s.closure, 'WEBHOOK');
    await sending;
    s.db().g1.ultimoIntento = new Date(Date.now() - 300_001);
    await s.g1.retry(1, operator);
    rejectFirst(new G1IntegrationError('G1_TIMEOUT', null, true, 'timeout'));
    await processing;
    expect(s.db().g1.estadoIntegracion).toBe('COMPLETADA');
    expect(s.db().event.result.postClosure.g1.state).toBe('COMPLETADA');
    expect(s.db().g1.intentos).toBe(2);
    expect(s.client.sendActivation.mock.calls[1][0]).toEqual(s.client.sendActivation.mock.calls[0][0]);
  });

  it('no reemplaza resultado pendiente por otro intento mientras falta su auditoria', async () => {
    const s = fixture();
    s.client.sendActivation.mockRejectedValueOnce(new G1IntegrationError('G1_TIMEOUT', null, true, 'timeout'));
    const create = s.prisma.logAuditoria.create.getMockImplementation();
    s.prisma.logAuditoria.create.mockImplementation(async (arg: any) => {
      if (arg.data.entidadAfectada === 'integracion_activacion_g1') throw new Error('audit unavailable');
      return create(arg);
    });
    await s.processor.process(s.closure, 'WEBHOOK');
    await s.g1.retry(1, operator);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
    expect(s.db().g1.intentos).toBe(1);
    s.prisma.logAuditoria.create.mockImplementation(create);
    await s.g1.retry(1, operator);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(2);
    expect(s.db().audits.some((row: any) => row.accion === 'ACTIVACION_G1_PENDIENTE' && row.valorNuevo.intento === 1)).toBe(true);
  });

  it('recupera marcador perdido despues del exito G1 sin otro envio', async () => {
    const s = fixture();
    const update = s.prisma.integracionEventoEntrante.update.getMockImplementation();
    s.prisma.integracionEventoEntrante.update.mockImplementation(async (arg: any) => {
      if (arg.data.result.postClosure.g1.state === 'COMPLETADA') throw new Error('marker unavailable');
      return update(arg);
    });
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.db().event.result.postClosure.g1.state).toBe('PENDIENTE_CREACION');
    expect(s.db().g1.estadoIntegracion).toBe('COMPLETADA');
    const restarted = fixture(s.serialize());
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.db().event.result.postClosure.g1.state).toBe('COMPLETADA');
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    expect(restarted.db().audits).toHaveLength(4);
  });

  it('empresa 2 conserva su scope sin usar empresa principal de la identidad compartida', async () => {
    const s = fixture();
    s.db().tracking.idEmpresa = 2;
    s.db().tracking.payloadSnapshot.id_empresa = 2;
    s.db().tracking.payloadHash = sha256Payload(s.db().tracking.payloadSnapshot);
    s.db().contract.idEmpresa = 2;
    s.db().service.idEmpresa = 2;
    await s.processor.process({ ...s.closure, id_empresa: 2 }, 'WEBHOOK');
    expect(s.client.sendActivation).toHaveBeenCalledWith(expect.objectContaining({ id_empresa: 2, id_cliente: 30 }));
    expect(s.prisma.cliente.findUnique).not.toHaveBeenCalled();
  });

  it('no reenvia automaticamente si otro worker ya intento G1 entre upsert y dispatch', async () => {
    const s = fixture();
    s.prisma.integracionActivacionG1.findUnique.mockImplementationOnce(async () => {
      // Interleaving: another recovery sent and failed after our upsert returned intentos=0.
      Object.assign(s.db().g1, { intentos: 1, ultimoIntento: new Date(),
        estadoIntegracion: 'PENDIENTE_SINCRONIZACION_G1', ultimoErrorSanitizado: 'G1_TIMEOUT' });
      return structuredClone(s.db().g1);
    });
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.client.sendActivation).not.toHaveBeenCalled();
    expect(s.db().g1.intentos).toBe(1);
    expect(s.db().event.result.postClosure.g1.state).toBe('PENDIENTE_SINCRONIZACION_G1');
    await s.g1.retry(1, operator);
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it('una respuesta tardia no atribuye su HTTP 503 a la auditoria del intento confirmado posterior', async () => {
    const s = fixture();
    let rejectFirst!: (error: Error) => void;
    let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    s.client.sendActivation.mockImplementationOnce(() => {
      started();
      return new Promise((_resolve, reject) => { rejectFirst = reject; });
    });
    const processing = s.processor.process(s.closure, 'WEBHOOK');
    await sending;
    s.db().g1.ultimoIntento = new Date(Date.now() - 300_001);
    s.prisma.logAuditoria.create.mockRejectedValueOnce(new Error('audit unavailable for second attempt'));
    await s.g1.retry(1, operator);
    expect(s.db().g1.estadoIntegracion).toBe('COMPLETADA');
    rejectFirst(new G1IntegrationError('G1_UNAVAILABLE', 503, true, 'unavailable'));
    await processing;
    const confirmed = s.db().audits.find((row: any) => row.accion === 'ACTIVACION_G1_COMPLETADA');
    expect(confirmed.valorNuevo).toMatchObject({ intento: 2, resultado: 'COMPLETADA', statusHttp: null });
    expect(s.db().g1.estadoIntegracion).toBe('COMPLETADA');
    expect(s.client.sendActivation).toHaveBeenCalledTimes(2);
  });

  it('fallar el marcador G3 revierte ambas auditorias de la misma transaccion', async () => {
    const s = fixture();
    s.prisma.integracionEventoEntrante.update.mockRejectedValueOnce(new Error('audit marker unavailable'));
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.db().event.result.postClosure.audit).toBe('PENDIENTE');
    expect(s.db().audits.filter((row: any) => row.entidadAfectada === 'integracion_instalacion_g3')).toHaveLength(0);
    const restarted = fixture(s.serialize());
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.db().audits.filter((row: any) => row.entidadAfectada === 'integracion_instalacion_g3')).toHaveLength(2);
    expect(restarted.db().event.result.postClosure.audit).toBe('COMPLETADA');
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    expect(restarted.activation.activate).not.toHaveBeenCalled();
  });

  it.each(['integracion_instalacion_g3', 'integracion_activacion_g1'])
    ('perder ACK del commit de auditoria %s no duplica registros al reiniciar', async entity => {
      const s = fixture();
      const transaction = s.prisma.$transaction.getMockImplementation();
      let ackLost = false;
      s.prisma.$transaction.mockImplementation(async (callback: any) => {
        const before = s.db().audits.filter((row: any) => row.entidadAfectada === entity).length;
        const result = await transaction(callback);
        if (!ackLost && s.db().audits.filter((row: any) => row.entidadAfectada === entity).length > before) {
          ackLost = true;
          // The transaction committed; the caller never received its acknowledgment.
          throw new Error('commit acknowledged too late');
        }
        return result;
      });
      await s.processor.process(s.closure, 'WEBHOOK');
      expect(ackLost).toBe(true);
      expect(s.db().audits).toHaveLength(4);
      const restarted = fixture(s.serialize());
      await restarted.processor.recoverPostClosure(1);
      expect(restarted.db().audits).toHaveLength(4);
      expect(restarted.db().event.result.postClosure).toMatchObject({ audit: 'COMPLETADA', g1: { state: 'COMPLETADA', auditPending: false } });
      expect(restarted.client.sendActivation).not.toHaveBeenCalled();
      expect(restarted.activation.activate).not.toHaveBeenCalled();
    });

  it('ACK remoto sin resultado local exige retry explicito con el mismo payload tras reinicio', async () => {
    const s = fixture();
    const update = s.prisma.integracionActivacionG1.updateMany.getMockImplementation();
    s.prisma.integracionActivacionG1.updateMany.mockImplementation(async (args: any) => {
      if (args.data.intentos) return update(args); // Persist the send lease, then lose DB writes.
      throw new Error('outcome persistence unavailable');
    });
    await s.processor.process(s.closure, 'WEBHOOK');
    expect(s.client.sendActivation).toHaveBeenCalledTimes(1); // Remote mock accepted it.
    expect(s.db().g1.estadoIntegracion).toBe('ENVIANDO');
    const original = structuredClone(s.client.sendActivation.mock.calls[0][0]);
    const restarted = fixture(s.serialize());
    await restarted.processor.recoverPostClosure(1);
    expect(restarted.client.sendActivation).not.toHaveBeenCalled();
    restarted.db().g1.ultimoIntento = new Date(Date.now() - 300_001);
    await restarted.g1.retry(1, operator);
    expect(restarted.client.sendActivation).toHaveBeenCalledTimes(1);
    expect(restarted.client.sendActivation).toHaveBeenCalledWith(original);
    expect(restarted.activation.activate).not.toHaveBeenCalled();
    // Preventing a second physical effect of these two POSTs belongs to G1's idempotency contract.
  });
});
