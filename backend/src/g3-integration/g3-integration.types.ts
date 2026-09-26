export const G3_INTEGRATION_CLIENT = Symbol('G3_INTEGRATION_CLIENT');

export const G3_WORK_ORDER_STATES = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_CURSO',
  'COMPLETADA',
  'CANCELADA',
  'PENDIENTE_CLIENTE_AUSENTE',
] as const;

export type G3WorkOrderState = (typeof G3_WORK_ORDER_STATES)[number];
export type G3PresentationState = G3WorkOrderState | 'EN_SEGUIMIENTO';

export type G3InstallationPayload = {
  request_id: string;
  trace_id: string;
  id_empresa: number;
  id_prospecto?: number;
  id_contrato: number;
  id_plan: number;
  rut: string;
  persona: {
    nombre_completo: string;
    telefono: string;
  };
  direccion: {
    direccion_completa: string;
    comuna: string;
  };
};

export type G3WorkOrderResponse = {
  id_ot?: string | number;
  codigo_ot?: string;
  tipo?: string;
  estado?: string;
  fecha?: string;
  tecnico?: unknown;
  direccion?: unknown;
  persona?: unknown;
  telefono?: string;
  resultado?: unknown;
  resultado_tecnico?: unknown;
  duplicado?: boolean;
  id_empresa?: number;
  request_id?: string;
  trace_id?: string;
  id_prospecto?: number;
  id_contrato?: number;
  id_plan?: number;
};

export type G3ClientResult<T> = {
  status: number;
  data: T;
  durationMs: number;
};

export interface G3IntegrationClient {
  configured(): boolean;
  createInstallation(payload: G3InstallationPayload): Promise<G3ClientResult<G3WorkOrderResponse>>;
  getWorkOrder(id: string): Promise<G3ClientResult<G3WorkOrderResponse>>;
  getWorkOrderClosure(id: string): Promise<G3ClientResult<G3WorkOrderResponse>>;
}

export class G3IntegrationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export type G3ClosureSource = 'WEBHOOK' | 'RECONCILIACION';

export type G3ClosurePayload = G3WorkOrderResponse & {
  estado: string;
};
