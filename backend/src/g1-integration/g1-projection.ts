import { isOfficialG1PhysicalState } from './g1-integration.types';

/**
 * Explicit output contracts of G8 for G1 inventory data. Only fields approved by the G1 contract and used by the
 * UI cross to the browser; nested objects (tipo_equipo, garantia, asignacion_actual) are projected field by field, so
 * an extra property sent by G1 (internal data, new columns) never reaches the frontend. No `{...unknown}` here.
 * Shapes verified against G1 main 2131b7f5 (IntegracionesService: consultarTiposEquipo, consultarUnidadPorSerie,
 * consultarEquiposPorServicio).
 */

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : null);
const text = (value: unknown, max = 200): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const id = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null);
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const flag = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
/** G1 serializes dates as YYYY-MM-DD or ISO timestamps; anything else is dropped. */
const date = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim()) ? value.trim() : null;
};
/** An OT reference may be numeric or a G3 code. */
const reference = (value: unknown): number | string | null => id(value) ?? text(value, 60);

export type G1EquipmentTypeOut = {
  id_tipo_equipo: number; id_empresa: number; nombre: string; categoria: string | null; marca: string | null; modelo: string | null;
  descripcion_tecnica: string | null; unidad_medida: string | null; garantia_dias: number | null; requiere_serie_individual: boolean | null; activo: boolean | null;
};

export function projectEquipmentType(raw: unknown, idEmpresa: number): G1EquipmentTypeOut | null {
  const row = object(raw);
  const idTipo = id(row?.id_tipo_equipo);
  const nombre = text(row?.nombre);
  if (!row || !idTipo || !nombre) return null;
  return {
    id_tipo_equipo: idTipo, id_empresa: idEmpresa, nombre, categoria: text(row.categoria, 60), marca: text(row.marca, 100), modelo: text(row.modelo, 100),
    descripcion_tecnica: text(row.descripcion_tecnica, 1000), unidad_medida: text(row.unidad_medida, 40), garantia_dias: count(row.garantia_dias),
    requiere_serie_individual: flag(row.requiere_serie_individual), activo: flag(row.activo),
  };
}

type UnitTypeOut = { id_tipo_equipo: number | null; nombre: string | null; categoria: string | null; marca: string | null; modelo: string | null };
/** Nested tipo_equipo: G1 sends an object; a legacy string label is kept as text. */
function projectUnitType(value: unknown): UnitTypeOut | string | null {
  if (typeof value === 'string') return text(value);
  const row = object(value);
  if (!row) return null;
  return { id_tipo_equipo: id(row.id_tipo_equipo), nombre: text(row.nombre), categoria: text(row.categoria, 60), marca: text(row.marca, 100), modelo: text(row.modelo, 100) };
}

/**
 * Nested asignacion_actual. G1 names the G8 references id_cliente_externo / id_servicio_externo / id_contrato_externo;
 * G8 exposes them as id_cliente / id_servicio / id_contrato (the UI contract). null = no active assignment;
 * absent stays absent (G1 did not report it).
 */
function projectAssignment(value: unknown) {
  if (value === undefined) return undefined;
  const row = object(value);
  if (!row) return null;
  return {
    id_cliente: id(row.id_cliente_externo ?? row.id_cliente),
    id_servicio: id(row.id_servicio_externo ?? row.id_servicio),
    id_contrato: id(row.id_contrato_externo ?? row.id_contrato),
    id_ot: reference(row.id_ot),
  };
}

function projectWarranty(value: unknown) {
  if (value === undefined) return undefined;
  const row = object(value);
  if (!row) return null;
  return { fecha_vencimiento: date(row.fecha_vencimiento), vigente: flag(row.vigente) };
}

export type G1UnitOut = ReturnType<typeof projectUnit>;

/** Physical unit (by serial or associated to a service). Company is already verified by the caller. */
export function projectUnit(raw: Raw, idEmpresa: number) {
  const estado = text(raw.estado, 60);
  const out: Record<string, unknown> = {
    id_unidad: id(raw.id_unidad),
    numero_serie: text(raw.numero_serie, 100),
    id_empresa: idEmpresa,
    id_tipo_equipo: id(raw.id_tipo_equipo) ?? (object(raw.tipo_equipo) ? id((raw.tipo_equipo as Raw).id_tipo_equipo) : null),
    tipo_equipo: projectUnitType(raw.tipo_equipo),
    mac_address: text(raw.mac_address, 40),
    estado,
    estadoFisicoOficial: isOfficialG1PhysicalState(estado ?? ''),
    id_bodega_actual: id(raw.id_bodega_actual),
    fecha_adquisicion: date(raw.fecha_adquisicion),
    fecha_instalacion: date(raw.fecha_instalacion),
    id_ot: reference(raw.id_ot),
  };
  const garantia = projectWarranty(raw.garantia);
  if (garantia !== undefined) out.garantia = garantia;
  const asignacion = projectAssignment(raw.asignacion_actual);
  if (asignacion !== undefined) out.asignacion_actual = asignacion;
  return out as {
    id_unidad: number | null; numero_serie: string | null; id_empresa: number; id_tipo_equipo: number | null; tipo_equipo: UnitTypeOut | string | null;
    mac_address: string | null; estado: string | null; estadoFisicoOficial: boolean; id_bodega_actual: number | null; fecha_adquisicion: string | null;
    fecha_instalacion: string | null; id_ot: number | string | null;
    garantia?: { fecha_vencimiento: string | null; vigente: boolean | null } | null;
    asignacion_actual?: { id_cliente: number | null; id_servicio: number | null; id_contrato: number | null; id_ot: number | string | null } | null;
  };
}
