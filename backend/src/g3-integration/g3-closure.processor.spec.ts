import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { G3ClosureProcessor } from './g3-closure.processor';

function setup() {
  const tracking: any = {
    idIntegracion: 1, idEmpresa: 1, idProspecto: 10, idCliente: null, idContrato: 20, idPlan: 7, idServicio: null,
    requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', estadoIntegracion: 'ENVIADA', estadoOtG3: 'EN_CURSO', estadoOriginalG3: null,
    fechaSolicitud: new Date(), ultimoIntento: new Date(), fechaUltimaSincronizacion: null, intentos: 1,
    ultimoErrorSanitizado: null, payloadHash: 'a'.repeat(64), payloadSnapshot: {}, fechaCierreProcesado: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  let event: any = null;
  const events = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(event)),
    create: jest.fn().mockImplementation(({ data }) => { event = { idEvento: 1, ...data, processedAt: new Date() }; return Promise.resolve(event); }),
  };
  const integrations = {
    findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.requestId && where.requestId !== tracking.requestId ? null : tracking)),
    findMany: jest.fn().mockResolvedValue([tracking]),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve(Object.assign(tracking, data))),
  };
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id_integracion: 1 }]), integracionEventoEntrante: events, integracionInstalacionG3: integrations };
  const prisma = { integracionEventoEntrante: events, integracionInstalacionG3: integrations, $transaction: jest.fn().mockImplementation((callback) => callback(tx)) };
  const activation = { activate: jest.fn().mockResolvedValue({ idCliente: 30, idDireccion: 40, idServicio: 50, fechaActivacion: new Date() }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const processor = new G3ClosureProcessor(prisma as never, activation as never, audit as never);
  const completed = { request_id: tracking.requestId, estado: 'COMPLETADA', tipo: 'INSTALACION', resultado_tecnico: { potencia: -19 } };
  return { processor, prisma, activation, audit, tracking, completed, getEvent: () => event, setEvent: (value: any) => { event = value; } };
}

describe('Etapa 3 - G3ClosureProcessor', () => {
  it('25. estado desconocido no activa', async () => {
    const { processor, activation, tracking } = setup(); await processor.process({ request_id: tracking.requestId, estado: 'ESPERA_MATERIAL' }, 'WEBHOOK');
    expect(activation.activate).not.toHaveBeenCalled(); expect(tracking.estadoOtG3).toBe('EN_SEGUIMIENTO'); expect(tracking.estadoOriginalG3).toBe('ESPERA_MATERIAL');
  });
  it('26. CANCELADA no activa ni crea cliente', async () => {
    const { processor, activation, tracking } = setup(); await processor.process({ request_id: tracking.requestId, estado: 'CANCELADA' }, 'WEBHOOK');
    expect(activation.activate).not.toHaveBeenCalled(); expect(tracking.estadoOtG3).toBe('CANCELADA');
  });
  it('27. PENDIENTE_CLIENTE_AUSENTE no activa', async () => {
    const { processor, activation, tracking } = setup(); await processor.process({ request_id: tracking.requestId, estado: 'PENDIENTE_CLIENTE_AUSENTE' }, 'WEBHOOK');
    expect(activation.activate).not.toHaveBeenCalled(); expect(tracking.estadoIntegracion).toBe('EN_SEGUIMIENTO');
  });
  it('28. cierre COMPLETADA ejecuta el servicio de activacion protegido', async () => {
    const { processor, activation, completed } = setup(); await processor.process(completed, 'WEBHOOK');
    expect(activation.activate).toHaveBeenCalledTimes(1);
  });
  it('32. retry del webhook no duplica activacion', async () => {
    const { processor, activation, completed } = setup(); await processor.process(completed, 'WEBHOOK'); await processor.process(completed, 'WEBHOOK');
    expect(activation.activate).toHaveBeenCalledTimes(1);
  });
  it('33. reconciliacion posterior al webhook no duplica', async () => {
    const { processor, activation, completed } = setup(); await processor.process(completed, 'WEBHOOK'); await processor.process(completed, 'RECONCILIACION');
    expect(activation.activate).toHaveBeenCalledTimes(1);
  });
  it('34. webhook posterior a reconciliacion no duplica', async () => {
    const { processor, activation, completed } = setup(); await processor.process(completed, 'RECONCILIACION'); await processor.process(completed, 'WEBHOOK');
    expect(activation.activate).toHaveBeenCalledTimes(1);
  });
  it('35. request_id incorrecto es rechazado', async () => {
    const { processor } = setup(); await expect(processor.process({ request_id: '33333333-3333-4333-8333-333333333333', estado: 'PENDIENTE' }, 'WEBHOOK')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('36. empresa incorrecta es rechazada', async () => {
    const { processor, tracking } = setup(); await expect(processor.process({ request_id: tracking.requestId, id_empresa: 2, estado: 'PENDIENTE' }, 'WEBHOOK')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('37. correlaciones opcionales ausentes no rompen el parsing', async () => {
    const { processor, tracking } = setup(); await expect(processor.process({ request_id: tracking.requestId, estado: 'ASIGNADA' }, 'WEBHOOK')).resolves.toMatchObject({ duplicate: false });
  });
  it('38. correlaciones presentes son validadas', async () => {
    const { processor, tracking } = setup(); await expect(processor.process({ request_id: tracking.requestId, trace_id: tracking.traceId, id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7, estado: 'EN_CURSO' }, 'WEBHOOK')).resolves.toMatchObject({ duplicate: false });
  });
  it('39. cierre de reparacion no crea Cliente', async () => {
    const { processor, activation, completed } = setup(); await expect(processor.process({ ...completed, tipo: 'REPARACION' }, 'WEBHOOK')).rejects.toBeInstanceOf(BadRequestException); expect(activation.activate).not.toHaveBeenCalled();
  });
  it('44. payload identico ya procesado devuelve duplicate', async () => {
    const { processor, completed } = setup(); await processor.process(completed, 'WEBHOOK'); await expect(processor.process(completed, 'WEBHOOK')).resolves.toMatchObject({ duplicate: true });
  });
  it('45. payload conflictivo para el mismo estado es rechazado', async () => {
    const { processor, completed } = setup(); await processor.process(completed, 'WEBHOOK');
    await expect(processor.process({ ...completed, resultado_tecnico: { potencia: -25 } }, 'RECONCILIACION')).rejects.toBeInstanceOf(ConflictException);
  });
});
