import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { G3HttpReply, G3WithdrawalOrderPayload } from './g3-withdrawal-contract';

export const G3_WITHDRAWAL_CLIENT = Symbol('G3_WITHDRAWAL_CLIENT');

export interface G3WithdrawalClient {
  /** S2S transport configured (G3_INTEGRATION_ENABLED + URL + key). */
  configured(): boolean;
  createOrder(payload: G3WithdrawalOrderPayload): Promise<G3HttpReply>;
  cancelOrder(requestId: string, body: { motivo: string; trace_id?: string }): Promise<G3HttpReply>;
  readOrder(idOt: number, idEmpresa: number): Promise<G3HttpReply>;
}

/**
 * Raw HTTP transport for the BAJA endpoints of G3. It never interprets business results: it returns
 * the status and the parsed body (status=null for network/timeout) and the pure contract module
 * (g3-withdrawal-contract.ts) decides. Same credentials, timeout and URL policy as the installation
 * client: HTTPS only, plain HTTP only for loopback; no redirects; no secrets in errors or logs.
 */
@Injectable()
export class HttpG3WithdrawalClient implements G3WithdrawalClient {
  constructor(private readonly config: ConfigService) {}

  configured() {
    return (this.config.get<string>('G3_INTEGRATION_ENABLED') ?? '').trim().toLowerCase() === 'true'
      && Boolean(this.config.get<string>('G3_API_URL')?.trim()) && Boolean(this.config.get<string>('G3_API_KEY')?.trim());
  }

  createOrder(payload: G3WithdrawalOrderPayload) {
    return this.send('/api/integraciones/ordenes-baja', { method: 'POST', body: JSON.stringify(payload) });
  }

  cancelOrder(requestId: string, body: { motivo: string; trace_id?: string }) {
    return this.send(`/api/integraciones/ordenes-baja/${encodeURIComponent(requestId)}/cancelacion`, { method: 'POST', body: JSON.stringify(body) });
  }

  readOrder(idOt: number, idEmpresa: number) {
    return this.send(`/api/integraciones/ordenes/${encodeURIComponent(String(idOt))}`, { method: 'GET' }, { id_empresa: String(idEmpresa) });
  }

  private async send(path: string, init: RequestInit, query: Record<string, string> = {}): Promise<G3HttpReply> {
    if (!this.configured()) return { status: null, body: { codigo: 'INTEGRACION_G3_NO_CONFIGURADA' } };
    const url = this.url(path, query);
    if (!url) return { status: null, body: { codigo: 'INTEGRACION_G3_NO_CONFIGURADA' } };
    const timeoutValue = Number(this.config.get<string>('G3_REQUEST_TIMEOUT_MS') ?? 8000);
    const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue >= 1000 ? timeoutValue : 8000;
    try {
      const response = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-KEY': this.config.get<string>('G3_API_KEY')!.trim() },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      const text = await response.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      return { status: response.status, body };
    } catch {
      return { status: null, body: { codigo: 'G3_NO_DISPONIBLE' } };
    }
  }

  private url(path: string, query: Record<string, string>) {
    try {
      const parsed = new URL(this.config.get<string>('G3_API_URL')!.trim());
      const loopback = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      if ((parsed.protocol !== 'https:' && !loopback) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
      parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${path}`;
      for (const [name, value] of Object.entries(query)) parsed.searchParams.set(name, value);
      return parsed;
    } catch {
      return null;
    }
  }
}
