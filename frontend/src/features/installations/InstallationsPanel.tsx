import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type InventoryUnit, type Prospect, type WorkOrder } from '../../api';
import { formatDateOnly, formatWorkOrderValue, normalizeWorkOrderValue } from '../../lib';
import { Modal, StatusBadge, TablePagination } from '../../shared/components';
import { InstallOrderForm } from './InstallOrderForm';
import { InstallationCompletionForm } from './InstallationCompletionForm';

export function InstallationsPanel({
  prospects,
  pendingActivationProspects,
  workOrders,
  inventory,
  canComplete,
  focusedProspectId,
  onFocusConsumed,
  onChanged,
}: {
  prospects: Prospect[];
  pendingActivationProspects: Prospect[];
  workOrders: WorkOrder[];
  inventory: InventoryUnit[];
  canComplete: boolean;
  focusedProspectId: number | null;
  onFocusConsumed: () => void;
  onChanged: () => void;
}) {
  const installationOrders = useMemo(
    () => workOrders.filter((order) => normalizeWorkOrderValue(order.tipoOt) === 'instalacion'),
    [workOrders],
  );
  const installationProspects = useMemo(() => {
    const openProspectIds = new Set(
      installationOrders
        .filter((order) => !['completada', 'cerrada', 'cancelada'].includes(normalizeWorkOrderValue(order.estado)))
        .map((order) => order.idProspecto ?? order.prospecto?.idProspecto)
        .filter((id): id is number => Boolean(id)),
    );
    const unique = new Map(
      [...prospects, ...pendingActivationProspects].map((prospect) => [prospect.idProspecto, prospect]),
    );

    return [...unique.values()].filter((prospect) => {
      const legacyReady = prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente);
      const signedPending = !prospect.idCliente && Boolean(
        prospect.contratos?.some((contract) => ['Firmado', 'Activo'].includes(contract.estado ?? '')),
      );

      return (legacyReady || signedPending) && !openProspectIds.has(prospect.idProspecto);
    });
  }, [installationOrders, pendingActivationProspects, prospects]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [completionOrderId, setCompletionOrderId] = useState<number | null>(null);
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [historyPriorityFilter, setHistoryPriorityFilter] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const selectedProspect = installationProspects.find((prospect) => prospect.idProspecto === selectedId) ?? null;
  const allProspects = useMemo(() => [...prospects, ...pendingActivationProspects], [pendingActivationProspects, prospects]);
  const prospectByCustomerCompany = useMemo(() => {
    const map = new Map<string, Prospect>();

    for (const prospect of allProspects) {
      if (prospect.idCliente && prospect.empresa?.idEmpresa) {
        map.set(`${prospect.idCliente}:${prospect.empresa.idEmpresa}`, prospect);
      }
    }

    return map;
  }, [allProspects]);
  const pendingInstallationOrders = useMemo(
    () => installationOrders.filter((order) => !['completada', 'cerrada', 'cancelada'].includes(normalizeWorkOrderValue(order.estado))),
    [installationOrders],
  );
  const selectedCompletionOrder = pendingInstallationOrders.find((order) => order.idOt === completionOrderId) ?? null;
  const historyStatusOptions = [...new Set(installationOrders.map((order) => normalizeWorkOrderValue(order.estado)).filter(Boolean))].sort();
  const historyPriorityOptions = [...new Set(installationOrders.map((order) => normalizeWorkOrderValue(order.prioridad)).filter(Boolean))].sort();
  const filteredInstallationOrders = installationOrders.filter((order) => (
    (!historyStatusFilter || normalizeWorkOrderValue(order.estado) === historyStatusFilter)
    && (!historyPriorityFilter || normalizeWorkOrderValue(order.prioridad) === historyPriorityFilter)
  ));
  const historyPageSize = 20;
  const paginatedInstallationOrders = filteredInstallationOrders.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  useEffect(() => { setHistoryPage(1); }, [historyStatusFilter, historyPriorityFilter, filteredInstallationOrders.length]);

  useEffect(() => {
    if (!focusedProspectId) {
      return;
    }

    const focused = installationProspects.find((prospect) => prospect.idProspecto === focusedProspectId);

    if (focused) {
      setSelectedId(focused.idProspecto);
      setModalOpen(true);
    }

    onFocusConsumed();
  }, [focusedProspectId, installationProspects, onFocusConsumed]);

  function openInstallModal(idProspecto: number) {
    setSelectedId(idProspecto);
    setModalOpen(true);
  }

  function formatInstallationOrderCode(order: WorkOrder) {
    const code = order.codigoSeguimiento?.trim();

    if (code) {
      return code;
    }

    const normalizedType = normalizeWorkOrderValue(order.tipoOt);
    const prefix = normalizedType.includes('instalacion')
      ? 'INS'
      : normalizedType.includes('reparacion')
        ? 'REP'
        : normalizedType.includes('soporte')
          ? 'SOP'
          : 'OTR';

    return `OT-${prefix}-${String(order.idOt).padStart(6, '0')}`;
  }

  return (
    <section className="installations-workspace">
      <div className="installations-overview">
        <details className="installation-collapsible">
          <summary><h2>Instalaciones G3</h2><span className="installation-count">{installationProspects.length}</span><ChevronDown size={18} /></summary>
          <div className="installation-collapsible-content installation-queue">
            {installationProspects.map((prospect) => (
              <article className="installation-prospect-item" key={prospect.idProspecto}>
                <div><strong>{prospect.nombreCompleto ?? 'Prospecto sin nombre'}</strong><span>{prospect.rut ?? 'RUT no registrado'} · {prospect.empresa?.nombre ?? 'Empresa sin asignar'}</span></div>
                <button type="button" className="secondary compact" onClick={() => openInstallModal(prospect.idProspecto)}>Gestionar en G3</button>
              </article>
            ))}
            {!installationProspects.length && <p className="inline-status">No hay prospectos habilitados para generar una orden de instalación.</p>}
          </div>
        </details>
        <details className="installation-collapsible">
          <summary><h2>Agenda local histórica</h2><span className="installation-count">{pendingInstallationOrders.length}</span><ChevronDown size={18} /></summary>
          <div className="installation-collapsible-content installation-agenda">
            {pendingInstallationOrders.slice(0, 4).map((order) => {
              const relatedProspect = order.prospecto ?? prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`);
              return <article className="installation-agenda-item" key={order.idOt}>
                <div className="installation-visit-date"><strong>{formatDateOnly(order.fechaProgramada)}</strong><span>{order.horaVisita ?? 'Sin hora'}</span></div>
                <div className="installation-visit-copy"><strong>{relatedProspect?.nombreCompleto ?? `Cliente ${order.idCliente ?? '-'}`}</strong><span>{formatInstallationOrderCode(order)} · {order.tecnico?.nombreCompleto ?? 'Técnico sin asignar'}</span></div>
                <div className="installation-visit-badges"><span className="source-badge">LEGACY_LOCAL</span><StatusBadge value={formatWorkOrderValue(order.prioridad)} /></div>
                <button type="button" className="secondary compact" onClick={() => setCompletionOrderId(order.idOt)}>Completar</button>
              </article>;
            })}
            {!pendingInstallationOrders.length && <p className="inline-status">No hay visitas activas en la agenda.</p>}
          </div>
        </details>
      </div>
      <section className="installation-history">
        <div className="installation-history-header">
          <h2>Historial local de instalaciones</h2>
          <div className="installation-history-filters">
            <span className="installation-history-count">{filteredInstallationOrders.length} registros</span>
            <select aria-label="Filtrar historial por estado" value={historyStatusFilter} onChange={(event) => setHistoryStatusFilter(event.target.value)}>
              <option value="">Todos los estados</option>
              {historyStatusOptions.map((state) => <option key={state} value={state}>{formatWorkOrderValue(state)}</option>)}
            </select>
            <select aria-label="Filtrar historial por prioridad" value={historyPriorityFilter} onChange={(event) => setHistoryPriorityFilter(event.target.value)}>
              <option value="">Todas las prioridades</option>
              {historyPriorityOptions.map((priority) => <option key={priority} value={priority}>{formatWorkOrderValue(priority)}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap installation-history-table-wrap"><table className="operational-table"><thead><tr><th>Orden</th><th>Fuente</th><th>Cliente</th><th>Visita</th><th>Técnico</th><th className="operational-badge-column">Prioridad</th><th className="operational-badge-column">Estado</th></tr></thead><tbody>{paginatedInstallationOrders.map((order) => { const relatedProspect = order.prospecto ?? prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`); return <tr key={order.idOt}><td className="work-order-id">{formatInstallationOrderCode(order)}</td><td><span className="source-badge">LEGACY_LOCAL</span></td><td>{relatedProspect?.nombreCompleto ?? `Cliente ${order.idCliente ?? '-'}`}</td><td>{formatDateOnly(order.fechaProgramada)} {order.horaVisita ?? ''}</td><td>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</td><td className="operational-badge-column"><StatusBadge value={formatWorkOrderValue(order.prioridad)} /></td><td className="installation-status">{formatWorkOrderValue(order.estado)}</td></tr>; })}</tbody></table></div>
        <TablePagination currentPage={historyPage} totalItems={filteredInstallationOrders.length} pageSize={historyPageSize} onPageChange={setHistoryPage} />
      </section>
      <Modal title="Instalación técnica G3" open={modalOpen} onClose={() => setModalOpen(false)}>
        {selectedProspect ? (
          <InstallOrderForm
            prospect={selectedProspect}
            onChanged={() => {
              setModalOpen(false);
              onChanged();
            }}
          />
        ) : (
          <p className="inline-status">Selecciona un prospecto aceptado para agendar la instalación.</p>
        )}
      </Modal>
      <Modal title="Completar instalación" open={Boolean(selectedCompletionOrder)} onClose={() => setCompletionOrderId(null)}>
        {selectedCompletionOrder && (
          <InstallationCompletionForm
            order={selectedCompletionOrder}
            inventory={inventory}
            canComplete={canComplete}
            onChanged={() => {
              setCompletionOrderId(null);
              onChanged();
            }}
          />
        )}
      </Modal>
    </section>
  );
}
