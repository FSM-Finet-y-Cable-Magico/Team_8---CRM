import { G1ActivationService } from './g1-activation.service';
import { G1IntegrationError } from './g1-integration.types';

const user = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Admin', roles: ['Administrador'] };

function setup() {
  let stored: any = null;
  let nextId = 1;
  const activations = {
    upsert: jest.fn(({ create }) => {
      if (!stored) stored = { idIntegracion: nextId++, intentos: 0, ultimoIntento: null, ultimoErrorSanitizado: null, respuestaEstadoG1: null, fechaCompletado: null, createdAt: new Date(), updatedAt: new Date(), ...create };
      return Promise.resolve(stored);
    }),
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored ? { ...stored, cliente: { rut: '12.345.678-5' } } : null)),
    update: jest.fn(({ data }) => {
      const increment = data.intentos?.increment ?? 0;
      stored = { ...stored, ...data, intentos: (stored.intentos ?? 0) + increment };
      if (data.intentos) stored.intentos = (stored.intentos ?? 0);
      return Promise.resolve(stored);
    }),
  };
  const prisma = {
    cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 30, idEmpresa: 1, rut: '12.345.678-5' }) },
    integracionActivacionG1: activations,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const client = { configured: jest.fn().mockReturnValue(true), sendActivation: jest.fn().mockResolvedValue({ status: 200, durationMs: 8, data: { event_id: 'ok', duplicado: false } }) };
  const service = new G1ActivationService(prisma as never, audit as never, client as never);
  const tracking: any = {
    idIntegracion: 8, idEmpresa: 1, idCliente: 30, idContrato: 20, idPlan: 7, idServicio: 50,
    requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA',
    idProspecto: 10, estadoOriginalG3: null, fechaSolicitud: new Date(), ultimoIntento: new Date(),
    fechaUltimaSincronizacion: new Date(), intentos: 1, ultimoErrorSanitizado: null, payloadHash: 'x'.repeat(64),
    payloadSnapshot: {}, fechaCierreProcesado: new Date(), createdAt: new Date(), updatedAt: new Date(),
  };
  const closure: any = { id_ot: 901, resultado_tecnico: { equipos_instalados: [{ numero_serie: 'ONT-001' }] } };
  return { service, prisma, audit, client, tracking, closure, getStored: () => stored };
}

describe('Etapa 4 - activación G1 post G3', () => {
  afterEach(() => jest.restoreAllMocks());

  it('genera y envía una activación solo después del resultado comercial G8', async () => {
    const { service, client, tracking, closure, getStored } = setup();
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(client.sendActivation).toHaveBeenCalledWith(expect.objectContaining({ id_cliente: 30, id_servicio: 50, id_contrato: 20, id_ot: '901', equipos: [{ numero_serie: 'ONT-001' }] }));
    expect(getStored().estadoIntegracion).toBe('COMPLETADA');
  });

  it('usa event_id estable y no reenvía un evento ya completado', async () => {
    const { service, client, tracking, closure, getStored } = setup();
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    const firstEvent = getStored().eventId;
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(getStored().eventId).toBe(firstEvent);
    expect(client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it('acepta una respuesta 200 duplicada sin crear otro tracking ni reenviar', async () => {
    const { service, client, tracking, closure, getStored } = setup();
    client.sendActivation.mockResolvedValueOnce({ status: 200, durationMs: 5, data: { event_id: 'ok', duplicado: true } });
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(getStored()).toMatchObject({ estadoIntegracion: 'COMPLETADA', respuestaEstadoG1: { duplicado: true } });
    expect(client.sendActivation).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, 'G1_COMPANY_FORBIDDEN'],
    [409, 'G1_CONFLICT'],
  ])('registra un rechazo G1 %s como error controlado', async (status, code) => {
    const { service, client, tracking, closure, audit, getStored } = setup();
    client.sendActivation.mockRejectedValueOnce(new G1IntegrationError(code, status, false, 'rechazo controlado'));
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(getStored().estadoIntegracion).toBe('ERROR_G1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      valorNuevo: expect.objectContaining({ statusHttp: status, codigo: code, resultado: 'ERROR_G1' }),
    }));
  });

  it('timeout no revierte el lifecycle G8 y retry reutiliza event_id', async () => {
    const { service, client, tracking, closure, getStored } = setup();
    client.sendActivation.mockRejectedValueOnce(new G1IntegrationError('G1_TIMEOUT', null, true, 'timeout'));
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(getStored().estadoIntegracion).toBe('PENDIENTE_SINCRONIZACION_G1');
    const eventId = getStored().eventId;
    await service.retry(getStored().idIntegracion, user);
    expect(client.sendActivation.mock.calls[1][0].event_id).toBe(eventId);
    expect(getStored().estadoIntegracion).toBe('COMPLETADA');
  });

  it('G1 no configurado queda pendiente sin ejecutar fallback físico local', async () => {
    const { service, client, tracking, closure, prisma, getStored } = setup();
    client.sendActivation.mockRejectedValueOnce(new G1IntegrationError('INTEGRACION_G1_NO_CONFIGURADA', null, true, 'sin configurar'));
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(getStored().estadoIntegracion).toBe('PENDIENTE_SINCRONIZACION_G1');
    expect(prisma).not.toHaveProperty('unidadEquipo');
    expect(prisma).not.toHaveProperty('movimientoInventario');
  });

  it('no inventa semántica multiunidad mientras event_id siga pendiente de ratificación final', async () => {
    const { service, client, tracking, closure, getStored } = setup();
    closure.resultado_tecnico.equipos_instalados.push({ numero_serie: 'ONT-002' });
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    expect(client.sendActivation).not.toHaveBeenCalled();
    expect(getStored().estadoIntegracion).toBe('PENDIENTE_RATIFICACION_G1_EVENT_ID');
  });

  it('sin serie conserva tracking pendiente y no escribe una unidad local', async () => {
    const { service, client, tracking, getStored } = setup();
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, { id_ot: 901, resultado_tecnico: { potencia: -18 } });
    expect(client.sendActivation).not.toHaveBeenCalled();
    expect(getStored().estadoIntegracion).toBe('PENDIENTE_DATOS_EQUIPO_G1');
  });

  it('no envía poste ni NAP a G1 y no escribe CajaNap local', async () => {
    const { service, client, tracking, closure, prisma } = setup();
    closure.resultado_tecnico.numero_poste = 'POSTE-9';
    closure.resultado_tecnico.caja_nap = 'NAP-3';
    await service.afterG3Completion(tracking, { idCliente: 30, idServicio: 50 }, closure);
    const payload = client.sendActivation.mock.calls[0][0];
    expect(payload).not.toHaveProperty('numero_poste');
    expect(payload).not.toHaveProperty('caja_nap');
    expect(prisma).not.toHaveProperty('cajaNap');
  });
});
