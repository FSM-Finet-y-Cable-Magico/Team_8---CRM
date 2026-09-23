import { ProspectsService } from './prospects.service';

describe('Factibilidad TomoDAT en prospectos', () => {
  const user = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
  const location = { latitud: -33.58, longitud: -70.63 };
  const input = { rut: '21600781-6', nombreCompleto: 'Prueba', telefono: '+56912345678', direccion: 'Calle 10, La Pintana', ubicacion: location };

  function setup(estado = 'Factible', pipeline = 'Prospecto Nuevo') {
    const prospect = { idProspecto: 7, idEmpresa: 1, direccion: input.direccion, estadoPipeline: pipeline };
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
    const coverage = { check: jest.fn().mockResolvedValue({ estado, proveedor: 'TomoDAT', ubicacion: location, cajas: [], motivo: 'Prueba', consultadoEn: new Date().toISOString() }) };
    const audit = { record: jest.fn() };
    const service = new ProspectsService(prisma as never, audit as never, {} as never, coverage as never);
    return { service, prisma, coverage, audit };
  }

  it.each(['Factible', 'No Factible', 'Pendiente'])('reconsulta al crear y conserva el resultado %s', async state => {
    const { service, prisma, coverage, audit } = setup(state);
    const result = await service.create(input, user);
    expect(coverage.check).toHaveBeenCalledWith(1, location, user);
    expect(result.estadoPipeline).toBe(state === 'Pendiente' ? 'Prospecto Nuevo' : state);
    const data = prisma.prospecto.create.mock.calls[0][0].data;
    expect(Boolean(data.cotizaciones)).toBe(state === 'Factible');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ valorNuevo: expect.objectContaining({ cobertura: expect.objectContaining({ estado: state }) }) }));
  });

  it('sin ubicación registra el prospecto pendiente sin consultar', async () => {
    const { service, coverage } = setup();
    expect((await service.create({ ...input, ubicacion: undefined }, user)).estadoPipeline).toBe('Prospecto Nuevo');
    expect(coverage.check).not.toHaveBeenCalled();
  });

  it('un error del proveedor conserva el estado y no crea una verificación', async () => {
    const { service, prisma } = setup('Pendiente', 'Factible');
    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('Factible');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la revisión negativa invalida las verificaciones anteriores dentro de una transacción', async () => {
    const { service, prisma } = setup('No Factible', 'Factible');
    expect((await service.verifyTomodat(7, location, user)).estadoPipeline).toBe('No Factible');
    expect(prisma.cotizacion.updateMany).toHaveBeenCalledWith({ where: { idProspecto: 7 }, data: { factibilidadVerificada: false } });
    expect(prisma.prospecto.update.mock.calls[0][0].data.cotizaciones).toBeUndefined();
  });

  it.each(['Cotizacion Enviada', 'Pendiente firma', 'Servicio Activo', 'Perdido'])('no retrocede procesos avanzados o cerrados (%s)', async status => {
    const { service, prisma, coverage } = setup('No Factible', status);
    await expect(service.verifyTomodat(7, location, user)).rejects.toThrow('antes de cotizar');
    expect(coverage.check).not.toHaveBeenCalled();
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
  });
});
