import { Prisma } from '@prisma/client';

// Read equivalence only: these predicates never authorize a transition or an activation.
export const INSTALLATION_TYPE_FILTER = { in: ['Instalacion', 'Instalación'], mode: Prisma.QueryMode.insensitive };
export const COMPLETED_ORDER_FILTER = { equals: 'Completada', mode: Prisma.QueryMode.insensitive };
export const NON_TERMINAL_ORDER_FILTER = { notIn: ['Completada', 'Cerrada', 'Cancelada'], mode: Prisma.QueryMode.insensitive };

export function isInstallationType(value: unknown) {
  return typeof value === 'string' && ['instalacion', 'instalación'].includes(value.toLowerCase());
}
export function isCompletedWorkOrder(value: unknown) {
  return typeof value === 'string' && value.toLowerCase() === 'completada';
}

type OrderReference = { idOt: number; idEmpresa: number | null };
type EquipmentRow = OrderReference & { cierreEquipos: unknown };
const key = (row: OrderReference) => `${row.idEmpresa}:${row.idOt}`;

function declaredSerials(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const result: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const serial = (item as Record<string, unknown>).numero_serie;
    if (typeof serial !== 'string' || !serial.trim() || serial.length > 100) return null;
    result.push(serial);
  }
  return result;
}

export type DeclaredOrderEquipment = { instalados: string[] | null; retirados: string[] | null };

/** The canonical OT has cierre_equipos, intentionally not mapped by Prisma.
 * Project only that technical evidence for already company-authorized OT pairs.
 * Never read units, infer a service assignment, or use equipment as activation evidence.
 */
export async function readDeclaredOrderEquipment(prisma: Prisma.TransactionClient, orders: OrderReference[]) {
  const allowed = new Map(orders.filter(row => Number.isSafeInteger(row.idEmpresa) && row.idEmpresa! > 0
    && Number.isSafeInteger(row.idOt) && row.idOt > 0).map(row => [key(row), row]));
  const result = new Map<string, DeclaredOrderEquipment>();
  const refs = [...allowed.values()];
  for (let offset = 0; offset < refs.length; offset += 200) {
    const pairs = refs.slice(offset, offset + 200).map(row => Prisma.sql`(${row.idEmpresa}, ${row.idOt})`);
    const rows = await prisma.$queryRaw<EquipmentRow[]>`SELECT id_ot AS "idOt", id_empresa AS "idEmpresa",
      cierre_equipos AS "cierreEquipos" FROM public.orden_trabajo
      WHERE (id_empresa, id_ot) IN (${Prisma.join(pairs)})`;
    for (const row of rows) {
      if (!allowed.has(key(row)) || !row.cierreEquipos || typeof row.cierreEquipos !== 'object' || Array.isArray(row.cierreEquipos)) continue;
      const data = row.cierreEquipos as Record<string, unknown>;
      result.set(key(row), { instalados: declaredSerials(data.instalados), retirados: declaredSerials(data.retirados) });
    }
  }
  return result;
}

export function persistedOrderTechnicalData(row: OrderReference & {
  fechaCompletada?: Date | null; idTecnico?: number | null; idTecnicoExterno?: number | null;
  potenciaOpticaDbm?: unknown; resueltoRemotamente?: boolean | null;
}, equipment?: DeclaredOrderEquipment) {
  const power = row.potenciaOpticaDbm == null ? null : Number(row.potenciaOpticaDbm);
  return { fuente: 'OT_PERSISTIDA' as const, idOt: row.idOt, idEmpresa: row.idEmpresa,
    fechaCompletada: row.fechaCompletada && Number.isFinite(row.fechaCompletada.getTime()) ? row.fechaCompletada.toISOString() : null,
    idTecnicoRegistrado: row.idTecnico ?? null, idTecnicoExterno: row.idTecnicoExterno ?? null,
    potenciaOpticaDbm: power !== null && Number.isFinite(power) ? power : null,
    resueltoRemotamente: typeof row.resueltoRemotamente === 'boolean' ? row.resueltoRemotamente : null,
    equiposDeclarados: equipment ?? null, asignacionInventarioConfirmada: false as const };
}
