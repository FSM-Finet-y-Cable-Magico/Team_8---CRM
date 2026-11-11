import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Check, ChevronDown, Columns3, Download, FileText, Filter, RefreshCw, Search, TriangleAlert, Users, Wallet, X } from 'lucide-react';
import { type Company, type Customer } from '../../api';
import { ControlBookFinancePanel } from './ControlBookFinancePanel';
import { api, apiErrorMessage } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { ControlBookDrawer } from './ControlBookDrawer';
import { ControlBookFilters, FILTER_LABELS, filterDescription } from './ControlBookFilters';
import { COLUMNS, ControlResponse, ControlRow, EMPTY_FILTERS, Filters, ESSENTIAL, currency, dateLabel, exportColumns, readable, recordContext } from './control-book-model';
import { TablePagination } from '../../shared/components/TablePagination';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { ControlBookExternalDocuments } from './ControlBookExternalDocuments';
import './commercial-control-book.css';

const SPLIT_COLUMNS: Partial<Record<string, string[]>> = {
  cliente: ['cliente', 'rut'], servicio: ['servicio', 'documento'], estado: ['estado', 'dias'],
};
const TABLE_LABELS: Partial<Record<string, string>> = {
  rut: 'RUT', servicio: 'Servicio', documento: 'Documento', estado: 'Estado', dias: 'Días de atraso',
};
const QUICK_FILTERS = [
  ['conDeuda', 'Con saldo pendiente'], ['vencido', 'Vencidas'], ['conConvenio', 'Con convenio'],
  ['conProrroga', 'Con prórroga'], ['conUltimoAviso', 'Con último aviso'], ['retiroPendiente', 'Retiro pendiente'],
] as const;

export function CommercialStatus({ row }: { row: ControlRow }) {
  return <span className={'control-status status-' + row.estadoComercial.toLowerCase()}>{readable(row.estadoComercial)}</span>;
}

function Cell({ column, row }: { column: string; row: ControlRow }) {
  if (column === 'rut') return <>{row.rut ?? '—'}</>;
  if (column === 'servicio') return <><span>{row.plan ?? 'Sin plan'}</span>{row.numeroContrato && <small>{row.numeroContrato}</small>}</>;
  if (column === 'documento') return <>{row.idFactura ? row.numeroDocumento ?? `Factura ${row.idFactura}` : 'Sin facturas'}{row.idFactura && row.tipoDocumento && <small>{readable(row.tipoDocumento)}</small>}</>;
  if (column === 'deuda') return <strong>{row.saldoPendiente === null ? '—' : currency.format(row.saldoPendiente)}</strong>;
  if (column === 'estado') return <CommercialStatus row={row}/>;
  if (column === 'dias') return <span className={row.diasAtraso != null && row.diasAtraso > 0 ? 'control-overdue' : undefined}>{row.diasAtraso ?? '—'}</span>;
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

export function CommercialControlBookPanel({ active = true, scope, writeCompanyId, permissions, customers, companies, onChanged }: {
  active?: boolean;
  scope: string; writeCompanyId: number; permissions: DashboardPermissions; customers: Customer[]; companies: Company[]; onChanged: () => void;
}) {
  const [focusedInvoice, setFocusedInvoice] = useState<Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'> | null>(null);
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
  const [openMenu, setOpenMenu] = useState<'export' | 'quickFilters' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<ControlRow | null>(null);
  const [contractError, setContractError] = useState('');
  const tableRecord = useRef<ControlRow | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [catalog, setCatalog] = useState<ControlResponse['filterOptions']>();
  const exportRef = useRef<HTMLDivElement>(null);
  const quickFiltersRef = useRef<HTMLDivElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const columnsButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sortReturn = useRef<{ column: string; scrollLeft: number } | null>(null);
  const workspace = useRef<HTMLElement>(null);
  const openerId = useRef<string | null>(null);
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
    setSelected(null); setFocusedInvoice(null); setDrawerBusy(false); setData(null); setCatalog(undefined); setPage(1); clearMessage(); setUpdatedAt('');
    setOptionsPanel(null); setOpenMenu(null); setSearch(''); setFilters(EMPTY_FILTERS);
    openerId.current = null;
    tableRecord.current = null;
    setContractError('');
    sortReturn.current = null;
  }, [companyId, clearMessage]);

  useEffect(() => {
    if (selected || loading || openerId.current === null) return;
    const opener = workspace.current?.querySelector<HTMLButtonElement>(`tr[data-row-id="${CSS.escape(openerId.current)}"] .control-customer-trigger`);
    openerId.current = null;
    (opener ?? searchInput.current)?.focus({ preventScroll: true });
  }, [selected, loading]);

  useEffect(() => {
    if (loading || !sortReturn.current) return;
    const { column, scrollLeft } = sortReturn.current;
    sortReturn.current = null;
    const table = workspace.current?.querySelector<HTMLElement>('.control-table-shell');
    if (!table) return;
    table.scrollLeft = scrollLeft;
    if (document.activeElement === document.body) {
      table.querySelector<HTMLButtonElement>(`[data-sort-column="${CSS.escape(column)}"]`)?.focus({ preventScroll: true });
    }
  }, [data, loading]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.get<ControlResponse>('/commercial/control-book', { params, signal: controller.signal }).then(async ({ data: result }) => {
      if (controller.signal.aborted) return;
      if (page > result.pagination.totalPages) { setPage(result.pagination.totalPages); return; }
      setData(result);
      setUpdatedAt(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setCatalog((current) => ({
        plans: [...new Map([...(current?.plans ?? []), ...result.filterOptions.plans].map((item) => [item.id, item])).values()],
        zones: [...new Map([...(current?.zones ?? []), ...result.filterOptions.zones].map((item) => [item.id, item])).values()],
        commercialStatuses: [...new Set([...(current?.commercialStatuses ?? []), ...result.filterOptions.commercialStatuses])],
        serviceStatuses: [...new Set([...(current?.serviceStatuses ?? []), ...result.filterOptions.serviceStatuses])],
      }));
      const record = tableRecord.current;
      if (!record) return;
      const visibleRecord = result.items.find(row => row.rowId === record.rowId);
      if (visibleRecord) { setSelected(visibleRecord); return; }

      // A payment can move the open invoice out of a filtered portfolio.
      try {
        const { data: exact } = await api.get<ControlResponse>('/commercial/control-book', { signal: controller.signal, params: {
          idEmpresa: record.idEmpresa, idCliente: record.idCliente, idContrato: record.idContrato ?? undefined,
          idFactura: record.idFactura ?? undefined, page: 1, pageSize: record.idFactura === null ? 100 : 1,
        } });
        if (controller.signal.aborted || tableRecord.current !== record) return;
        const updated = exact.items.find(row => row.rowId === record.rowId);
        if (updated) setSelected(updated);
        else { closeRecord(); setContractError('El registro seleccionado ya no está disponible.'); }
      } catch (err) {
        if (!controller.signal.aborted && tableRecord.current === record) setContractError(apiErrorMessage(err));
      }
    }).catch((err) => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params, refresh, page, active]);

  useEffect(() => {
    if (!openMenu) return;
    const container = openMenu === 'export' ? exportRef : quickFiltersRef;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpenMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenMenu(null); container.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [openMenu]);

  const activeFilters = (Object.keys(FILTER_LABELS) as (keyof Filters)[]).filter((key) => filters[key] !== '');
  const tableColumns = visible.flatMap((key) => SPLIT_COLUMNS[key] ?? [key]);
  const quickCount = QUICK_FILTERS.filter(([key]) => filters[key] === 'true').length;
  function applyFilters(next: Filters) { setFilters(next); setPage(1); closeOptions(); }
  function closeOptions() {
    if (optionsPanel) (optionsPanel === 'filters' ? filtersButton : columnsButton).current?.focus();
    setOptionsPanel(null);
  }
  function sortBy(sort: string, column?: string) {
    const table = workspace.current?.querySelector<HTMLElement>('.control-table-shell');
    if (column && table) sortReturn.current = { column, scrollLeft: table.scrollLeft };
    setFilters((current) => ({ ...current, sort, order: current.sort === sort && current.order === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  }
  function closeRecord() {
    tableRecord.current = null;
    setSelected(null);
    setFocusedInvoice(null);
  }
  function openRecord(row: ControlRow) {
    if (drawerBusy || loading || selected) return;
    setContractError('');
    tableRecord.current = row;
    openerId.current = row.rowId; setFocusedInvoice(null); setSelected(row); setOpenMenu(null);
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
    setExporting(true); setOpenMenu(null); setError('');
    try {
      const response = await api.get('/commercial/control-book/export', { params: { ...params, format, columns: exportColumns(visible).join(','), page: undefined, pageSize: undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = 'libro-control.' + format;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(apiErrorMessage(err)); } finally { setExporting(false); }
  }

  const feedback = <>
    {message && <div className="control-feedback" role="status">{message}<button className="control-icon" aria-label="Cerrar mensaje" onClick={clearMessage}><X size={16}/></button></div>}
    {error && <p className="control-feedback error" role="alert">{error}</p>}
    {contractError && <div className="control-feedback error" role="alert">{contractError}<button type="button" className="control-icon" aria-label="Cerrar mensaje del contrato" onClick={() => setContractError('')}><X size={16}/></button></div>}
  </>;

  return <section ref={workspace} className="control-book-workspace control-workbook" aria-label="Libro de control">
    <header className="control-book-header">
      <h1>Libro de control</h1>
      {updatedAt && <small className="control-workbook-updated">Actualizado {updatedAt}</small>}
    </header>
    <div className="control-ribbon-actions" role="group" aria-label="Herramientas de Cartera">
      <button className="control-ribbon-command" disabled={loading || drawerBusy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={21} aria-hidden="true" className={loading ? 'control-spinning' : ''}/>{loading ? 'Actualizando…' : 'Actualizar cartera'}</button>
      {permissions.exportControlBook && <div className="control-export" ref={exportRef}>
        <button className="control-ribbon-command" disabled={exporting || loading || !data?.items.length} aria-expanded={openMenu === 'export'} aria-controls="control-export-options" onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}><Download size={21} aria-hidden="true"/><span>{exporting ? 'Exportando…' : 'Exportar'} <ChevronDown size={12} aria-hidden="true"/></span></button>
        {openMenu === 'export' && <div className="control-menu" id="control-export-options"><button onClick={() => void exportFile('xlsx')}>Excel (.xlsx)</button><button onClick={() => void exportFile('csv')}>CSV (.csv)</button><small>Con los filtros y columnas de esta vista.</small></div>}
      </div>}
      <button ref={filtersButton} className="control-ribbon-command" disabled={drawerBusy} aria-expanded={optionsPanel === 'filters'} aria-controls="control-filters" onClick={() => { setOptionsPanel(optionsPanel === 'filters' ? null : 'filters'); setOpenMenu(null); }}><Filter size={21} aria-hidden="true"/><span>Filtros {activeFilters.length > 0 && <span className="control-count">{activeFilters.length}</span>}</span></button>
      <button ref={columnsButton} className="control-ribbon-command" aria-expanded={optionsPanel === 'columns'} aria-controls="control-columns" onClick={() => { setOptionsPanel(optionsPanel === 'columns' ? null : 'columns'); setOpenMenu(null); }}><Columns3 size={21} aria-hidden="true"/>Campos</button>
      {permissions.manageBilling && <button type="button" className="control-ribbon-command" disabled={loading || drawerBusy} onClick={() => void synchronizeDelinquency()}><TriangleAlert size={21} aria-hidden="true"/>Actualizar morosidad</button>}
      <ControlBookExternalDocuments active={active} scope={scope} writeCompanyId={writeCompanyId} customers={customers}
        canView={permissions.viewExternalTaxDocuments} canManage={permissions.manageExternalTaxDocuments} disabled={drawerBusy}/>
    </div>

    <dl className="control-book-summary" aria-label="Resumen de la empresa" aria-busy={loading}>
      {([
        [Users, 'Clientes', data?.dashboard.customerCount ?? '—'],
        [Wallet, 'Saldo pendiente', data ? currency.format(data.dashboard.totalDebt) : '—'],
        [TriangleAlert, 'Clientes morosos', data?.dashboard.overdueCustomerCount ?? '—'],
        [FileText, 'Facturas vencidas', data?.dashboard.overdueInvoiceCount ?? '—'],
      ] as const).map(([Icon, label, value]) => <div key={label}><dt><Icon size={17} aria-hidden="true"/>{label}</dt><dd>{value}</dd></div>)}
    </dl>

    {!selected && feedback}

    <div className="control-book-toolbar">
      <label className="control-search"><Search size={18}/><input ref={searchInput} aria-label="Buscar en libro de control" placeholder="Buscar cliente, RUT, teléfono, contrato o folio" value={search} disabled={drawerBusy} onChange={(event) => setSearch(event.target.value)}/>{search && <button className="control-icon" aria-label="Limpiar búsqueda" disabled={drawerBusy} onClick={() => setSearch('')}><X size={16}/></button>}</label>
      <div ref={quickFiltersRef} className="control-quick-filters">
        <button type="button" className="control-outline" disabled={drawerBusy} aria-expanded={openMenu === 'quickFilters'} aria-controls={openMenu === 'quickFilters' ? 'control-quick-filter-options' : undefined} onClick={() => {
          setOpenMenu(openMenu === 'quickFilters' ? null : 'quickFilters');
          setOptionsPanel(null);
        }}>
          <Filter size={15} aria-hidden="true"/>Filtros rápidos{quickCount > 0 && <span className="control-count">{quickCount}</span>}<ChevronDown size={14} aria-hidden="true"/>
        </button>
        {openMenu === 'quickFilters' && <div id="control-quick-filter-options" className="control-menu control-quick-filter-menu" role="group" aria-label="Filtros rápidos">
          {QUICK_FILTERS.map(([key, label]) => {
            const active = filters[key] === 'true';
            return <button key={key} type="button" disabled={drawerBusy} aria-pressed={active} onClick={() => applyFilters({ ...filters, [key]: active ? '' : 'true' })}>
              {label}{active && <Check size={16} aria-hidden="true"/>}
            </button>;
          })}
        </div>}
      </div>
      <div className="control-sort">
        <select aria-label="Ordenar por" disabled={drawerBusy} value={filters.sort} onChange={(event) => { setFilters({ ...filters, sort: event.target.value }); setPage(1); }}>
          <option value="diasAtraso">Días de atraso</option><option value="saldo">Saldo pendiente</option><option value="fechaVencimiento">Vencimiento</option><option value="ultimaGestion">Última gestión</option><option value="nombre">Nombre</option>
        </select>
        <button type="button" className="control-icon" disabled={drawerBusy} aria-label={filters.order === 'desc' ? 'Orden descendente. Cambiar a ascendente' : 'Orden ascendente. Cambiar a descendente'} onClick={() => sortBy(filters.sort)}>{filters.order === 'desc' ? <ArrowDown size={15}/> : <ArrowUp size={15}/>}</button>
      </div>
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

    <div className="control-list">
      <div className="control-table-shell" role="region" aria-label="Tabla de cartera desplazable" tabIndex={data?.items.length && !loading ? 0 : undefined} aria-busy={loading}>
        {loading ? <div className="control-empty" role="status"><RefreshCw size={22} className="control-spinning"/>Cargando libro de control…</div> : error && !data ? <div className="control-empty"><span>No se pudo cargar el libro de control.</span><button className="control-outline" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button></div> : !data?.items.length ? <div className="control-empty"><Search size={24}/><strong>No hay resultados</strong><span>Prueba con otra búsqueda o ajusta los filtros.</span>{(activeFilters.length > 0 || search) && <button className="control-outline" onClick={() => { setSearch(''); applyFilters(EMPTY_FILTERS); }}>Limpiar búsqueda y filtros</button>}</div> : <table className="control-table">
          <caption className="control-sr-only">Cartera por contrato. Selecciona un registro para abrir la ficha del cliente.</caption>
          <colgroup><col className="control-sheet-index"/>{tableColumns.map(key => <col key={key} className={`control-col-${key}`}/>)}</colgroup>
          <thead>
            <tr className="control-sheet-letters" aria-hidden="true"><td className="control-sheet-index"/>{tableColumns.map((key, index) => <td key={key}>{String.fromCharCode(65 + index)}</td>)}</tr>
            <tr><td className="control-sheet-index" aria-hidden="true"/>{tableColumns.map((key) => {
              const label = TABLE_LABELS[key] ?? COLUMNS[key].label;
              const orderKey = key === 'dias' ? 'diasAtraso' : key === 'estado' ? undefined : COLUMNS[key]?.sort;
              const ordered = orderKey === filters.sort;
              const SortIcon = ordered ? (filters.order === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;
              return <th scope="col" key={key} className={`column-${key}`} aria-sort={ordered ? (filters.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                {orderKey ? <button type="button" className="control-column-sort" data-sort-column={key} aria-label={`Ordenar por ${label}`} disabled={drawerBusy} onClick={() => sortBy(orderKey, key)}>{key === 'dias' ? 'Días' : label}<SortIcon size={13} aria-hidden="true"/></button> : label}
              </th>;
            })}</tr>
          </thead>
          <tbody>{data.items.map((row, index) => <tr key={row.rowId} className={selected?.rowId === row.rowId ? 'is-selected' : undefined} data-row-id={row.rowId} onClick={() => openRecord(row)}>
            <td className="control-sheet-index" aria-hidden="true">{(page - 1) * 20 + index + 1}</td>
            {tableColumns.map((key) => <td key={key} className={'column-' + key}>{key === 'cliente' ?
              <button type="button" className="control-customer-trigger" aria-haspopup="dialog" aria-label={`Abrir ficha de ${row.nombre}, ${recordContext(row)}`} disabled={drawerBusy}>{row.nombre}</button> :
              <Cell column={key} row={row}/>}</td>)}
          </tr>)}</tbody>
        </table>}
      </div>
      {data && <footer className="control-book-results">
        <fieldset disabled={loading || drawerBusy} aria-label="Cambiar página">
          <TablePagination
            currentPage={data.pagination.page}
            totalItems={data.pagination.totalRows}
            pageSize={data.pagination.pageSize}
            onPageChange={setPage}
          />
        </fieldset>
      </footer>}
    </div>
    {active && selected && <ControlBookDrawer key={selected.rowId} row={selected} revision={refresh}
      customer={customers.find(customer => customer.idCliente === selected.idCliente)}
      companyName={companies.find(company => company.idEmpresa === selected.idEmpresa)?.nombre}
      canManage={permissions.manageCommercialCollections}
      canViewBilling={permissions.viewBilling} canViewDocuments={permissions.viewBilling && permissions.viewExternalTaxDocuments}
      onClose={closeRecord} onBusyChange={setDrawerBusy} onSaved={(notice) => { setMessage(notice); setRefresh(value => value + 1); }}
      onOpenBilling={setFocusedInvoice} feedback={feedback}
      financialTools={permissions.viewBilling ? (view) => <ControlBookFinancePanel key={selected.idEmpresa + '-' + selected.idCliente} view={view}
        row={selected} scope={String(selected.idEmpresa ?? companyId)} customers={customers} permissions={permissions} revision={refresh}
        onChanged={() => { setRefresh(value => value + 1); onChanged(); }} focusedInvoice={focusedInvoice}
        onFocusConsumed={() => setFocusedInvoice(null)}/> : undefined}/>}
  </section>;
}
