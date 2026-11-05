import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoverageProvider, TechnicalCoverageResult } from './coverage.types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato invalido');
  return value as Record<string, unknown>;
}

function numeric(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) throw new Error('Numero invalido');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Numero invalido');
  return number;
}

@Injectable()
export class LegacyTomodatCoverageProvider implements CoverageProvider {
  constructor(private readonly config: ConfigService) {}

  configuredFor(idEmpresa: number) {
    const company = Number(this.config.get<string>('TOMODAT_COMPANY_ID'));
    return Number.isInteger(company) && company > 0 && company === idEmpresa
      && Boolean(this.config.get<string>('TOMODAT_API_TOKEN')?.trim());
  }

  async check(idEmpresa: number, latitud: number, longitud: number, traceId: string): Promise<TechnicalCoverageResult> {
    const pending = (motivo: string): TechnicalCoverageResult => ({
      estado: 'PENDIENTE', proveedor: 'LEGACY_TOMODAT', motivo, traceId, cajas: [],
    });
    if (!this.configuredFor(idEmpresa)) return pending('El adaptador legacy de TomoDAT no esta configurado para esta empresa.');
    try {
      const base = new URL(this.config.get<string>('TOMODAT_API_URL') || 'https://cl2.tomodat.com/tomodat/api/');
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('URL invalida');
      base.pathname = `${base.pathname.replace(/\/$/, '')}/clients/viability/${latitud}/${longitud}/`;
      const response = await fetch(base, {
        headers: { Authorization: this.config.get<string>('TOMODAT_API_TOKEN')!.trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Consulta fallida');
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length > 5000) throw new Error('Respuesta invalida');
      const boxes = data.map(value => {
        const box = object(value);
        const dot = object(box.dot);
        const id = numeric(box.id);
        const boxLat = numeric(dot.lat);
        const boxLng = numeric(dot.lng);
        if (!Number.isInteger(id) || id < 1 || Math.abs(boxLat) > 90 || Math.abs(boxLng) > 180
          || typeof box.name !== 'string' || !box.name.trim() || !Array.isArray(box.splitters)) throw new Error('Caja invalida');
        let availablePorts = 0;
        for (const item of box.splitters) {
          const splitter = object(item);
          const free = numeric(splitter.free_ports_number);
          const total = numeric(splitter.total_ports);
          if (!Number.isInteger(free) || !Number.isInteger(total) || free < 0 || total < free) throw new Error('Puertos invalidos');
          availablePorts += free;
        }
        return { id, nombre: box.name.slice(0, 200), latitud: boxLat, longitud: boxLng, puertosLibres: availablePorts };
      }).filter(box => box.puertosLibres > 0);
      return boxes.length
        ? { estado: 'FACTIBLE', proveedor: 'LEGACY_TOMODAT', motivo: 'TomoDAT legacy encontro cajas con puertos disponibles.', traceId, cajas: boxes }
        : { estado: 'NO_FACTIBLE', proveedor: 'LEGACY_TOMODAT', motivo: 'TomoDAT legacy no encontro cajas viables con puertos libres.', traceId, cajas: [] };
    } catch {
      return pending('No fue posible consultar TomoDAT legacy; la validacion tecnica sigue pendiente.');
    }
  }
}
