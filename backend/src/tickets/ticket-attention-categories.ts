import { Prisma } from '@prisma/client';

// Documento 0, Tabla 11.9: contrato de atención G8/G2. Los IDs y SLA
// pertenecen exclusivamente a categoria_falla, incluidos los registros técnicos G3.
export const TICKET_ATTENTION_NAMES = [
  'Falla de Internet',
  'Falla de TV',
  'Cambio de plan',
  'Mudanza',
  'Facturación y cobro',
  'Consulta general',
  'Baja de servicio',
] as const;

/**
 * G8-only attention category (FINET 13-11-2026): the customer's voluntary termination, started from Tickets. It is NOT
 * part of the G2/G8 contract of seven categories above and it is NOT «Baja de servicio» (never renamed nor its ID
 * reused). It exists only after the authorized additive insertion in categoria_falla (db/proposals/); until then the
 * option is simply not offered.
 */
export const G8_TICKET_ATTENTION_NAMES = ['Término de servicio'] as const;

type CategoryRow = {
  idCategoria: number;
  nombre: string;
  slaHoras: number | null;
  tipo: string | null;
  tipoDisponible: boolean;
};

// Only formatting equivalence and the Consulta alias ratified in C2-TK-01.
// Do not remove accents, translate technical names or rewrite persisted rows.
export function ticketCategoryNameKey(name: string) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function officialTicketAttentionName(name: string) {
  const key = ticketCategoryNameKey(name);
  if (key === 'consulta') return 'Consulta general';
  return [...TICKET_ATTENTION_NAMES, ...G8_TICKET_ATTENTION_NAMES].find(official => ticketCategoryNameKey(official) === key) ?? null;
}

export function isGeneralTicketCategory(category: Pick<CategoryRow, 'nombre' | 'tipo' | 'tipoDisponible'>) {
  if (['cambio_credenciales_wifi', 'asistente virtual'].includes(ticketCategoryNameKey(category.nombre))) return false;
  return category.tipo === 'ATENCION' || category.tipo === 'TECNICA'
    || (category.tipoDisponible === false && category.tipo === null);
}

export async function readTicketCategoryCatalog(prisma: Pick<Prisma.TransactionClient, '$queryRaw'>) {
  // tipo existe en global, pero no en todas las bases locales. La proyección
  // JSON no referencia una columna ausente ni exige cambiar el modelo Prisma.
  // No capturar errores como si probaran que la clasificación no existe.
  const categories = await prisma.$queryRaw<CategoryRow[]>`
    SELECT c.id_categoria AS "idCategoria", c.nombre, c.sla_horas AS "slaHoras",
      to_jsonb(c) ? 'tipo' AS "tipoDisponible", to_jsonb(c)->>'tipo' AS tipo
    FROM public.categoria_falla AS c ORDER BY c.id_categoria`;
  return ticketAttentionCatalog(categories);
}

export function ticketAttentionCatalog<T extends { idCategoria: number; nombre: string; tipo: string | null; tipoDisponible: boolean }>(categories: readonly T[]) {
  const counts = new Map<string, number>();
  const idCounts = new Map<number, number>();
  for (const category of categories) {
    const key = officialTicketAttentionName(category.nombre) ?? ticketCategoryNameKey(category.nombre);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    idCounts.set(category.idCategoria, (idCounts.get(category.idCategoria) ?? 0) + 1);
  }
  return categories.map(category => {
    const official = officialTicketAttentionName(category.nombre);
    const key = official ?? ticketCategoryNameKey(category.nombre);
    // No escoger arbitrariamente un ID si hay nombres equivalentes duplicados.
    const permitsAttention = category.tipo === 'ATENCION' || (category.tipoDisponible === false && category.tipo === null);
    const validId = Number.isInteger(category.idCategoria) && category.idCategoria > 0 && category.idCategoria <= 2147483647;
    const nombreAtencion = permitsAttention && validId && idCounts.get(category.idCategoria) === 1 && counts.get(key) === 1 ? official : null;
    return { ...category, nombreAtencion };
  });
}
