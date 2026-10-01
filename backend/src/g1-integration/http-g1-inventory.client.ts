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
    try {
      return this.enabled() && Boolean(this.baseUrl() && this.apiKey()) && this.timeoutMs() > 0;
    } catch {
      return false;
    }
  }

  async getEquipmentTypes(input: {
    idEmpresa: number;
    categoria?: string;
    buscar?: string;
    activo?: boolean;
  }) {
    const idEmpresa = this.positiveId(input.idEmpresa, 'id_empresa');
    const query = new URLSearchParams({ id_empresa: String(idEmpresa) });
    if (input.categoria) query.set('categoria', input.categoria);
    if (input.buscar) query.set('buscar', input.buscar);
    if (input.activo !== undefined) query.set('activo', String(input.activo));
    return this.request<G1EquipmentType[]>(`/api/integraciones/tipos-equipo?${query}`)
      .then(result => this.validateCompanyArray(result, idEmpresa));
  }

  getUnitBySerial(serial: string, idEmpresa: number) {
    const company = this.positiveId(idEmpresa, 'id_empresa');
    const normalizedSerial = serial.trim();
    if (!normalizedSerial) {
      throw new G1IntegrationError('G1_SERIAL_REQUIRED', null, false, 'G1 requiere un número de serie.');
    }
    const query = new URLSearchParams({ id_empresa: String(company) });
    return this.request<G1Unit>(`/api/integraciones/unidades/${encodeURIComponent(normalizedSerial)}?${query}`)
      .then(result => this.validateCompanyObject(result, company));
  }

  sendActivation(payload: G1ActivationPayload) {
    this.positiveId(payload.id_empresa, 'id_empresa');
    this.positiveId(payload.id_ot, 'id_ot', 'G1_ID_OT_REQUIRED');
    this.positiveId(payload.id_cliente, 'id_cliente');
    this.positiveId(payload.id_servicio, 'id_servicio');
    this.positiveId(payload.id_contrato, 'id_contrato');
    return this.request<Record<string, unknown>>('/api/integraciones/activaciones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getEquipmentByService(idServicio: number, idEmpresa: number) {
    const company = this.positiveId(idEmpresa, 'id_empresa');
    const service = this.positiveId(idServicio, 'id_servicio');
    const query = new URLSearchParams({ id_empresa: String(company), id_servicio: String(service) });
    return this.request<G1ServiceEquipment[]>(`/api/integraciones/equipos?${query}`)
      .then(result => this.validateCompanyArray(result, company));
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<G1ClientResult<T>> {
    if (!this.enabled()) {
      throw new G1IntegrationError(
        'INTEGRACION_G1_NO_CONFIGURADA',
        null,
        true,
        'La integración con Inventario/Bodega no está configurada.',
      );
    }
    const baseUrl = this.baseUrl();
    const apiKey = this.apiKey();
    if (!baseUrl || !apiKey) {
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
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
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
    if (status === 401) return 'AUTH_CONFIGURATION_MISMATCH';
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
    const raw = this.config.get<string>('G1_API_URL') ?? '';
    if (!raw) return '';
    try {
      const url = new URL(raw);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (raw !== raw.trim() || url.username || url.password || url.search || url.hash
        || url.pathname !== '/' || !/^https?:\/\/[^/]+\/?$/.test(raw)
        || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error();
      return url.origin;
    } catch {
      throw new G1IntegrationError('G1_INVALID_URL', null, false, 'G1_API_URL debe ser el origen HTTPS sin credenciales, rutas, query ni fragmento; solo un slash final opcional.');
    }
  }

  private apiKey() {
    const raw = this.config.get<string>('G1_API_KEY') ?? '';
    if (!raw) return '';
    if (raw !== raw.trim() || /[\r\n]/.test(raw)) {
      throw new G1IntegrationError('G1_INVALID_API_KEY_FORMAT', null, false, 'G1_API_KEY tiene un formato inválido.');
    }
    return raw;
  }

  private timeoutMs() {
    const parsed = Number(this.config.get<string>('G1_REQUEST_TIMEOUT_MS') ?? 8000);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60000) {
      throw new G1IntegrationError('G1_INVALID_TIMEOUT', null, false, 'G1_REQUEST_TIMEOUT_MS debe ser un entero entre 1 y 60000.');
    }
    return parsed;
  }

  private positiveId(value: number, field: string, code = 'G1_INVALID_REQUEST') {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
      throw new G1IntegrationError(code, null, false, `G1 requiere ${field} como entero positivo.`);
    }
    return value;
  }

  private validateCompanyArray<T extends { id_empresa: number }>(result: G1ClientResult<T[]>, idEmpresa: number) {
    if (!Array.isArray(result.data)) {
      throw new G1IntegrationError('G1_INVALID_RESPONSE', result.status, true, 'G1 devolvió una respuesta inválida.');
    }
    if (result.data.some(row => !row || row.id_empresa !== idEmpresa)) {
      throw new G1IntegrationError('G1_COMPANY_MISMATCH', 403, false, 'G1 devolvió datos fuera del alcance de empresa.');
    }
    return result;
  }

  private validateCompanyObject<T extends { id_empresa: number }>(result: G1ClientResult<T>, idEmpresa: number) {
    if (!result.data || typeof result.data !== 'object') {
      throw new G1IntegrationError('G1_INVALID_RESPONSE', result.status, true, 'G1 devolvió una respuesta inválida.');
    }
    if (result.data.id_empresa !== idEmpresa) {
      throw new G1IntegrationError('G1_COMPANY_MISMATCH', 403, false, 'G1 devolvió datos fuera del alcance de empresa.');
    }
    return result;
  }
}
