import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  const candidate = { display_name: 'Direccion aproximada', lat: '-33.58', lon: '-70.63', address: { country_code: 'cl' } };
  const createService = (settings = {}) => new GeocodingService(new ConfigService({
    GEOCODING_PROVIDER: 'NOMINATIM', GEOCODING_API_URL: 'https://nominatim.openstreetmap.org', ...settings,
  }));

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-07T00:00:00Z') });
    // Every fetch is mocked, including unexpected calls: these tests never use the network.
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([candidate])));
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('construye search con direccion completa, Chile, jsonv2 y User-Agent propio', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    const service = createService();
    expect(await service.geocode('  Av. Prueba 123, La Florida, Metropolitana, Chile  ')).toEqual([
      { etiqueta: 'Direccion aproximada', latitud: -33.58, longitud: -70.63 },
    ]);
    const [input, options] = jest.mocked(fetch).mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Av. Prueba 123, La Florida, Metropolitana, Chile', format: 'jsonv2', limit: '5', countrycodes: 'cl', addressdetails: '1',
    });
    expect(options).toMatchObject({ redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': expect.stringContaining('Finet-CRM/') } });
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it('cache normalizada y solicitudes simultaneas iguales emiten una sola peticion', async () => {
    const service = createService();
    const [first, second] = await Promise.all([service.geocode(' Av.   Prueba 123, Chile '), service.geocode('av. prueba 123, chile')]);
    expect(first).toEqual(second);
    first[0].latitud = 0;
    expect((await service.geocode('AV. PRUEBA 123, CHILE'))[0].latitud).toBe(-33.58);
    expect(fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await service.geocode('av. prueba 123, chile');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('forward y reverse comparten el limite de una peticion por segundo', async () => {
    const starts: number[] = [];
    jest.mocked(fetch).mockImplementation(async input => {
      starts.push(Date.now());
      return new Response(JSON.stringify(new URL(String(input)).pathname === '/reverse' ? candidate : [candidate]));
    });
    const service = createService();
    const requests = [service.geocode('Calle uno'), service.reverseGeocode(-33.58, -70.63), service.geocode('Calle dos')];
    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(starts).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.all(requests);
    expect(starts.map(time => time - starts[0])).toEqual([0, 1000, 2000]);
  });

  it('la cache esta acotada a 128 consultas y desaloja la mas antigua', async () => {
    const service = createService();
    for (let i = 0; i < 129; i++) {
      const result = service.geocode(`Calle ${i}`);
      await jest.advanceTimersByTimeAsync(1000);
      await result;
    }
    await service.geocode('Calle 128');
    expect(fetch).toHaveBeenCalledTimes(129);
    await service.geocode('Calle 0');
    expect(fetch).toHaveBeenCalledTimes(130);
  });

  it('acota la cola y devuelve fallback cuando esta llena', async () => {
    const service = createService();
    const requests = Array.from({ length: 32 }, (_, i) => service.geocode(`Calle ${i}`));
    expect(await service.geocode('Otra calle')).toEqual([]);
    await jest.runAllTimersAsync();
    await Promise.all(requests);
    expect(fetch).toHaveBeenCalledTimes(32);
  });

  it.each([null, {}, { error: 'unavailable' }, [null, [], 'invalid'],
    [{ lat: null, lon: '' }, { lat: '', lon: '-70' }, { lat: false, lon: '-70' }, { lat: 'NaN', lon: 'Infinity' }],
    [{ lat: '91', lon: '0' }, { lat: '0', lon: '-181' }],
    [{ ...candidate, address: { country_code: 'ar' } }],
  ])('respuesta invalida o fuera de Chile => [] (%j)', async data => {
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(data)));
    expect(await createService().geocode('Calle')).toEqual([]);
  });

  it('limita los candidatos a cinco y las etiquetas a 300 caracteres', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(Array.from({ length: 8 }, () => ({ ...candidate, display_name: 'a'.repeat(400) })))));
    const result = await createService().geocode('Calle');
    expect(result).toHaveLength(5);
    expect(result[0].etiqueta).toHaveLength(300);
  });

  it('sin display_name usa la consulta como etiqueta acotada', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ lat: '-33.58', lon: '-70.63' }])));
    const result = await createService().geocode('a'.repeat(400));
    expect(result[0]).toEqual({ etiqueta: 'a'.repeat(300), latitud: -33.58, longitud: -70.63 });
  });

  it.each([429, 500, 503])('HTTP %i devuelve fallback', async status => {
    jest.mocked(fetch).mockResolvedValue(new Response('', { status }));
    expect(await createService().geocode('Calle')).toEqual([]);
  });

  it('JSON invalido devuelve fallback', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('not-json'));
    expect(await createService().geocode('Calle')).toEqual([]);
  });

  it('el timeout aborta la peticion a los cinco segundos sin bloquear al usuario', async () => {
    jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    jest.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('Timeout')), { once: true });
    }));
    const request = createService().geocode('Calle');
    await jest.advanceTimersByTimeAsync(5000);
    expect(await request).toEqual([]);
  });

  it.each(['https://nominatim.openstreetmap.org', 'https://geo.example.test/search'])('reverse usa /reverse con base %s y cachea', async base => {
    jest.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(candidate)));
    const service = createService({ GEOCODING_API_URL: base });
    expect(await service.reverseGeocode(-33.58, -70.63)).toBe('Direccion aproximada');
    expect(await service.reverseGeocode(-33.58, -70.63)).toBe('Direccion aproximada');
    const url = new URL(String(jest.mocked(fetch).mock.calls[0][0]));
    expect(url.pathname).toBe('/reverse');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: '-33.58', lon: '-70.63', format: 'jsonv2', addressdetails: '1' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reverse invalido o indisponible => null, coordenadas invalidas no usan red', async () => {
    const service = createService();
    expect(await service.reverseGeocode(NaN, -70)).toBeNull();
    expect(await service.reverseGeocode(0, 181)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    jest.mocked(fetch).mockResolvedValue(new Response('{}'));
    expect(await service.reverseGeocode(-33, -70)).toBeNull();
    jest.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect(await createService().reverseGeocode(-33, -70)).toBeNull();
  });

  it.each(['', 'http://geo.example.test', 'invalid', 'https://user:pass@geo.example.test', 'https://geo.example.test/#fragment'])('no usa URL invalida o insegura: %s', async base => {
    expect(await createService({ GEOCODING_API_URL: base }).geocode('Calle')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('direccion vacia no usa red', async () => {
    expect(await createService().geocode('  ')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el proveedor manual no usa red y conserva disponible el fallback de mapa', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'MANUAL' }));
    expect(await service.geocode('Calle de prueba')).toEqual([]);
    expect(await service.reverseGeocode(-33, -70)).toBeNull();
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
