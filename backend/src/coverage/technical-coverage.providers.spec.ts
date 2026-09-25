import { ConfigService } from '@nestjs/config';
import { G3CoverageProvider } from './g3-coverage.provider';
import { LegacyTomodatCoverageProvider } from './legacy-tomodat-coverage.provider';

describe('proveedores tecnicos de cobertura', () => {
  const point = { idEmpresa: 1, latitud: -33.58, longitud: -70.63, traceId: '00000000-0000-4000-8000-000000000001' };
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ factible: true }, 'FACTIBLE'],
    [{ estado: 'NO_FACTIBLE' }, 'NO_FACTIBLE'],
  ] as const)('interpreta respuesta G3 %j como %s', async (body, expected) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const provider = new G3CoverageProvider(new ConfigService({ G3_API_URL: 'https://g3.example.test' }));
    expect((await provider.check(point.idEmpresa, point.latitud, point.longitud, point.traceId)).estado).toBe(expected);
  });

  it('timeout y error G3 mantienen pendiente sin exponer el secreto', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('G3_API_KEY=test-secret'));
    const provider = new G3CoverageProvider(new ConfigService({ G3_API_URL: 'https://g3.example.test', G3_API_KEY: 'test-secret' }));
    const result = await provider.check(point.idEmpresa, point.latitud, point.longitud, point.traceId);
    expect(result.estado).toBe('PENDIENTE');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });

  it('G3 no configurado queda pendiente y no usa red', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const result = await new G3CoverageProvider(new ConfigService()).check(point.idEmpresa, point.latitud, point.longitud, point.traceId);
    expect(result.estado).toBe('PENDIENTE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TomoDAT legacy solo consulta cuando empresa, token y selección explicita lo permiten', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const disabled = new LegacyTomodatCoverageProvider(new ConfigService({ TOMODAT_COMPANY_ID: '1', TOMODAT_API_TOKEN: '' }));
    expect((await disabled.check(point.idEmpresa, point.latitud, point.longitud, point.traceId)).estado).toBe('PENDIENTE');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(JSON.stringify([{
      id: 3, name: 'NAP test', dot: { lat: point.latitud, lng: point.longitud }, splitters: [{ total_ports: 8, free_ports_number: 1 }],
    }]), { status: 200 }));
    const enabled = new LegacyTomodatCoverageProvider(new ConfigService({ TOMODAT_COMPANY_ID: '1', TOMODAT_API_TOKEN: 'test-secret' }));
    const result = await enabled.check(point.idEmpresa, point.latitud, point.longitud, point.traceId);
    expect(result.estado).toBe('FACTIBLE');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
});
