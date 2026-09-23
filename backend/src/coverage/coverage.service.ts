import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { CoverageLocationDto } from './coverage.dto';

export type CoverageResult = {
  proveedor: 'TomoDAT';
  estado: 'Factible' | 'No Factible' | 'Pendiente';
  motivo: string;
  consultadoEn: string;
  ubicacion: { latitud: number; longitud: number };
  cajas: Array<{
    id: number;
    nombre: string;
    latitud: number;
    longitud: number;
    puertosLibres: number;
  }>;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato inválido');
  return value as Record<string, unknown>;
}

// Empty strings, nulls and booleans must never become valid coordinates/port counts.
function numeric(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) throw new Error('Número inválido');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Número inválido');
  return number;
}

@Injectable()
export class CoverageService {
  constructor(private readonly config: ConfigService) {}

  status(idEmpresa: number, user: AuthUser) {
    this.assertAccess(idEmpresa, user);
    const company = Number(this.config.get<string>('TOMODAT_COMPANY_ID'));
    const enabled = Number.isInteger(company) && company > 0 && company === idEmpresa;
    const configured = enabled && Boolean(this.config.get<string>('TOMODAT_API_TOKEN')?.trim());
    return {
      configurado: configured,
      mensaje: configured
        ? 'Confirma la ubicación para consultar cobertura y puertos disponibles.'
        : enabled
          ? 'La conexión con TomoDAT está pendiente de configuración. La factibilidad requiere revisión técnica.'
          : 'TomoDAT no está configurado para esta empresa. La factibilidad requiere revisión técnica.',
    };
  }

  async check(idEmpresa: number, location: CoverageLocationDto, user: AuthUser): Promise<CoverageResult> {
    const status = this.status(idEmpresa, user);
    if (!Number.isFinite(location.latitud) || Math.abs(location.latitud) > 90
      || !Number.isFinite(location.longitud) || Math.abs(location.longitud) > 180) {
      throw new BadRequestException('Coordenadas inválidas');
    }
    const result: CoverageResult = {
      proveedor: 'TomoDAT', estado: 'Pendiente', motivo: status.mensaje,
      consultadoEn: new Date().toISOString(),
      ubicacion: { latitud: location.latitud, longitud: location.longitud }, cajas: [],
    };
    if (!status.configurado) return result;

    try {
      const base = new URL(this.config.get<string>('TOMODAT_API_URL') || 'https://cl2.tomodat.com/tomodat/api/');
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('URL inválida');
      base.pathname = `${base.pathname.replace(/\/$/, '')}/clients/viability/${location.latitud}/${location.longitud}/`;
      const response = await fetch(base, {
        headers: { Authorization: this.config.get<string>('TOMODAT_API_TOKEN')!.trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Consulta fallida');
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length > 5000) throw new Error('Respuesta inválida');
      const cajas = data.map((value) => {
        const box = object(value);
        const dot = object(box.dot);
        const id = numeric(box.id);
        const latitud = numeric(dot.lat);
        const longitud = numeric(dot.lng);
        if (!Number.isInteger(id) || id < 1 || Math.abs(latitud) > 90 || Math.abs(longitud) > 180
          || typeof box.name !== 'string' || !box.name.trim() || !Array.isArray(box.splitters)) throw new Error('Caja inválida');
        let puertosLibres = 0;
        for (const value of box.splitters) {
          const splitter = object(value);
          const free = numeric(splitter.free_ports_number);
          const total = numeric(splitter.total_ports);
          if (!Number.isInteger(free) || !Number.isInteger(total) || free < 0 || total < free) throw new Error('Puertos inválidos');
          puertosLibres += free;
        }
        return { id, nombre: box.name.slice(0, 200), latitud, longitud, puertosLibres };
      });
      result.cajas = cajas.filter(box => box.puertosLibres > 0);
      result.estado = result.cajas.length ? 'Factible' : 'No Factible';
      result.motivo = result.cajas.length
        ? 'TomoDAT encontró cajas dentro de alcance con puertos disponibles. La consulta no reserva un puerto.'
        : 'TomoDAT no encontró cajas viables con puertos libres para esta ubicación.';
    } catch {
      // Never expose provider bodies, tokens or request headers in logs or responses.
      result.motivo = 'No se pudo verificar la cobertura con TomoDAT. Intenta nuevamente o solicita revisión técnica.';
    }
    return result;
  }

  private assertAccess(idEmpresa: number, user: AuthUser) {
    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) throw new BadRequestException('Empresa inválida');
    if (!isAdministrator(user.roles) && user.idEmpresa !== idEmpresa) {
      throw new ForbiddenException('No tienes acceso a la cobertura de esta empresa');
    }
  }
}
