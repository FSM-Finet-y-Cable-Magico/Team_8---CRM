import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  G3ClientResult,
  G3InstallationPayload,
  G3IntegrationClient,
  G3IntegrationError,
  G3WorkOrderResponse,
} from './g3-integration.types';

@Injectable()
export class HttpG3IntegrationClient implements G3IntegrationClient {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return this.enabled()
      && Boolean(this.config.get<string>('G3_API_URL')?.trim())
      && Boolean(this.config.get<string>('G3_API_KEY')?.trim());
  }

  createInstallation(payload: G3InstallationPayload) {
    return this.request<G3WorkOrderResponse>('/api/integraciones/instalaciones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getWorkOrder(id: string) {
    return this.request<G3WorkOrderResponse>(`/api/integraciones/ordenes/${encodeURIComponent(id)}`);
  }

  getWorkOrderClosure(id: string) {
    return this.request<G3WorkOrderResponse>(`/api/integraciones/ordenes/${encodeURIComponent(id)}/cierre`);
  }

  private enabled() {
    return (this.config.get<string>('G3_INTEGRATION_ENABLED') ?? '').trim().toLowerCase() === 'true';
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<G3ClientResult<T>> {
    if (!this.configured()) {
      throw new G3IntegrationError(
        'INTEGRACION_G3_NO_CONFIGURADA',
        null,
        true,
        'La integracion tecnica con G3 no esta configurada.',
      );
    }

    const baseUrl = this.config.get<string>('G3_API_URL')?.trim() ?? '';
    const apiKey = this.config.get<string>('G3_API_KEY')?.trim() ?? '';
    const timeoutValue = Number(this.config.get<string>('G3_REQUEST_TIMEOUT_MS') ?? 8000);
    const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue >= 1000 ? timeoutValue : 8000;
    const url = this.buildUrl(baseUrl, path);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      const body = await this.parseBody(response);
      if (!response.ok) throw this.httpError(response.status);
      return { status: response.status, data: body as T, durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof G3IntegrationError) throw error;
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new G3IntegrationError('G3_TIMEOUT', null, true, 'G3 no respondio dentro del tiempo configurado.');
      }
      throw new G3IntegrationError('G3_NO_DISPONIBLE', null, true, 'No fue posible comunicarse con G3.');
    }
  }

  private buildUrl(baseUrl: string, path: string) {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new G3IntegrationError('INTEGRACION_G3_NO_CONFIGURADA', null, true, 'La URL de G3 no es valida.');
    }
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new G3IntegrationError('INTEGRACION_G3_NO_CONFIGURADA', null, true, 'La URL de G3 no es segura o valida.');
    }
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${path}`;
    return parsed;
  }

  private async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return {};
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private httpError(status: number) {
    const errors: Record<number, [string, boolean, string]> = {
      400: ['G3_PAYLOAD_INVALIDO', false, 'G3 rechazo los datos de la instalacion.'],
      401: ['G3_NO_AUTORIZADO', false, 'G3 rechazo la credencial de integracion.'],
      403: ['G3_SCOPE_EMPRESA_INVALIDO', false, 'G3 rechazo el scope de empresa.'],
      404: ['G3_OT_NO_ENCONTRADA', false, 'G3 no encontro la orden solicitada.'],
      409: ['G3_REQUEST_ID_CONFLICTO', false, 'G3 detecto un request_id con payload incompatible.'],
      429: ['G3_RATE_LIMIT', true, 'G3 limito temporalmente las solicitudes.'],
    };
    const [code, retryable, message] = errors[status]
      ?? (status >= 500
        ? ['G3_ERROR_SERVIDOR', true, 'G3 presento un error temporal.']
        : ['G3_RESPUESTA_NO_ESPERADA', false, 'G3 rechazo la operacion.']);
    return new G3IntegrationError(code, status, retryable, message);
  }
}
