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

type CategoryRow = {
  idCategoria: number;
  nombre: string;
  slaHoras: number | null;
  tipo: string | null;
  tipoDisponible: boolean;
};

export function isGeneralTicketCategory(category: Pick<CategoryRow, 'nombre' | 'tipo' | 'tipoDisponible'>) {
  if (['cambio_credenciales_wifi', 'asistente virtual'].includes(category.nombre.toLowerCase())) return false;
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
  const names = new Map(TICKET_ATTENTION_NAMES.map(name => [name.toLowerCase(), name]));
  const counts = new Map<string, number>();
  for (const category of categories) {
    const key = category.nombre.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return categories.map(category => {
    const key = category.nombre.toLowerCase();
    // No escoger arbitrariamente un ID si hay nombres equivalentes duplicados.
    const permitsAttention = category.tipo === 'ATENCION' || (category.tipoDisponible === false && category.tipo === null);
    const nombreAtencion = permitsAttention && counts.get(key) === 1 ? names.get(key) ?? null : null;
    return { ...category, nombreAtencion };
  });
}
