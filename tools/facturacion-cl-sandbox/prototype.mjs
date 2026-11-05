// Offline contract exercise. This module has no HTTP implementation or CRM imports.
const SIMULATED_ORIGIN = 'https://facturacion.invalid';
const TOKEN_CACHE_MS = (24 * 60 - 5) * 60 * 1000;
const transports = new WeakSet();

export class PrototypeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PrototypeError';
    this.code = code;
  }
}

/**
 * Fixtures: {status, body}, {failure: 'before-send'}, or {failure: 'unknown'}.
 * Optional expect checks method, path, headers, body fields and query fields.
 * Only sanitized request metadata is retained; responses are copied on creation.
 */
export function createFixtureTransport(fixtures) {
  const queue = structuredClone(fixtures);
  if (!Array.isArray(queue)) throw new PrototypeError('INVALID_FIXTURES');
  const metadata = [];
  const transport = Object.freeze({
    async request(request) {
      const url = new URL(request.url);
      if (url.origin !== SIMULATED_ORIGIN) throw new PrototypeError('SIMULATION_ONLY');
      metadata.push(Object.freeze({
        idEmpresa: request.idEmpresa, method: request.method, path: url.pathname,
        formato: url.searchParams.get('formato'),
      }));
      if (!queue.length) throw new PrototypeError('FIXTURE_EXHAUSTED');
      const fixture = queue.shift();
      const expected = fixture.expect;
      if (expected && (
        (expected.method !== undefined && request.method !== expected.method) ||
        (expected.path !== undefined && url.pathname !== expected.path) ||
        Object.entries(expected.headers ?? {}).some(([key, value]) => request.headers?.[key] !== value) ||
        Object.entries(expected.body ?? {}).some(([key, value]) => request.body?.[key] !== value) ||
        Object.entries(expected.query ?? {}).some(([key, value]) => url.searchParams.get(key) !== value)
      )) throw new PrototypeError('SIMULATED_CONTRACT_MISMATCH');
      if (fixture.failure === 'before-send') throw new PrototypeError('SIMULATED_NOT_SENT');
      if (fixture.failure) throw new PrototypeError('SIMULATED_TRANSPORT_UNKNOWN');
      return fixture;
    },
    metadata() { return [...metadata]; },
  });
  transports.add(transport);
  return transport;
}

export function parseProcessingResponse(body, expectedDteType) {
  const uncertain = code => Object.freeze({ simulated: true, state: 'RESULTADO_INDETERMINADO', code });
  const envelope = body?.WSPLANO;
  const rawDocument = envelope?.Detalle?.Documento;
  const documents = Array.isArray(rawDocument) ? rawDocument : [rawDocument];
  if (documents.length !== 1 || !documents[0] || typeof documents[0] !== 'object') {
    return uncertain('UNEXPECTED_DOCUMENT_COUNT_OR_SHAPE');
  }
  const document = documents[0];
  // A False result can mean "already exists". It does not prove absence of a DTE.
  if (envelope.Resultado !== 'True' || document.Resultado !== 'True') {
    return uncertain('PROVIDER_REPORTED_ERROR_OR_UNKNOWN_RESULT');
  }
  if (typeof document.Folio !== 'string' || !/^[1-9]\d*$/.test(document.Folio)) {
    return uncertain('INVALID_OR_MISSING_FOLIO');
  }
  if (String(document.TipoDte) !== String(expectedDteType)) {
    return uncertain('UNEXPECTED_DTE_TYPE');
  }
  return Object.freeze({ simulated: true, state: 'GENERADO', folio: document.Folio, tipoDte: String(document.TipoDte) });
}

export class FacturacionClPrototypeClient {
  #transport;
  #enabled;
  #companies;
  #now;
  #tokens = new Map();
  #logins = new Map();

  constructor({ enabled = false, companies = [], transport, now = Date.now } = {}) {
    if (typeof enabled !== 'boolean' || !Array.isArray(companies) || typeof now !== 'function') {
      throw new PrototypeError('INVALID_CONFIGURATION');
    }
    const companyMap = new Map();
    for (const company of companies) {
      if (!company || !Number.isSafeInteger(company.idEmpresa) || company.idEmpresa <= 0 ||
          company.environment !== 'sandbox' || typeof company.enabled !== 'boolean' ||
          Object.keys(company).some(key => !['idEmpresa', 'environment', 'enabled'].includes(key)) ||
          companyMap.has(company.idEmpresa)) throw new PrototypeError('INVALID_CONFIGURATION');
      companyMap.set(company.idEmpresa, Object.freeze({ ...company }));
    }
    if (!transports.has(transport)) throw new PrototypeError('FIXTURE_TRANSPORT_REQUIRED');
    this.#transport = transport;
    this.#enabled = enabled;
    this.#companies = companyMap;
    this.#now = now;
  }

  #assertCompany(idEmpresa) {
    if (!this.#enabled) throw new PrototypeError('INTEGRATION_DISABLED');
    if (!this.#companies.get(idEmpresa)?.enabled) throw new PrototypeError('COMPANY_DISABLED_OR_MISSING');
  }

  async #token(idEmpresa) {
    this.#assertCompany(idEmpresa);
    const cached = this.#tokens.get(idEmpresa);
    if (cached && cached.expiresAt > this.#now()) return cached.token;
    if (this.#logins.has(idEmpresa)) return this.#logins.get(idEmpresa);
    const pending = this.#login(idEmpresa);
    this.#logins.set(idEmpresa, pending);
    try { return await pending; }
    finally { this.#logins.delete(idEmpresa); }
  }

  async #login(idEmpresa) {
    const startedAt = this.#now();
    let response;
    try {
      response = await this.#transport.request({
        idEmpresa, method: 'POST', url: `${SIMULATED_ORIGIN}/login`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          usuario: `SIMULATED_USER_${idEmpresa}`,
          rut: `SIMULATED_RUT_${idEmpresa}`,
          clave: `SIMULATED_PASSWORD_${idEmpresa}`,
        },
      });
    } catch { throw new PrototypeError('AUTH_TRANSPORT_FAILED'); }
    if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) {
      throw new PrototypeError('AUTH_HTTP_FAILED');
    }
    const token = response.body?.token;
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) {
      throw new PrototypeError('AUTH_INVALID_RESPONSE');
    }
    this.#tokens.set(idEmpresa, { token, expiresAt: startedAt + TOKEN_CACHE_MS });
    return token;
  }

  async authenticate(idEmpresa) {
    await this.#token(idEmpresa);
    return Object.freeze({ simulated: true, authenticated: true, idEmpresa });
  }

  async processIntegration({ idEmpresa, fileBytes, formato, expectedDteType }) {
    this.#assertCompany(idEmpresa);
    if (!(fileBytes instanceof Uint8Array) || fileBytes.length === 0 ||
        ![1, 2].includes(formato) || !Number.isSafeInteger(expectedDteType) || expectedDteType <= 0) {
      throw new PrototypeError('INVALID_INTEGRATION_INPUT');
    }
    // Copy before awaiting authentication; caller mutation must not change the request.
    const file = Buffer.from(fileBytes).toString('base64');
    const token = await this.#token(idEmpresa);
    const url = new URL('/wsds/procesar', SIMULATED_ORIGIN);
    url.searchParams.set('file', file);
    url.searchParams.set('formato', String(formato));
    let response;
    try {
      response = await this.#transport.request({ idEmpresa, method: 'GET', url: url.href, headers: { Authorization: token } });
    } catch (error) {
      if (error instanceof PrototypeError && error.code === 'SIMULATED_NOT_SENT') {
        return Object.freeze({ simulated: true, state: 'NO_ENVIADO', code: 'TRANSPORT_CONFIRMED_NOT_SENT' });
      }
      return Object.freeze({ simulated: true, state: 'RESULTADO_INDETERMINADO', code: 'TRANSPORT_UNKNOWN' });
    }
    if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) {
      if (response?.status === 401) this.#tokens.delete(idEmpresa);
      return Object.freeze({ simulated: true, state: 'RESULTADO_INDETERMINADO', code: 'PROCESS_HTTP_FAILED' });
    }
    return parseProcessingResponse(response.body, expectedDteType);
  }
}
