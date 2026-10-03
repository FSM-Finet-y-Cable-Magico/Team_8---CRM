import { BadRequestException } from '@nestjs/common';
import { G3IntegrationError } from './g3-integration.types';
import { InstallationIntegrationService } from './installation-integration.service';

const user = { idUsuario: 5, idEmpresa: 1, email: 'test@example.invalid', nombreCompleto: 'Usuario Test', roles: ['Comercial'] };

function setup() {
  let stored: any = null;
  const contract = {
    idContrato: 20, idCliente: null, idProspecto: 10, idPlan: 7, idEmpresa: 1, idZonaPago: 2,
    estado: 'Firmado', direccionInstalacion: 'Calle Demo 123', comunaInstalacion: 'Valparaiso', ciudadInstalacion: 'Valparaiso',
    plan: { idPlan: 7, idEmpresa: 1, tipoPlan: 'Internet Fibra' }, cliente: null,
    prospecto: {
      idProspecto: 10, idEmpresa: 1, idCliente: null, rut: '12345678-5', nombreCompleto: 'Persona Demo',
      telefono: '+56912345678', email: 'persona@example.invalid', direccion: 'Calle Demo 123', comuna: 'Valparaiso',
      origenContacto: 'Web', fechaCreacion: new Date('2026-09-01'),
    },
  };
  const integration = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    create: jest.fn().mockImplementation(({ data }) => {
      stored = {
        idIntegracion: 1, ...data, idOtG3: null, codigoOtG3: null, estadoIntegracion: 'PENDIENTE_ENVIO',
        estadoOtG3: null, estadoOriginalG3: null, fechaSolicitud: new Date(), ultimoIntento: null,
        fechaUltimaSincronizacion: null, intentos: 0, ultimoErrorSanitizado: null, fechaCierreProcesado: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      return Promise.resolve(stored);
    }),
    update: jest.fn().mockImplementation(({ data }) => {
      stored = { ...stored, ...data, intentos: data.intentos?.increment ? stored.intentos + data.intentos.increment : stored.intentos };
      return Promise.resolve(stored);
    }),
  };
  const tx = { integracionInstalacionG3: integration, prospecto: { update: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    contrato: { findFirst: jest.fn().mockResolvedValue(contract), findUnique: jest.fn().mockResolvedValue(contract) },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue(null) },
    cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }) },
    prospecto: { findUnique: jest.fn().mockResolvedValue(contract.prospecto), update: jest.fn().mockResolvedValue({}) },
    integracionInstalacionG3: integration,
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    ordenTrabajo: { create: jest.fn() },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const closure = { process: jest.fn().mockResolvedValue({ duplicate: false }) };
  const client = {
    configured: jest.fn().mockReturnValue(true),
    createInstallation: jest.fn().mockResolvedValue({
      status: 201, durationMs: 12,
      data: { id_ot: 901, codigo_ot: 'G3-901', estado: 'PENDIENTE', id_empresa: 1 },
    }),
    getWorkOrder: jest.fn(), getWorkOrderClosure: jest.fn(),
  };
  const service = new InstallationIntegrationService(prisma as never, audit as never, closure as never, client as never);
  return { service, prisma, audit, closure, client, contract, getStored: () => stored, setStored: (value: any) => { stored = value; } };
}

describe('Etapa 3 - solicitud y reconciliacion G3', () => {
  it('1. instalacion valida invoca POST G3 mediante el adapter', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation).toHaveBeenCalledTimes(1);
  });
  it('2. el payload contiene RUT canonico', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].persona.rut).toBe('12345678-5');
    expect(client.createInstallation.mock.calls[0][0]).not.toHaveProperty('rut');
  });
  it('3. el payload contiene nombre completo', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].persona.nombre_completo).toBe('Persona Demo');
  });
  it('4. el payload contiene telefono E.164', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].persona.telefono).toBe('+56912345678');
  });
  it('5. el payload contiene snapshot de direccion', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].direccion.direccion_completa).toBe('Calle Demo 123');
  });
  it('6. el payload contiene comuna', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].direccion.comuna).toBe('Valparaiso');
  });
  it('7. request_id es UUID', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('8. trace_id es UUID v4', async () => {
    const { service, client } = setup(); await service.requestInstallation({ idProspecto: 10 }, user);
    expect(client.createInstallation.mock.calls[0][0].trace_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('9. retry reutiliza request_id y payload persistido', async () => {
    const { service, client } = setup(); const first: any = await service.requestInstallation({ idProspecto: 10 }, user);
    const originalPayload = client.createInstallation.mock.calls[0][0];
    client.createInstallation.mockClear(); await service.retry(first.idIntegracion, user);
    expect(client.createInstallation.mock.calls[0][0]).toEqual(originalPayload);
    expect(client.createInstallation.mock.calls[0][0].request_id).toBe(first.requestId);
    expect(client.createInstallation.mock.calls[0][0].id_empresa).toBe(1);
  });
  it('10. HTTP 201 guarda referencia OT externa', async () => {
    const { service } = setup(); const result: any = await service.requestInstallation({ idProspecto: 10 }, user);
    expect(result).toMatchObject({ idOtG3: '901', codigoOtG3: 'G3-901', fuente: 'G3' });
  });
  it('11. solicitud repetida devuelve tracking sin duplicarlo', async () => {
    const context = setup(); const first: any = await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.prisma.integracionInstalacionG3.findFirst.mockResolvedValue(context.getStored());
    await context.service.requestInstallation({ idProspecto: 10 }, user);
    expect(context.prisma.integracionInstalacionG3.create).toHaveBeenCalledTimes(1); expect(first.requestId).toBe(context.getStored().requestId);
  });
  it('12. HTTP 409 se registra como conflicto definitivo', async () => {
    const { service, client } = setup(); client.createInstallation.mockRejectedValue(new G3IntegrationError('G3_REQUEST_ID_CONFLICTO', 409, false, 'Conflicto'));
    const result: any = await service.requestInstallation({ idProspecto: 10 }, user); expect(result.estadoIntegracion).toBe('FALLIDA_DEFINITIVA');
  });
  it('13. HTTP 403 se registra como scope invalido definitivo', async () => {
    const { service, client } = setup(); client.createInstallation.mockRejectedValue(new G3IntegrationError('G3_SCOPE_EMPRESA_INVALIDO', 403, false, 'Scope invalido'));
    const result: any = await service.requestInstallation({ idProspecto: 10 }, user); expect(result.ultimoErrorSanitizado).toBe('Scope invalido');
  });
  it('14. timeout no crea OrdenTrabajo local', async () => {
    const { service, client, prisma } = setup(); client.createInstallation.mockRejectedValue(new G3IntegrationError('G3_TIMEOUT', null, true, 'Timeout'));
    await service.requestInstallation({ idProspecto: 10 }, user); expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });
  it('15. timeout deja retry seguro disponible', async () => {
    const { service, client } = setup(); client.createInstallation.mockRejectedValueOnce(new G3IntegrationError('G3_TIMEOUT', null, true, 'Timeout'));
    const failed: any = await service.requestInstallation({ idProspecto: 10 }, user); client.createInstallation.mockResolvedValue({ status: 200, durationMs: 5, data: { id_ot: 901, estado: 'PENDIENTE', duplicado: true, id_empresa: 1 } });
    const retried: any = await service.retry(failed.idIntegracion, user); expect(retried.estadoIntegracion).toBe('ENVIADA');
  });
  it('16. G3 no configurado no crea OT local', async () => {
    const { service, client, prisma } = setup(); client.createInstallation.mockRejectedValue(new G3IntegrationError('INTEGRACION_G3_NO_CONFIGURADA', null, true, 'No configurada'));
    const result: any = await service.requestInstallation({ idProspecto: 10 }, user); expect(result.estadoIntegracion).toBe('FALLIDA_REINTENTABLE'); expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });
  it('17. referencias de empresa cruzada son rechazadas', async () => {
    const { service, contract } = setup(); contract.plan.idEmpresa = 2;
    await expect(service.requestInstallation({ idProspecto: 10 }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('GET defensivo presenta un estado no contractual como seguimiento sin activar', async () => {
    const context = setup();
    await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.client.getWorkOrder.mockResolvedValue({ status: 200, durationMs: 4, data: { id_ot: 901, id_empresa: 1, estado: 'LEGACY_INTERMEDIATE' } });
    await expect(context.service.detail(1, user)).resolves.toMatchObject({ estadoIntegracion: 'EN_SEGUIMIENTO', estadoOtG3: 'EN_SEGUIMIENTO' });
    expect(context.client.getWorkOrder).toHaveBeenCalledWith('901', 1);
  });
  it('GET detalle usa la empresa 2 persistida y no una constante', async () => {
    const context = setup();
    await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.setStored({ ...context.getStored(), idEmpresa: 2 });
    context.client.getWorkOrder.mockResolvedValue({ status: 200, durationMs: 4, data: { id_ot: 901, id_empresa: 2, estado: 'PENDIENTE' } });
    const userEmpresa2 = { ...user, idEmpresa: 2 };
    await context.service.detail(1, userEmpresa2);
    expect(context.client.getWorkOrder).toHaveBeenCalledWith('901', 2);
  });
  it('GET detalle no mezcla una respuesta de otra empresa', async () => {
    const context = setup();
    await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.client.getWorkOrder.mockResolvedValue({ status: 200, durationMs: 4, data: { id_ot: 901, id_empresa: 2, estado: 'COMPLETADA' } });
    const result = await context.service.detail(1, user);
    expect(context.client.getWorkOrder).toHaveBeenCalledWith('901', 1);
    expect(result).toMatchObject({ detalle: null, ultimoErrorSanitizado: 'G3 respondio con una empresa diferente.' });
    expect(context.getStored().estadoOtG3).toBe('PENDIENTE');
  });
  it('40. reconciliacion GET de cierre sin estado usa el processor común como COMPLETADA', async () => {
    const context = setup(); await context.service.requestInstallation({ idProspecto: 10 }, user);
    const tracking = context.getStored();
    const closure = {
      id_ot: 901, request_id: tracking.requestId, trace_id: tracking.traceId,
      id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7,
      equipos_instalados: [], equipos_retirados: [],
    };
    context.client.getWorkOrderClosure.mockResolvedValue({ status: 200, durationMs: 4, data: closure });
    await context.service.reconcile(1, user);
    expect(context.client.getWorkOrderClosure).toHaveBeenCalledWith('901', 1);
    expect(context.closure.process).toHaveBeenCalledWith(closure, 'RECONCILIACION', 1);
  });
  it('41. GET cierre aun no disponible no activa', async () => {
    const context = setup(); await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.client.getWorkOrderClosure.mockResolvedValue({ status: 200, durationMs: 4, data: {} });
    await expect(context.service.reconcile(1, user)).resolves.toMatchObject({ available: false }); expect(context.closure.process).not.toHaveBeenCalled();
  });
  it('42. GET cierre 404 queda disponible para reconciliacion posterior', async () => {
    const context = setup(); await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.client.getWorkOrderClosure.mockRejectedValue(new G3IntegrationError('G3_OT_NO_ENCONTRADA', 404, false, 'No encontrada'));
    await expect(context.service.reconcile(1, user)).resolves.toMatchObject({ available: false });
  });
  it('43. timeout de reconciliacion no ejecuta processor', async () => {
    const context = setup(); await context.service.requestInstallation({ idProspecto: 10 }, user);
    context.client.getWorkOrderClosure.mockRejectedValue(new G3IntegrationError('G3_TIMEOUT', null, true, 'Timeout'));
    await expect(context.service.reconcile(1, user)).rejects.toThrow('Timeout'); expect(context.closure.process).not.toHaveBeenCalled();
  });
  it('44. reconciliacion no procesa estados distintos de COMPLETADA si un backend legacy los expone', async () => {
    const context = setup(); await context.service.requestInstallation({ idProspecto: 10 }, user);
    const tracking = context.getStored();
    context.client.getWorkOrderClosure.mockResolvedValue({
      status: 200,
      durationMs: 4,
      data: {
        id_ot: 901, request_id: tracking.requestId, trace_id: tracking.traceId,
        id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7,
        equipos_instalados: [], equipos_retirados: [], estado: 'ASIGNADA',
      },
    });
    await expect(context.service.reconcile(1, user)).resolves.toMatchObject({ available: false });
    expect(context.closure.process).not.toHaveBeenCalled();
  });
});
