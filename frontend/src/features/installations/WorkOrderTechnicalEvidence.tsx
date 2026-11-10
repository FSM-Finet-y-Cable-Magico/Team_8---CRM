import type { WorkOrderTechnicalEvidence as Evidence } from '../../api';

export const WORK_ORDER_EVIDENCE_NOTICE = 'Estas declaraciones pertenecen a la OT; no acreditan asignación oficial de inventario a un servicio ni equivalencia entre técnicos de distintos sistemas.';

export function WorkOrderTechnicalEvidence({ evidence, formatTechnicalDate, showNotice = true }: {
  evidence?: Evidence;
  formatTechnicalDate?: (date: string) => string;
  showNotice?: boolean;
}) {
  if (!evidence) return null;
  return <section className="installation-technical-evidence" aria-label={`Antecedente técnico OT ${evidence.idOt}`}>
    <h4>Antecedente técnico de OT {evidence.idOt}</h4>
    <dl>
      <div><dt>Fecha técnica registrada</dt><dd>{evidence.fechaCompletada
        ? <time dateTime={evidence.fechaCompletada}>{formatTechnicalDate?.(evidence.fechaCompletada) ?? evidence.fechaCompletada}</time>
        : 'No registrada'}</dd></div>
      <div><dt>Identificador técnico registrado en OT</dt><dd>{evidence.idTecnicoRegistrado ?? 'No registrado'}</dd></div>
      <div><dt>Identificador técnico externo</dt><dd>{evidence.idTecnicoExterno ?? 'No registrado'}</dd></div>
      <div><dt>Potencia óptica (dBm)</dt><dd>{evidence.potenciaOpticaDbm ?? 'No registrada'}</dd></div>
      <div><dt>Resuelto remotamente</dt><dd>{evidence.resueltoRemotamente == null ? 'No registrado' : evidence.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>
      <div className="installation-evidence-equipment"><dt>Equipos declarados como instalados en la OT</dt><dd>{evidence.equiposDeclarados?.instalados?.join(', ') || 'Sin series declaradas disponibles'}</dd></div>
      <div className="installation-evidence-equipment"><dt>Equipos declarados como retirados en la OT</dt><dd>{evidence.equiposDeclarados?.retirados?.join(', ') || 'Sin series declaradas disponibles'}</dd></div>
    </dl>
    {showNotice && <p>{WORK_ORDER_EVIDENCE_NOTICE}</p>}
  </section>;
}
