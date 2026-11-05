import { ForbiddenException } from '@nestjs/common';
import { InstallationIntegrationService } from './installation-integration.service';

const user = { idUsuario: 5, idEmpresa: 1, email: 'test@example.invalid', nombreCompleto: 'Test', roles: ['Comercial'] };
const closureData = {
  id_ot: 901, id_empresa: 1, id_contrato: 20, id_prospecto: 10, id_plan: 7,
  request_id: 'request-1', trace_id: 'trace-1', fecha_completada: '2026-10-07T12:30:00.000Z',
  id_tecnico: 88, potencia_optica_dbm: -19.25, resultado_llamada: 'CONTACTADO',
  resuelto_remotamente: false, materiales: [{ descripcion: 'Cable' }], equipos_instalados: [],
};

function setup(company = 1) {
  const tracking = Object.freeze({
    idIntegracion: 101, idServicio: 50, idCliente: 30, idEmpresa: company, idContrato: 20,
    idProspecto: 10, idPlan: 7, idOtG3: '901', requestId: 'request-1', traceId: 'trace-1',
    estadoIntegracion: 'COMPLETADA', fechaCierreProcesado: new Date('2026-10-08T00:00:00Z'),
  });
  const prisma = {
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 50, idCliente: 30, idEmpresa: company, idContrato: 20 }), update: jest.fn() },
    integracionInstalacionG3: { findFirst: jest.fn().mockResolvedValue(tracking), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    integracionEventoEntrante: { create: jest.fn() }, $transaction: jest.fn(),
  };
  const client = { getWorkOrderClosure: jest.fn().mockResolvedValue({ data: { ...closureData, id_empresa: company } }), createInstallation: jest.fn() };
  const audit = { record: jest.fn() };
  const processor = { process: jest.fn() };
  const service = new InstallationIntegrationService(prisma as never, audit as never, processor as never, client as never);
  const read = () => service.historicalClosureForService(50, { ...user, idEmpresa: company });
  const assertNoWrites = () => {
    for (const fn of [prisma.$transaction, prisma.servicioContratado.update, prisma.integracionInstalacionG3.update,
      prisma.integracionInstalacionG3.create, prisma.integracionInstalacionG3.updateMany,
      prisma.integracionEventoEntrante.create, audit.record, processor.process, client.createInstallation]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(tracking.estadoIntegracion).toBe('COMPLETADA');
  };
  return { prisma, client, service, tracking, read, assertNoWrites };
}

describe('Lectura histórica G3 sin reconciliar ni persistir', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Real traffic prohibited')));

  it.each([1, 2])('consulta la empresa %s del tracking y proyecta exclusivamente campos permitidos', async (company) => {
    const ctx = setup(company);
    ctx.client.getWorkOrderClosure.mockResolvedValue({ data: {
      ...closureData, id_empresa: company, id_ot: '901', mac: 'inventada', tecnico: { nombre: 'No publicar' },
      payload: { api_key: 'No publicar' }, puerto_olt: 'No publicar',
    } } as never);
    const result = await ctx.read();
    expect(ctx.client.getWorkOrderClosure).toHaveBeenCalledWith('901', company);
    expect(ctx.prisma.integracionInstalacionG3.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { idServicio: 50, idEmpresa: company, idContrato: 20, estadoIntegracion: 'COMPLETADA' },
    }));
    expect(result).toMatchObject({ fuente: 'G3_CONSULTA_TEMPORAL', persistido: false, estadoConsulta: 'DISPONIBLE' });
    expect(result.datos).toEqual({
      fechaCompletada: closureData.fecha_completada, idTecnicoG3: 88, potenciaOpticaDbm: -19.25,
      resultadoLlamada: 'CONTACTADO', resueltoRemotamente: false, cantidadMateriales: 1, cantidadEquiposInformados: 0,
    });
    expect(JSON.stringify(result)).not.toContain('No publicar');
    expect(global.fetch).not.toHaveBeenCalled();
    ctx.assertNoWrites();
  });

  it.each(['id_ot', 'id_empresa', 'id_contrato', 'id_prospecto', 'id_plan', 'request_id', 'trace_id'])
  ('rechaza %s ausente o diferente antes de aceptar datos técnicos', async (key) => {
    const ctx = setup();
    for (const value of [undefined, null, 'incorrecto', 999]) {
      ctx.client.getWorkOrderClosure.mockResolvedValue({ data: { ...closureData, [key]: value } });
      expect(await ctx.read()).toMatchObject({ estadoConsulta: 'NO_VALIDADO', datos: null });
    }
    ctx.assertNoWrites();
  });

  it('rechaza empresa ajena antes de consultar tracking o G3', async () => {
    const ctx = setup(2);
    await expect(ctx.service.historicalClosureForService(50, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.prisma.integracionInstalacionG3.findFirst).not.toHaveBeenCalled();
    expect(ctx.client.getWorkOrderClosure).not.toHaveBeenCalled();
    ctx.assertNoWrites();
  });

  it.each([
    { idEmpresa: 2 }, { idContrato: 21 }, { idServicio: 51 }, { idCliente: 31 },
    { idPlan: null }, { idProspecto: null }, { idOtG3: null }, { requestId: '' }, { traceId: '' },
    { estadoIntegracion: 'EN_SEGUIMIENTO' }, { fechaCierreProcesado: null },
  ])('no consulta referencias locales inconsistentes o incompletas: %j', async (invalid) => {
    const ctx = setup();
    ctx.prisma.integracionInstalacionG3.findFirst.mockResolvedValue({ ...ctx.tracking, ...invalid });
    expect(await ctx.read()).toMatchObject({ estadoConsulta: 'NO_DISPONIBLE', datos: null });
    expect(ctx.client.getWorkOrderClosure).not.toHaveBeenCalled();
    ctx.assertNoWrites();
  });

  it.each([null, [], { success: false }, { ...closureData, estado: 'PENDIENTE' }])
  ('no acepta una respuesta incompleta o contradictoria: %j', async (data) => {
    const ctx = setup();
    ctx.client.getWorkOrderClosure.mockResolvedValue({ data } as never);
    expect(await ctx.read()).toMatchObject({ estadoConsulta: 'NO_VALIDADO', datos: null });
    ctx.assertNoWrites();
  });

  it('no inventa fecha a partir del procesamiento o creación y omite campos malformados', async () => {
    const ctx = setup();
    ctx.client.getWorkOrderClosure.mockResolvedValue({ data: {
      ...closureData, fecha_completada: '2026-02-30T00:00:00Z', fecha_creacion: '2026-10-01T00:00:00Z',
      id_tecnico: '88', potencia_optica_dbm: '0', resultado_llamada: { mensaje: 'No publicar' },
      resuelto_remotamente: 'false', materiales: {}, equipos_instalados: undefined,
    } } as never);
    expect((await ctx.read()).datos).toEqual({
      fechaCompletada: null, idTecnicoG3: null, potenciaOpticaDbm: null, resultadoLlamada: null,
      resueltoRemotamente: null, cantidadMateriales: null, cantidadEquiposInformados: null,
    });
    ctx.assertNoWrites();
  });

  it.each(['TimeoutError', 'NetworkError', 'G3_NO_AUTORIZADO', 'G3_OT_NO_ENCONTRADA'])
  ('un error %s no altera la instalación ni revela el error remoto', async (name) => {
    const ctx = setup();
    ctx.client.getWorkOrderClosure.mockRejectedValue(Object.assign(new Error('api_key=NoPublicar'), { name }));
    const result = await ctx.read();
    expect(result).toMatchObject({ estadoConsulta: 'NO_DISPONIBLE', datos: null });
    expect(JSON.stringify(result)).not.toContain('NoPublicar');
    ctx.assertNoWrites();
  });
});
