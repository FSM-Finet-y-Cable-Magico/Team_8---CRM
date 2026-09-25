import { GeoJsonPolygon } from './coverage-geometry';

export type CommercialZoneSummary = {
  idZonaPago: number;
  idEmpresa: number | null;
  nombreZona: string;
  tipoZona: string | null;
  idZonaPadre: number | null;
  poligonoGeojson: GeoJsonPolygon;
  activo: boolean | null;
  fechaInicio: Date | null;
  fechaFin: Date | null;
};

export type LocationPlan = {
  idPlan: number;
  nombre: string;
  tipo: string;
  velocidad: number | null;
  precioBase: number;
  precioAplicable: number;
  origenPrecio: 'MICROZONA' | 'ZONA_PADRE' | 'PLAN_BASE';
};

export type CommercialCoverageResult = {
  coberturaComercial: boolean;
  zona: CommercialZoneSummary | null;
  microzona: CommercialZoneSummary | null;
  planes: LocationPlan[];
};

export type TechnicalCoverageResult = {
  estado: 'FACTIBLE' | 'NO_FACTIBLE' | 'PENDIENTE';
  proveedor: 'G3' | 'LEGACY_TOMODAT' | 'NINGUNO';
  motivo: string;
  traceId: string;
  cajas?: Array<{
    id: number;
    nombre: string;
    latitud: number;
    longitud: number;
    puertosLibres: number;
  }>;
};

export interface CoverageProvider {
  check(idEmpresa: number, latitud: number, longitud: number, traceId: string): Promise<TechnicalCoverageResult>;
}

export type CoverageResult = CommercialCoverageResult & {
  estado: 'FACTIBLE' | 'NO_FACTIBLE' | 'PENDIENTE_VALIDACION_TECNICA';
  motivo: string;
  consultadoEn: string;
  ubicacion: { latitud: number; longitud: number };
  tecnica: TechnicalCoverageResult;
  cajas: NonNullable<TechnicalCoverageResult['cajas']>;
};

export type GeocodingCandidate = {
  etiqueta: string;
  latitud: number;
  longitud: number;
};

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodingCandidate[]>;
  reverseGeocode(latitud: number, longitud: number): Promise<string | null>;
}
