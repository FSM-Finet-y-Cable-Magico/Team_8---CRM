export type FacturacionClTestCredentials = { usuario: string; rut: string; clave: string };
export type FacturacionClTestCompany = { idEmpresa: number; enabled: boolean; environment: 'sandbox' };
export type FacturacionClJsonResponse = { status: number; ok: boolean; json(): Promise<unknown> };
export type FacturacionClRequest = (url: string, options: RequestInit) => Promise<FacturacionClJsonResponse>;
export type FacturacionClReadOptions = {
  enabled: boolean; companies: FacturacionClTestCompany[];
  credentials: (idEmpresa: number) => Promise<FacturacionClTestCredentials>;
};

export class FacturacionClReadError extends Error {
  constructor(public readonly code: string, public readonly httpStatus?: number) {
    super(code);
    this.name = 'FacturacionClReadError';
  }
}

/** Server-side API authentication. Public operations on this class are read-only. */
export class FacturacionClReadClient {
  private readonly companies = new Map<number, FacturacionClTestCompany>();
  private readonly tokens = new Map<number, { value: string; expiresAt: number }>();
  private readonly logins = new Map<number, Promise<string>>();
  private readonly enabled: boolean;
  private readonly credentials: (idEmpresa: number) => Promise<FacturacionClTestCredentials>;

  constructor(
    options: FacturacionClReadOptions,
    private readonly request: FacturacionClRequest = fetch,
    private readonly now: () => number = Date.now,
  ) {
    if (typeof options.enabled !== 'boolean' || !Array.isArray(options.companies)) throw new FacturacionClReadError('CONFIGURATION_INVALID');
    this.enabled = options.enabled;
    this.credentials = options.credentials;
    for (const company of options.companies) {
      if (!Number.isSafeInteger(company.idEmpresa) || company.idEmpresa < 1 || company.environment !== 'sandbox' ||
          typeof company.enabled !== 'boolean' || this.companies.has(company.idEmpresa)) throw new FacturacionClReadError('CONFIGURATION_INVALID');
      this.companies.set(company.idEmpresa, Object.freeze({ ...company }));
    }
  }

  private assertCompany(idEmpresa: number) {
    if (!this.enabled) throw new FacturacionClReadError('INTEGRATION_DISABLED');
    if (!this.companies.get(idEmpresa)?.enabled) throw new FacturacionClReadError('COMPANY_DISABLED_OR_MISSING');
  }

  protected companyEnabled(idEmpresa: number) {
    return this.enabled && this.companies.get(idEmpresa)?.enabled === true;
  }

  private async login(idEmpresa: number): Promise<string> {
    const startedAt = this.now();
    let credentials: FacturacionClTestCredentials;
    try { credentials = await this.credentials(idEmpresa); }
    catch { throw new FacturacionClReadError('TEST_CREDENTIALS_MISSING'); }
    if (!credentials || ![credentials.usuario, credentials.rut, credentials.clave].every(value => typeof value === 'string' && value.trim())) {
      throw new FacturacionClReadError('TEST_CREDENTIALS_MISSING');
    }
    let response: FacturacionClJsonResponse;
    try {
      response = await this.request('https://rest.facturacion.cl/login', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: credentials.usuario, rut: credentials.rut, clave: credentials.clave }),
      });
    } catch { throw new FacturacionClReadError('AUTH_TRANSPORT_FAILED'); }
    if (!response.ok) throw new FacturacionClReadError('AUTH_HTTP_FAILED', response.status);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new FacturacionClReadError('AUTH_INVALID_RESPONSE'); }
    const token = (body as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new FacturacionClReadError('AUTH_INVALID_RESPONSE');
    this.tokens.set(idEmpresa, { value: token, expiresAt: startedAt + (24 * 60 - 5) * 60000 });
    return token;
  }

  private async token(idEmpresa: number) {
    this.assertCompany(idEmpresa);
    const cached = this.tokens.get(idEmpresa);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const existing = this.logins.get(idEmpresa);
    if (existing) return existing;
    const pending = this.login(idEmpresa);
    this.logins.set(idEmpresa, pending);
    try { return await pending; }
    finally { this.logins.delete(idEmpresa); }
  }

  async authenticate(idEmpresa: number) {
    await this.token(idEmpresa);
    return { authenticated: true as const, environment: 'sandbox' as const, idEmpresa };
  }

  /** For the gated subclass only; fixed origin/paths, no token in return values. */
  protected async authorizedRequest(idEmpresa: number, url: URL) {
    if (url.origin !== 'https://rest.facturacion.cl' || !['/wsds/version', '/wsds/procesar', '/wsds/obtenerlink'].includes(url.pathname) || url.username || url.password || url.hash) {
      throw new FacturacionClReadError('REQUEST_DESTINATION_INVALID');
    }
    const token = await this.token(idEmpresa);
    const response = await this.request(url.href, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: token },
    });
    // Invalidate for the next explicit operation; never replay a processing request.
    if (response.status === 401) this.tokens.delete(idEmpresa);
    return response;
  }

  async version(idEmpresa: number) {
    const token = await this.token(idEmpresa);
    let response: FacturacionClJsonResponse;
    try {
      response = await this.request('https://rest.facturacion.cl/wsds/version', {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: token },
      });
    } catch { throw new FacturacionClReadError('VERSION_TRANSPORT_FAILED'); }
    if (!response.ok) {
      if (response.status === 401) this.tokens.delete(idEmpresa);
      throw new FacturacionClReadError('VERSION_HTTP_FAILED', response.status);
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new FacturacionClReadError('VERSION_INVALID_RESPONSE'); }
    const value = (body as { version?: unknown } | null)?.version;
    // The real test API returns an array. Preserve the discrepancy until its
    // element contract has been verified; never stringify arbitrary content.
    if (Array.isArray(value)) return { state: 'CONTRACT_MISMATCH' as const, responseShape: 'version:array' as const };
    if (typeof value !== 'string' || !/^[0-9]+(?:\.[0-9]+){1,5}$/.test(value)) throw new FacturacionClReadError('VERSION_INVALID_RESPONSE');
    return { state: 'VERIFIED' as const, version: value };
  }
}
