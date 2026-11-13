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

/** Why an address lookup returned what it did; lets users and operators tell configuration, outage and no-match apart. */
export type GeocodingOutcome = 'OK' | 'DIRECCION_VACIA' | 'PROVEEDOR_DESHABILITADO' | 'CONFIGURACION_INVALIDA'
  | 'PROVEEDOR_NO_DISPONIBLE' | 'SIN_RESULTADOS';

export type GeocodingLookup = { candidatos: GeocodingCandidate[]; motivo: GeocodingOutcome };

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodingCandidate[]>;
  lookup(address: string): Promise<GeocodingLookup>;
  reverseGeocode(latitud: number, longitud: number): Promise<string | null>;
}
