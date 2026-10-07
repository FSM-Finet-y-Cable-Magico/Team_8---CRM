import { ServiceUnavailableException } from '@nestjs/common';

export const ARCGIS_GEOCODING_URL = 'https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

export function arcgisCandidates(data: unknown) {
  const response = data as { error?: { code?: number }; candidates?: unknown[] } | null;
  if (response?.error) {
    throw new ServiceUnavailableException('El servicio de direcciones no aceptó la consulta. Revisa la configuración y los permisos de la credencial.');
  }
  if (!Array.isArray(response?.candidates)) throw new ServiceUnavailableException('El servicio de ubicación devolvió una respuesta inválida.');
  const text = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return response.candidates.slice(0, 5).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { score?: unknown; address?: unknown; location?: { x?: unknown; y?: unknown }; attributes?: Record<string, unknown> };
    const fields = candidate.attributes;
    // No se confirma un centro de calle ni una ubicación interpolada como domicilio exacto.
    if (!fields || !['PointAddress', 'Subaddress'].includes(text(fields.Addr_type)) || typeof candidate.score !== 'number' || !Number.isFinite(candidate.score) || candidate.score < 95 || candidate.score > 100) return [];
    return [{ display_name: text(candidate.address), lat: candidate.location?.y, lon: candidate.location?.x, address: {
      road: text(fields.StName), house_number: text(fields.AddNum), city: text(fields.City), city_district: text(fields.District),
      county: text(fields.Subregion), state: text(fields.Region), country_code: text(fields.Country).toUpperCase() === 'CHL' ? 'cl' : '',
    } }];
  });
}
