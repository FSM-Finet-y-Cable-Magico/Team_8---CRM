import { IntegracionInstalacionG3 } from '@prisma/client';
import { isISO8601 } from 'class-validator';

export type HistoricalClosureData = {
  fechaCompletada: string | null;
  idTecnicoG3: number | null;
  potenciaOpticaDbm: number | null;
  resultadoLlamada: string | null;
  resueltoRemotamente: boolean | null;
  cantidadMateriales: number | null;
  cantidadEquiposInformados: number | null;
};

export type HistoricalClosureView = {
  fuente: 'G3_CONSULTA_TEMPORAL';
  persistido: false;
  consultadoEn: string;
  estadoConsulta: 'DISPONIBLE' | 'NO_DISPONIBLE' | 'NO_VALIDADO';
  mensaje: string;
  datos: HistoricalClosureData | null;
};

export function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

// Only the OT identifier supports string form in the existing G3 response contract.
export function numericWorkOrderId(value: unknown): number | null {
  if (positiveId(value)) return value;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  return positiveId(Number(value)) ? Number(value) : null;
}

export function historicalClosureData(raw: unknown, tracking: IntegracionInstalacionG3): HistoricalClosureData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const ids = [
    [data.id_empresa, tracking.idEmpresa],
    [data.id_contrato, tracking.idContrato],
    [data.id_prospecto, tracking.idProspecto],
    [data.id_plan, tracking.idPlan],
  ];
  if (ids.some(([received, expected]) => !positiveId(received) || !positiveId(expected) || received !== expected)
    || numericWorkOrderId(data.id_ot) === null
    || numericWorkOrderId(data.id_ot) !== numericWorkOrderId(tracking.idOtG3)
    || !tracking.requestId || data.request_id !== tracking.requestId
    || !tracking.traceId || data.trace_id !== tracking.traceId
    // A closure may omit estado; if supplied it must confirm completion.
    || (data.estado !== undefined && data.estado !== 'COMPLETADA')) return null;

  return {
    fechaCompletada: typeof data.fecha_completada === 'string'
      && isISO8601(data.fecha_completada, { strict: true, strictSeparator: true })
      && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.fecha_completada)
      ? new Date(data.fecha_completada).toISOString() : null,
    idTecnicoG3: positiveId(data.id_tecnico) ? data.id_tecnico : null,
    potenciaOpticaDbm: typeof data.potencia_optica_dbm === 'number' && Number.isFinite(data.potencia_optica_dbm)
      ? data.potencia_optica_dbm : null,
    resultadoLlamada: typeof data.resultado_llamada === 'string'
      && data.resultado_llamada.trim().length > 0 && data.resultado_llamada.length <= 200
      && !/[\u0000-\u001f\u007f]/.test(data.resultado_llamada) ? data.resultado_llamada.trim() : null,
    resueltoRemotamente: typeof data.resuelto_remotamente === 'boolean' ? data.resuelto_remotamente : null,
    cantidadMateriales: Array.isArray(data.materiales) ? data.materiales.length : null,
    // Counts describe the closure only. Physical inventory remains exclusively G1's responsibility.
    cantidadEquiposInformados: Array.isArray(data.equipos_instalados) ? data.equipos_instalados.length : null,
  };
}
