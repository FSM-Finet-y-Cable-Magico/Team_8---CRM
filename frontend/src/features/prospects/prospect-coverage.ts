import type { Prospect } from '../../api';

export type ProspectLocation = { latitud: number; longitud: number };
export type CommercialCoverage = {
  coberturaComercial: boolean;
  zona: { nombreZona: string; poligonoGeojson: { type: 'Polygon'; coordinates: number[][][] } } | null;
  microzona: { nombreZona: string; poligonoGeojson: { type: 'Polygon'; coordinates: number[][][] } } | null;
  planes: Array<{ idPlan: number }>;
};

export function validLocation(value: unknown): ProspectLocation | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Partial<ProspectLocation>;
  if (typeof point.latitud !== 'number' || typeof point.longitud !== 'number'
    || !Number.isFinite(point.latitud) || !Number.isFinite(point.longitud)
    || Math.abs(point.latitud) > 90 || Math.abs(point.longitud) > 180) return null;
  return { latitud: point.latitud, longitud: point.longitud };
}

// Ambiguous addresses must not silently assign coverage to an arbitrary result.
export function uniqueAddressLocation(candidates: unknown): ProspectLocation | null {
  if (!Array.isArray(candidates)) return null;
  const points = new Map<string, ProspectLocation>();
  for (const candidate of candidates) {
    const point = validLocation(candidate);
    if (point) points.set(`${point.latitud.toFixed(6)},${point.longitud.toFixed(6)}`, point);
  }
  return points.size === 1 ? [...points.values()][0] : null;
}

export function prospectNeedsReview(prospect: Pick<Prospect, 'estadoPipeline' | 'idCliente'>) {
  return prospect.estadoPipeline === 'Servicio Activo' && !prospect.idCliente;
}

export function prospectStageLabel(prospect: Pick<Prospect, 'estadoPipeline' | 'idCliente'>) {
  if (prospectNeedsReview(prospect)) return 'Registro histórico';
  if (prospect.estadoPipeline === 'Instalacion en G3') return 'Instalación solicitada';
  return prospect.estadoPipeline ?? 'Prospecto Nuevo';
}

export function registeredCoverage(prospect: Pick<Prospect, 'latitud' | 'longitud' | 'estadoPipeline'>) {
  if (!validLocation(prospect)) return 'pending';
  if (prospect.estadoPipeline === 'No Factible') return 'outside';
  if (['Factible', 'Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma',
    'Pendiente activacion', 'Aceptado', 'Instalacion Programada', 'Instalacion en G3', 'Servicio Activo']
    .includes(prospect.estadoPipeline ?? '')) return 'covered';
  return 'pending';
}
