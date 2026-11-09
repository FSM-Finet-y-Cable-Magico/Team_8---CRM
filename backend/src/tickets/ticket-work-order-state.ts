// Exact read equivalence, not an installation closure or activation command.
export const COMPLETED_TICKET_WORK_ORDER_STATES = ['Completada', 'COMPLETADA'] as const;

export function isCompletedTicketWorkOrder(estado: unknown) {
  return COMPLETED_TICKET_WORK_ORDER_STATES.some(value => value === estado);
}
