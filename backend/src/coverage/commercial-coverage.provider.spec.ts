import { PrismaService } from '../prisma/prisma.service';
import { CommercialCoverageProvider } from './commercial-coverage.provider';

const polygon = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

describe('CommercialCoverageProvider', () => {
  const general = {
    idZonaPago: 10, idEmpresa: 1, nombreZona: 'Cobertura Sur', tipoZona: 'COBERTURA_GENERAL', idZonaPadre: null,
    poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5), activo: true, fechaInicio: null, fechaFin: null, prioridad: 0,
  };
  const micro = {
    idZonaPago: 11, idEmpresa: 1, nombreZona: 'Promocion Norte', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10,
    poligonoGeojson: polygon(-70.64, -33.62, -70.58, -33.56), activo: true, fechaInicio: null, fechaFin: null, prioridad: 0,
  };

  function setup(zones: Array<Record<string, unknown>> = [general, micro], rules: Array<Record<string, unknown>> = []) {
    const prisma = {
      zonaPago: { findMany: jest.fn().mockResolvedValue(zones) },
      plan: { findMany: jest.fn().mockResolvedValue([{ idPlan: 5, idEmpresa: 1, nombreComercial: 'Plan 600', tipoPlan: 'Internet', velocidadMbps: 600, precioMensual: 20000, activo: true, preciosZona: rules }]) },
    };
    return { provider: new CommercialCoverageProvider(prisma as unknown as PrismaService), prisma };
  }

  it('resuelve cobertura, microzona y precio especial de microzona', async () => {
    const { provider } = setup(undefined, [{ idPlanZonaPrecio: 2, idZonaPago: 11, precioMensual: 15990, activo: true, fechaInicio: null, fechaFin: null }]);
    const result = await provider.resolvePlanAvailabilityForLocation(1, -33.59, -70.61);
    expect(result.coberturaComercial).toBe(true);
    expect(result.zona?.idZonaPago).toBe(10);
    expect(result.microzona?.idZonaPago).toBe(11);
    expect(result.planes[0]).toMatchObject({ precioBase: 20000, precioAplicable: 15990, origenPrecio: 'MICROZONA' });
  });

  it('hereda precio desde cobertura padre y luego desde el plan base', async () => {
    const parent = setup(undefined, [{ idPlanZonaPrecio: 1, idZonaPago: 10, precioMensual: 17990, activo: true, fechaInicio: null, fechaFin: null }]);
    expect((await parent.provider.resolvePlanAvailabilityForLocation(1, -33.59, -70.61)).planes[0])
      .toMatchObject({ precioAplicable: 17990, origenPrecio: 'ZONA_PADRE' });
    const base = setup();
    expect((await base.provider.resolvePlanAvailabilityForLocation(1, -33.59, -70.61)).planes[0])
      .toMatchObject({ precioAplicable: 20000, origenPrecio: 'PLAN_BASE' });
  });

  it('declara fuera de cobertura y no consulta planes', async () => {
    const { provider, prisma } = setup();
    const result = await provider.resolvePlanAvailabilityForLocation(1, -34, -71);
    expect(result).toMatchObject({ coberturaComercial: false, zona: null, microzona: null, planes: [] });
    expect(prisma.plan.findMany).not.toHaveBeenCalled();
  });

  it('ignora microzonas inactivas, futuras y expiradas', async () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    for (const changed of [
      { activo: false },
      { fechaInicio: new Date('2026-10-01T00:00:00.000Z') },
      { fechaFin: new Date('2026-09-01T00:00:00.000Z') },
    ]) {
      const { provider } = setup([general, { ...micro, ...changed }]);
      expect((await provider.resolveZoneForPoint(1, -33.59, -70.61, now)).microzona).toBeNull();
    }
  });

  it('aísla consultas por empresa y solo solicita planes activos de esa empresa', async () => {
    const { provider, prisma } = setup();
    await provider.resolvePlanAvailabilityForLocation(1, -33.59, -70.61);
    expect(prisma.zonaPago.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 1, activo: { not: false } } }));
    expect(prisma.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 1, activo: { not: false } } }));
  });
});
