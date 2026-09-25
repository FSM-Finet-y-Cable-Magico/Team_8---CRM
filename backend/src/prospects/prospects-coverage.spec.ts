import { ProspectsService } from './prospects.service';

describe('Factibilidad geografica en prospectos', () => {
  const user = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
  const location = { latitud: -33.58, longitud: -70.63 };
  const input = { rut: '21600781-6', nombreCompleto: 'Prueba', telefono: '+56912345678', direccion: 'Calle 10, La Pintana', ubicacion: location };

  function setup(estado = 'FACTIBLE', pipeline = 'Prospecto Nuevo') {
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
    const coverage = { check: jest.fn().mockResolvedValue({
      estado, coberturaComercial: estado !== 'NO_FACTIBLE', zona: estado === 'NO_FACTIBLE' ? null : { idZonaPago: 10 }, microzona: null,
      planes: [], tecnica: { estado: 'PENDIENTE', proveedor: 'G3', traceId: 'trace' }, ubicacion: location, cajas: [], motivo: 'Prueba', consultadoEn: new Date().toISOString(),
    }) };
    const audit = { record: jest.fn() };
    const service = new ProspectsService(prisma as never, audit as never, {} as never, coverage as never);
    return { service, prisma, coverage, audit };
  }

  it.each(['FACTIBLE', 'NO_FACTIBLE', 'PENDIENTE_VALIDACION_TECNICA'])('reconsulta al crear, persiste coordenadas y conserva el resultado %s', async state => {
    const { service, prisma, coverage, audit } = setup(state);
    const result = await service.create(input, user);
    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
    expect(result.estadoPipeline).toBe(state === 'PENDIENTE_VALIDACION_TECNICA' ? 'Prospecto Nuevo' : state === 'FACTIBLE' ? 'Factible' : 'No Factible');
    const data = prisma.prospecto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ latitud: location.latitud, longitud: location.longitud, idZonaPago: state === 'NO_FACTIBLE' ? null : 10 });
    expect(Boolean(data.cotizaciones)).toBe(state === 'FACTIBLE');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ valorNuevo: expect.objectContaining({ cobertura: expect.objectContaining({ estado: state }) }) }));
  });

  it('sin ubicación registra el prospecto pendiente sin consultar', async () => {
    const { service, coverage } = setup();
    expect((await service.create({ ...input, ubicacion: undefined }, user)).estadoPipeline).toBe('Prospecto Nuevo');
    expect(coverage.check).not.toHaveBeenCalled();
  });

  it('un error del proveedor conserva el estado y no crea una verificación', async () => {
    const { service, prisma } = setup('PENDIENTE_VALIDACION_TECNICA', 'Factible');
    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('Factible');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la revisión negativa invalida las verificaciones anteriores dentro de una transacción', async () => {
    const { service, prisma } = setup('NO_FACTIBLE', 'Factible');
    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('No Factible');
    expect(prisma.cotizacion.updateMany).toHaveBeenCalledWith({ where: { idProspecto: 7 }, data: { factibilidadVerificada: false } });
    const feasibilityUpdate = prisma.prospecto.update.mock.calls.find(call => call[0].data.estadoPipeline === 'No Factible');
    expect(feasibilityUpdate?.[0].data.cotizaciones).toBeUndefined();
  });

  it.each(['Cotizacion Enviada', 'Pendiente firma', 'Servicio Activo', 'Perdido'])('no retrocede procesos avanzados o cerrados (%s)', async status => {
    const { service, prisma, coverage } = setup('NO_FACTIBLE', status);
    await expect(service.verifyTomodat(7, location, user)).rejects.toThrow('antes de cotizar');
    expect(coverage.check).not.toHaveBeenCalled();
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
  });
});
