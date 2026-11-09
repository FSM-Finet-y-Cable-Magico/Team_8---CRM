import { isCompletedWorkOrder, isInstallationType, persistedOrderTechnicalData, readDeclaredOrderEquipment } from './work-order-read';

describe('lectura compatible de OT sin transiciones ni asignaciones', () => {
  it.each(['Instalacion', 'INSTALACION', 'instalacion', 'Instalación', 'INSTALACIÓN'])('reconoce solo instalación: %s', type => {
    expect(isInstallationType(type)).toBe(true);
  });
  it.each(['REPARACION', 'Reparacion', 'MANTENIMIENTO', 'PRE_INSTALACION', '', null])('no convierte %s en instalación', type => {
    expect(isInstallationType(type)).toBe(false);
  });
  it.each(['COMPLETADA', 'Completada', 'completada'])('reconoce cierre %s', state => expect(isCompletedWorkOrder(state)).toBe(true));
  it.each(['EN_CURSO', 'PENDIENTE_APROBACION', 'CERRADA', 'CANCELADA', 'Resuelta', null])('no certifica %s como completada', state => expect(isCompletedWorkOrder(state)).toBe(false));
  it('consulta solo pares empresa/OT autorizados y proyecta series sin inventario ni PII', async () => {
    const query = jest.fn().mockResolvedValue([
      { idEmpresa: 1, idOt: 2, cierreEquipos: { instalados: [{ numero_serie: 'SERIE-QA', internalNote: 'DO_NOT_EXPOSE' }], retirados: [] } },
      { idEmpresa: 2, idOt: 2, cierreEquipos: { instalados: [{ numero_serie: 'AJENO' }] } },
    ]);
    const prisma = { $queryRaw: query };
    const result = await readDeclaredOrderEquipment(prisma as never, [{ idEmpresa: 1, idOt: 2 }]);
    expect([...result]).toEqual([['1:2', { instalados: ['SERIE-QA'], retirados: [] }]]);
    const [sql, pairs] = query.mock.calls[0];
    expect(sql.join('?')).toMatch(/^SELECT/);
    expect(sql.join('?')).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
    expect(pairs.values).toEqual([1, 2]);
    expect(prisma).not.toHaveProperty('unidadEquipo');
  });
  it('sin referencias de empresa verificables no consulta ni infiere por OT', async () => {
    const prisma = { $queryRaw: jest.fn() };
    expect((await readDeclaredOrderEquipment(prisma as never, [{ idEmpresa: null, idOt: 2 }])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('datos ausentes o inválidos no generan equipos ni fechas', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ idEmpresa: 1, idOt: 2, cierreEquipos: { instalados: [{ serie: 'NO_INVENTAR' }] } }]) };
    const result = await readDeclaredOrderEquipment(prisma as never, [{ idEmpresa: 1, idOt: 2 }]);
    expect(persistedOrderTechnicalData({ idEmpresa: 1, idOt: 2 }, result.get('1:2'))).toMatchObject({
      fechaCompletada: null, potenciaOpticaDbm: null, idTecnicoRegistrado: null,
      equiposDeclarados: { instalados: null, retirados: null }, asignacionInventarioConfirmada: false,
    });
  });
});
