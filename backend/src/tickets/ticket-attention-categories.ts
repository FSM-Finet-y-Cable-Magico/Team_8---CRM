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

export function ticketAttentionCatalog<T extends { idCategoria: number; nombre: string }>(categories: readonly T[]) {
  const names = new Map(TICKET_ATTENTION_NAMES.map(name => [name.toLowerCase(), name]));
  const counts = new Map<string, number>();
  for (const category of categories) {
    const key = category.nombre.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return categories.map(category => {
    const key = category.nombre.toLowerCase();
    // No escoger arbitrariamente un ID si hay nombres equivalentes duplicados.
    const nombreAtencion = counts.get(key) === 1 ? names.get(key) ?? null : null;
    return { ...category, nombreAtencion };
  });
}
