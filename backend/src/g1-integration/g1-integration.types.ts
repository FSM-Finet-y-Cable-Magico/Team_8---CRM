export const G1_INVENTORY_CLIENT = Symbol('G1_INVENTORY_CLIENT');

export const G1_PHYSICAL_STATES = [
  'En bodega',
  'Asignado a técnico',
  'Instalado en cliente',
  'En revisión',
  'En préstamo externo',
  'Dado de baja',
] as const;

export type G1PhysicalState = (typeof G1_PHYSICAL_STATES)[number];

export type G1EquipmentType = {
  id_tipo_equipo: number;
  id_empresa: number;
  nombre: string;
  categoria?: string | null;
  marca?: string | null;
  modelo?: string | null;
  descripcion_tecnica?: string | null;
  unidad_medida?: string | null;
  garantia_dias?: number | null;
  requiere_serie_individual?: boolean | null;
  activo?: boolean | null;
  [key: string]: unknown;
};

export type G1PhysicalWarranty = {
  fecha_vencimiento?: string | null;
  vigente?: boolean | null;
  [key: string]: unknown;
};

export type G1Unit = {
  id_unidad?: number;
  numero_serie: string;
  id_empresa: number;
  id_tipo_equipo?: number | null;
  tipo_equipo?: G1EquipmentType | string | null;
  mac_address?: string | null;
  estado: string;
  id_bodega_actual?: number | null;
  fecha_adquisicion?: string | null;
  garantia?: G1PhysicalWarranty | null;
  asignacion_actual?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type G1ServiceEquipment = G1Unit & {
  fecha_instalacion?: string | null;
  id_ot?: number | string | null;
};

export type G1ActivationPayload = {
  event_id: string;
  trace_id: string;
  id_empresa: number;
  id_ot: number | string;
  id_cliente: number;
  rut_cliente: string;
  id_servicio: number;
  id_contrato: number;
  equipos: Array<{ numero_serie: string }>;
};

export type G1Envelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type G1ClientResult<T> = {
  status: number;
  data: T;
  durationMs: number;
};

export interface G1InventoryClient {
  configured(): boolean;
  getEquipmentTypes(input: {
    idEmpresa: number;
    categoria?: string;
    buscar?: string;
    activo?: boolean;
  }): Promise<G1ClientResult<G1EquipmentType[]>>;
  getUnitBySerial(serial: string, idEmpresa: number): Promise<G1ClientResult<G1Unit>>;
  sendActivation(payload: G1ActivationPayload): Promise<G1ClientResult<Record<string, unknown>>>;
  getEquipmentByService(idServicio: number, idEmpresa: number): Promise<G1ClientResult<G1ServiceEquipment[]>>;
}

export class G1IntegrationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export function isOfficialG1PhysicalState(value: unknown): value is G1PhysicalState {
  return typeof value === 'string' && G1_PHYSICAL_STATES.includes(value as G1PhysicalState);
}
