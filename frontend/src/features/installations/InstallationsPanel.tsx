import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, UserRound } from 'lucide-react';
import { type Company, type Customer, type InventoryUnit, type Prospect, type WorkOrder } from '../../api';
import { formatDateOnly, formatWorkOrderValue, normalizeWorkOrderValue, isInstallationWorkOrder, isCompletedWorkOrder, isTerminalWorkOrder } from '../../lib';
import { Modal, StatusBadge, TablePagination } from '../../shared/components';
import { InstallOrderForm } from './InstallOrderForm';
import { InstallationCompletionForm } from './InstallationCompletionForm';
import { InstallationHistoryPanel } from './InstallationHistoryPanel';
import './installations-workspace.css';

type InstallationView = 'coordination' | 'agenda';

export function InstallationsPanel({
  scope, companies = [], customers = [], prospects, pendingActivationProspects, workOrders, inventory,
  canComplete, focusedProspectId, onFocusConsumed, onChanged, requestedView, onViewConsumed,
}: {
  scope: string; companies?: Company[]; customers?: Customer[]; prospects: Prospect[];
  pendingActivationProspects: Prospect[]; workOrders: WorkOrder[]; inventory: InventoryUnit[];
  canComplete: boolean; focusedProspectId: number | null; onFocusConsumed: () => void; onChanged: () => void;
  requestedView?: InstallationView | null; onViewConsumed?: () => void;
}) {
  const installationOrders = useMemo(() => workOrders.filter(order => isInstallationWorkOrder(order.tipoOt)), [workOrders]);
  const installationProspects = useMemo(() => {
    const openProspectIds = new Set(installationOrders.filter(order => !isTerminalWorkOrder(order.estado))
      .map(order => order.idProspecto ?? order.prospecto?.idProspecto).filter((id): id is number => Boolean(id)));
    const unique = new Map([...prospects, ...pendingActivationProspects].map(prospect => [prospect.idProspecto, prospect]));
    return [...unique.values()].filter(prospect => {
      const legacyReady = prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente);
      const signedPending = !prospect.idCliente && Boolean(prospect.contratos?.some(contract => ['Firmado', 'Activo'].includes(contract.estado ?? '')));
      return (legacyReady || signedPending) && !openProspectIds.has(prospect.idProspecto);
    });
  }, [installationOrders, pendingActivationProspects, prospects]);
  const [workflow, setWorkflow] = useState<{ scope: string; view: InstallationView } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [coordinationSearch, setCoordinationSearch] = useState('');
  const [coordinationPage, setCoordinationPage] = useState(1);
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [historyPriorityFilter, setHistoryPriorityFilter] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const coordinationRef = useRef<HTMLElement>(null);
  const agendaRef = useRef<HTMLElement>(null);
  const [confirmedHistory, setConfirmedHistory] = useState<{ scope: string; keys: string[] } | null>(null);
  const onHistoryLoaded = useCallback((scope: string, keys: string[]) => setConfirmedHistory({ scope, keys }), []);
  const confirmedKeys = useMemo(() => new Set(confirmedHistory?.scope === scope ? confirmedHistory.keys : []), [confirmedHistory, scope]);
  const prospectByCustomerCompany = useMemo(() => {
    const map = new Map<string, Prospect>();
    for (const prospect of [...prospects, ...pendingActivationProspects]) {
      if (prospect.idCliente && prospect.empresa?.idEmpresa) map.set(`${prospect.idCliente}:${prospect.empresa.idEmpresa}`, prospect);
    }
    return map;
  }, [pendingActivationProspects, prospects]);
  const pendingInstallationOrders = useMemo(() => installationOrders.filter(order =>
    !confirmedKeys.has(`${order.idEmpresa}:${order.idOt}`) && !isTerminalWorkOrder(order.estado)), [installationOrders, confirmedKeys]);
  const localOrders = installationOrders.filter(order => !isCompletedWorkOrder(order.estado) && !confirmedKeys.has(`${order.idEmpresa}:${order.idOt}`));
  const historyStatusOptions = [...new Set(localOrders.map(order => normalizeWorkOrderValue(order.estado)).filter(Boolean))].sort();
  const historyPriorityOptions = [...new Set(localOrders.map(order => normalizeWorkOrderValue(order.prioridad)).filter(Boolean))].sort();
  const filteredInstallationOrders = localOrders.filter(order => (
    (historyStatusFilter === 'all' || (historyStatusFilter ? normalizeWorkOrderValue(order.estado) === historyStatusFilter : !isTerminalWorkOrder(order.estado)))
    && (!historyPriorityFilter || normalizeWorkOrderValue(order.prioridad) === historyPriorityFilter)
    && (!orderSearch.trim() || normalizeWorkOrderValue([
      order.prospecto?.nombreCompleto, order.cliente?.nombreCompleto,
      prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`)?.nombreCompleto,
      order.cliente?.rut, formatInstallationOrderCode(order),
    ].filter(Boolean).join(' ')).includes(normalizeWorkOrderValue(orderSearch)))
  ));
  const filteredProspects = installationProspects.filter(prospect => !coordinationSearch.trim() || normalizeWorkOrderValue([
    prospect.nombreCompleto, prospect.rut, prospect.empresa?.nombre, prospect.direccion,
  ].filter(Boolean).join(' ')).includes(normalizeWorkOrderValue(coordinationSearch)));
  const pageSize = 20;
  const currentWorkflow = workflow?.scope === scope ? workflow : null;
  const selectedProspect = currentWorkflow?.view === 'coordination' ? installationProspects.find(prospect => prospect.idProspecto === selectedId) : null;
  const selectedOrder = currentWorkflow?.view === 'agenda' ? pendingInstallationOrders.find(order => order.idOt === selectedOrderId) : null;
  const detail = Boolean(selectedProspect || selectedOrder);

  useEffect(() => { setHistoryPage(1); }, [historyStatusFilter, historyPriorityFilter, orderSearch, filteredInstallationOrders.length]);
  useEffect(() => {
    if (!focusedProspectId) return;
    if (installationProspects.some(prospect => prospect.idProspecto === focusedProspectId)) {
      setSelectedId(focusedProspectId); setSelectedOrderId(null); setWorkflow({ scope, view: 'coordination' });
    }
    onFocusConsumed();
  }, [focusedProspectId, installationProspects, onFocusConsumed, scope]);
  useEffect(() => {
    if (!requestedView) return;
    const section = requestedView === 'coordination' ? coordinationRef.current : agendaRef.current;
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onViewConsumed?.();
  }, [requestedView, onViewConsumed, scope]);

  function manageProspect(id: number) {
    setSelectedId(id); setSelectedOrderId(null); setWorkflow({ scope, view: 'coordination' });
  }
  function viewOrder(id: number) {
    setSelectedOrderId(id); setSelectedId(null); setWorkflow({ scope, view: 'agenda' });
  }
  function close() { setWorkflow(null); setSelectedId(null); setSelectedOrderId(null); }
  function formatInstallationOrderCode(order: WorkOrder) {
    return order.codigoSeguimiento?.trim() || `OT-INS-${String(order.idOt).padStart(6, '0')}`;
  }
  return <section className="installations-workspace installations-redesign">
    <header className="installation-page-heading"><h1>Instalaciones</h1></header>
    <section ref={coordinationRef} className="installation-coordination" aria-labelledby="installation-coordination-title">
      <header className="installation-section-heading"><h2 id="installation-coordination-title">Por coordinar <span className="installation-section-count">{installationProspects.length}</span></h2></header>
      <div className="installation-toolbar">
        <label className="installation-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar solicitudes por coordinar" placeholder="Buscar cliente, RUT o dirección" value={coordinationSearch} onChange={event => { setCoordinationSearch(event.target.value); setCoordinationPage(1); }} /></label>
        <span>{filteredProspects.length} {filteredProspects.length === 1 ? 'solicitud' : 'solicitudes'} por coordinar</span>
      </div>
      <div className="table-wrap installation-table-wrap"><table className="installation-table installation-coordination-table" aria-label="Solicitudes por coordinar">
        <thead><tr><th>Cliente / empresa</th><th>Dirección</th><th><span className="sr-only">Acción</span></th></tr></thead>
        <tbody>{filteredProspects.slice((coordinationPage - 1) * pageSize, coordinationPage * pageSize).map(prospect => <tr key={prospect.idProspecto}>
          <td><strong>{prospect.nombreCompleto ?? 'Prospecto sin nombre'}</strong><span>{prospect.rut ?? 'RUT no registrado'} · {prospect.empresa?.nombre ?? 'Empresa sin asignar'}</span></td>
          <td>{prospect.direccion || 'No registrada'}</td>
          <td><button type="button" className="secondary compact crm-table-action" aria-haspopup="dialog" onClick={() => manageProspect(prospect.idProspecto)}>Gestionar</button></td>
        </tr>)}</tbody>
      </table></div>
      {!filteredProspects.length && <p className="installation-empty">No hay solicitudes que coincidan con la búsqueda.</p>}
      <TablePagination currentPage={coordinationPage} totalItems={filteredProspects.length} pageSize={pageSize} onPageChange={setCoordinationPage} />
    </section>
    <section ref={agendaRef} className="installation-orders-section" aria-labelledby="installation-agenda-title">
      <header className="installation-section-heading"><h2 id="installation-agenda-title">Órdenes en agenda <span className="installation-section-count">{pendingInstallationOrders.length}</span></h2></header>
      <div className="installation-toolbar">
        <label className="installation-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar órdenes de instalación" placeholder="Buscar cliente u orden" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} /></label>
        <div className="installation-history-filters">
          <select aria-label="Filtrar órdenes por estado" value={historyStatusFilter} onChange={event => setHistoryStatusFilter(event.target.value)}>
            <option value="">En agenda</option><option value="all">Todos los registros locales</option>
            {historyStatusOptions.map(state => <option key={state} value={state}>{formatWorkOrderValue(state)}</option>)}
          </select>
          <select aria-label="Filtrar órdenes por prioridad" value={historyPriorityFilter} onChange={event => setHistoryPriorityFilter(event.target.value)}>
            <option value="">Todas las prioridades</option>{historyPriorityOptions.map(priority => <option key={priority} value={priority}>{formatWorkOrderValue(priority)}</option>)}
          </select>
        </div>
        <span>{filteredInstallationOrders.length} {filteredInstallationOrders.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <div className="table-wrap installation-table-wrap"><table className="installation-table" aria-label="Órdenes en agenda">
        <thead><tr><th>Cliente / orden</th><th>Visita programada</th><th>Técnico</th><th>Prioridad</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr></thead>
        <tbody>{filteredInstallationOrders.slice((historyPage - 1) * pageSize, historyPage * pageSize).map(order => {
          const relatedProspect = order.prospecto ?? prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`);
          return <tr key={order.idOt}>
            <td><strong>{relatedProspect?.nombreCompleto ?? order.cliente?.nombreCompleto ?? `Cliente ${order.idCliente ?? '-'}`}</strong><span>{formatInstallationOrderCode(order)} · {companies.find(company => company.idEmpresa === order.idEmpresa)?.nombre ?? `Empresa ${order.idEmpresa ?? 'sin asignar'}`}</span></td>
            <td><strong>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : 'Sin programar'}</strong>{order.horaVisita && <span>{order.horaVisita} h</span>}</td>
            <td>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</td>
            <td><StatusBadge value={formatWorkOrderValue(order.prioridad)} /></td><td><StatusBadge value={formatWorkOrderValue(order.estado)} /></td>
            <td>{pendingInstallationOrders.some(pending => pending.idOt === order.idOt) && <button type="button" className="secondary compact crm-table-action" aria-haspopup="dialog" onClick={() => viewOrder(order.idOt)}>Detalle</button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!filteredInstallationOrders.length && <p className="installation-empty">No hay órdenes que coincidan con los filtros.</p>}
      <TablePagination currentPage={historyPage} totalItems={filteredInstallationOrders.length} pageSize={pageSize} onPageChange={setHistoryPage} />
    </section>
    <InstallationHistoryPanel scope={scope} revision={workOrders} localOrders={installationOrders} companies={companies} customers={customers} onLoaded={onHistoryLoaded} />
    <Modal key={selectedProspect ? `prospect-${selectedProspect.idProspecto}` : selectedOrder ? `order-${selectedOrder.idOt}` : 'closed'}
      title={selectedProspect ? 'Gestionar instalación' : 'Detalle de instalación'} open={detail} onClose={close}>
      <div className="installation-workflow-modal installation-workflow-modal-detail">
        <button autoFocus type="button" className="installation-history-back" onClick={close}><ArrowLeft size={16} aria-hidden="true" />Volver al listado</button>
        {selectedProspect && <>
          <header className="installation-detail-summary"><UserRound size={23} aria-hidden="true" /><div><h3>{selectedProspect.nombreCompleto}</h3><p>{selectedProspect.rut ?? 'RUT no registrado'} · {selectedProspect.empresa?.nombre ?? 'Empresa sin asignar'}</p></div></header>
          <InstallOrderForm prospect={selectedProspect} onChanged={onChanged} />
        </>}
        {selectedOrder && <InstallationCompletionForm order={selectedOrder} inventory={inventory} canComplete={canComplete} onChanged={onChanged} />}
      </div>
    </Modal>
  </section>;
}
