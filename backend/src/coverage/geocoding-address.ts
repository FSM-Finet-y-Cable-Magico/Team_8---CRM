import { GeocodingCandidate } from './coverage.types';

export type AddressInput = { direccion: string; comuna?: string; region?: string };

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function streetName(value: string) {
  return normalized(value).replace(/^(avenida|av|calle|pasaje|pje|camino)\s+/, '');
}

export function splitStreetAddress(value: string) {
  const line = value.split(',')[0].replace(/\b(?:nro|numero|nº|n°)\.?\s*/gi, '').replace(/#/g, '').trim();
  const matches = [...line.matchAll(/\b\d+[a-z]?\b/gi)];
  const number = matches[matches.length - 1];
  if (!number || number.index === undefined) return null;
  const calle = `${line.slice(0, number.index)} ${line.slice(number.index + number[0].length)}`.trim();
  if (streetName(calle).length < 3) return null;
  return { calle, numero: number[0] };
}

export function matchesAddress(candidate: GeocodingCandidate, input: AddressInput) {
  const requested = splitStreetAddress(input.direccion);
  const found = candidate.direccion;
  if (!requested || !found || found.pais.toLowerCase() !== 'cl') return false;
  if (normalized(found.numero) !== normalized(requested.numero) || streetName(found.calle) !== streetName(requested.calle)) return false;
  const comuna = normalized(input.comuna ?? '');
  if (!comuna || !found.localidades.some(value => normalized(value) === comuna)) return false;
  const region = (value: string) => normalized(value).replace(/\b(region|de|del|la|el)\b/g, '').replace(/\s+/g, ' ').trim();
  const expectedRegion = region(input.region ?? '');
  return !expectedRegion || Boolean(found.region && (region(found.region) === expectedRegion || region(found.region).startsWith(`${expectedRegion} `)));
}

export function distinctLocations(candidates: GeocodingCandidate[]) {
  const unique: GeocodingCandidate[] = [];
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const distance = (a: GeocodingCandidate, b: GeocodingCandidate) => {
    const lat = radians(b.latitud - a.latitud), lng = radians(b.longitud - a.longitud);
    const arc = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitud)) * Math.cos(radians(b.latitud)) * Math.sin(lng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
  };
  // El mismo domicilio puede figurar como edificio, entrada y punto de interés.
  for (const candidate of candidates) {
    if (!unique.some(existing => distance(candidate, existing) <= 35)) unique.push(candidate);
  }
  return unique;
}
