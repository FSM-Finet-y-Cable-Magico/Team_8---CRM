import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CoverageService } from './coverage.service';
import { CheckCoverageDto } from './coverage.dto';
import { CreateProspectDto } from '../prospects/dto/create-prospect.dto';

describe('CoverageService / TomoDAT', () => {
  const user = { idUsuario: 3, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
  const point = { latitud: -33.58, longitud: -70.63 };
  const box = { id: 19, name: 'NAP 19', dot: { lat: -33.58, lng: -70.63 }, splitters: [{ total_ports: 8, free_ports_number: 2 }] };
  let fetchMock: jest.SpyInstance;

  function service(overrides: Record<string, string> = {}) {
    return new CoverageService(new ConfigService({ TOMODAT_COMPANY_ID: '1', TOMODAT_API_TOKEN: 'test-secret', ...overrides }));
  }
  beforeEach(() => { fetchMock = jest.spyOn(globalThis, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());
  function respond(data: unknown, status = 200) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  }

  it('usa el endpoint documentado y Authorization sin Bearer, sin filtrar el token', async () => {
    respond([box]);
    const result = await service().check(1, point, user);
    expect(result.estado).toBe('Factible');
    expect(result.cajas[0].puertosLibres).toBe(2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://cl2.tomodat.com/tomodat/api/clients/viability/-33.58/-70.63/');
    expect(options).toMatchObject({ headers: { Authorization: 'test-secret' }, redirect: 'error' });
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });

  it.each([[], [{ ...box, splitters: [{ total_ports: 8, free_ports_number: 0 }] }]].map(data => ({ data })))('solo una respuesta válida sin cupos declara No Factible (%j)', async ({ data }) => {
    respond(data);
    expect((await service().check(1, point, user)).estado).toBe('No Factible');
  });

  it.each([401, 403, 429, 500])('mantiene pendiente ante HTTP %i', async status => {
    respond({ error: 'test-secret' }, status);
    const result = await service().check(1, point, user);
    expect(result.estado).toBe('Pendiente');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });

  it.each([
    { error: 'unexpected' }, [box, { id: 20 }], [{ ...box, dot: { lat: null, lng: -70 } }],
    [{ ...box, splitters: [{ total_ports: 8, free_ports_number: 9 }] }],
    [{ ...box, splitters: [{ total_ports: 8, free_ports_number: true }] }],
  ].map(data => ({ data })))('no convierte respuestas malformadas en factibilidad (%j)', async ({ data }) => {
    respond(data);
    expect((await service().check(1, point, user)).estado).toBe('Pendiente');
  });

  it('maneja cortes y timeouts sin declarar falta de cobertura', async () => {
    fetchMock.mockRejectedValue(new Error('connection interrupted'));
    expect((await service().check(1, point, user)).estado).toBe('Pendiente');
  });

  it('no consulta sin token ni envía la red de FiNet a otra empresa', async () => {
    expect((await service({ TOMODAT_API_TOKEN: '' }).check(1, point, user)).estado).toBe('Pendiente');
    expect((await service().check(2, point, { ...user, roles: ['Administrador'] })).estado).toBe('Pendiente');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza acceso cruzado, coordenadas inválidas y conexiones sin HTTPS', async () => {
    await expect(service().check(2, point, user)).rejects.toThrow('No tienes acceso');
    await expect(service().check(1, { latitud: 91, longitud: 0 }, user)).rejects.toThrow('Coordenadas inválidas');
    expect((await service({ TOMODAT_API_URL: 'http://example.com' }).check(1, point, user)).estado).toBe('Pendiente');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valida coordenadas completas también dentro del registro de prospecto', async () => {
    const input = plainToInstance(CreateProspectDto, { rut: '21600781-6', nombreCompleto: 'Prueba', telefono: '123', direccion: 'Calle 1', ubicacion: { latitud: -33 } });
    expect((await validate(input)).some(error => error.property === 'ubicacion')).toBe(true);
    const invalid = plainToInstance(CheckCoverageDto, { idEmpresa: 1, latitud: null, longitud: '' });
    expect(await validate(invalid)).toHaveLength(2);
  });
});
