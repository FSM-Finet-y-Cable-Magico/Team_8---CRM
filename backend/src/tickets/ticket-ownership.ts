// Historical filename only: vocabulary identifies neither origin nor ownership.
// This is a conservative compatibility restriction, never an authorization grant.
// Company, role and relationship checks remain required by the calling service.
const CRM_STATES = ['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'];
const FSM_LABELS: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_PROGRESO: 'En progreso',
  DERIVADO_OT: 'Derivado a OT',
  RESUELTO: 'Resuelto',
};

export function ticketStateCompatibility(estado: string) {
  const fsm = Object.prototype.hasOwnProperty.call(FSM_LABELS, estado);
  const crm = CRM_STATES.includes(estado);
  return {
    vocabularioEstado: fsm ? 'G3' as const : crm ? 'G8' as const : 'DESCONOCIDO' as const,
    estadoPresentacion: fsm ? FSM_LABELS[estado] : estado,
    // Origin CRM does not authorize edits: G3 also accepts that origin.
    soloLecturaTecnica: !crm,
  };
}
