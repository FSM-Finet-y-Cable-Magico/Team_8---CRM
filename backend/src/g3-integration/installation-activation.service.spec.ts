import { InstallationActivationService } from './installation-activation.service';
import { sha256Payload } from './g3-integration.utils';

function setup(existing = false) {
  const tracking: any = {
    idIntegracion: 1, idEmpresa: 1, idProspecto: 10, idCliente: existing ? 30 : null, idContrato: 20, idPlan: 7,
    idServicio: existing ? 50 : null, requestId: '11111111-1111-4111-8111-111111111111', traceId: '22222222-2222-4222-8222-222222222222',
    idOtG3: '901', codigoOtG3: 'G3-901', payloadSnapshot: {
      request_id: '11111111-1111-4111-8111-111111111111', trace_id: '22222222-2222-4222-8222-222222222222',
      id_empresa: 1, id_prospecto: 10, id_contrato: 20, id_plan: 7,
      persona: { rut: '12345678-5', nombre_completo: 'Persona Demo', telefono: '+56912345678' },
      direccion: { direccion_completa: 'Calle Demo 123', comuna: 'Valparaiso' },
    },
  };
  tracking.payloadHash = sha256Payload(tracking.payloadSnapshot);
  const customer = { idCliente: 30, idEmpresa: 1, rut: '12345678-5', estado: 'Activo' };
  const address = { idDireccion: 40, idCliente: 30, direccionCompleta: 'Calle Demo 123', comuna: 'Valparaiso' };
  const serviceRow = { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, idDireccion: 40, estadoOperativo: existing ? 'Pendiente' : 'Activo', fechaActivacion: null, datosTecnicos: null };
  const tx = {
    contrato: {
      findUnique: jest.fn().mockResolvedValue({
        idContrato: 20, estado: 'Firmado', idEmpresa: 1, idCliente: existing ? 30 : null, idProspecto: 10, idPlan: 7, idZonaPago: 2, ciudadInstalacion: 'Valparaiso',
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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ ...serviceRow, estadoOperativo: 'Activo', fechaActivacion: new Date() }),
      update: jest.fn().mockResolvedValue({ ...serviceRow, estadoOperativo: 'Activo', fechaActivacion: new Date() }),
    },
    prospecto: { update: jest.fn().mockResolvedValue({}) },
  };
  return { service: new InstallationActivationService(), tx, tracking, customer, serviceRow };
}

describe('Etapa 3 - activacion comercial desde G3', () => {
  const assertNoWrites = (tx: ReturnType<typeof setup>['tx']) => {
    for (const delegate of [tx.cliente, tx.direccionServicio, tx.servicioContratado]) {
      expect(delegate.create).not.toHaveBeenCalled();
    }
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.prospecto.update).not.toHaveBeenCalled();
  };

  it.each([[1, 2], [2, 1]])('cliente principal %s activa su contrato explicito de empresa %s', async (principal, target) => {
    const { service, tx, tracking, customer, serviceRow } = setup(true);
    const contract = await tx.contrato.findUnique();
    customer.idEmpresa = principal;
    contract.idEmpresa = contract.plan.idEmpresa = contract.prospecto.idEmpresa = serviceRow.idEmpresa = target;
    tracking.idEmpresa = tracking.payloadSnapshot.id_empresa = target;
    tracking.payloadHash = sha256Payload(tracking.payloadSnapshot);
    await service.activate(tx as never, tracking, {});
    expect(customer.idEmpresa).toBe(principal);
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.cliente.create).not.toHaveBeenCalled();
    expect(tx.contrato.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ idContrato: 20, idEmpresa: target, idCliente: 30 }),
      data: { idCliente: 30, estado: 'Activo' },
    }));
    expect(tx.servicioContratado.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ idContrato: 20, idEmpresa: target, idCliente: 30, estadoOperativo: 'Pendiente' }),
    }));
  });

  it.each(['Activo', 'Moroso', 'Suspendido'])('conserva el estado global %s del cliente existente', async (estado) => {
    const { service, tx, tracking, customer } = setup(true);
    customer.estado = estado;
    await service.activate(tx as never, tracking, {});
    expect(customer.estado).toBe(estado);
    expect(tx.cliente.update).not.toHaveBeenCalled();
    expect(tx.contrato.update).toHaveBeenCalled();
  });

  it('un RUT existente sin contrato vinculado no autoriza asociar ni duplicar cliente', async () => {
    const { service, tx, tracking, customer } = setup();
    tx.cliente.findUnique.mockResolvedValue(customer);
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('vinculacion contractual explicita');
    assertNoWrites(tx);
  });

  it('una referencia explicita inexistente no recurre al RUT', async () => {
    const { service, tx, tracking } = setup(true);
    tx.cliente.findUnique.mockResolvedValue(null);
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('cliente vinculado');
    expect(tx.cliente.findUnique).toHaveBeenCalledTimes(1);
    assertNoWrites(tx);
  });

  it.each(['tracking', 'prospecto', 'servicio', 'rut'])('rechaza cliente contradictorio en %s sin escrituras', async (reference) => {
    const { service, tx, tracking, customer, serviceRow } = setup(true);
    const contract = await tx.contrato.findUnique();
    if (reference === 'tracking') tracking.idCliente = 99;
    if (reference === 'prospecto') contract.prospecto.idCliente = 99;
    if (reference === 'servicio') serviceRow.idCliente = 99;
    if (reference === 'rut') customer.rut = '11111111-1';
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow();
    assertNoWrites(tx);
  });

  it.each(['empresaContrato', 'empresaPlan', 'empresaProspecto', 'empresaServicio', 'plan', 'prospecto', 'contratoServicio'])
    ('rechaza referencia inconsistente %s antes de escribir', async (reference) => {
      const { service, tx, tracking, serviceRow } = setup(true);
      const contract = await tx.contrato.findUnique();
      if (reference === 'empresaContrato') contract.idEmpresa = 2;
      if (reference === 'empresaPlan') contract.plan.idEmpresa = 2;
      if (reference === 'empresaProspecto') contract.prospecto.idEmpresa = 2;
      if (reference === 'empresaServicio') serviceRow.idEmpresa = 2;
      if (reference === 'plan') contract.idPlan = 8;
      if (reference === 'prospecto') contract.idProspecto = 11;
      if (reference === 'contratoServicio') serviceRow.idContrato = 21;
      await expect(service.activate(tx as never, tracking, {})).rejects.toThrow();
      assertNoWrites(tx);
    });

  it.each(['Moroso', 'Suspendido', 'Baja', 'Anulado', 'Pendiente Firma', 'Borrador', 'Desconocido'])
    ('no activa contrato %s', async (estado) => {
      const { service, tx, tracking } = setup(true);
      (await tx.contrato.findUnique()).estado = estado;
      await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('estado del contrato');
      assertNoWrites(tx);
    });

  it.each(['Suspendido', 'Moroso', 'Baja', 'Activo', 'Desconocido'])('no reactiva servicio %s', async (estado) => {
    const { service, tx, tracking, serviceRow } = setup(true);
    serviceRow.estadoOperativo = estado;
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('estado del servicio');
    assertNoWrites(tx);
  });

  it.each(['Pendiente', 'Pendiente Instalacion', 'Instalacion Programada'])('activa servicio pendiente %s', async (estado) => {
    const { service, tx, tracking, serviceRow } = setup(true);
    serviceRow.estadoOperativo = estado;
    await expect(service.activate(tx as never, tracking, {})).resolves.toMatchObject({ idCliente: 30, idServicio: 50 });
  });

  it('no oculta un servicio Baja al buscar servicios del contrato', async () => {
    const { service, tx, tracking, serviceRow } = setup(true);
    tracking.idServicio = null;
    serviceRow.estadoOperativo = 'Baja';
    tx.servicioContratado.findMany.mockResolvedValue([serviceRow]);
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('estado del servicio');
    expect(tx.servicioContratado.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idContrato: 20 } }));
    assertNoWrites(tx);
  });

  it('no elige arbitrariamente entre servicios historicos del contrato', async () => {
    const { service, tx, tracking, serviceRow } = setup(true);
    tracking.idServicio = null;
    tx.servicioContratado.findMany.mockResolvedValue([serviceRow, { ...serviceRow, idServicio: 51 }]);
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('servicio objetivo unico');
    assertNoWrites(tx);
  });

  it('rechaza snapshot manipulado antes de consultar relaciones', async () => {
    const { service, tx, tracking } = setup();
    tracking.payloadSnapshot.persona.telefono = '+56999999999';
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('snapshot');
    expect(tx.contrato.findUnique).not.toHaveBeenCalled();
    assertNoWrites(tx);
  });

  it.each(['request_id', 'trace_id', 'id_empresa', 'id_prospecto', 'id_contrato', 'id_plan'])
    ('rechaza snapshot con hash valido pero correlacion %s distinta', async (field) => {
      const { service, tx, tracking } = setup();
      tracking.payloadSnapshot[field] = typeof tracking.payloadSnapshot[field] === 'number' ? 99 : 'otro';
      tracking.payloadHash = sha256Payload(tracking.payloadSnapshot);
      await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('snapshot');
      assertNoWrites(tx);
    });

  it('un conflicto concurrente al actualizar el contrato propaga el fallo a la transaccion', async () => {
    const { service, tx, tracking } = setup(true);
    tx.contrato.update.mockRejectedValueOnce(Object.assign(new Error('Guardia de actualizacion'), { code: 'P2025' }));
    await expect(service.activate(tx as never, tracking, {})).rejects.toThrow('Guardia de actualizacion');
    expect(tx.contrato.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { idContrato: 20, idEmpresa: 1, idPlan: 7, idProspecto: 10, idCliente: 30, estado: 'Firmado' },
    }));
    expect(tx.prospecto.update).not.toHaveBeenCalled();
  });

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
  it('conserva procedencia, fecha G3 y datos tecnicos opcionales sin confundir al tecnico con un usuario G8', async () => {
    const { service, tx, tracking } = setup(true);
    (tx.servicioContratado.findUnique as jest.Mock).mockResolvedValueOnce({
      idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20,
      estadoOperativo: 'Pendiente', fechaActivacion: null,
      datosTecnicos: { macAddress: 'AA:BB:CC:DD:EE:FF' },
    });
    await service.activate(tx as never, tracking, {
      equipos_instalados: [], equipos_retirados: [],
      fecha_completada: '2026-10-07T12:00:00.000Z', id_tecnico: 77,
      potencia_optica_dbm: -19.4, resultado_llamada: 'CONTACTADO',
      resuelto_remotamente: false, materiales: [{ nombre: 'Conector' }],
    });

    expect(tx.servicioContratado.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        datosTecnicos: expect.objectContaining({
          macAddress: 'AA:BB:CC:DD:EE:FF', fuenteInstalacion: 'G3', idOtG3: '901',
          fechaCompletadaG3: '2026-10-07T12:00:00.000Z', idTecnicoG3: 77,
          potenciaOpticaDbm: -19.4, resueltoRemotamenteG3: false,
        }),
      }),
    }));
  });
});
