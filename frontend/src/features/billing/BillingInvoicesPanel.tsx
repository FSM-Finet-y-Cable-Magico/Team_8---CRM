import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, BillingInvoice, BillingInvoiceDetail, BillingInvoicePage } from '../../api';
import { formatDateOnly } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { type ControlRow } from '../commercial/control-book-model';
import { PaymentTaxDocument } from './PaymentTaxDocument';

const money = (value: number | string | null) => value === null ? 'Sin monto' : Number(value).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });
type Action = 'payment';
const initialForm = () => ({ monto: '', pasarela: 'Transferencia', codigoTransaccion: '' });

export function BillingInvoicesPanel({ scope, permissions, onChanged, revision, focusedInvoice, onFocusConsumed, showList = true }: { scope: string; permissions: DashboardPermissions; onChanged: () => void; revision: unknown; focusedInvoice?: Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'> | null; onFocusConsumed?: () => void; showList?: boolean }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [estado, setEstado] = useState('');
  const [result, setResult] = useState<BillingInvoicePage | null>(null), [selected, setSelected] = useState<BillingInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [reload, setReload] = useState(0), [action, setAction] = useState<Action | null>(null), [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const consumeFocus = useRef(onFocusConsumed);
  useEffect(() => { consumeFocus.current = onFocusConsumed; }, [onFocusConsumed]);
  useEffect(() => {
    if (!focusedInvoice?.idFactura) return;
    if (scope !== 'consolidado' && scope !== String(focusedInvoice.idEmpresa)) {
      setError('El documento no pertenece a la empresa seleccionada.'); consumeFocus.current?.(); return;
    }
    const controller = new AbortController();
    void api.get<BillingInvoiceDetail>(`/billing/invoices/${focusedInvoice.idFactura}`, { params: { scope }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.contrato?.cliente?.idCliente !== focusedInvoice.idCliente) { setError('El documento no corresponde al cliente seleccionado.'); return; }
        setSelected(data); setAction(null); setMessage('');
      })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) consumeFocus.current?.(); });
    return () => controller.abort();
  }, [focusedInvoice, scope]);


  useEffect(() => { setPage(1); setSelected(null); setAction(null); }, [scope]);
  useEffect(() => {
    if (!showList) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void api.get<BillingInvoicePage>('/billing/invoices', { params: { scope, page, pageSize: 20, search: search || undefined, estado: estado || undefined }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResult(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setResult(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, page, search, estado, reload, revision, showList]);

  async function detail(row: BillingInvoice) {
    setError(''); setMessage('');
    try { const { data } = await api.get<BillingInvoiceDetail>(`/billing/invoices/${row.idFactura}`, { params: { scope } }); setSelected(data); setAction(null); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  function openAction() { setAction('payment'); setMessage(''); setForm({ ...initialForm(), monto: String(selected?.saldo ?? '') }); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected?.contrato?.cliente || !action || saving) return;
    const base = { idFactura: selected.idFactura, idCliente: selected.contrato.cliente.idCliente, idContrato: selected.idContrato };
    setSaving(true); setMessage('');
    try {
      if (action === 'payment') await api.post('/billing/payments', { idFactura: base.idFactura, monto: Number(form.monto), pasarela: form.pasarela.trim(), codigoTransaccion: form.codigoTransaccion.trim() || undefined });
      setAction(null); setMessage('Operación registrada.'); setReload(v => v + 1); onChanged();
      const { data } = await api.get<BillingInvoiceDetail>(`/billing/invoices/${selected.idFactura}`, { params: { scope } }); setSelected(data);
    } catch (err) { setMessage(apiErrorMessage(err)); }
    finally { setSaving(false); }
  }
  async function approve(id: number) {
    if (!selected || saving) return; setSaving(true); setMessage('');
    try { await api.post(`/commercial/agreements/${id}/approve`); const { data } = await api.get<BillingInvoiceDetail>(`/billing/invoices/${selected.idFactura}`, { params: { scope } }); setSelected(data); setMessage('Convenio aprobado.'); onChanged(); }
    catch (err) { setMessage(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  return <>
    {showList && <details className="billing-workspace-section">
    <summary><span>Facturas y pagos</span><strong>{result?.pagination.totalRows ?? 0}</strong></summary>
    <section className="panel stack">
      <div className="billing-section-actions">
        <label>Buscar factura, folio o cliente<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} maxLength={100} /></label>
        <label>Estado registrado<select value={estado} onChange={e => { setEstado(e.target.value); setPage(1); }}><option value="">Todos</option>{['Pendiente', 'Vencida', 'Pagada', 'Anulada'].map(s => <option key={s}>{s}</option>)}</select></label>
        <button type="button" className="secondary compact" onClick={() => setReload(v => v + 1)}>Actualizar facturas</button>
      </div>
      {error && <p role="alert" className="inline-status">{error}</p>}
      {loading ? <p role="status">Cargando facturas…</p> : <div className="table-wrap"><table><thead><tr><th>Factura / folio</th><th>Cliente</th><th>Estado registrado / calculado</th><th>Vencimiento efectivo</th><th>Monto</th><th>Pagado</th><th>Saldo</th><th>Detalle</th></tr></thead>
        <tbody>{result?.items.map(row => <tr key={row.idFactura}><td>{row.idFactura} / {row.folioExterno ?? '—'}</td><td>{row.contrato?.cliente?.nombreCompleto ?? 'Sin cliente'}</td><td>{row.estado} / {row.estadoCalculado}</td><td>{formatDateOnly(row.fechaVencimientoEfectiva)}</td><td>{money(row.monto)}</td><td>{money(row.pagado)}</td><td>{money(row.saldo)}</td><td><button className="secondary compact" onClick={() => void detail(row)}>Ver factura {row.idFactura}</button></td></tr>)}</tbody></table></div>}
      {!loading && result?.items.length === 0 && <p className="empty-state">No hay facturas para este alcance y búsqueda.</p>}
      <TablePagination currentPage={page} totalItems={result?.pagination.totalRows ?? 0} pageSize={20} onPageChange={setPage} />
    </section>
    </details>}
    {!showList && error && <p role="alert" className="inline-status">{error}</p>}
    <Modal title={selected ? `Factura ${selected.idFactura}` : 'Factura'} open={Boolean(selected)} onClose={() => { if (!saving) { setSelected(null); setAction(null); } }}>
      {selected && <section className="stack">
        <p><strong>{selected.contrato?.cliente?.nombreCompleto ?? 'Sin cliente'}</strong> · Contrato {selected.idContrato ?? '—'}</p>
        <p>Monto: {money(selected.monto)} · Pagado: {money(selected.pagado)} · Saldo: {money(selected.saldo)} · Estado: {selected.estadoCalculado}</p>
        <p>Vencimiento original: {formatDateOnly(selected.fechaLimitePago)} · Vigente: {formatDateOnly(selected.fechaVencimientoEfectiva)}</p>
        {selected.estado === 'Anulada' && <p>Documento anulado: su diferencia contable no es deuda cobrable.</p>}
        {message && <p className="inline-status" role="status">{message}</p>}
        {selected.contrato?.cliente && <div className="table-actions">
          {permissions.manageBilling && selected.aceptaPagos && <button disabled={saving} onClick={() => openAction()}>Registrar pago</button>}
        </div>}
        {action && <form className="stack" onSubmit={submit}>
          <h3>Registrar pago</h3>
          <label>Monto<input type="number" min="0.01" max={selected.saldo ?? undefined} step="0.01" required value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} /></label>
          <label>Medio de pago<input required maxLength={30} value={form.pasarela} onChange={e => setForm({ ...form, pasarela: e.target.value })} /></label>
          <label>Referencia de transacción<input maxLength={100} value={form.codigoTransaccion} onChange={e => setForm({ ...form, codigoTransaccion: e.target.value })} /></label>
          <div className="table-actions"><button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar'}</button><button disabled={saving} className="secondary" type="button" onClick={() => setAction(null)}>Cancelar</button></div>
        </form>}
        <details open><summary>Pagos ({selected.pagos.length})</summary>{selected.pagos.map(p => <section key={p.idPago}><p>{formatDateOnly(p.fechaPago)} · {money(p.monto)} · {p.pasarela} · {p.codigoTransaccion ?? 'Sin referencia'}</p><PaymentTaxDocument idPago={p.idPago} canManage={permissions.manageBilling} canReconcile={permissions.reconcileTaxDocuments} /></section>)}</details>
        {permissions.approveAgreements && selected.convenios.some(c => c.estado === 'PENDIENTE') && <details open><summary>Convenios pendientes de aprobación</summary>{selected.convenios.filter(c => c.estado === 'PENDIENTE').map(c => <section className="stack" key={c.idConvenio}><h3>Convenio pendiente</h3><p>{money(c.montoComprometido)} · {c.condiciones}</p>{c.cuotas.map(q => <p key={q.idCuota}>Cuota {q.numero}: {money(q.monto)} · {formatDateOnly(q.fechaVencimiento)} · {q.estado}</p>)}<button disabled={saving} onClick={() => void approve(c.idConvenio)}>Aprobar convenio</button></section>)}</details>}
      </section>}
    </Modal>
  </>;
}
