import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AddressInput, distinctLocations, matchesAddress, splitStreetAddress } from './geocoding-address';
import { GeocodingCandidate, GeocodingProvider } from './coverage.types';
import { arcgisCandidates } from './arcgis-geocoding';

type CacheEntry = { expires: number; candidates: GeocodingCandidate[] };

@Injectable()
export class GeocodingService implements GeocodingProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<GeocodingCandidate[]>>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<GeocodingCandidate[]> {
    const provider = this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase();
    if (!['HTTP', 'PHOTON', 'ARCGIS'].includes(provider ?? '')) return [];
    const url = this.configuredUrl();
    if (!url) throw new ServiceUnavailableException('El servicio de ubicación de direcciones no está configurado.');
    if (provider === 'ARCGIS') {
      const key = this.config.get<string>('GEOCODING_API_KEY')?.trim();
      if (!key) throw new ServiceUnavailableException('El servicio de direcciones requiere una credencial privada configurada en el servidor.');
      if (!['geocode-api.arcgis.com', 'geocode.arcgis.com'].includes(url.hostname) || !url.pathname.endsWith('/World/GeocodeServer/findAddressCandidates')) {
        throw new ServiceUnavailableException('Configura un endpoint de geocodificación oficial de ArcGIS antes de usar la credencial.');
      }
      url.searchParams.delete('token');
      url.searchParams.set('SingleLine', address.trim());
      url.searchParams.set('sourceCountry', 'CHL');
      url.searchParams.set('maxLocations', '5');
      url.searchParams.set('outFields', 'Addr_type,AddNum,StName,City,District,Subregion,Region,Country');
      url.searchParams.set('outSR', '4326');
      url.searchParams.set('locationType', 'rooftop');
      url.searchParams.set('matchOutOfRange', 'false');
      url.searchParams.set('forStorage', 'true');
      url.searchParams.set('f', 'json');
      return this.forwardRequest(url, false, key);
    }
    url.searchParams.set('q', address.trim());
    url.searchParams.set('limit', '5');
    if (provider === 'PHOTON') url.searchParams.set('countrycode', 'CL');
    else {
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('countrycodes', 'cl');
    }
    return this.forwardRequest(url, provider === 'PHOTON');
  }

  private async forwardRequest(url: URL, photon: boolean, arcgisKey?: string): Promise<GeocodingCandidate[]> {
    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.candidates;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.queue.catch(() => undefined).then(async () => {
      const delay = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      this.lastRequestAt = Date.now();
      const data = await this.request(url, arcgisKey);
      const candidates = this.parseCandidates(arcgisKey ? arcgisCandidates(data) : data, photon);
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { candidates, expires: Date.now() + (candidates.length ? 86400000 : 60000) });
      return candidates;
    });
    this.queue = request;
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }

  async resolveAddress(input: AddressInput) {
    const street = splitStreetAddress(input.direccion);
    if (!street || !input.comuna?.trim()) {
      throw new BadRequestException('Ingresa una dirección válida con calle, número y comuna.');
    }
    const query = [input.direccion.trim(), input.comuna.trim(), input.region?.trim(), 'Chile'].filter(Boolean).join(', ');
    let results: GeocodingCandidate[] = [];
    if (this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase() === 'PHOTON') {
      const url = this.configuredUrl();
      if (!url) throw new ServiceUnavailableException('El servicio de ubicación de direcciones no está configurado.');
      url.pathname = url.pathname.replace(/\/api\/?$/, '/structured');
      url.searchParams.set('street', street.calle);
      url.searchParams.set('housenumber', street.numero);
      url.searchParams.set('city', input.comuna.trim());
      if (input.region?.trim()) url.searchParams.set('state', input.region.trim());
      url.searchParams.set('countrycode', 'CL');
      url.searchParams.set('limit', '5');
      results = await this.forwardRequest(url, true);
    }
    let candidates = distinctLocations(results.filter(candidate => matchesAddress(candidate, input)));
    if (!candidates.length) {
      results = await this.geocode(query);
      candidates = distinctLocations(results.filter(candidate => matchesAddress(candidate, input)));
    }
    if (!candidates.length) throw new BadRequestException('El servicio de mapas no pudo confirmar la ubicación exacta. La dirección puede existir aunque no esté registrada allí.');
    if (candidates.length > 1) throw new BadRequestException('La dirección coincide con varios lugares. Completa o corrige la comuna y la región.');
    return candidates[0];
  }

  async reverseGeocode(latitud: number, longitud: number): Promise<string | null> {
    const provider = this.config.get<string>('GEOCODING_PROVIDER')?.trim().toUpperCase();
    if (!['HTTP', 'PHOTON'].includes(provider ?? '')) return null;
    const url = this.configuredUrl();
    if (!url) return null;
    if (provider === 'PHOTON') url.pathname = url.pathname.replace(/\/api\/?$/, '/reverse');
    url.searchParams.set('lat', String(latitud));
    url.searchParams.set('lon', String(longitud));
    url.searchParams.set('format', 'json');
    try {
      const data = await this.request(url);
      if (provider === 'PHOTON') return this.parseCandidates(data, true)[0]?.etiqueta ?? null;
      return data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).display_name === 'string'
        ? String((data as Record<string, unknown>).display_name).slice(0, 300) : null;
    } catch { return null; }
  }

  private async request(url: URL, arcgisKey?: string): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'FiNetCRM/0.1 (+https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM)',
          ...(arcgisKey ? { 'X-Esri-Authorization': `Bearer ${arcgisKey}` } : {}),
        },
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!response.ok) throw new Error('GEOCODING_UNAVAILABLE');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('No se pudo consultar la dirección en este momento. Intenta nuevamente.');
    }
  }

  private parseCandidates(data: unknown, photon: boolean): GeocodingCandidate[] {
    const features = data && typeof data === 'object' ? (data as Record<string, unknown>).features : null;
    const entries = photon ? features : data;
    if (!Array.isArray(entries)) throw new ServiceUnavailableException('El servicio de ubicación devolvió una respuesta inválida.');
    return entries.slice(0, 5).flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const geometry = record.geometry as { type?: string; coordinates?: unknown[] } | undefined;
      const properties = (photon ? record.properties : record.address) as Record<string, unknown> | undefined;
      const rawLat = photon ? geometry?.coordinates?.[1] : record.lat;
      const rawLng = photon ? geometry?.coordinates?.[0] : record.lon;
      if (rawLat === null || rawLat === undefined || rawLat === '' || rawLng === null || rawLng === undefined || rawLng === '') return [];
      if (!['number', 'string'].includes(typeof rawLat) || !['number', 'string'].includes(typeof rawLng)) return [];
      const latitud = Number(rawLat), longitud = Number(rawLng);
      if (photon && geometry?.type !== 'Point') return [];
      if (!Number.isFinite(latitud) || Math.abs(latitud) > 90 || !Number.isFinite(longitud) || Math.abs(longitud) > 180) return [];
      const text = (value: unknown) => typeof value === 'string' ? value : '';
      const calle = text(properties?.street ?? properties?.road ?? (photon ? properties?.name : undefined));
      const numero = text(properties?.housenumber ?? properties?.house_number);
      const localidades = ['city', 'district', 'county', 'locality', 'town', 'village', 'municipality', 'suburb', 'city_district']
        .map(key => text(properties?.[key])).filter(Boolean);
      const region = text(properties?.state), pais = text(properties?.countrycode ?? properties?.country_code);
      const etiqueta = photon ? [calle, numero, ...new Set(localidades), region, 'Chile'].filter(Boolean).join(', ') : String(record.display_name ?? 'Dirección');
      return [{ etiqueta: etiqueta.slice(0, 300), latitud, longitud,
        ...(properties ? { direccion: { calle, numero, localidades, region, pais } } : {}),
      }];
    });
  }

  private configuredUrl() {
    const value = this.config.get<string>('GEOCODING_API_URL')?.trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url : null;
    } catch { return null; }
  }
}
