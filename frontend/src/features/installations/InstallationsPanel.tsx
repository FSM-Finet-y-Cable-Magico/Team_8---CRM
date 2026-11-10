import { useEffect, useRef, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { type Company, type Customer, type InventoryUnit, type Prospect, type WorkOrder } from '../../api';
import { normalizeWorkOrderValue, isInstallationWorkOrder } from '../../lib';
import { Modal, TablePagination } from '../../shared/components';
import { InstallOrderForm } from './InstallOrderForm';
import { InstallationHistoryPanel } from './InstallationHistoryPanel';
import './installations-workspace.css';

export function InstallationsPanel({
  scope, companies = [], customers = [], pendingActivationProspects, workOrders,
  focusedProspectId, onFocusConsumed, onChanged, requestedView, onViewConsumed, canRequest = false,
}: {
  scope: string; companies?: Company[]; customers?: Customer[]; prospects: Prospect[];
  pendingActivationProspects: Prospect[]; workOrders: WorkOrder[]; inventory: InventoryUnit[];
  canComplete: boolean; focusedProspectId: number | null; onFocusConsumed: () => void; onChanged: () => void;
  canRequest?: boolean;
  requestedView?: 'coordination' | 'agenda' | null; onViewConsumed?: () => void;
}) {
  // Use the pending contract selected by the backend, including additional
  // installations for existing customers. An open local OT is not required.
  const installationProspects = pendingActivationProspects;
  const [selection, setSelection] = useState<{ scope: string; id: number } | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);
  const selected = selection?.scope === scope ? installationProspects.find(prospect => prospect.idProspecto === selection.id) : null;
  const filtered = installationProspects.filter(prospect => !query.trim() || normalizeWorkOrderValue([
    prospect.nombreCompleto, prospect.rut, prospect.empresa?.nombre, prospect.direccion,
    prospect.contratos?.[0]?.idContrato, prospect.contratos?.[0]?.plan?.nombreComercial,
  ].filter(value => value != null).join(' ')).includes(normalizeWorkOrderValue(query)));
  const pageSize = 20;

  useEffect(() => { setPage(1); }, [scope, query, installationProspects.length]);
  useEffect(() => {
    if (!focusedProspectId || !installationProspects.some(prospect => prospect.idProspecto === focusedProspectId)) return;
    setSelection({ scope, id: focusedProspectId });
    onFocusConsumed();
  }, [focusedProspectId, installationProspects, onFocusConsumed, scope]);
  useEffect(() => {
    if (!requestedView) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onViewConsumed?.();
  }, [requestedView, onViewConsumed, scope]);

  return <section className="installations-workspace installations-redesign">
    <header className="installation-page-heading"><h1>Instalaciones</h1></header>
    <section ref={sectionRef} className="installation-coordination" aria-labelledby="installation-process-title">
      <header className="installation-section-heading"><h2 id="installation-process-title">Instalaciones en proceso</h2></header>
      <div className="installation-toolbar installation-process-toolbar">
        <label className="installation-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar instalaciones en proceso" placeholder="Buscar cliente, RUT, contrato o dirección" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <InstallationHistoryPanel key={scope} scope={scope} revision={workOrders} localOrders={workOrders.filter(order => isInstallationWorkOrder(order.tipoOt))} companies={companies} customers={customers} />
      </div>
      <div className="table-wrap installation-table-wrap"><table className="installation-table installation-coordination-table" aria-label="Instalaciones en proceso">
        <thead><tr><th>Cliente / empresa</th><th>Plan / contrato</th><th>Dirección de instalación</th><th>Acción</th></tr></thead>
        <tbody>{filtered.slice((page - 1) * pageSize, page * pageSize).map(prospect => {
          const contract = prospect.contratos?.[0];
          return <tr key={prospect.idProspecto}>
            <td><strong>{prospect.nombreCompleto ?? 'Sin nombre registrado'}</strong><span>{prospect.rut ?? 'RUT no registrado'} · {prospect.empresa?.nombre ?? 'Empresa sin asignar'}</span></td>
            <td><strong>{contract?.plan?.nombreComercial ?? 'Plan no registrado'}</strong><span>{contract?.idContrato ? `Contrato #${contract.idContrato}` : 'Contrato sin referencia'}</span></td>
            <td>{prospect.ubicacionInstalacion?.direccion || contract?.direccionInstalacion || prospect.direccion || 'No registrada'}</td>
            <td><button type="button" className="secondary compact crm-table-action" aria-haspopup="dialog" onClick={() => setSelection({ scope, id: prospect.idProspecto })}>Gestionar</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!filtered.length && <p className="installation-empty">{query.trim() ? 'No hay instalaciones que coincidan con la búsqueda.' : 'No hay contrataciones pendientes de instalación.'}</p>}
      <TablePagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />
    </section>
    <Modal key={selected ? `${scope}:${selected.idProspecto}:${selected.contratos?.[0]?.idContrato ?? ''}` : 'closed'} title="Instalación técnica" open={Boolean(selected)} onClose={() => setSelection(null)} focusClose>
      <div className="installation-workflow-modal installation-workflow-modal-detail">
        {selected && <>
          <header className="installation-detail-summary"><UserRound size={23} aria-hidden="true" /><div><h3>{selected.nombreCompleto}</h3><p>{selected.rut ?? 'RUT no registrado'} · {selected.empresa?.nombre ?? 'Empresa sin asignar'}</p></div></header>
          <InstallOrderForm prospect={selected} canRequest={canRequest} onChanged={onChanged} />
        </>}
      </div>
    </Modal>
  </section>;
}
