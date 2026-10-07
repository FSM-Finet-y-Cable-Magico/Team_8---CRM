import { HttpG3IntegrationClient } from './http-g3-integration.client';
import { G3IntegrationError } from './g3-integration.types';

function setup(values: Record<string, string> = {}) {
  const config = { get: jest.fn((key: string) => ({
    G3_INTEGRATION_ENABLED: 'true', G3_API_URL: 'http://localhost:3999', G3_API_KEY: 'secret-test', G3_REQUEST_TIMEOUT_MS: '2000', ...values,
  })[key]) };
  return new HttpG3IntegrationClient(config as never);
}

function response(status: number, body: object) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Etapa 3 - adaptador HTTP G3', () => {
  afterEach(() => jest.restoreAllMocks());
  it('envia X-API-KEY solo desde backend y conserva snake_case', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(201, { id_ot: 1, estado: 'PENDIENTE' }));
    const client = setup(); await client.createInstallation({ request_id: 'r', trace_id: 't', id_empresa: 1, id_prospecto: 4, id_contrato: 2, id_plan: 3, persona: { rut: '12345678-5', nombre_completo: 'Demo', telefono: '+56912345678' }, direccion: { direccion_completa: 'Calle 1', comuna: 'Valparaiso' } });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: expect.objectContaining({ 'X-API-KEY': 'secret-test' }), body: expect.stringContaining('"request_id":"r"') }));
    expect(fetchMock.mock.calls[0][1]?.body).toContain('"persona":{"rut":"12345678-5"');
    expect(fetchMock.mock.calls[0][1]?.body).not.toContain('"rut":"12345678-5","persona"');
  });
  it('acepta HTTP 201 de creacion', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(201, { id_ot: 1 })); await expect(setup().createInstallation({} as never)).resolves.toMatchObject({ status: 201 });
  });
  it('acepta HTTP 200 idempotente', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(200, { id_ot: 1, duplicado: true })); await expect(setup().createInstallation({} as never)).resolves.toMatchObject({ status: 200, data: { duplicado: true } });
  });
  it.each([1, 2])('GET detalle agrega el scope de empresa %s y preserva el encoding del id', async (idEmpresa) => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(200, { id_ot: 1, id_empresa: idEmpresa }));
    await setup().getWorkOrder('OT/QA 1', idEmpresa);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/integraciones/ordenes/OT%2FQA%201');
    expect(url.searchParams.get('id_empresa')).toBe(String(idEmpresa));
  });
  it('GET cierre valida la empresa, pero no inventa un query todavía no ratificado', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response(200, { id_ot: 1, id_empresa: 2 }));
    await setup().getWorkOrderClosure('OT/QA 1', 2);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/integraciones/ordenes/OT%2FQA%201/cierre');
    expect(url.search).toBe('');
  });
  it.each([0, -1, 1.5, Number.NaN])('rechaza id_empresa no positivo antes de consultar G3: %s', async (idEmpresa) => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(setup().getWorkOrder('1', idEmpresa)).rejects.toMatchObject({ code: 'G3_SCOPE_EMPRESA_INVALIDO' });
    await expect(setup().getWorkOrderClosure('1', idEmpresa)).rejects.toMatchObject({ code: 'G3_SCOPE_EMPRESA_INVALIDO' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [400, 'G3_PAYLOAD_INVALIDO', false],
    [401, 'G3_NO_AUTORIZADO', false],
    [403, 'G3_SCOPE_EMPRESA_INVALIDO', false],
    [404, 'G3_OT_NO_ENCONTRADA', false],
    [409, 'G3_REQUEST_ID_CONFLICTO', false],
    [429, 'G3_RATE_LIMIT', true],
    [500, 'G3_ERROR_SERVIDOR', true],
  ])('mapea HTTP %s sin exponer respuesta sensible', async (status, code, retryable) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(status as number, { api_key: 'no debe propagarse' }));
    try { await setup().getWorkOrder('1', 1); throw new Error('expected failure'); } catch (error) {
      expect(error).toBeInstanceOf(G3IntegrationError); expect(error).toMatchObject({ code, retryable }); expect((error as Error).message).not.toContain('api_key');
    }
  });
  it('mapea timeout como reintentable', async () => {
    const timeout = new Error('timeout'); timeout.name = 'TimeoutError'; jest.spyOn(global, 'fetch').mockRejectedValue(timeout);
    await expect(setup().getWorkOrder('1', 1)).rejects.toMatchObject({ code: 'G3_TIMEOUT', retryable: true });
  });
  it('falla cerrado cuando la integracion no esta habilitada', async () => {
    await expect(setup({ G3_INTEGRATION_ENABLED: 'false' }).getWorkOrder('1', 1)).rejects.toMatchObject({ code: 'INTEGRACION_G3_NO_CONFIGURADA' });
  });
});
