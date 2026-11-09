import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCheck, History, RefreshCw, Search } from 'lucide-react';
import { api, type Company, type Customer, type InstallationHistory, type WorkOrder } from '../../api';
import { formatDateOnly, formatDateTime, formatWorkOrderValue, normalizeWorkOrderValue } from '../../lib';
import { Modal, TablePagination } from '../../shared/components';
import { WorkOrderTechnicalEvidence } from './WorkOrderTechnicalEvidence';

type HistoryRow = InstallationHistory['items'][number];

export function InstallationHistoryPanel({ scope, revision, localOrders = [], companies = [], customers = [], onLoaded }: {
  scope: string; revision: unknown; localOrders?: WorkOrder[]; companies?: Company[]; customers?: Customer[];
  onLoaded?: (scope: string, keys: string[]) => void;
}) {
  const [result, setResult] = useState<{ scope: string; data?: InstallationHistory; error?: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  useEffect(() => {
    let active = true;
    setResult(null); setPage(1); setSelectedKey(null);
    void api.get<InstallationHistory>('/integrations/g3/installation-history', { params: { scope } })
      .then(({ data }) => { if (active) { setResult({ scope, data }); onLoaded?.(scope, data.items.map(row => row.key)); } })
      .catch(() => { if (active) setResult({ scope, error: true }); });
    return () => { active = false; };
  }, [scope, revision, refresh, onLoaded]);
  // Scope-tagged state also protects the render before the effect cleanup executes.
  const current = result?.scope === scope ? result : null;
  const items = (current?.data?.items ?? []).filter(row => (
    (!filter || row.clasificacionFecha === filter)
    && (!source || row.fuente === source)
    && (!search.trim() || normalizeWorkOrderValue([
      customerName(row), companyName(row), row.idOt, row.idContrato, row.idServicio,
      ...ordersFor(row).map(order => order.codigoSeguimiento),
    ].filter(value => value != null).join(' ')).includes(normalizeWorkOrderValue(search)))
  ));
  const selected = current?.data?.items.find(row => row.key === selectedKey);
  const pageSize = 20;
  function ordersFor(row: HistoryRow) {
    return localOrders.filter(order => order.idEmpresa === row.idEmpresa && row.ordenesLocales.includes(order.idOt));
  }
  function customerName(row: HistoryRow) {
    // Preserve company scope when enriching labels from already-loaded data.
    const customer = customers.find(customer => customer.idCliente === row.idCliente && (
      customer.idEmpresa === row.idEmpresa || customer.contratos?.some(contract => contract.idEmpresa === row.idEmpresa)
    ));
    const order = ordersFor(row)[0];
    return customer?.nombreCompleto ?? order?.prospecto?.nombreCompleto ?? order?.cliente?.nombreCompleto
      ?? (row.idCliente ? `Cliente #${row.idCliente}` : 'Cliente sin referencia');
  }
  function companyName(row: HistoryRow) {
    return companies.find(company => company.idEmpresa === row.idEmpresa)?.nombre ?? `Empresa ${row.idEmpresa}`;
  }
  function sourceLabel(row: HistoryRow) {
    return row.fuente === 'LEGACY_LOCAL' ? 'Histórica / local' : 'Cierre confirmado G3';
  }
  function dateLabel(row: HistoryRow) {
    if (row.clasificacionFecha === 'REQUIERE_REVISION') return 'Requiere revisión';
    if (row.clasificacionFecha === 'PENDIENTE_FECHA_TECNICA') return 'Pendiente de fecha técnica';
    return row.fechasTecnicasOriginales.map(date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateOnly(date) : formatDateTime(date)).join(' · ');
  }
  return <section className="installation-history installation-completed">
    <header className="installation-section-heading">
      <div><h2><History size={19} aria-hidden="true" />Instalaciones completadas</h2><p>{current?.data ? `${current.data.items.length} ${current.data.items.length === 1 ? 'registro disponible' : 'registros disponibles'} en el historial.` : current?.error ? 'Consulta el historial para volver a intentar la carga.' : 'Consultando registros completados…'}</p></div>
      <button type="button" className="installation-history-trigger" onClick={() => setHistoryOpen(true)}>Ver historial <ArrowRight size={16} aria-hidden="true" /></button>
    </header>
    <Modal key={selected?.key ?? 'installation-history-list'} title={selected ? 'Instalación completada' : 'Historial de instalaciones'} open={historyOpen} onClose={() => { setHistoryOpen(false); setSelectedKey(null); }}>
    <div className={`installation-history-modal${selected ? ' installation-history-modal-detail' : ''}`}>
    {!selected && <>
    <header className="installation-section-heading">
      <div><p>Instalaciones completadas{current?.data ? ` · ${items.length}` : ''}</p></div>
      <button type="button" className="installation-refresh-button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Actualizar historial</button>
    </header>
    {!current && <p className="installation-empty" role="status">Cargando historial confirmado…</p>}
    {current?.error && <p className="installation-feedback" role="alert">No se pudo consultar el historial. Los cierres confirmados no han sido modificados.</p>}
    {current?.data && <>
      <div className="installation-toolbar">
        <label className="installation-search"><Search size={16} aria-hidden="true" /><input autoFocus type="search" aria-label="Buscar en el historial de instalaciones" placeholder="Buscar cliente, orden o contrato" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <label>Origen <select aria-label="Origen del historial" value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="">Todos</option><option value="G3">Cierre confirmado G3</option><option value="LEGACY_LOCAL">Histórica / local</option></select></label>
        <label>Fecha técnica <select aria-label="Fecha técnica" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="">Todas</option><option value="FECHA_TECNICA_CONFIRMADA">Con fecha técnica</option>
          <option value="PENDIENTE_FECHA_TECNICA">Pendiente de fecha técnica</option><option value="REQUIERE_REVISION">Requiere revisión</option>
        </select></label>
      </div>
      <p className="installation-history-note">Sin fecha técnica no significa pendiente de ejecución.</p>
      <div className="table-wrap installation-table-wrap"><table className="installation-table"><thead><tr><th>Cliente / empresa</th><th>Orden / origen</th><th>Contrato / servicio</th><th>Finalización técnica</th><th><span className="sr-only">Acción</span></th></tr></thead>
        <tbody>{items.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={row.key}>
          <td><strong>{customerName(row)}</strong><span>{companyName(row)}</span></td>
          <td><strong>OT {row.idOt ?? 'Sin referencia'}</strong><span className={row.fuente === 'G3' ? 'installation-origin confirmed' : 'installation-origin'}>{sourceLabel(row)}</span></td>
          <td><strong>{row.idContrato ? `Contrato #${row.idContrato}` : 'Sin contrato correlacionado'}</strong><span>{row.idServicio ? `Servicio #${row.idServicio}` : 'Sin servicio correlacionado'}</span></td>
          <td><span className={row.clasificacionFecha !== 'FECHA_TECNICA_CONFIRMADA' ? 'installation-date-warning' : ''}>{dateLabel(row)}</span></td>
          <td><button type="button" className="installation-detail-button" onClick={() => setSelectedKey(row.key)}>Detalle <ArrowRight size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody></table></div>
      {!items.length && <p className="installation-empty">No hay instalaciones completadas que coincidan con el filtro.</p>}
      <TablePagination currentPage={page} totalItems={items.length} pageSize={pageSize} onPageChange={setPage} />
    </>}
    </>}
      {selected && <div className="installation-detail-view">
        <button autoFocus type="button" className="installation-history-back" onClick={() => setSelectedKey(null)}><ArrowLeft size={16} aria-hidden="true" />Volver al historial</button>
        <header className="installation-detail-summary">
          <span className="installation-completed-icon"><CheckCheck size={24} aria-hidden="true" /></span>
          <div><h3>{customerName(selected)}</h3><p>{companyName(selected)} · OT {selected.idOt ?? 'Sin referencia'}</p></div>
          <span className="installation-completed-badge">Completada</span>
        </header>
        <dl className="installation-detail-grid">
          <div><dt>Origen del registro</dt><dd>{sourceLabel(selected)}</dd></div>
          <div><dt>Finalización técnica</dt><dd>{dateLabel(selected)}</dd></div>
          <div><dt>Contrato</dt><dd>{selected.idContrato ? `#${selected.idContrato}` : 'Sin contrato correlacionado'}</dd></div>
          <div><dt>Servicio</dt><dd>{selected.idServicio ? `#${selected.idServicio}` : 'Sin servicio correlacionado'}</dd></div>
        </dl>
        {ordersFor(selected).length > 0 && <section className="installation-detail-section">
          <h3>Orden registrada en el CRM</h3>
          {ordersFor(selected).map(order => <dl className="installation-detail-grid" key={order.idOt}>
            <div><dt>Orden local</dt><dd>{order.codigoSeguimiento ?? `OT ${order.idOt}`}</dd></div>
            <div><dt>Técnico local</dt><dd>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd></div>
            <div><dt>Visita programada</dt><dd>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : 'Sin fecha'} {order.horaVisita ?? ''}</dd></div>
            <div><dt>Estado / prioridad local</dt><dd>{formatWorkOrderValue(order.estado)} · {formatWorkOrderValue(order.prioridad)}</dd></div>
          </dl>)}
        </section>}
        {selected.antecedentesTecnicos?.map(evidence => <WorkOrderTechnicalEvidence key={`${evidence.idEmpresa}:${evidence.idOt}`} evidence={evidence} />)}
        <details className="installation-integration-details">
          <summary>Referencias y fechas originales</summary>
          <div>
            <p>{selected.fuente === 'LEGACY_LOCAL' ? 'Histórica / local, sin tracking G8–G3 confirmado' : 'Cierre de solicitud G8–G3 confirmado'}</p>
            <p>{selected.ordenesLocales.length ? `OT local: ${selected.ordenesLocales.join(', ')}` : 'Sin OT local'}</p>
            {selected.fechasTecnicasOriginales.map(date => <p key={date}>Fecha técnica original: <time dateTime={date}>{date}</time></p>)}
            {selected.solicitudesG3.length ? selected.solicitudesG3.map(request => <dl className="installation-request-reference" key={request.idIntegracion}>
              <div><dt>Tracking #{request.idIntegracion}</dt><dd>request_id: {request.requestId}</dd><dd>trace_id: {request.traceId}</dd></div>
              <div><dt>Procesado en CRM (no es fecha técnica)</dt><dd>{formatDateTime(request.fechaCierreProcesado)}</dd><dd>{request.fechaCierreProcesado}</dd></div>
            </dl>) : <p>Sin solicitud técnica</p>}
          </div>
        </details>
      </div>}
    </div>
    </Modal>
  </section>;
}
