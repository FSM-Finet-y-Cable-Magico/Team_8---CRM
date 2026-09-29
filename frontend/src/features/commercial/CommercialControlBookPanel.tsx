import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, Columns3, RefreshCw, Search, Sheet, UserPlus } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import './commercial-control-book.css';

type ControlRow = {
  rowId: string; idEmpresa: number | null; idCliente: number; rut: string | null; nombre: string; telefono: string | null; email: string | null; direccion: string | null;
  idServicio: number | null; serviciosRelacionados: number[]; estadoServicio: string | null; idContrato: number; numeroContrato: string; idPlan: number | null; plan: string | null;
  idZona: number | null; zona: string | null; idFactura: number; tipoDocumento: string | null; numeroDocumento: string; fechaEmision: string | null; fechaVencimiento: string;
  fechaVencimientoEfectiva: string; estadoDocumento: string; montoDocumento: number | null; totalPagado: number; saldoPendiente: number | null; saldoFavor: number | null;
  diasAtraso: number | null; estadoComercial: string; ultimaGestion: string | null; fechaUltimaGestion: string | null; responsableUltimaGestion: string | null; accionSugerida: string;
  convenioActivo: boolean; prorrogaActiva: boolean; diaPago: number; cambioFecha: string | null; fechaInstalacion: string | null; fechaCorte: string | null; estadoCorte: string | null;
  avisoRetiro: boolean; retiroPendiente: boolean; observacionRelevante: string | null; ultimoPago: string | null; formaPago: string | null; codigoTransaccion: string | null;
  valorRecibido: number | null; cargosPendientes: number;
};

type ControlResponse = {
  items: ControlRow[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalRows: number; totalDebt: number; overdueCount: number; agreementsCount: number; extensionsCount: number };
  filterOptions: { plans: Array<{ id: number; label: string }>; zones: Array<{ id: number; label: string }>; commercialStatuses: string[]; serviceStatuses: string[] };
};

type ActionName = 'detail' | 'event' | 'lastNotice' | 'agreement' | 'extension' | 'paymentDay' | 'charge' | 'withdrawal' | null;
type Filters = {
  search: string; estadoComercial: string; estadoServicio: string; idPlan: string; idZona: string;
  conDeuda: string; vencido: string; conConvenio: string; conProrroga: string; conUltimoAviso: string;
  retiroPendiente: string; diasAtrasoMin: string; diasAtrasoMax: string; fechaVencimientoDesde: string;
  fechaVencimientoHasta: string; sort: string; order: string;
};
const EMPTY_FILTERS: Filters = {
  search: '', estadoComercial: '', estadoServicio: '', idPlan: '', idZona: '', conDeuda: '', vencido: '',
  conConvenio: '', conProrroga: '', conUltimoAviso: '', retiroPendiente: '', diasAtrasoMin: '', diasAtrasoMax: '',
  fechaVencimientoDesde: '', fechaVencimientoHasta: '', sort: 'diasAtraso', order: 'desc',
};

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const ESSENTIAL = ['rut', 'nombre', 'plan', 'saldoPendiente', 'estadoComercial', 'diasAtraso', 'accionSugerida'];
const OPERATIONAL = ['rut', 'nombre', 'direccion', 'telefono', 'email', 'plan', 'zona', 'estadoServicio', 'tipoDocumento', 'numeroDocumento', 'montoDocumento', 'fechaEmision', 'fechaVencimientoEfectiva', 'totalPagado', 'saldoPendiente', 'diasAtraso', 'diaPago', 'estadoComercial', 'ultimaGestion', 'accionSugerida', 'convenioActivo', 'prorrogaActiva', 'avisoRetiro', 'formaPago', 'codigoTransaccion', 'cargosPendientes'];
const COLUMNS: Record<string, { label: string; render: (row: ControlRow) => string | number }> = {
  rut: { label: 'RUT', render: (r) => r.rut ?? '-' }, nombre: { label: 'Nombre', render: (r) => r.nombre }, direccion: { label: 'Dirección', render: (r) => r.direccion ?? '-' },
  telefono: { label: 'Teléfono', render: (r) => r.telefono ?? '-' }, email: { label: 'Correo', render: (r) => r.email ?? '-' }, plan: { label: 'Plan/Servicio', render: (r) => r.plan ?? '-' },
  zona: { label: 'Zona', render: (r) => r.zona ?? '-' }, estadoServicio: { label: 'Estado servicio', render: (r) => r.estadoServicio ?? '-' }, tipoDocumento: { label: 'Documento', render: (r) => r.tipoDocumento ?? '-' },
  numeroDocumento: { label: 'Folio', render: (r) => r.numeroDocumento }, montoDocumento: { label: 'Monto', render: (r) => r.montoDocumento === null ? '-' : currency.format(r.montoDocumento) },
  fechaEmision: { label: 'Emisión', render: (r) => r.fechaEmision ?? '-' }, fechaVencimientoEfectiva: { label: 'Vencimiento', render: (r) => r.fechaVencimientoEfectiva },
  totalPagado: { label: 'Pagado', render: (r) => currency.format(r.totalPagado) }, saldoPendiente: { label: 'Deuda', render: (r) => r.saldoPendiente === null ? '-' : currency.format(r.saldoPendiente) },
  diasAtraso: { label: 'Días atraso', render: (r) => r.diasAtraso ?? '-' }, diaPago: { label: 'Día pago', render: (r) => r.diaPago }, estadoComercial: { label: 'Estado comercial', render: (r) => r.estadoComercial.replace(/_/g, ' ') },
  ultimaGestion: { label: 'Última gestión', render: (r) => r.ultimaGestion?.replace(/_/g, ' ') ?? '-' }, accionSugerida: { label: 'Acción sugerida', render: (r) => r.accionSugerida },
  convenioActivo: { label: 'Convenio', render: (r) => r.convenioActivo ? 'Sí' : 'No' }, prorrogaActiva: { label: 'Prórroga', render: (r) => r.prorrogaActiva ? 'Sí' : 'No' },
  avisoRetiro: { label: 'Aviso retiro', render: (r) => r.avisoRetiro ? 'Registrado' : 'No' }, formaPago: { label: 'Último pago', render: (r) => r.formaPago ?? '-' },
  codigoTransaccion: { label: 'Voucher/TX', render: (r) => r.codigoTransaccion ?? '-' }, cargosPendientes: { label: 'Cargos pendientes', render: (r) => currency.format(r.cargosPendientes) },
};

export function CommercialControlBookPanel({ scope, writeCompanyId, permissions, onOpenCustomers, onOpenBilling }: {
  scope: string; writeCompanyId: number; permissions: DashboardPermissions; onOpenCustomers: () => void; onOpenBilling: () => void;
}) {
  const [data, setData] = useState<ControlResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<'essential' | 'operational'>('essential'); const [visible, setVisible] = useState<string[]>(ESSENTIAL); const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<ControlRow | null>(null); const [action, setAction] = useState<ActionName>(null); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const [form, setForm] = useState({ canal: 'TELEFONO', fecha: new Date().toISOString().slice(0, 10), observacion: '', monto: '', cuotas: '1', condiciones: '', nuevaFecha: '', diaPago: '', tipoCargo: 'REPOSICION' });
  const [leadOpen, setLeadOpen] = useState(false); const [lead, setLead] = useState({ nombreCompleto: '', rut: '', email: '', telefono: '', direccion: '', comuna: '', region: '' });

  const params = useMemo(() => ({ idEmpresa: scope !== 'consolidado' ? scope : writeCompanyId, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')), page, pageSize: 30 }), [scope, writeCompanyId, filters, page]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); void api.get<ControlResponse>('/commercial/control-book', { params, signal: controller.signal }).then(({ data: result }) => setData(result)).catch((err) => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [params, refresh]);
  useEffect(() => setPage(1), [scope, filters]);

  function changeView(next: 'essential' | 'operational') { setView(next); setVisible(next === 'essential' ? ESSENTIAL : OPERATIONAL); }
  function openAction(next: ActionName, row: ControlRow) { setSelected(row); setAction(next); setMessage(''); setForm({ canal: 'TELEFONO', fecha: new Date().toISOString().slice(0, 10), observacion: '', monto: String(row.saldoPendiente ?? ''), cuotas: '1', condiciones: '', nuevaFecha: '', diaPago: String(row.diaPago), tipoCargo: 'REPOSICION' }); }
  async function exportFile(format: 'csv' | 'xlsx') { setError(''); try { const response = await api.get('/commercial/control-book/export', { params: { ...params, format, columns: visible.join(','), page: undefined, pageSize: undefined }, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `libro-control.${format}`; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(apiErrorMessage(err)); } }

  async function submitAction() {
    if (!selected || !action) return; setSaving(true); setMessage('');
    try {
      const base = { idCliente: selected.idCliente, idContrato: selected.idContrato, idServicio: selected.idServicio ?? undefined, idFactura: selected.idFactura };
      if (action === 'event' || action === 'lastNotice' || action === 'withdrawal') await api.post(action === 'withdrawal' ? '/commercial/withdrawal-notices' : '/commercial/events', { ...base, tipo: action === 'lastNotice' ? 'ULTIMO_AVISO_CORTE' : action === 'withdrawal' ? 'AVISO_PREVIO_RETIRO' : 'CONTACTO_CLIENTE', canal: form.canal, fecha: `${form.fecha}T12:00:00.000Z`, observacion: form.observacion });
      if (action === 'agreement') { const amount = Number(form.monto); const count = Number(form.cuotas); const start = form.fecha; const perInstallment = Math.floor((amount / count) * 100) / 100; const cuotas = Array.from({ length: count }, (_, index) => { const date = new Date(`${start}T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + index); return { numero: index + 1, monto: index === count - 1 ? Number((amount - perInstallment * (count - 1)).toFixed(2)) : perInstallment, fechaVencimiento: date.toISOString().slice(0, 10) }; }); await api.post('/commercial/agreements', { ...base, montoComprometido: amount, cantidadCuotas: count, condiciones: form.condiciones, fechaInicio: start, cuotas }); }
      if (action === 'extension') await api.post('/commercial/extensions', { idFactura: selected.idFactura, nuevaFecha: form.nuevaFecha, motivo: form.observacion });
      if (action === 'paymentDay') await api.post('/commercial/payment-condition-changes', { idCliente: selected.idCliente, idContrato: selected.idContrato, tipoCambio: 'DIA_PAGO', valorNuevo: form.diaPago, justificacion: form.observacion });
      if (action === 'charge') await api.post('/commercial/additional-charges', { idCliente: selected.idCliente, idContrato: selected.idContrato, idServicio: selected.idServicio ?? undefined, tipo: form.tipoCargo, monto: Number(form.monto), fecha: form.fecha, observacion: form.observacion });
      setAction(null); setRefresh((value) => value + 1); setMessage('Gestión registrada correctamente');
    } catch (err) { setMessage(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  async function createLead() { setSaving(true); setMessage(''); try { await api.post('/commercial/non-contracting-leads', { ...lead, idEmpresa: writeCompanyId }); setLeadOpen(false); setLead({ nombreCompleto: '', rut: '', email: '', telefono: '', direccion: '', comuna: '', region: '' }); setMessage('Interesado guardado para remarketing'); } catch (err) { setMessage(apiErrorMessage(err)); } finally { setSaving(false); } }

  return <section className="control-book-workspace">
    <header className="control-book-header"><div><span className="eyebrow">Área comercial</span><h1>Libro Control Comercial</h1><p>Proyección normalizada por cliente, contrato y factura.</p></div><div className="control-book-header-actions"><button className="secondary" onClick={() => setRefresh((v) => v + 1)}><RefreshCw size={16}/>Actualizar</button>{permissions.manageCommercialCollections && <button onClick={() => setLeadOpen(true)}><UserPlus size={16}/>Interesado</button>}{permissions.exportControlBook && <><button className="secondary" onClick={() => void exportFile('csv')}><Download size={16}/>CSV</button><button className="secondary" onClick={() => void exportFile('xlsx')}><Sheet size={16}/>XLSX</button></>}</div></header>
    {message && <p className="alert">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="control-book-summary">{[['Filas', data?.summary.totalRows ?? 0], ['Deuda', currency.format(data?.summary.totalDebt ?? 0)], ['Vencidas', data?.summary.overdueCount ?? 0], ['Convenios', data?.summary.agreementsCount ?? 0], ['Prórrogas', data?.summary.extensionsCount ?? 0]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="control-book-toolbar">
      <label className="control-search"><Search size={16}/><input placeholder="RUT, nombre, teléfono, contrato o folio" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}/></label>
      <select aria-label="Estado comercial" value={filters.estadoComercial} onChange={(e) => setFilters({ ...filters, estadoComercial: e.target.value })}><option value="">Todos los estados comerciales</option>{data?.filterOptions.commercialStatuses.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Estado de servicio" value={filters.estadoServicio} onChange={(e) => setFilters({ ...filters, estadoServicio: e.target.value })}><option value="">Todos los servicios</option>{data?.filterOptions.serviceStatuses.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Plan" value={filters.idPlan} onChange={(e) => setFilters({ ...filters, idPlan: e.target.value })}><option value="">Todos los planes</option>{data?.filterOptions.plans.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select aria-label="Zona" value={filters.idZona} onChange={(e) => setFilters({ ...filters, idZona: e.target.value })}><option value="">Todas las zonas</option>{data?.filterOptions.zones.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select aria-label="Deuda" value={filters.conDeuda} onChange={(e) => setFilters({ ...filters, conDeuda: e.target.value })}><option value="">Con y sin deuda</option><option value="true">Con deuda</option><option value="false">Sin deuda</option></select>
      <select aria-label="Vencimiento" value={filters.vencido} onChange={(e) => setFilters({ ...filters, vencido: e.target.value })}><option value="">Vencidas y no vencidas</option><option value="true">Solo vencidas</option><option value="false">No vencidas</option></select>
      <select aria-label="Convenio" value={filters.conConvenio} onChange={(e) => setFilters({ ...filters, conConvenio: e.target.value })}><option value="">Con y sin convenio</option><option value="true">Con convenio</option><option value="false">Sin convenio</option></select>
      <select aria-label="Prórroga" value={filters.conProrroga} onChange={(e) => setFilters({ ...filters, conProrroga: e.target.value })}><option value="">Con y sin prórroga</option><option value="true">Con prórroga</option><option value="false">Sin prórroga</option></select>
      <select aria-label="Último aviso" value={filters.conUltimoAviso} onChange={(e) => setFilters({ ...filters, conUltimoAviso: e.target.value })}><option value="">Con y sin último aviso</option><option value="true">Con último aviso</option><option value="false">Sin último aviso</option></select>
      <select aria-label="Retiro pendiente" value={filters.retiroPendiente} onChange={(e) => setFilters({ ...filters, retiroPendiente: e.target.value })}><option value="">Con y sin retiro</option><option value="true">Retiro pendiente</option><option value="false">Sin retiro pendiente</option></select>
      <input aria-label="Días de atraso mínimos" title="Días de atraso mínimos" type="number" min="0" placeholder="Atraso mín." value={filters.diasAtrasoMin} onChange={(e) => setFilters({ ...filters, diasAtrasoMin: e.target.value })}/>
      <input aria-label="Días de atraso máximos" title="Días de atraso máximos" type="number" min="0" placeholder="Atraso máx." value={filters.diasAtrasoMax} onChange={(e) => setFilters({ ...filters, diasAtrasoMax: e.target.value })}/>
      <input aria-label="Vencimiento desde" title="Vencimiento desde" type="date" value={filters.fechaVencimientoDesde} onChange={(e) => setFilters({ ...filters, fechaVencimientoDesde: e.target.value })}/>
      <input aria-label="Vencimiento hasta" title="Vencimiento hasta" type="date" value={filters.fechaVencimientoHasta} onChange={(e) => setFilters({ ...filters, fechaVencimientoHasta: e.target.value })}/>
      <select aria-label="Ordenar por" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="diasAtraso">Días de atraso</option><option value="saldo">Saldo</option><option value="fechaVencimiento">Vencimiento</option><option value="ultimaGestion">Última gestión</option><option value="nombre">Nombre</option></select>
      <select aria-label="Dirección de orden" value={filters.order} onChange={(e) => setFilters({ ...filters, order: e.target.value })}><option value="desc">Descendente</option><option value="asc">Ascendente</option></select>
      <button className="secondary" onClick={() => setColumnsOpen(!columnsOpen)}><Columns3 size={16}/>Columnas</button>
      <button className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>
    </section>
    <div className="control-view-switch"><button className={view === 'essential' ? 'active' : 'secondary'} onClick={() => changeView('essential')}>Vista esencial</button><button className={view === 'operational' ? 'active' : 'secondary'} onClick={() => changeView('operational')}>Vista operativa Finet</button><span><Filter size={14}/>{data?.pagination.totalRows ?? 0} resultados</span></div>
    {columnsOpen && <div className="control-column-picker">{Object.entries(COLUMNS).map(([key, column]) => <label key={key}><input type="checkbox" checked={visible.includes(key)} onChange={() => setVisible((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}/>{column.label}</label>)}</div>}
    <div className="control-table-shell">{loading ? <div className="control-empty">Cargando Libro Control…</div> : !data?.items.length ? <div className="control-empty">No hay filas para los filtros seleccionados.</div> : <table className="control-table"><thead><tr>{visible.map((key, index) => <th key={key} className={index < 5 ? `sticky-control sticky-${index}` : ''}>{COLUMNS[key].label}</th>)}<th className="actions-column">Acciones</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.rowId}>{visible.map((key, index) => <td key={key} className={`${index < 5 ? `sticky-control sticky-${index}` : ''} ${key === 'estadoComercial' ? 'commercial-status-cell' : ''}`} title={String(COLUMNS[key].render(row))}>{key === 'estadoComercial' ? <StatusBadge value={String(COLUMNS[key].render(row))}/> : COLUMNS[key].render(row)}</td>)}<td className="control-row-actions"><button className="secondary compact" onClick={() => openAction('detail', row)}>Detalle</button>{permissions.manageCommercialCollections && <><button className="secondary compact" onClick={() => openAction('event', row)}>Gestión</button><button className="secondary compact" disabled={!row.saldoPendiente} onClick={() => openAction('lastNotice', row)}>Último aviso</button><button className="secondary compact" disabled={!row.saldoPendiente} onClick={() => openAction('agreement', row)}>Convenio</button><button className="secondary compact" disabled={!row.saldoPendiente} onClick={() => openAction('extension', row)}>Prórroga</button><button className="secondary compact" onClick={() => openAction('paymentDay', row)}>Día pago</button><button className="secondary compact" onClick={() => openAction('charge', row)}>Cargo</button><button className="secondary compact" disabled={!row.idServicio} onClick={() => openAction('withdrawal', row)}>Aviso retiro</button></>}</td></tr>)}</tbody></table>}</div>
    <footer className="control-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {data?.pagination.page ?? page} de {data?.pagination.totalPages ?? 1}</span><button className="secondary" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button></footer>

    <Modal open={Boolean(action && selected)} title={action === 'detail' ? 'Detalle comercial' : 'Registrar gestión comercial'} onClose={() => setAction(null)}>{selected && action === 'detail' ? <div className="control-detail"><dl><div><dt>Cliente</dt><dd>{selected.nombre} · {selected.rut}</dd></div><div><dt>Contrato / factura</dt><dd>{selected.numeroContrato} · {selected.numeroDocumento}</dd></div><div><dt>Servicios</dt><dd>{selected.serviciosRelacionados.join(', ') || 'Sin servicio'}</dd></div><div><dt>Estado</dt><dd>{selected.estadoComercial.replace(/_/g, ' ')}</dd></div><div><dt>Acción sugerida</dt><dd>{selected.accionSugerida}</dd></div><div><dt>Observación</dt><dd>{selected.observacionRelevante ?? 'Sin observación'}</dd></div></dl><div className="control-detail-actions"><button onClick={onOpenCustomers}>Abrir ficha cliente/servicio</button><button className="secondary" onClick={onOpenBilling}>Abrir cobranza/factura</button></div></div> : selected && <form className="control-action-form" onSubmit={(event) => { event.preventDefault(); void submitAction(); }}>
      {(['event','lastNotice','withdrawal'] as ActionName[]).includes(action) && <><label>Canal<select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}><option>TELEFONO</option><option>EMAIL</option><option>WHATSAPP</option><option>PRESENCIAL</option><option>OTRO</option></select></label><label>Fecha<input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}/></label></>}
      {action === 'agreement' && <><label>Monto comprometido<input type="number" min="1" required value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}/></label><label>Cantidad cuotas<input type="number" min="1" max="60" required value={form.cuotas} onChange={(e) => setForm({ ...form, cuotas: e.target.value })}/></label><label>Fecha inicial<input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}/></label><label>Condiciones<textarea required value={form.condiciones} onChange={(e) => setForm({ ...form, condiciones: e.target.value })}/></label></>}
      {action === 'extension' && <label>Nueva fecha<input type="date" required value={form.nuevaFecha} onChange={(e) => setForm({ ...form, nuevaFecha: e.target.value })}/></label>}
      {action === 'paymentDay' && <label>Nuevo día de pago<input type="number" min="1" max="28" required value={form.diaPago} onChange={(e) => setForm({ ...form, diaPago: e.target.value })}/></label>}
      {action === 'charge' && <><label>Concepto<select value={form.tipoCargo} onChange={(e) => setForm({ ...form, tipoCargo: e.target.value })}><option>REPOSICION</option><option>RECONEXION</option><option>RETIRO</option><option>OTRO</option></select></label><label>Monto<input type="number" min="1" required value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}/></label><label>Fecha<input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}/></label></>}
      {action !== 'agreement' && <label>Observación / justificación<textarea required={action !== 'charge'} value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })}/></label>}<button disabled={saving}>{saving ? 'Guardando…' : 'Confirmar registro'}</button>{message && <p className="alert">{message}</p>}
    </form>}</Modal>
    <Modal open={leadOpen} title="Interesado no contratante" onClose={() => setLeadOpen(false)}><form className="control-action-form" onSubmit={(event) => { event.preventDefault(); void createLead(); }}>{Object.entries({ nombreCompleto: 'Nombre completo', rut: 'RUT', email: 'Correo', telefono: 'Teléfono', direccion: 'Dirección', comuna: 'Comuna', region: 'Región' }).map(([key, label]) => <label key={key}>{label}<input required type={key === 'email' ? 'email' : 'text'} value={lead[key as keyof typeof lead]} onChange={(e) => setLead({ ...lead, [key]: e.target.value })}/></label>)}<button disabled={saving}>{saving ? 'Guardando…' : 'Guardar para remarketing'}</button></form></Modal>
  </section>;
}
