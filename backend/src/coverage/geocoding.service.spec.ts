import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('el proveedor manual no usa red y conserva disponible el fallback de mapa', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'MANUAL' }));
    expect(await service.geocode('Calle de prueba')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza candidatos del proveedor HTTP configurable', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { display_name: 'Direccion aproximada', lat: '-33.58', lon: '-70.63' },
    ]), { status: 200 }));
    const service = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'HTTP', GEOCODING_API_URL: 'https://geo.example.test/search' }));
    await expect(service.geocode('Calle de prueba')).resolves.toEqual([
      { etiqueta: 'Direccion aproximada', latitud: -33.58, longitud: -70.63 },
    ]);
  });

  it('error o URL insegura devuelve fallback vacio sin bloquear', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    const insecure = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'HTTP', GEOCODING_API_URL: 'http://geo.example.test' }));
    expect(await insecure.geocode('Calle')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    const failing = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'HTTP', GEOCODING_API_URL: 'https://geo.example.test' }));
    expect(await failing.geocode('Calle')).toEqual([]);
  });
});
