import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';
import { ARCGIS_GEOCODING_URL } from './arcgis-geocoding';

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

  it('distingue errores del servicio de una dirección no encontrada', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    const insecure = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'HTTP', GEOCODING_API_URL: 'http://geo.example.test' }));
    await expect(insecure.geocode('Calle')).rejects.toThrow('no está configurado');
    expect(fetchMock).not.toHaveBeenCalled();
    const failing = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'HTTP', GEOCODING_API_URL: 'https://geo.example.test' }));
    await expect(failing.geocode('Calle')).rejects.toThrow('Intenta nuevamente');
  });

  function photon(properties: Record<string, unknown> = {}, coordinates: unknown[] = [-70.65, -33.43]) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {
      street: 'Plaza de Armas', housenumber: '951', city: 'Santiago', state: 'Región Metropolitana de Santiago', countrycode: 'CL', ...properties,
    }, geometry: { type: 'Point', coordinates } }] };
  }
  const address = { direccion: 'Plaza de Armas 951', comuna: 'Santiago', region: 'Región Metropolitana' };
  const configured = () => new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'PHOTON', GEOCODING_API_URL: 'https://geo.example.test/api/' }));

  it('ubica un domicilio de Chile y comparte la consulta entre validación y registro', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(photon()), { status: 200 }));
    const service = configured();
    const [first, second] = await Promise.all([service.resolveAddress(address), service.resolveAddress(address)]);
    expect(first).toMatchObject({ latitud: -33.43, longitud: -70.65 });
    expect(second).toEqual(first);
    expect(await service.resolveAddress(address)).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('countrycode')).toBe('CL');
    expect(url.pathname).toBe('/structured');
    expect(url.searchParams.get('street')).toBe('Plaza de Armas');
    expect(url.searchParams.get('housenumber')).toBe('951');
    expect(url.searchParams.get('city')).toBe('Santiago');
  });

  it.each([{ housenumber: '952' }, { street: 'Otra calle' }, { city: 'Otra comuna' }, { countrycode: 'US' }, { housenumber: undefined }])('rechaza coincidencias aproximadas o de otro domicilio: %j', async properties => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(photon(properties)), { status: 200 }));
    await expect(configured().resolveAddress(address)).rejects.toThrow('La dirección puede existir');
  });

  it('no convierte coordenadas nulas en un punto del mapa', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(photon({}, [null, null])), { status: 200 }));
    await expect(configured().resolveAddress(address)).rejects.toThrow('ubicación exacta');
  });

  it('una dirección ambigua requiere corregir los datos y no escoge el primer punto', async () => {
    const data = photon();
    data.features.push(photon({}, [-70.66, -33.44]).features[0]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(configured().resolveAddress(address)).rejects.toThrow('varios lugares');
  });

  it('un edificio y su entrada con el mismo domicilio no se consideran direcciones distintas', async () => {
    const data = photon();
    data.features.push(photon({}, [-70.6502, -33.4301]).features[0]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(configured().resolveAddress(address)).resolves.toMatchObject({ latitud: -33.43, longitud: -70.65 });
  });

  it('valida calle, número y comuna antes de consultar el proveedor', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(configured().resolveAddress({ direccion: 'Calle inexistente', comuna: 'Santiago' })).rejects.toThrow('dirección válida');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prueba la búsqueda libre si la búsqueda por campos no devuelve un domicilio exacto', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(photon({ housenumber: undefined })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(photon()), { status: 200 }));
    await expect(configured().resolveAddress(address)).resolves.toMatchObject({ latitud: -33.43, longitud: -70.65 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('q')).toContain('Plaza de Armas 951');
  });

  it('un centro de calle sin número no confirma la dirección ni su cobertura', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(photon({ housenumber: undefined })), { status: 200 }));
    await expect(configured().resolveAddress(address)).rejects.toThrow('La dirección puede existir aunque no esté registrada');
  });

  const arcgis = () => new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'ARCGIS', GEOCODING_API_URL: ARCGIS_GEOCODING_URL, GEOCODING_API_KEY: 'test-key' }));
  const arcgisResponse = (attributes: Record<string, unknown> = {}, score = 100) => ({ candidates: [{ address: 'Plaza de Armas 951, Santiago, Chile', score,
    location: { x: -70.65, y: -33.43 }, attributes: { Addr_type: 'PointAddress', StName: 'Plaza de Armas', AddNum: '951', City: 'Santiago', Region: 'Región Metropolitana de Santiago', Country: 'CHL', ...attributes } }] });

  it('ArcGIS autentica por cabecera y solicita resultados aptos para guardarse en el CRM', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(arcgisResponse()), { status: 200 }));
    await expect(arcgis().resolveAddress(address)).resolves.toMatchObject({ latitud: -33.43, longitud: -70.65 });
    const [request, options] = fetchMock.mock.calls[0];
    const url = new URL(String(request));
    expect(url.searchParams.get('forStorage')).toBe('true');
    expect(url.searchParams.get('sourceCountry')).toBe('CHL');
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.toString()).not.toContain('test-key');
    expect(options?.headers).toMatchObject({ 'X-Esri-Authorization': 'Bearer test-key' });
  });

  it.each([{ Addr_type: 'StreetName' }, { Addr_type: 'StreetAddress' }, { StName: 'Avenida Independencia' }, { AddNum: '952' }, { Country: 'USA' }])('ArcGIS no confirma una calle aproximada u otro domicilio: %j', async attributes => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(arcgisResponse(attributes)), { status: 200 }));
    await expect(arcgis().resolveAddress(address)).rejects.toThrow('ubicación exacta');
  });

  it('ArcGIS rechaza coincidencias de baja confianza', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(arcgisResponse({}, 80)), { status: 200 }));
    await expect(arcgis().resolveAddress(address)).rejects.toThrow('ubicación exacta');
  });

  it('la falta de credencial o un destino distinto no envían consultas de ArcGIS', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const missing = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'ARCGIS', GEOCODING_API_URL: ARCGIS_GEOCODING_URL }));
    await expect(missing.resolveAddress(address)).rejects.toThrow('credencial privada');
    const wrongEndpoint = new GeocodingService(new ConfigService({ GEOCODING_PROVIDER: 'ARCGIS', GEOCODING_API_URL: 'https://photon.komoot.io/api/', GEOCODING_API_KEY: 'test-key' }));
    await expect(wrongEndpoint.resolveAddress(address)).rejects.toThrow('endpoint');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ArcGIS distingue un rechazo de autenticación de una dirección no localizada', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 498, message: 'Datos internos del proveedor' } }), { status: 200 }));
    await expect(arcgis().resolveAddress(address)).rejects.toThrow('permisos de la credencial');
  });
});
