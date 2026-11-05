import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, Filter, RefreshCw, Search, X } from 'lucide-react';
import { type Customer } from '../../api';
import { ControlBookFinancePanel } from './ControlBookFinancePanel';
import { api, apiErrorMessage } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { ControlBookDrawer } from './ControlBookDrawer';
import { ControlBookFilters, FILTER_LABELS, filterDescription } from './ControlBookFilters';
import { COLUMNS, ControlResponse, ControlRow, EMPTY_FILTERS, Filters, ESSENTIAL, currency, dateLabel, exportColumns, readable, recordContext } from './control-book-model';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import './commercial-control-book.css';

export function CommercialStatus({ row }: { row: ControlRow }) {
  return <span className={'control-status status-' + row.estadoComercial.toLowerCase()}>{readable(row.estadoComercial)}</span>;
}

function Cell({ column, row }: { column: string; row: ControlRow }) {
  if (column === 'cliente') return <><strong>{row.nombre}</strong><small>{row.rut ?? 'Sin RUT'}</small></>;
  if (column === 'servicio') return <><span>{row.plan ?? 'Sin plan'}</span>{row.direccion && <small>{row.direccion}</small>}<small>{readable(row.estadoServicio)} · {row.idFactura ? 'Vence ' + dateLabel(row.fechaVencimientoEfectiva) : 'Sin facturas'}</small></>;
  if (column === 'deuda') return <strong>{row.saldoPendiente === null ? '—' : currency.format(row.saldoPendiente)}</strong>;
  if (column === 'estado') return <><CommercialStatus row={row}/><small>{row.diasAtraso === null ? 'Atraso sin datos' : row.diasAtraso > 0 ? row.diasAtraso + ' días de atraso' : 'Sin atraso'}</small></>;
  if (column === 'accion') return row.accionSugerida.toLocaleLowerCase('es-CL').includes('sin gestión pendiente') ? null : <span>{row.accionSugerida}</span>;
  if (column === 'contacto') return <><span>{row.telefono ?? 'Sin teléfono'}</span><small>{row.email ?? 'Sin correo'}</small></>;
  if (column === 'gestion') return <><span>{readable(row.ultimaGestion)}</span><small>{dateLabel(row.fechaUltimaGestion)}{row.responsableUltimaGestion ? ' · ' + row.responsableUltimaGestion : ''}</small></>;
  const key = COLUMNS[column].fields[0];
  const value = row[key];
  if (['montoDocumento', 'totalPagado', 'cargosPendientes'].includes(key)) return <>{value === null ? '—' : currency.format(Number(value))}</>;
  if (key.startsWith('fecha')) return <>{dateLabel(value as string | null)}</>;
  if (typeof value === 'boolean') return <>{value ? 'Sí' : 'No'}</>;
  return <>{value === null ? '—' : String(value)}</>;
}

export function CommercialControlBookPanel({ scope, writeCompanyId, permissions, onOpenCustomers, customers, onChanged }: {
  scope: string; writeCompanyId: number; permissions: DashboardPermissions; onOpenCustomers: (row: ControlRow) => void; customers: Customer[]; onChanged: () => void;
}) {
  const [focusedInvoice, setFocusedInvoice] = useState<Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'> | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [data, setData] = useState<ControlResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { message, showMessage: setMessage, clearMessage } = useTransientMessage(5000);
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState('');
  const [visible, setVisible] = useState<string[]>(() => [...ESSENTIAL]);
  const [optionsPanel, setOptionsPanel] = useState<'filters' | 'columns' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<ControlRow | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [catalog, setCatalog] = useState<ControlResponse['filterOptions']>();
  const exportRef = useRef<HTMLDivElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const columnsButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const openerId = useRef<string | null>(null);
  const returning = useRef(false);
  const synchronizing = useRef(false);
  const companyId = scope !== 'consolidado' ? scope : String(writeCompanyId);
  const previousCompany = useRef(companyId);
  const params = useMemo(() => ({ idEmpresa: companyId, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')), page, pageSize: 20 }), [companyId, filters, page]);


  useEffect(() => {
    const timer = window.setTimeout(() => { setFilters((current) => current.search === search ? current : { ...current, search }); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (previousCompany.current === companyId) return;
    previousCompany.current = companyId;
    setSelected(null); setFocusedInvoice(null); setHighlightedId(null); setDrawerBusy(false); setData(null); setCatalog(undefined); setPage(1); clearMessage(); setUpdatedAt('');
    setOptionsPanel(null); setExportOpen(false); setSearch(''); setFilters(EMPTY_FILTERS);
  }, [companyId, clearMessage]);

  useEffect(() => {
    if (selected || !returning.current) return;
    returning.current = false;
    workspace.current?.querySelector<HTMLTableRowElement>(`tr[data-row-id="${CSS.escape(openerId.current ?? '')}"]`)?.focus();
  }, [selected]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.get<ControlResponse>('/commercial/control-book', { params, signal: controller.signal }).then(({ data: result }) => {
      if (controller.signal.aborted) return;
      if (page > result.pagination.totalPages) { setPage(result.pagination.totalPages); return; }
      setData(result);
      setUpdatedAt(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setSelected((current) => current ? result.items.find((row) => row.rowId === current.rowId) ?? null : null);
      setCatalog((current) => ({
        plans: [...new Map([...(current?.plans ?? []), ...result.filterOptions.plans].map((item) => [item.id, item])).values()],
        zones: [...new Map([...(current?.zones ?? []), ...result.filterOptions.zones].map((item) => [item.id, item])).values()],
        commercialStatuses: [...new Set([...(current?.commercialStatuses ?? []), ...result.filterOptions.commercialStatuses])],
        serviceStatuses: [...new Set([...(current?.serviceStatuses ?? []), ...result.filterOptions.serviceStatuses])],
      }));
    }).catch((err) => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params, refresh, page]);

  useEffect(() => {
    if (!exportOpen) return;
    const outside = (event: PointerEvent) => { if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setExportOpen(false); exportRef.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [exportOpen]);

  const activeFilters = (Object.keys(FILTER_LABELS) as (keyof Filters)[]).filter((key) => filters[key] !== '');
  function applyFilters(next: Filters) { setHighlightedId(null); setFilters(next); setPage(1); setOptionsPanel(null); filtersButton.current?.focus(); }
  function closeOptions() { (optionsPanel === 'filters' ? filtersButton : columnsButton).current?.focus(); setOptionsPanel(null); }
  function sortBy(sort: string) { setFilters((current) => ({ ...current, sort, order: current.sort === sort && current.order === 'desc' ? 'asc' : 'desc' })); setPage(1); }
  function closeDrawer() { returning.current = true; setSelected(null); }
  function openRecord(row: ControlRow) {
    if (drawerBusy) return;
    openerId.current = row.rowId; setHighlightedId(row.rowId); setSelected(row); setOptionsPanel(null);
  }
  async function synchronizeDelinquency() {
    if (synchronizing.current || loading || !permissions.manageBilling) return;
    synchronizing.current = true; setDrawerBusy(true); setError('');
    try {
      await api.post('/billing/refresh-delinquency', undefined, { params: { scope: companyId } });
      setMessage('Estados de morosidad actualizados.'); setRefresh(value => value + 1); onChanged();
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { synchronizing.current = false; setDrawerBusy(false); }
  }
  async function exportFile(format: 'csv' | 'xlsx') {
    if (!permissions.exportControlBook || exporting) return;
    setExporting(true); setExportOpen(false); setError('');
    try {
      const response = await api.get('/commercial/control-book/export', { params: { ...params, format, columns: exportColumns(visible).join(','), page: undefined, pageSize: undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = 'libro-control.' + format;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(apiErrorMessage(err)); } finally { setExporting(false); }
  }

  if (selected) return <section ref={workspace} className="control-book-workspace">
    {message && <div className="control-feedback" role="status">{message}<button className="control-icon" aria-label="Cerrar mensaje" onClick={clearMessage}><X size={16}/></button></div>}
    {error && <p className="control-feedback error" role="alert">{error}</p>}
    <ControlBookDrawer key={companyId + '-' + selected.rowId} row={selected} revision={refresh} canManage={permissions.manageCommercialCollections} canViewCustomers={permissions.viewCustomers} canViewBilling={permissions.viewBilling} onClose={closeDrawer} onBusyChange={setDrawerBusy} onSaved={(notice) => { setMessage(notice); setRefresh((value) => value + 1); }} onOpenCustomers={onOpenCustomers} onOpenBilling={setFocusedInvoice} financialTools={permissions.viewBilling && <ControlBookFinancePanel key={companyId + '-' + selected.idCliente} row={selected} scope={companyId} customers={customers} permissions={permissions} revision={refresh} onChanged={() => { setRefresh(value => value + 1); onChanged(); }} focusedInvoice={focusedInvoice} onFocusConsumed={() => setFocusedInvoice(null)}/>}/>
  </section>;

  return <section ref={workspace} className="control-book-workspace" aria-label="Libro de control">
    <header className="control-book-header"><h1>Libro de control</h1><div className="control-book-header-actions">
      <button className="control-refresh" aria-label="Actualizar libro de control" disabled={loading || drawerBusy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} className={loading ? 'control-spinning' : ''}/><span>{loading ? 'Actualizando…' : updatedAt ? 'Actualizado ' + updatedAt : 'Actualizar'}</span></button>
      {permissions.manageBilling && <button type="button" className="control-text-button" disabled={loading || drawerBusy} onClick={() => void synchronizeDelinquency()}>Actualizar morosidad</button>}
      {permissions.exportControlBook && <div className="control-export" ref={exportRef}>
        <button className="control-outline" disabled={exporting || loading || !data?.items.length} aria-expanded={exportOpen} aria-controls="control-export-options" onClick={() => setExportOpen(!exportOpen)}><Download size={16}/>{exporting ? 'Exportando…' : 'Exportar'}<ChevronDown size={14}/></button>
        {exportOpen && <div className="control-menu" id="control-export-options"><button onClick={() => void exportFile('xlsx')}>Excel (.xlsx)</button><button onClick={() => void exportFile('csv')}>CSV (.csv)</button><small>Con los filtros y columnas de esta vista.</small></div>}
      </div>}
    </div></header>

    <dl className="control-book-summary" aria-label="Resumen de la empresa" aria-busy={loading}>
      {([
        ['Clientes', data?.dashboard.customerCount ?? '—'],
        ['Saldo pendiente', data ? currency.format(data.dashboard.totalDebt) : '—'],
        ['Clientes morosos', data?.dashboard.overdueCustomerCount ?? '—'],
        ['Facturas vencidas', data?.dashboard.overdueInvoiceCount ?? '—'],
      ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>

    {message && <div className="control-feedback" role="status">{message}<button className="control-icon" aria-label="Cerrar mensaje" onClick={clearMessage}><X size={16}/></button></div>}
    {error && <p className="control-feedback error" role="alert">{error}</p>}

    <div className="control-book-toolbar">
      <label className="control-search"><Search size={18}/><input aria-label="Buscar en libro de control" placeholder="Buscar cliente, RUT, teléfono, contrato o folio" value={search} disabled={drawerBusy} onChange={(event) => setSearch(event.target.value)}/>{search && <button className="control-icon" aria-label="Limpiar búsqueda" disabled={drawerBusy} onClick={() => setSearch('')}><X size={16}/></button>}</label>
      <button ref={filtersButton} className={'control-outline ' + (optionsPanel === 'filters' ? 'active' : '')} disabled={drawerBusy} aria-expanded={optionsPanel === 'filters'} aria-controls="control-filters" onClick={() => setOptionsPanel(optionsPanel === 'filters' ? null : 'filters')}><Filter size={16}/>Filtros{activeFilters.length > 0 && <span className="control-count">{activeFilters.length}</span>}</button>
      <button ref={columnsButton} className={'control-outline ' + (optionsPanel === 'columns' ? 'active' : '')} aria-expanded={optionsPanel === 'columns'} aria-controls="control-columns" onClick={() => setOptionsPanel(optionsPanel === 'columns' ? null : 'columns')}><Columns3 size={16}/>Campos</button>
    </div>
    {activeFilters.length > 0 && <div className="control-filter-chips" aria-label="Filtros aplicados">
      {activeFilters.map((key) => <button key={key} disabled={drawerBusy} onClick={() => applyFilters({ ...filters, [key]: '' })} aria-label={'Quitar filtro ' + filterDescription(key, filters[key], catalog)}>{filterDescription(key, filters[key], catalog)}<X size={13}/></button>)}
      <button className="control-text-button" disabled={drawerBusy} onClick={() => applyFilters({ ...EMPTY_FILTERS, search: filters.search, sort: filters.sort, order: filters.order })}>Limpiar filtros</button>
    </div>}
    {optionsPanel && <div onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeOptions(); } }}>
      {optionsPanel === 'filters' ? <ControlBookFilters filters={filters} options={catalog} onApply={applyFilters} onClose={closeOptions}/> : <section id="control-columns" className="control-options-panel" aria-label="Seleccionar columnas">
        <header><h2>Campos de esta vista</h2><button className="control-icon" aria-label="Cerrar campos" onClick={closeOptions}><X size={18}/></button></header>
        <div className="control-column-picker">{[...new Set(Object.values(COLUMNS).map((column) => column.group))].map((group) => <fieldset key={group}><legend>{group}</legend>{Object.entries(COLUMNS).filter(([, column]) => column.group === group).map(([key, column]) => <label key={key}><input type="checkbox" checked={visible.includes(key)} disabled={key === 'cliente' || !visible.includes(key) && visible.length >= 6} onChange={() => setVisible((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length < 6 ? Object.keys(COLUMNS).filter((item) => [...current, key].includes(item)) : current)}/>{column.label}{key === 'cliente' && <small>Fijo</small>}</label>)}</fieldset>)}</div>
        <footer><span>{visible.length} de 6 campos. Desmarca uno para sustituirlo. Selecciona una fila para ver su detalle.</span><button className="control-text-button" onClick={() => setVisible([...ESSENTIAL])}>Restablecer vista</button></footer>
      </section>}
    </div>}

    <div className="control-view-switch"><div className="control-queue-filters" role="group" aria-label="Selección rápida de registros">{([['conDeuda', 'Con saldo pendiente'], ['vencido', 'Vencidas'], ['conConvenio', 'Con convenio'], ['conProrroga', 'Con prórroga']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={filters[key] === 'true'} className={filters[key] === 'true' ? 'active' : ''} onClick={() => applyFilters({ ...filters, [key]: filters[key] === 'true' ? '' : 'true' })}>{label}</button>)}</div><div className="control-sort"><label><span className="control-sr-only">Ordenar por</span><select aria-label="Ordenar por" disabled={drawerBusy} value={filters.sort} onChange={(event) => { setFilters({ ...filters, sort: event.target.value }); setPage(1); }}>
      <option value="diasAtraso">Días de atraso</option><option value="saldo">Saldo pendiente</option><option value="fechaVencimiento">Vencimiento</option><option value="ultimaGestion">Última gestión</option><option value="nombre">Nombre</option>
    </select></label><button className="control-icon" disabled={drawerBusy} aria-label={filters.order === 'desc' ? 'Orden descendente. Cambiar a ascendente' : 'Orden ascendente. Cambiar a descendente'} onClick={() => sortBy(filters.sort)}>{filters.order === 'desc' ? <ArrowDown size={15}/> : <ArrowUp size={15}/>}</button><span aria-live="polite">{data?.pagination.totalRows ?? 0} registros</span></div></div>

    <div className="control-book-body">
      <div className="control-list">
        <div className="control-table-shell" aria-busy={loading}>
          {loading ? <div className="control-empty" role="status"><RefreshCw size={22} className="control-spinning"/>Cargando libro de control…</div> : error && !data ? <div className="control-empty"><span>No se pudo cargar el libro de control.</span><button className="control-outline" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div> : !data?.items.length ? <div className="control-empty"><Search size={24}/><strong>No hay resultados</strong><span>Prueba con otra búsqueda o ajusta los filtros.</span>{(activeFilters.length > 0 || search) && <button className="control-outline" onClick={() => { setSearch(''); applyFilters(EMPTY_FILTERS); }}>Limpiar búsqueda y filtros</button>}</div> : <table className="control-table">
            <caption className="control-sr-only">Libro de control. Incluye clientes con y sin facturas; los documentos se muestran por contrato. Selecciona una fila o pulsa Enter para abrir su detalle.</caption>
            <colgroup>{visible.map(key => <col key={key} style={{ width: `${(key === 'cliente' ? 1.45 : 1) / (visible.length + 0.45) * 100}%` }}/>)}</colgroup>
            <thead><tr>{visible.map((key) => <th scope="col" key={key} className={'column-' + key} aria-sort={COLUMNS[key].sort === filters.sort ? filters.order === 'asc' ? 'ascending' : 'descending' : undefined}>{COLUMNS[key].sort ? <button disabled={drawerBusy} onClick={() => sortBy(COLUMNS[key].sort!)}>{COLUMNS[key].label}{COLUMNS[key].sort === filters.sort && (filters.order === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</button> : COLUMNS[key].label}</th>)}</tr></thead>
            <tbody>{data.items.map((row) => <tr key={row.rowId} tabIndex={0} className={highlightedId === row.rowId ? 'is-selected' : undefined} data-row-id={row.rowId} aria-label={'Ver ' + row.nombre + ', ' + recordContext(row)} onClick={() => openRecord(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRecord(row); } }}>{visible.map((key) => <td key={key} className={'column-' + key} data-label={COLUMNS[key].label}><Cell column={key} row={row}/></td>)}</tr>)}</tbody>
          </table>}
        </div>
        <footer className="control-pagination"><span>{data?.items.length ? ((page - 1) * 20 + 1) + '–' + ((page - 1) * 20 + data.items.length) + ' de ' + data.pagination.totalRows : '0 registros'}</span><button className="control-icon" aria-label="Página anterior" disabled={page <= 1 || loading || drawerBusy} onClick={() => { setPage(page - 1); setSelected(null); }}><ChevronLeft size={18}/></button><span>Página {data?.pagination.page ?? page} de {data?.pagination.totalPages ?? 1}</span><button className="control-icon" aria-label="Página siguiente" disabled={!data || page >= data.pagination.totalPages || loading || drawerBusy} onClick={() => { setPage(page + 1); setSelected(null); }}><ChevronRight size={18}/></button></footer>
      </div>
    </div>
  </section>;
}
