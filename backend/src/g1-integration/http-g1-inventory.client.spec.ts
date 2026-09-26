import { HttpG1InventoryClient } from './http-g1-inventory.client';
import { G1IntegrationError, G1_PHYSICAL_STATES, isOfficialG1PhysicalState } from './g1-integration.types';

const originalFetch = global.fetch;

function setup(values: Record<string, string> = {}) {
  const config = {
    G1_INTEGRATION_ENABLED: 'true',
    G1_API_URL: 'https://g1.example.test',
    G1_API_KEY: 'secret-g1-key',
    G1_REQUEST_TIMEOUT_MS: '50',
    ...values,
  };
  return new HttpG1InventoryClient({ get: jest.fn((key: string) => config[key as keyof typeof config]) } as never);
}

function response(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('Etapa 4 - HttpG1InventoryClient', () => {
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('consulta tipos con empresa y filtros usando X-API-KEY solo en servidor', async () => {
    const fetchMock = jest.fn().mockImplementation(() => response({ success: true, data: [{ id_tipo_equipo: 3, id_empresa: 1, nombre: 'ONT' }] }));
    global.fetch = fetchMock as never;
    const result = await setup().getEquipmentTypes({ idEmpresa: 1, categoria: 'ONT/ONU', buscar: 'Huawei', activo: true });
    expect(result.data).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('id_empresa=1'); expect(url).toContain('categoria=ONT%2FONU'); expect(url).toContain('buscar=Huawei');
    expect(init.headers['X-API-KEY']).toBe('secret-g1-key');
  });

  it('consulta una unidad por serie y conserva la garantía física', async () => {
    global.fetch = jest.fn().mockImplementation(() => response({ success: true, data: { numero_serie: 'ONT-1', id_empresa: 1, estado: 'Instalado en cliente', garantia: { vigente: true } } })) as never;
    await expect(setup().getUnitBySerial('ONT-1', 1)).resolves.toMatchObject({ data: { numero_serie: 'ONT-1', garantia: { vigente: true } } });
  });

  it.each([
    [401, 'G1_UNAUTHORIZED', false],
    [403, 'G1_COMPANY_FORBIDDEN', false],
    [404, 'G1_NOT_FOUND', false],
    [409, 'G1_CONFLICT', false],
    [429, 'G1_RATE_LIMITED', true],
    [500, 'G1_UPSTREAM_ERROR', true],
  ])('normaliza error HTTP %s', async (status, code, retryable) => {
    global.fetch = jest.fn().mockImplementation(() => response({ message: 'detalle sensible' }, status)) as never;
    await expect(setup().getUnitBySerial('NOPE', 1)).rejects.toMatchObject({ code, status, retryable });
  });

  it('marca timeout como reintentable', async () => {
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { const error = new Error('abort'); error.name = 'AbortError'; reject(error); });
    })) as never;
    await expect(setup({ G1_REQUEST_TIMEOUT_MS: '1' }).getUnitBySerial('ONT-1', 1)).rejects.toMatchObject({ code: 'G1_TIMEOUT', retryable: true });
  });

  it('falla cerrado cuando G1 no está configurado y no expone la API key', async () => {
    const client = setup({ G1_INTEGRATION_ENABLED: 'false' });
    const error = await client.getUnitBySerial('ONT-1', 1).catch((value) => value as G1IntegrationError);
    expect((error as G1IntegrationError).code).toBe('INTEGRACION_G1_NO_CONFIGURADA');
    expect(JSON.stringify(error)).not.toContain('secret-g1-key');
  });

  it('reconoce exclusivamente los seis estados físicos oficiales; Bloqueado no es oficial', () => {
    expect(G1_PHYSICAL_STATES).toHaveLength(6);
    for (const state of G1_PHYSICAL_STATES) expect(isOfficialG1PhysicalState(state)).toBe(true);
    expect(isOfficialG1PhysicalState('Bloqueado')).toBe(false);
    expect(isOfficialG1PhysicalState('Disponible')).toBe(false);
  });
});
