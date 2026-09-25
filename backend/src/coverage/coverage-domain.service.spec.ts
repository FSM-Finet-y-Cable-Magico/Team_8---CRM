import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialCoverageProvider } from './commercial-coverage.provider';
import { CoverageDomainService } from './coverage-domain.service';
import { G3CoverageProvider } from './g3-coverage.provider';
import { GeocodingService } from './geocoding.service';
import { LegacyTomodatCoverageProvider } from './legacy-tomodat-coverage.provider';

const polygon = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon' as const, coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

describe('CoverageDomainService', () => {
  const admin = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Admin', roles: ['Administrador'] };
  const commercial = { ...admin, roles: ['Comercial'] };
  const support = { ...admin, roles: ['Soporte'] };
  const parent = {
    idZonaPago: 10, idEmpresa: 1, nombreZona: 'Cobertura Sur', descripcion: null, tipoZona: 'COBERTURA_GENERAL', idZonaPadre: null,
    poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5), activo: true, fechaInicio: null, fechaFin: null,
    centroLat: -33.6, centroLng: -70.6, prioridad: 0, fuenteCobertura: 'MANUAL', diaVencimientoSugerido: null,
  };

  function setup(config: Record<string, string> = {}) {
    const prisma = {
      zonaPago: {
        findUnique: jest.fn().mockResolvedValue(parent),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idZonaPago: 20, ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...parent, ...data })),
      },
    };
    const audit = { record: jest.fn() };
    const commercialProvider = { resolvePlanAvailabilityForLocation: jest.fn() };
    const g3 = { configured: jest.fn().mockReturnValue(false), check: jest.fn() };
    const legacy = { configuredFor: jest.fn().mockReturnValue(false), check: jest.fn() };
    const geocoding = { geocode: jest.fn().mockResolvedValue([]) };
    const service = new CoverageDomainService(
      prisma as unknown as PrismaService,
      new ConfigService(config),
      audit as unknown as AuditService,
      commercialProvider as unknown as CommercialCoverageProvider,
      g3 as unknown as G3CoverageProvider,
      legacy as unknown as LegacyTomodatCoverageProvider,
      geocoding as unknown as GeocodingService,
    );
    return { service, prisma, audit, commercialProvider, g3, legacy };
  }

  it('crea una cobertura general valida y registra auditoria', async () => {
    const { service, prisma, audit } = setup();
    const result = await service.createZone({ idEmpresa: 1, nombre: 'General', tipoZona: 'COBERTURA_GENERAL', poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5) }, commercial);
    expect(result).toMatchObject({ idZonaPago: 20, tipoZona: 'COBERTURA_GENERAL', fuenteCobertura: 'MANUAL' });
    expect(prisma.zonaPago.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_ZONA_GEOGRAFICA' }));
  });

  it('rechaza poligono invalido, vigencia invertida y usuario sin permiso', async () => {
    const { service } = setup();
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Mal', tipoZona: 'COBERTURA_GENERAL', poligonoGeojson: { type: 'Polygon', coordinates: [] } }, commercial)).rejects.toThrow('Polygon');
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Mal', tipoZona: 'COBERTURA_GENERAL', poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5), fechaInicio: '2026-10-01', fechaFin: '2026-09-01' }, commercial)).rejects.toThrow('fecha de inicio');
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Mal', tipoZona: 'COBERTURA_GENERAL', poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5) }, support)).rejects.toThrow('permiso');
  });

  it('valida padre, empresa, contencion y solapamiento de microzonas', async () => {
    const { service, prisma } = setup();
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Fuera', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, poligonoGeojson: polygon(-70.8, -33.6, -70.75, -33.55) }, admin)).rejects.toThrow('dentro');
    prisma.zonaPago.findUnique.mockResolvedValueOnce({ ...parent, idEmpresa: 2 });
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Cruzada', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, poligonoGeojson: polygon(-70.65, -33.65, -70.6, -33.6) }, admin)).rejects.toThrow('misma empresa');
    prisma.zonaPago.findUnique.mockResolvedValue(parent);
    prisma.zonaPago.findMany.mockResolvedValueOnce([{ ...parent, idZonaPago: 11, tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, nombreZona: 'Promocion Norte', poligonoGeojson: polygon(-70.66, -33.66, -70.6, -33.6) }]);
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Solapada', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, poligonoGeojson: polygon(-70.64, -33.64, -70.58, -33.58) }, admin)).rejects.toThrow('Promocion Norte');
  });

  it('permite microzonas separadas y bloquea acceso cruzado', async () => {
    const { service, prisma } = setup();
    prisma.zonaPago.findMany.mockResolvedValueOnce([{ ...parent, idZonaPago: 11, tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, poligonoGeojson: polygon(-70.66, -33.66, -70.63, -33.63) }]);
    await expect(service.createZone({ idEmpresa: 1, nombre: 'Separada', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: 10, poligonoGeojson: polygon(-70.58, -33.58, -70.55, -33.55) }, admin)).resolves.toMatchObject({ idZonaPago: 20 });
    await expect(service.listZones(2, commercial)).rejects.toThrow('acceso');
  });

  it('fuera de cobertura es NO_FACTIBLE y no consulta proveedor tecnico', async () => {
    const { service, commercialProvider, g3, legacy } = setup();
    commercialProvider.resolvePlanAvailabilityForLocation.mockResolvedValue({ coberturaComercial: false, zona: null, microzona: null, planes: [] });
    const result = await service.check(1, { latitud: -34, longitud: -71 }, commercial);
    expect(result.estado).toBe('NO_FACTIBLE');
    expect(g3.check).not.toHaveBeenCalled();
    expect(legacy.check).not.toHaveBeenCalled();
  });

  it('dentro sin G3 queda pendiente y solo usa legacy mediante configuracion explicita', async () => {
    const base = { coberturaComercial: true, zona: { idZonaPago: 10 }, microzona: null, planes: [] };
    const normal = setup();
    normal.commercialProvider.resolvePlanAvailabilityForLocation.mockResolvedValue(base);
    normal.g3.check.mockResolvedValue({ estado: 'PENDIENTE', proveedor: 'G3', motivo: 'pendiente', traceId: 'trace' });
    expect((await normal.service.check(1, { latitud: -33.6, longitud: -70.6 }, commercial)).estado).toBe('PENDIENTE_VALIDACION_TECNICA');
    expect(normal.legacy.check).not.toHaveBeenCalled();

    const configured = setup({ COVERAGE_TECHNICAL_PROVIDER: 'LEGACY_TOMODAT' });
    configured.commercialProvider.resolvePlanAvailabilityForLocation.mockResolvedValue(base);
    configured.legacy.check.mockResolvedValue({ estado: 'FACTIBLE', proveedor: 'LEGACY_TOMODAT', motivo: 'ok', traceId: 'trace', cajas: [] });
    expect((await configured.service.check(1, { latitud: -33.6, longitud: -70.6 }, commercial)).estado).toBe('FACTIBLE');
    expect(configured.g3.check).not.toHaveBeenCalled();
  });
});
