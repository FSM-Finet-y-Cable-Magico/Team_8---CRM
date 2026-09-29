import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingCandidate, GeocodingProvider } from './coverage.types';

@Injectable()
export class GeocodingService implements GeocodingProvider {
  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<GeocodingCandidate[]> {
    if (this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase() !== 'HTTP') return [];
    const url = this.configuredUrl();
    if (!url) return [];
    try {
      url.searchParams.set('q', address.trim());
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '5');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return [];
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];
      return data.slice(0, 5).flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const latitud = Number(record.lat);
        const longitud = Number(record.lon);
        if (!Number.isFinite(latitud) || Math.abs(latitud) > 90 || !Number.isFinite(longitud) || Math.abs(longitud) > 180) return [];
        return [{ etiqueta: String(record.display_name ?? address).slice(0, 300), latitud, longitud }];
      });
    } catch {
      return [];
    }
  }

  async reverseGeocode(latitud: number, longitud: number): Promise<string | null> {
    if (this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase() !== 'HTTP') return null;
    const url = this.configuredUrl();
    if (!url) return null;
    try {
      url.searchParams.set('lat', String(latitud));
      url.searchParams.set('lon', String(longitud));
      url.searchParams.set('format', 'json');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return null;
      const data: unknown = await response.json();
      return data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).display_name === 'string'
        ? String((data as Record<string, unknown>).display_name).slice(0, 300)
        : null;
    } catch {
      return null;
    }
  }

  private configuredUrl() {
    const value = this.config.get<string>('GEOCODING_API_URL')?.trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
      return url;
    } catch {
      return null;
    }
  }
}
