import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isCompletedWorkOrder, isInstallationType } from '../common/work-order-read';

type Contract = { idContrato: number; idEmpresa: number | null; idCliente: number | null };
type Service = {
  idServicio: number; idEmpresa: number | null; idContrato: number | null; idCliente: number;
  contrato: Contract | null; datosTecnicos: unknown;
};
export type LocalInstallation = {
  tipoOt: string; estado: string;
  idOt: number; idEmpresa: number | null; idServicio: number | null; idCliente: number | null;
  fechaCompletada: Date | null; servicio: Service | null;
};
export type G3Installation = {
  idEmpresa: number; idOtG3: string | null; idContrato: number; idServicio: number | null;
  idCliente: number | null; contrato: Contract; servicio: Service | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function orderId(value: unknown): string | null {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return text;
}

// A date-only value is a calendar date. An instant must carry its original offset;
// never interpret an unqualified timestamp using the host's timezone.
function technicalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDateOnly(value) ? value : null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !parseDateOnly(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) return null;
  return todayDateOnly(new Date(value));
}

function serviceConsistent(service: Service, company: number, customer: number | null) {
  return service.idEmpresa === company && service.idCliente === customer
    && service.contrato?.idContrato === service.idContrato
    && service.contrato?.idEmpresa === company && service.contrato?.idCliente === customer;
}

/** Read-only CU47 projection. Identity is company + physical OT, never customer/RUT.
 * A local row and a G3 tracking describe the same OT only when their service/customer
 * references also agree. Ambiguities are visible as review work, not silently summed.
 */
export function installationMetrics(local: LocalInstallation[], g3: G3Installation[], month: string, today: string) {
  type Evidence = { source: 'LOCAL' | 'G3'; service: number | null; customer: number | null; contract: number | null; date: string | null; invalid: boolean };
  const orders = new Map<string, Evidence[]>();
  let unidentified = 0;
  const add = (company: number | null, id: unknown, row: Evidence) => {
    const ot = orderId(id);
    if (!company || !ot) { unidentified += 1; return; }
    const key = `${company}:${ot}`;
    orders.set(key, [...(orders.get(key) ?? []), row]);
  };
  for (const row of local) {
    // A pending mirror may validate references of an already confirmed tracking;
    // it must never become independent evidence of a completed installation.
    if (!isInstallationType(row.tipoOt) || (!isCompletedWorkOrder(row.estado)
      && !g3.some(remote => remote.idEmpresa === row.idEmpresa && orderId(remote.idOtG3) === orderId(row.idOt)))) continue;
    const invalid = row.idServicio !== (row.servicio?.idServicio ?? null)
      || Boolean(row.servicio && !serviceConsistent(row.servicio, row.idEmpresa!, row.idCliente));
    const date = row.fechaCompletada && Number.isFinite(row.fechaCompletada.getTime())
      ? todayDateOnly(row.fechaCompletada) : null;
    add(row.idEmpresa, row.idOt, { source: 'LOCAL', service: row.idServicio, customer: row.idCliente,
      contract: row.servicio?.idContrato ?? null, date, invalid });
  }
  for (const row of g3) {
    const data = object(row.servicio?.datosTecnicos);
    const result = object(data?.resultadoInstalacion);
    const metadataMatches = data?.fuenteInstalacion === 'G3' && orderId(data.idOtG3) === orderId(row.idOtG3);
    const candidates = metadataMatches ? [data?.fechaCompletadaG3, result?.fecha_completada].filter(v => v != null) : [];
    const dates = candidates.map(technicalDate);
    const knownDates = new Set(dates.filter((v): v is string => v !== null));
    const invalid = !row.servicio || row.servicio.idServicio !== row.idServicio
      || !serviceConsistent(row.servicio, row.idEmpresa, row.idCliente)
      || row.servicio.idContrato !== row.idContrato || row.contrato.idContrato !== row.idContrato
      || row.contrato.idEmpresa !== row.idEmpresa || row.contrato.idCliente !== row.idCliente
      || Boolean(data?.idOtG3 != null && !metadataMatches) || knownDates.size > 1;
    // Missing, invalid or timezone-less dates stay unclassified, never use processedAt.
    const date = dates.length && dates.every(Boolean) && knownDates.size === 1 ? [...knownDates][0] : null;
    add(row.idEmpresa, row.idOtG3, { source: 'G3', service: row.idServicio, customer: row.idCliente,
      contract: row.idContrato, date, invalid });
  }
  let monthly = 0, withoutDate = 0, review = unidentified;
  for (const rows of orders.values()) {
    const inconsistent = (field: 'service' | 'customer' | 'contract') =>
      new Set(rows.map(r => r[field]).filter(v => v != null)).size > 1;
    if (rows.some(r => r.invalid) || inconsistent('service') || inconsistent('customer') || inconsistent('contract')) {
      review += 1; continue;
    }
    // G3 is authoritative even when the mirrored local OT carries a processing date.
    const authoritative = rows.some(r => r.source === 'G3') ? rows.filter(r => r.source === 'G3') : rows;
    const dates = new Set(authoritative.map(r => r.date).filter((v): v is string => v !== null));
    if (dates.size > 1) { review += 1; continue; }
    const date = [...dates][0];
    if (!date) { withoutDate += 1; continue; }
    if (date > today) { review += 1; continue; }
    if (date.slice(0, 7) === month) monthly += 1;
  }
  return { instalacionesMensuales: monthly, instalacionesSinFechaTecnica: withoutDate,
    instalacionesRequierenRevision: review };
}
