import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingCandidate, GeocodingProvider } from './coverage.types';

const USER_AGENT = 'Finet-CRM/1.0 (https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM)';
const CACHE_LIMIT = 128;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_PENDING = 32;

@Injectable()
export class GeocodingService implements GeocodingProvider {
  // Singleton Nest provider: forward and reverse share the same process queue.
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<GeocodingCandidate[]> {
    const query = address.trim().replace(/\s+/g, ' ');
    const url = this.configuredUrl('search');
    if (!url || !query) return [];
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'cl');
    url.searchParams.set('addressdetails', '1');
    const candidates = await this.cachedRequest<GeocodingCandidate[]>(url, data => {
      if (!Array.isArray(data)) return [];
      return data.slice(0, 5).flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const latitud = this.coordinate(record.lat, 90);
        const longitud = this.coordinate(record.lon, 180);
        if (latitud === null || longitud === null) return [];
        const country = record.address && typeof record.address === 'object'
          ? (record.address as Record<string, unknown>).country_code : undefined;
        if (country !== undefined && country !== 'cl') return [];
        return [{ etiqueta: (typeof record.display_name === 'string' ? record.display_name : query).slice(0, 300), latitud, longitud }];
      });
    }, []);
    return candidates.map(candidate => ({ ...candidate }));
  }

  async reverseGeocode(latitud: number, longitud: number): Promise<string | null> {
    const url = this.configuredUrl('reverse');
    if (!url || this.coordinate(latitud, 90) === null || this.coordinate(longitud, 180) === null) return null;
    url.searchParams.set('lat', String(latitud));
    url.searchParams.set('lon', String(longitud));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    return this.cachedRequest(url, data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      const label = (data as Record<string, unknown>).display_name;
      return typeof label === 'string' && label.trim() ? label.slice(0, 300) : null;
    }, null);
  }

  private coordinate(value: unknown, limit: number): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
  }

  private async cachedRequest<T>(url: URL, parse: (data: unknown) => T, fallback: T): Promise<T> {
    const normalized = new URL(url);
    const query = normalized.searchParams.get('q');
    if (query) normalized.searchParams.set('q', query.toLocaleLowerCase('es-CL'));
    const key = normalized.toString();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    this.cache.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    // Fail safe instead of allowing an unbounded queue of user addresses.
    if (this.pending.size >= MAX_PENDING) return fallback;

    const request = this.queue.then(async () => {
      const delay = this.nextRequestAt - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      this.nextRequestAt = Date.now() + 1000;
      let value = fallback;
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        if (response.ok) value = parse(await response.json());
      } catch {
        // Unavailable provider must not prevent choosing a location manually.
      }
      if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value, expires: Date.now() + (value === fallback ? 10_000 : CACHE_TTL_MS) });
      return value;
    });
    this.pending.set(key, request);
    this.queue = request.then(() => undefined, () => undefined);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private configuredUrl(operation: 'search' | 'reverse') {
    const provider = this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase();
    if (provider !== 'NOMINATIM' && provider !== 'HTTP') return null;
    const value = this.config.get<string>('GEOCODING_API_URL')?.trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) return null;
      // Also accept legacy HTTP settings ending in /search, but never use it for reverse.
      const base = url.pathname.replace(/\/(search|reverse)\/?$/, '').replace(/\/$/, '');
      url.pathname = `${base}/${operation}`;
      return url;
    } catch {
      return null;
    }
  }
}
