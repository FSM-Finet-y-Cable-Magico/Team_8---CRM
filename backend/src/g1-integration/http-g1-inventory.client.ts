import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  G1ActivationPayload,
  G1ClientResult,
  G1Envelope,
  G1EquipmentType,
  G1IntegrationError,
  G1InventoryClient,
  G1ServiceEquipment,
  G1Unit,
} from './g1-integration.types';

@Injectable()
export class HttpG1InventoryClient implements G1InventoryClient {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return this.enabled() && Boolean(this.baseUrl() && this.apiKey());
  }

  async getEquipmentTypes(input: {
    idEmpresa: number;
    categoria?: string;
    buscar?: string;
    activo?: boolean;
  }) {
    const query = new URLSearchParams({ id_empresa: String(input.idEmpresa) });
    if (input.categoria) query.set('categoria', input.categoria);
    if (input.buscar) query.set('buscar', input.buscar);
    if (input.activo !== undefined) query.set('activo', String(input.activo));
    return this.request<G1EquipmentType[]>(`/api/integraciones/tipos-equipo?${query}`);
  }

  getUnitBySerial(serial: string, idEmpresa: number) {
    const query = new URLSearchParams({ id_empresa: String(idEmpresa) });
    return this.request<G1Unit>(`/api/integraciones/unidades/${encodeURIComponent(serial)}?${query}`);
  }

  sendActivation(payload: G1ActivationPayload) {
    return this.request<Record<string, unknown>>('/api/integraciones/activaciones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getEquipmentByService(idServicio: number, idEmpresa: number) {
    const query = new URLSearchParams({ id_empresa: String(idEmpresa), id_servicio: String(idServicio) });
    return this.request<G1ServiceEquipment[]>(`/api/integraciones/equipos?${query}`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<G1ClientResult<T>> {
    if (!this.configured()) {
      throw new G1IntegrationError(
        'INTEGRACION_G1_NO_CONFIGURADA',
        null,
        true,
        'La integración con Inventario/Bodega no está configurada.',
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey(),
          ...init.headers,
        },
        signal: controller.signal,
      });
      const raw = await response.text();
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = null;
        }
      }
      if (!response.ok) {
        throw new G1IntegrationError(
          this.errorCode(response.status),
          response.status,
          response.status === 429 || response.status >= 500,
          this.errorMessage(response.status),
        );
      }
      const envelope = body as Partial<G1Envelope<T>> | null;
      if (!envelope || envelope.success !== true || envelope.data === undefined) {
        throw new G1IntegrationError('G1_INVALID_RESPONSE', response.status, true, 'G1 devolvió una respuesta inválida.');
      }
      return { status: response.status, data: envelope.data, durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof G1IntegrationError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new G1IntegrationError('G1_TIMEOUT', null, true, 'G1 no respondió dentro del tiempo configurado.');
      }
      throw new G1IntegrationError('G1_UNAVAILABLE', null, true, 'No fue posible conectar con G1.');
    } finally {
      clearTimeout(timer);
    }
  }

  private errorCode(status: number) {
    if (status === 401) return 'G1_UNAUTHORIZED';
    if (status === 403) return 'G1_COMPANY_FORBIDDEN';
    if (status === 404) return 'G1_NOT_FOUND';
    if (status === 409) return 'G1_CONFLICT';
    if (status === 429) return 'G1_RATE_LIMITED';
    return status >= 500 ? 'G1_UPSTREAM_ERROR' : 'G1_REQUEST_REJECTED';
  }

  private errorMessage(status: number) {
    if (status === 404) return 'El recurso no existe en G1.';
    if (status === 403) return 'G1 rechazó el alcance de empresa.';
    if (status === 401) return 'G1 rechazó la autenticación del servidor.';
    if (status === 409) return 'G1 informó un conflicto de estado o idempotencia.';
    if (status === 429) return 'G1 limitó temporalmente las solicitudes.';
    return status >= 500 ? 'G1 no pudo procesar la solicitud.' : 'G1 rechazó la solicitud.';
  }

  private enabled() {
    return (this.config.get<string>('G1_INTEGRATION_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private baseUrl() {
    return (this.config.get<string>('G1_API_URL') ?? '').trim().replace(/\/$/, '');
  }

  private apiKey() {
    return (this.config.get<string>('G1_API_KEY') ?? '').trim();
  }

  private timeoutMs() {
    const parsed = Number(this.config.get<string>('G1_REQUEST_TIMEOUT_MS') ?? 8000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
  }
}
