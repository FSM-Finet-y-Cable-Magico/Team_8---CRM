// La prioridad convive en varios vocabularios sobre la misma tabla: G8 escribe
// "Alta/Media/Baja", G3 "CRITICA/ALTA/MEDIA/BAJA" y G2 "MEDIA". Ordenar el texto
// alfabéticamente pondría "Baja" antes que "Media" y "CRITICA" entre ambas.
const URGENCY: Record<string, number> = { critica: 0, urgente: 0, alta: 1, media: 2, baja: 3 };
const UNKNOWN = 4;

export function ticketPriorityRank(prioridad: string | null | undefined) {
  const key = (prioridad ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  return URGENCY[key] ?? UNKNOWN;
}

const time = (value: unknown) => (value ? new Date(value as string | number | Date).getTime() || 0 : 0);

/** Más urgente primero; a igual urgencia, el más reciente. Los valores históricos o ajenos van al final. */
export function compareTicketsByUrgency(
  a: { idTicket: number; prioridad: string | null; fechaCreacion: Date | string | null },
  b: { idTicket: number; prioridad: string | null; fechaCreacion: Date | string | null },
) {
  return ticketPriorityRank(a.prioridad) - ticketPriorityRank(b.prioridad)
    || time(b.fechaCreacion) - time(a.fechaCreacion)
    || b.idTicket - a.idTicket;
}
