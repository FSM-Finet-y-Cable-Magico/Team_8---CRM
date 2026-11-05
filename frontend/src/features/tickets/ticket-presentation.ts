import type { Ticket } from '../../api';

export type TicketActivity = {
  kind: 'note' | 'status' | 'diagnosis';
  text: string;
  author?: string;
  date?: string;
};

// Older tickets keep their report and subsequent entries in the same field.
// Separate them for display without changing the stored content.
export function ticketContent(ticket: Ticket) {
  const source = (ticket.descripcion ?? '').replace(/\r\n/g, '\n');
  const marker = /^(?:\[Observacion tecnica - ([^\]\n]+)\]\n|Diagnostico tecnico:\n|Comentario: ?)/gm;
  const matches = [...source.matchAll(marker)];
  const activities: TicketActivity[] = matches.map((match, index) => {
    const text = source.slice(match.index! + match[0].length, matches[index + 1]?.index ?? source.length).trim();
    if (match[1]) {
      const [date, ...author] = match[1].split(' - ');
      const validDate = !Number.isNaN(Date.parse(date));
      return { kind: 'note', text, date: validDate ? date : undefined, author: validDate ? author.join(' - ') : match[1] };
    }
    return { kind: match[0].startsWith('Comentario:') ? 'status' : 'diagnosis', text };
  });

  for (const note of ticket.observacionesTecnicas ?? []) {
    if (matches.some(match => Boolean(match[1]))) break;
    if (activities.some(activity => activity.kind === 'note' && activity.text === note.texto.trim())) continue;
    const [date, ...author] = note.metadata.split(' - ');
    const validDate = !Number.isNaN(Date.parse(date));
    activities.push({ kind: 'note', text: note.texto, date: validDate ? date : undefined, author: validDate ? author.join(' - ') : note.metadata });
  }

  return { report: source.slice(0, matches[0]?.index ?? source.length).trim(), activities: activities.reverse() };
}

export const PENDING_ORDER_MESSAGE = 'La orden técnica está pendiente. Podrás resolver o cerrar el ticket cuando esté completada.';

export function ticketErrorMessage(message: string) {
  if (/OT asociada no consta completada/i.test(message)) return PENDING_ORDER_MESSAGE;
  if (/Transicion de estado invalida/i.test(message)) return 'El ticket ya avanzó a otro estado. Cierra esta ventana y vuelve a abrirlo para actualizar los datos.';
  if (/G[1238]\b|ratificaci[oó]n|payload|prisma|status code 5\d\d/i.test(message)) return 'No se pudo guardar el cambio. Inténtalo nuevamente.';
  return message;
}
