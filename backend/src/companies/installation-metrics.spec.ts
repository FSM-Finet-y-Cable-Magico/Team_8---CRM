import { G3Installation, installationMetrics, LocalInstallation } from './installation-metrics';

const contract = { idContrato: 10, idEmpresa: 1, idCliente: 30 };
const service = { idServicio: 50, idEmpresa: 1, idContrato: 10, idCliente: 30, contrato: contract, datosTecnicos: null };
const g3 = (date?: string): G3Installation => ({ idEmpresa: 1, idOtG3: '901', idContrato: 10,
  idServicio: 50, idCliente: 30, contrato: contract, servicio: { ...service,
    datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: '901', ...(date ? { fechaCompletadaG3: date } : {}) } } });
const local = (): LocalInstallation => ({ tipoOt: 'Instalacion', estado: 'Completada', idOt: 901, idEmpresa: 1, idServicio: 50, idCliente: 30,
  servicio: service, fechaCompletada: new Date('2026-11-02T14:00:00Z') });
const metrics = (locals: LocalInstallation[], remote: G3Installation[]) => installationMetrics(locals, remote, '2026-11', '2026-11-03');

describe('CU47 fecha técnica, identidad y atribución empresarial', () => {
  it('cuenta INSTALACION/COMPLETADA sin servicio una vez y excluye reparaciones y estados no completados', () => {
    const row = { ...local(), idOt: 2, tipoOt: 'INSTALACION', estado: 'COMPLETADA', idServicio: null, idCliente: null, servicio: null };
    expect(metrics([row, row, { ...row, idOt: 1, tipoOt: 'REPARACION' },
      { ...row, idOt: 3, estado: 'EN_CURSO' }, { ...row, idOt: 4, estado: 'CANCELADA' }, { ...row, idOt: 5, estado: 'Cerrada' }], []))
      .toEqual({ instalacionesMensuales: 1, instalacionesSinFechaTecnica: 0, instalacionesRequierenRevision: 0 });
  });
  it('cuenta cierre G3 sin OT local; reintentos de la misma OT no suman', () => {
    const row = g3('2026-11-02T14:00:00Z');
    expect(metrics([], [row, row]).instalacionesMensuales).toBe(1);
  });
  it('deduplica OT local y G3 por empresa/OT con relaciones coherentes', () => {
    expect(metrics([local()], [g3('2026-11-02T14:00:00Z')]).instalacionesMensuales).toBe(1);
  });
  it('fecha técnica anterior prevalece frente a procesamiento/local del mes actual', () => {
    expect(metrics([local()], [g3('2026-10-30T14:00:00Z')]).instalacionesMensuales).toBe(0);
  });
  it('G3 sin fecha sigue completada pero pendiente de fecha, incluso con fecha local', () => {
    const row = g3(); const before = JSON.stringify(row);
    expect(metrics([local()], [row])).toEqual({ instalacionesMensuales: 0, instalacionesSinFechaTecnica: 1, instalacionesRequierenRevision: 0 });
    expect(JSON.stringify(row)).toBe(before);
  });
  it('la fecha obtenida luego clasifica su mes original sin usar el mes actual', () => {
    const row = g3('2026-10-30T14:00:00Z');
    expect(metrics([], [row]).instalacionesMensuales).toBe(0);
    expect(installationMetrics([], [row], '2026-10', '2026-11-03').instalacionesMensuales).toBe(1);
  });
  it.each(['2026-02-30T12:00:00Z', '2026-11-02T12:00:00', 'invalid'])('no inventa fecha válida para %s', date => {
    expect(metrics([], [g3(date)]).instalacionesSinFechaTecnica).toBe(1);
  });
  it('usa calendario Santiago y no UTC en el límite mensual', () => {
    expect(metrics([], [g3('2026-11-01T01:00:00Z')]).instalacionesMensuales).toBe(0);
    expect(metrics([], [g3('2026-11-01T03:00:00Z')]).instalacionesMensuales).toBe(1);
    expect(metrics([], [g3('2026-11-01')]).instalacionesMensuales).toBe(1);
  });
  it('no cuenta fechas futuras', () => {
    expect(metrics([], [g3('2026-12-01T12:00:00Z')]).instalacionesRequierenRevision).toBe(1);
  });
  it('no colapsa empresas con el mismo id OT ni reasigna identidad compartida', () => {
    const other = g3('2026-11-02T12:00:00Z');
    other.idEmpresa = 2; other.idContrato = 11; other.idServicio = 51;
    other.contrato = { ...contract, idEmpresa: 2, idContrato: 11 };
    other.servicio = { ...other.servicio!, idEmpresa: 2, idContrato: 11, idServicio: 51, contrato: other.contrato };
    expect(metrics([], [g3('2026-11-02T12:00:00Z'), other]).instalacionesMensuales).toBe(2);
  });
  it('dos OT distintas del mismo servicio no se fusionan por cliente o contrato', () => {
    expect(metrics([{ ...local(), idOt: 902 }], [g3('2026-11-02T12:00:00Z')]).instalacionesMensuales).toBe(2);
  });
  it.each(['company', 'contract', 'customer', 'order'])('excluye relaciones inconsistentes: %s', field => {
    const row = g3('2026-11-02T12:00:00Z');
    if (field === 'company') row.servicio!.idEmpresa = 2;
    if (field === 'contract') row.servicio!.idContrato = 11;
    if (field === 'customer') row.servicio!.idCliente = 31;
    if (field === 'order') row.idOtG3 = '902';
    expect(metrics([], [row]).instalacionesRequierenRevision).toBe(1);
    expect(metrics([], [row]).instalacionesMensuales).toBe(0);
  });
  it('misma OT con servicio diferente exige revisión, no suma ni oculta el conflicto', () => {
    const row = local(); row.idServicio = 51; row.servicio = { ...service, idServicio: 51 };
    expect(metrics([row], [g3('2026-11-02T12:00:00Z')]).instalacionesRequierenRevision).toBe(1);
  });
  it('mantiene legado independiente con fecha y marca legado sin fecha por separado', () => {
    expect(metrics([local(), { ...local(), idOt: 902, fechaCompletada: null }], [])).toEqual({
      instalacionesMensuales: 1, instalacionesSinFechaTecnica: 1, instalacionesRequierenRevision: 0 });
  });
  it('fechas técnicas contradictorias no se eligen arbitrariamente', () => {
    const row = g3('2026-11-02T12:00:00Z');
    row.servicio!.datosTecnicos = { ...(row.servicio!.datosTecnicos as object), resultadoInstalacion: { fecha_completada: '2026-10-20T12:00:00Z' } };
    expect(metrics([], [row]).instalacionesRequierenRevision).toBe(1);
  });
});
