import { InstallationActivationService } from './installation-activation.service';

function setup(existing = false) {
  const tracking: any = {
    idIntegracion: 1, idEmpresa: 1, idProspecto: 10, idCliente: existing ? 30 : null, idContrato: 20, idPlan: 7,
    idServicio: existing ? 50 : null, requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', payloadSnapshot: {
      request_id: '11111111-1111-4111-8111-111111111111', trace_id: '22222222-2222-4222-8222-222222222222',
      id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7, rut: '12345678-5',
      persona: { nombre_completo: 'Persona Demo', telefono: '+56912345678' },
      direccion: { direccion_completa: 'Calle Demo 123', comuna: 'Valparaiso' },
    },
  };
  const customer = { idCliente: 30, idEmpresa: 1, rut: '12345678-5', estado: 'Activo' };
  const address = { idDireccion: 40, idCliente: 30, direccionCompleta: 'Calle Demo 123', comuna: 'Valparaiso' };
  const serviceRow = { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, idDireccion: 40, estadoOperativo: existing ? 'Pendiente' : 'Activo', fechaActivacion: null, datosTecnicos: null };
  const tx = {
    contrato: {
      findUnique: jest.fn().mockResolvedValue({
        idContrato: 20, idEmpresa: 1, idCliente: existing ? 30 : null, idProspecto: 10, idPlan: 7, idZonaPago: 2, ciudadInstalacion: 'Valparaiso',
        plan: { idPlan: 7, idEmpresa: 1, tipoPlan: 'Internet Fibra' },
        prospecto: { idProspecto: 10, idEmpresa: 1, idCliente: existing ? 30 : null, email: 'demo@example.invalid', origenContacto: 'Web', fechaCreacion: new Date('2026-09-01') },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    cliente: {
      findUnique: jest.fn().mockResolvedValue(existing ? customer : null),
      create: jest.fn().mockResolvedValue(customer), update: jest.fn().mockResolvedValue(customer),
    },
    direccionServicio: {
      findFirst: jest.fn().mockResolvedValue(existing ? address : null), create: jest.fn().mockResolvedValue(address),
    },
    servicioContratado: {
      findUnique: jest.fn().mockResolvedValue(existing ? serviceRow : null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ ...serviceRow, estadoOperativo: 'Activo', fechaActivacion: new Date() }),
      update: jest.fn().mockResolvedValue({ ...serviceRow, estadoOperativo: 'Activo', fechaActivacion: new Date() }),
    },
    prospecto: { update: jest.fn().mockResolvedValue({}) },
  };
  return { service: new InstallationActivationService(), tx, tracking };
}

describe('Etapa 3 - activacion comercial desde G3', () => {
  it('29. crea Cliente exactamente una vez', async () => {
    const { service, tx, tracking } = setup(); await service.activate(tx as never, tracking, { potencia: -19 });
    expect(tx.cliente.create).toHaveBeenCalledTimes(1);
  });
  it('30. crea ServicioContratado exactamente una vez y activo', async () => {
    const { service, tx, tracking } = setup(); await service.activate(tx as never, tracking, { potencia: -19 });
    expect(tx.servicioContratado.create).toHaveBeenCalledTimes(1); expect(tx.servicioContratado.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estadoOperativo: 'Activo', fechaActivacion: expect.any(Date) }) }));
  });
  it('31. crea DireccionServicio definitiva exactamente una vez', async () => {
    const { service, tx, tracking } = setup(); await service.activate(tx as never, tracking, { potencia: -19 });
    expect(tx.direccionServicio.create).toHaveBeenCalledTimes(1);
  });
  it('31b. resuelve entidades existentes sin duplicarlas', async () => {
    const { service, tx, tracking } = setup(true); await service.activate(tx as never, tracking, { potencia: -19 });
    expect(tx.cliente.create).not.toHaveBeenCalled(); expect(tx.direccionServicio.create).not.toHaveBeenCalled(); expect(tx.servicioContratado.create).not.toHaveBeenCalled(); expect(tx.servicioContratado.update).toHaveBeenCalledTimes(1);
  });
});
