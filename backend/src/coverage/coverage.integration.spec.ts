import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialCoverageProvider } from './commercial-coverage.provider';
import { CoverageDomainService } from './coverage-domain.service';
import { G3CoverageProvider } from './g3-coverage.provider';
import { LegacyTomodatCoverageProvider } from './legacy-tomodat-coverage.provider';

const integration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;
const rollback = new Error('ROLLBACK_COVERAGE_INTEGRATION');
const polygon = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

integration('Prospecto -> ubicacion -> cobertura -> zona -> planes en PostgreSQL', () => {
  const prisma = new PrismaService();
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('persiste y recupera coordenadas, resuelve microzona/plan y mantiene politica tecnica', async () => {
    expect.assertions(9);
    try {
      await prisma.$transaction(async tx => {
        const company = await tx.empresa.create({ data: { nombre: 'Empresa temporal geografia' } });
        const general = await tx.zonaPago.create({ data: {
          idEmpresa: company.idEmpresa, nombreZona: 'Cobertura temporal', tipoZona: 'COBERTURA_GENERAL',
          poligonoGeojson: polygon(-70.7, -33.7, -70.5, -33.5) as Prisma.InputJsonValue,
        } });
        const micro = await tx.zonaPago.create({ data: {
          idEmpresa: company.idEmpresa, nombreZona: 'Microzona temporal', tipoZona: 'MICROZONA_COMERCIAL', idZonaPadre: general.idZonaPago,
          poligonoGeojson: polygon(-70.64, -33.62, -70.58, -33.56) as Prisma.InputJsonValue,
        } });
        const plan = await tx.plan.create({ data: {
          idEmpresa: company.idEmpresa, nombreComercial: 'Plan temporal 600', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 20000,
        } });
        await tx.planZonaPrecio.create({ data: { idPlan: plan.idPlan, idZonaPago: micro.idZonaPago, precioMensual: 15990 } });
        const prospect = await tx.prospecto.create({ data: {
          idEmpresa: company.idEmpresa, nombreCompleto: 'Prospecto temporal', direccion: 'Direccion de prueba',
          latitud: -33.59, longitud: -70.61, idZonaPago: micro.idZonaPago,
        } });
        const recovered = await tx.prospecto.findUnique({ where: { idProspecto: prospect.idProspecto } });
        expect(recovered).toMatchObject({ latitud: -33.59, longitud: -70.61, idZonaPago: micro.idZonaPago });

        const commercial = new CommercialCoverageProvider(tx as unknown as PrismaService);
        const resolution = await commercial.resolvePlanAvailabilityForLocation(company.idEmpresa, -33.59, -70.61);
        expect(resolution.zona?.idZonaPago).toBe(general.idZonaPago);
        expect(resolution.microzona?.idZonaPago).toBe(micro.idZonaPago);
        expect(resolution.planes[0]).toMatchObject({ idPlan: plan.idPlan, precioAplicable: 15990, origenPrecio: 'MICROZONA' });
        expect((await commercial.resolvePlanAvailabilityForLocation(company.idEmpresa, -34, -71)).coberturaComercial).toBe(false);

        const user = { idUsuario: 1, idEmpresa: company.idEmpresa, email: null, nombreCompleto: 'Test', roles: ['Administrador'] };
        const audit = { record: jest.fn() };
        const config = new ConfigService();
        const pendingDomain = new CoverageDomainService(
          tx as unknown as PrismaService, config, audit as never, commercial,
          new G3CoverageProvider(config), new LegacyTomodatCoverageProvider(config), { geocode: jest.fn() } as never,
        );
        expect((await pendingDomain.check(company.idEmpresa, { latitud: -33.59, longitud: -70.61 }, user)).estado)
          .toBe('PENDIENTE_VALIDACION_TECNICA');
        expect((await pendingDomain.check(company.idEmpresa, { latitud: -34, longitud: -71 }, user)).estado).toBe('NO_FACTIBLE');

        const positiveDomain = new CoverageDomainService(
          tx as unknown as PrismaService, config, audit as never, commercial,
          { configured: () => true, check: async (_company: number, _lat: number, _lng: number, traceId: string) => ({ estado: 'FACTIBLE', proveedor: 'G3', motivo: 'ok', traceId }) } as never,
          new LegacyTomodatCoverageProvider(config), { geocode: jest.fn() } as never,
        );
        expect((await positiveDomain.check(company.idEmpresa, { latitud: -33.59, longitud: -70.61 }, user)).estado).toBe('FACTIBLE');
        expect(audit.record).toHaveBeenCalled();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
