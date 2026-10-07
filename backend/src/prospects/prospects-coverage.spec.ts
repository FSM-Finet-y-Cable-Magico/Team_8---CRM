import { ProspectsService } from './prospects.service';

describe('Factibilidad geografica en prospectos', () => {
  const user = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
  const location = { latitud: -33.58, longitud: -70.63 };
  const input = { rut: '21600781-6', nombreCompleto: 'Prueba', telefono: '+56912345678', direccion: 'Calle 10, La Pintana', ubicacion: location };

  function setup(coberturaComercial = true, pipeline = 'Prospecto Nuevo', withMicrozone = false) {
    const prospect = { idProspecto: 7, idEmpresa: 1, direccion: input.direccion, estadoPipeline: pipeline, latitud: null, longitud: null, idZonaPago: null };
    const prisma = {
      prospecto: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(prospect),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
      },
      cliente: { findUnique: jest.fn().mockResolvedValue(null) },
      cotizacion: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(callback => callback(prisma));
    const coverage = { resolveAddress: jest.fn().mockResolvedValue(location), check: jest.fn().mockResolvedValue({
      estado: coberturaComercial ? 'FACTIBLE' : 'NO_FACTIBLE',
      coberturaComercial,
      zona: coberturaComercial ? { idZonaPago: 10 } : null,
      microzona: coberturaComercial && withMicrozone ? { idZonaPago: 11 } : null,
      planes: [],
      tecnica: { estado: 'PENDIENTE', proveedor: 'NINGUNO', traceId: 'trace' },
      ubicacion: location,
      cajas: [],
      motivo: coberturaComercial ? 'Cobertura disponible' : 'Fuera de cobertura',
      consultadoEn: new Date().toISOString(),
    }) };
    const audit = { record: jest.fn() };
    const service = new ProspectsService(prisma as never, audit as never, {} as never, coverage as never);
    return { service, prisma, coverage, audit };
  }

  it('crea como Factible dentro de cobertura general y genera evidencia interna', async () => {
    const { service, prisma, coverage, audit } = setup();
    const result = await service.create(input, user);

    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
    expect(result.estadoPipeline).toBe('Factible');
    const data = prisma.prospecto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ latitud: location.latitud, longitud: location.longitud, idZonaPago: 10 });
    expect(data.cotizaciones).toEqual({ create: { factibilidadVerificada: true } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      valorNuevo: expect.objectContaining({ cobertura: expect.objectContaining({ estado: 'FACTIBLE' }) }),
    }));
  });

  it('prefiere la microzona como idZonaPago cuando el punto pertenece a ella', async () => {
    const { service, prisma } = setup(true, 'Prospecto Nuevo', true);

    expect((await service.create(input, user)).estadoPipeline).toBe('Factible');
    expect(prisma.prospecto.create.mock.calls[0][0].data.idZonaPago).toBe(11);
  });

  it('crea como No Factible fuera de cobertura general sin evidencia positiva', async () => {
    const { service, prisma } = setup(false);

    expect((await service.create(input, user)).estadoPipeline).toBe('No Factible');
    const data = prisma.prospecto.create.mock.calls[0][0].data;
    expect(data.idZonaPago).toBeNull();
    expect(data.cotizaciones).toBeUndefined();
  });

  it('sin ubicacion registra el prospecto como Prospecto Nuevo sin consultar cobertura', async () => {
    const { service, coverage } = setup();

    expect((await service.create({ ...input, ubicacion: undefined }, user)).estadoPipeline).toBe('Prospecto Nuevo');
    expect(coverage.check).not.toHaveBeenCalled();
  });

  it('el registro con validación automática guarda el punto verificado, no coordenadas arbitrarias del cliente', async () => {
    const { service, prisma, coverage } = setup();
    const dto = { ...input, validarDireccion: true, comuna: 'La Pintana', ubicacion: { latitud: 0, longitud: 0 } };
    const result = await service.create(dto, user);
    expect(coverage.resolveAddress).toHaveBeenCalledWith(dto);
    expect(result.estadoPipeline).toBe('Factible');
    expect(prisma.prospecto.create.mock.calls[0][0].data).toMatchObject(location);
  });

  it('una dirección inválida no crea un registro incompleto ni consulta cobertura', async () => {
    const { service, prisma, coverage } = setup();
    coverage.resolveAddress.mockRejectedValue(new Error('Ingresa una dirección válida'));
    await expect(service.create({ ...input, validarDireccion: true }, user)).rejects.toThrow('dirección válida');
    expect(prisma.prospecto.create).not.toHaveBeenCalled();
    expect(coverage.check).not.toHaveBeenCalled();
  });

  it('el endpoint legacy usa cobertura comercial y registra Factible sin TomoDAT', async () => {
    const { service, prisma, coverage, audit } = setup();

    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('Factible');
    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'VERIFICAR_FACTIBILIDAD',
      valorNuevo: expect.objectContaining({ origen: 'COBERTURA_COMERCIAL' }),
    }));
  });

  it('el endpoint manual no puede marcar No Factible un punto dentro de cobertura', async () => {
    const { service, prisma, coverage } = setup();
    prisma.prospecto.findUnique.mockResolvedValue({
      idProspecto: 7,
      idEmpresa: 1,
      direccion: input.direccion,
      estadoPipeline: 'Prospecto Nuevo',
      latitud: location.latitud,
      longitud: location.longitud,
      idZonaPago: 10,
    });

    const result = await service.verifyFeasibility(7, { resultado: 'No Factible' }, user);

    expect(result.estadoPipeline).toBe('Factible');
    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
  });

  it('el endpoint manual no puede marcar Factible un punto fuera de cobertura', async () => {
    const { service, prisma, coverage } = setup(false);
    prisma.prospecto.findUnique.mockResolvedValue({
      idProspecto: 7,
      idEmpresa: 1,
      direccion: input.direccion,
      estadoPipeline: 'Prospecto Nuevo',
      latitud: location.latitud,
      longitud: location.longitud,
      idZonaPago: null,
    });

    const result = await service.verifyFeasibility(7, { resultado: 'Factible' }, user);

    expect(result.estadoPipeline).toBe('No Factible');
    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
  });

  it('la revision fuera de cobertura invalida evidencias anteriores dentro de una transaccion', async () => {
    const { service, prisma } = setup(false, 'Factible');

    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('No Factible');
    expect(prisma.cotizacion.updateMany).toHaveBeenCalledWith({ where: { idProspecto: 7 }, data: { factibilidadVerificada: false } });
    const feasibilityUpdate = prisma.prospecto.update.mock.calls.find(call => call[0].data.estadoPipeline === 'No Factible');
    expect(feasibilityUpdate?.[0].data.cotizaciones).toBeUndefined();
  });

  it.each(['Cotizacion Enviada', 'Pendiente firma', 'Servicio Activo', 'Perdido'])('no retrocede procesos avanzados o cerrados (%s)', async status => {
    const { service, prisma, coverage } = setup(false, status);
    await expect(service.verifyTomodat(7, location, user)).rejects.toThrow('antes de cotizar');
    expect(coverage.check).not.toHaveBeenCalled();
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
  });
});
