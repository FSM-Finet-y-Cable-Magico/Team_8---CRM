import type { Ticket, TicketCategory } from '../../api';

const searchText = (value: string | number | null | undefined) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').replace(/[_#]/g, ' ').trim();
const compactSearchText = (value: string) => value.replace(/[^a-z0-9]/g, '');

export function ticketMatchesSearch(ticket: Ticket, query: string) {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const fields = [
    ticket.idTicket, ticket.codigoSeguimiento, ticket.descripcion, ticket.idServicio,
    ticket.idServicio ? `Servicio ${ticket.idServicio}` : null,
    ticket.cliente?.nombreCompleto, ticket.cliente?.rut, ticket.cliente?.email, ticket.cliente?.telefono,
    ticket.idCategoria, ticket.categoria?.nombre, ticket.categoria?.nombreAtencion,
    ticket.prioridad, ticket.estado, ticket.estadoPresentacion,
    ...(ticket.workOrders ?? []).flatMap(order => [
      `OT ${order.idOt}`, `Orden de trabajo ${order.idOt}`, order.codigoSeguimiento, order.tipoOt, order.estado,
    ]),
  ].map(searchText);
  return terms.every(term => fields.some(field => field.includes(term)
    || Boolean(compactSearchText(term) && compactSearchText(field).includes(compactSearchText(term)))));
}

// Documento 0 / Tabla 11.9. IDs and eligibility still come from the backend.
export const TICKET_ATTENTION_LABELS = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
  'Facturación y cobro', 'Consulta general', 'Baja de servicio'] as const;
const categoryKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
const officialName = (name: string) => categoryKey(name) === 'consulta' ? 'Consulta general'
  : TICKET_ATTENTION_LABELS.find(label => categoryKey(label) === categoryKey(name)) ?? null;

/** Diagnose the actual catalog response; never enable an ID without the backend
 * projection. Seven arbitrary rows are not evidence of seven official options. */
export function ticketAttentionAvailability(categories: TicketCategory[]) {
  const options: TicketCategory[] = [];
  const issues: Array<{ name: string; reason: string; rows: TicketCategory[] }> = [];
  for (const name of TICKET_ATTENTION_LABELS) {
    const rows = categories.filter(category => officialName(category.nombre) === name);
    const row = rows[0];
    let reason = '';
    if (!row) reason = 'Falta en el catálogo';
    else if (rows.length !== 1) reason = 'Nombre o alias duplicado; requiere revisión';
    else if (!Number.isInteger(row.idCategoria) || row.idCategoria < 1 || row.idCategoria > 2147483647
      || categories.filter(category => category.idCategoria === row.idCategoria).length !== 1) reason = 'Identificador no válido o duplicado';
    else if (!(row.tipo === 'ATENCION' || (row.tipo == null && row.tipoDisponible !== true))) reason = 'Clasificación incompatible con atención';
    else if (row.nombreAtencion !== name) reason = 'No habilitada por el catálogo del servidor';
    if (reason) issues.push({ name, reason, rows });
    else options.push(row);
  }
  return { options, issues, complete: issues.length === 0 };
}

/** FINET 13-11-2026: «Baja de servicio» is only created by the guided withdrawal of the Libro de Control. It stays in the
 * catalogue (history, filters, existing tickets) but is never offered for manual creation or reclassification. */
export const WITHDRAWAL_TICKET_CATEGORY = 'Baja de servicio';
export function isWithdrawalTicketCategory(category: Pick<TicketCategory, 'nombre'>) {
  return officialName(category.nombre) === WITHDRAWAL_TICKET_CATEGORY;
}

/** G8-only category (FINET 13-11-2026): the customer's voluntary termination, registered from Tickets with its own form. */
export const TERMINATION_TICKET_CATEGORY = 'Término de servicio';
export function isTerminationTicketCategory(category: Pick<TicketCategory, 'nombre'>) {
  return categoryKey(category.nombre) === categoryKey(TERMINATION_TICKET_CATEGORY);
}

/**
 * Categories offered in the «Nuevo ticket» form: server-enabled attention categories except the reserved «Baja de
 * servicio», plus «Término de servicio» only when the server enables it unambiguously (after the authorized catalogue
 * insertion). Selecting it switches the form to the termination requirement.
 */
export function manualTicketCategories(categories: TicketCategory[]) {
  const options = ticketAttentionAvailability(categories).options.filter(category => !isWithdrawalTicketCategory(category));
  const termination = categories.filter(isTerminationTicketCategory);
  const row = termination[0];
  if (termination.length === 1 && row.nombreAtencion === TERMINATION_TICKET_CATEGORY && Number.isInteger(row.idCategoria) && row.idCategoria > 0
    && (row.tipo === 'ATENCION' || (row.tipo == null && row.tipoDisponible !== true))) options.push(row);
  return options;
}

export function isGeneralTicketCategory(category: TicketCategory) {
  if (['cambio_credenciales_wifi', 'asistente virtual'].includes(categoryKey(category.nombre))) return false;
  if (category.tipoDisponible === true || category.tipo != null) return ['ATENCION', 'TECNICA'].includes(category.tipo ?? '');
  return true; // Catálogo local/anterior sin clasificación: conservar gestión histórica.
}

export type TicketActivity = {
  kind: 'note' | 'status' | 'diagnosis';
  text: string;
  author?: string;
  date?: string;
};

// Conservative fallback for an older backend: never translate a FSM state
// into a writable CRM state, including tickets whose origin is CRM.
export function isTechnicalTicketReadOnly(ticket: Ticket) {
  return ticket.soloLecturaTecnica === true ||
    !['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'].includes(ticket.estado);
}

// Do not equate cancellation, unknown values or other spellings with completion.
export function isCompletedTicketWorkOrder(estado: unknown) {
  return estado === 'Completada' || estado === 'COMPLETADA';
}

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
