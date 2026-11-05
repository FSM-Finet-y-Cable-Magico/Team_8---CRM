import { InstallationHistoryService } from './installation-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth.types';

const user: AuthUser = { idUsuario: 1, idEmpresa: 1, roles: ['Comercial'], nombreCompleto: 'QA', email: null };
function fixture(date: string | null = '2026-10-01T12:00:00Z', company = 1) {
  const contrato = { idContrato: company * 10, idEmpresa: company, idCliente: 30 };
  const servicio = { idServicio: company * 50, idEmpresa: company, idContrato: contrato.idContrato, idCliente: 30, contrato,
    datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: '901', fechaCompletadaG3: date, privateData: 'DO_NOT_EXPOSE' } };
  return { idIntegracion: company, idEmpresa: company, idOtG3: '901', idContrato: contrato.idContrato, idServicio: servicio.idServicio,
    idCliente: 30, contrato, servicio, requestId: `request-${company}`, traceId: `trace-${company}`, fechaCierreProcesado: new Date('2026-11-01T12:00:00Z') };
}
type Remote = ReturnType<typeof fixture>;
function setup(remote: Remote[], local: unknown[] = []) {
  const prisma = { ordenTrabajo: { findMany: jest.fn().mockResolvedValue(local) },
    integracionInstalacionG3: { findMany: jest.fn().mockResolvedValue(remote) },
    $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)) };
  return { prisma, service: new InstallationHistoryService(prisma as unknown as PrismaService) };
}
describe('historial persistido de instalaciones', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-03T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  it('expone cierre G3 sin OT local, fecha original y trazas sin payload ni PII', async () => {
    const { service } = setup([fixture()]);
    const result = await service.list(user);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ fuente: 'G3', estado: 'COMPLETADA', ordenesLocales: [],
      fechasTecnicasOriginales: ['2026-10-01T12:00:00Z'], solicitudesG3: [{ requestId: 'request-1', traceId: 'trace-1' }] });
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_EXPOSE|datosTecnicos|payloadSnapshot|rut|nombreCompleto/);
  });
  it('no usa fecha de procesamiento ni del espejo local para cierre sin fecha técnica', async () => {
    const remote = fixture(null);
    const { service } = setup([remote], [{ idOt: 901, idEmpresa: 1, idServicio: 50, idCliente: 30, servicio: remote.servicio, fechaCompletada: new Date() }]);
    const { items } = await service.list(user);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ estado: 'COMPLETADA', clasificacionFecha: 'PENDIENTE_FECHA_TECNICA', fechasTecnicasOriginales: [], ordenesLocales: [901] });
  });
  it('agrupa reintentos y espejo conservando todas las referencias de solicitud', async () => {
    const a = fixture();
    const { service } = setup([a, { ...a, idIntegracion: 3, requestId: 'request-3' }], [{ idOt: 901, idEmpresa: 1, idServicio: 50, idCliente: 30, servicio: a.servicio, fechaCompletada: new Date() }]);
    const { items } = await service.list(user);
    expect(items).toHaveLength(1); expect(items[0].solicitudesG3).toHaveLength(2); expect(items[0].ordenesLocales).toEqual([901]);
  });
  it('separa la misma OT y cliente compartido por empresa', async () => {
    const { service } = setup([fixture(), fixture(null, 2)]);
    const { items } = await service.list({ ...user, roles: ['Administrador'] });
    expect(items.map(r => r.key)).toEqual(['1:901', '2:901']);
  });
  it('redacta relaciones inconsistentes y no publica fechas como certificadas', async () => {
    const a = fixture(); a.servicio.idEmpresa = 2;
    const { service } = setup([a]);
    expect((await service.list(user)).items[0]).toMatchObject({ clasificacionFecha: 'REQUIERE_REVISION', idContrato: null, idServicio: null, idCliente: null, fechasTecnicasOriginales: [] });
  });
  it.each([null, 'sin-zona', '2026-02-30', '2035-01-01'])('fecha %s nunca sustituida por procesamiento', async date => {
    const { service } = setup([fixture(date)]);
    expect((await service.list(user)).items[0].fechasTecnicasOriginales).toEqual([]);
  });
  it('mantiene OT legacy completada sin solicitud G3', async () => {
    const { service } = setup([], [{ idOt: 5, estado: 'Completada', idEmpresa: 1, idServicio: null, idCliente: null, servicio: null, fechaCompletada: new Date('2026-10-02T12:00:00Z') }]);
    expect((await service.list(user)).items[0]).toMatchObject({ fuente: 'LEGACY_LOCAL', solicitudesG3: [], ordenesLocales: [5] });
  });
  it.each([[user, '2', 1], [{ ...user, idEmpresa: 2 }, '1', 2], [{ ...user, roles: ['Administrador'] }, '2', 2]] as Array<[AuthUser, string, number]>)(
    'filtra ambas consultas por empresa autorizada', async (actor, scope, company) => {
      const { service, prisma } = setup([]);
      await service.list(actor, scope);
      expect(prisma.ordenTrabajo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ idEmpresa: company }) }));
      expect(prisma.integracionInstalacionG3.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
        idEmpresa: company, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: { not: null },
      } }));
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' });
    });
  it('rechaza usuario sin empresa antes de consultar', async () => {
    const { service, prisma } = setup([]);
    await expect(service.list({ ...user, idEmpresa: null })).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('incluye espejo pendiente de cierre confirmado sin fabricar cierre para otras OT pendientes', async () => {
    const a = fixture();
    const { service } = setup([a], [901, 902].map(idOt => ({ idOt, estado: 'Pendiente', idEmpresa: 1, idServicio: 50, idCliente: 30, servicio: a.servicio, fechaCompletada: null })));
    const { items } = await service.list(user);
    expect(items).toHaveLength(1); expect(items[0].ordenesLocales).toEqual([901]);
  });
  it('tracking confirmado sin referencia OT queda visible para revisión sin fallar', async () => {
    const a = { ...fixture(), idOtG3: null };
    const { service } = setup([a as unknown as Remote]);
    expect((await service.list(user)).items[0]).toMatchObject({ key: 'tracking:1', idOt: null, clasificacionFecha: 'REQUIERE_REVISION' });
  });
});
