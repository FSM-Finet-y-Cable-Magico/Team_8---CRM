import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoverageProvider, TechnicalCoverageResult } from './coverage.types';

@Injectable()
export class G3CoverageProvider implements CoverageProvider {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return Boolean(this.config.get<string>('G3_API_URL')?.trim());
  }

  async check(idEmpresa: number, latitud: number, longitud: number, traceId: string): Promise<TechnicalCoverageResult> {
    const pending = (motivo: string): TechnicalCoverageResult => ({ estado: 'PENDIENTE', proveedor: 'G3', motivo, traceId });
    const configuredUrl = this.config.get<string>('G3_API_URL')?.trim();
    if (!configuredUrl) return pending('La validacion tecnica de G3 aun no esta configurada.');
    try {
      const url = new URL(configuredUrl);
      if (!this.safeProtocol(url) || url.username || url.password || url.search || url.hash) throw new Error('URL invalida');
      url.pathname = `${url.pathname.replace(/\/$/, '')}/api/integraciones/cobertura/verificar`;
      const apiKey = this.config.get<string>('G3_API_KEY')?.trim();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ id_empresa: idEmpresa, latitud, longitud, trace_id: traceId }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) return pending('G3 no pudo confirmar la factibilidad tecnica.');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return pending('G3 entrego una respuesta no reconocida.');
      const record = body as Record<string, unknown>;
      const value = typeof record.estado === 'string' ? record.estado.toUpperCase() : record.factible;
      if (value === true || value === 'FACTIBLE') {
        return { estado: 'FACTIBLE', proveedor: 'G3', motivo: 'G3 confirmo factibilidad tecnica.', traceId };
      }
      if (value === false || value === 'NO_FACTIBLE') {
        return { estado: 'NO_FACTIBLE', proveedor: 'G3', motivo: 'G3 informo que la ubicacion no es tecnicamente factible.', traceId };
      }
      return pending('G3 no entrego una decision tecnica definitiva.');
    } catch {
      return pending('No fue posible consultar G3; la validacion tecnica sigue pendiente.');
    }
  }

  private safeProtocol(url: URL) {
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  }
}
