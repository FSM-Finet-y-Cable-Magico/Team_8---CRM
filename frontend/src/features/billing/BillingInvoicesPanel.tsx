import { FormEvent, useEffect, useState } from 'react';
import { api, apiErrorMessage, BillingInvoice, BillingInvoiceDetail, BillingInvoicePage } from '../../api';
import { formatDateOnly } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { PaymentTaxDocument } from './PaymentTaxDocument';

const money = (value: number | string | null) => value === null ? 'Sin monto' : Number(value).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });
type Action = 'payment' | 'agreement' | 'extension' | 'condition' | 'charge' | 'event';
const labels: Record<Action, string> = { payment: 'Registrar pago', agreement: 'Crear convenio', extension: 'Registrar prórroga', condition: 'Cambiar condición', charge: 'Registrar cargo', event: 'Registrar gestión' };
const initialForm = () => ({ monto: '', pasarela: 'Transferencia', codigoTransaccion: '', fecha: new Date().toISOString().slice(0, 10), nuevaFecha: '', condiciones: '', observacion: '', cantidad: '1', tipoCargo: 'REPOSICION', tipoCambio: 'DIA_PAGO', valorNuevo: '', canal: 'TELEFONO' });

export function BillingInvoicesPanel({ scope, permissions, onChanged, revision }: { scope: string; permissions: DashboardPermissions; onChanged: () => void; revision: unknown }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [estado, setEstado] = useState('');
  const [result, setResult] = useState<BillingInvoicePage | null>(null), [selected, setSelected] = useState<BillingInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [reload, setReload] = useState(0), [action, setAction] = useState<Action | null>(null), [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [cuotas, setCuotas] = useState<Array<{ numero: number; monto: string; fechaVencimiento: string }>>([]);

  useEffect(() => { setPage(1); setSelected(null); setAction(null); }, [scope]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void api.get<BillingInvoicePage>('/billing/invoices', { params: { scope, page, pageSize: 20, search: search || undefined, estado: estado || undefined }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResult(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setResult(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, page, search, estado, reload, revision]);

  async function detail(row: BillingInvoice) {
    setError(''); setMessage('');
    try { const { data } = await api.get<BillingInvoiceDetail>(`/billing/invoices/${row.idFactura}`, { params: { scope } }); setSelected(data); setAction(null); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  function openAction(next: Action) { setAction(next); setMessage(''); setForm({ ...initialForm(), monto: String(selected?.saldo ?? ''), valorNuevo: String(selected?.contrato?.diaVencimiento ?? '') }); setCuotas([]); }
  function prepareInstallments() {
    const amount = Math.round(Number(form.monto) * 100), count = Number(form.cantidad);
    if (!Number.isInteger(count) || count < 1 || count > 60 || !Number.isSafeInteger(amount) || amount < count || !form.fecha) { setMessage('Revisa monto, fecha y cantidad de cuotas (1 a 60).'); return; }
    const start = new Date(form.fecha + 'T00:00:00Z'), each = Math.floor(amount / count);
    setCuotas(Array.from({ length: count }, (_, i) => {
      const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(start.getUTCDate(), last));
      return { numero: i + 1, monto: String((i === count - 1 ? amount - each * (count - 1) : each) / 100), fechaVencimiento: date.toISOString().slice(0, 10) };
    }));
    setMessage('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected?.contrato?.cliente || !action || saving) return;
    const base = { idFactura: selected.idFactura, idCliente: selected.contrato.cliente.idCliente, idContrato: selected.idContrato };
    setSaving(true); setMessage('');
    try {
      if (action === 'payment') await api.post('/billing/payments', { idFactura: base.idFactura, monto: Number(form.monto), pasarela: form.pasarela.trim(), codigoTransaccion: form.codigoTransaccion.trim() || undefined });
      if (action === 'agreement') {
        if (cuotas.length !== Number(form.cantidad)) {
          setMessage('Genera y revisa el detalle de cuotas antes de guardar.');
          return;
        }
        await api.post('/commercial/agreements', { ...base, montoComprometido: Number(form.monto), cantidadCuotas: Number(form.cantidad), condiciones: form.condiciones, fechaInicio: form.fecha, cuotas: cuotas.map(c => ({ ...c, monto: Number(c.monto) })) });
      }
      if (action === 'extension') await api.post('/commercial/extensions', { idFactura: base.idFactura, nuevaFecha: form.nuevaFecha, motivo: form.observacion });
      if (action === 'condition') await api.post('/commercial/payment-condition-changes', { ...base, tipoCambio: form.tipoCambio, valorNuevo: form.valorNuevo, justificacion: form.observacion });
      if (action === 'charge') await api.post('/commercial/additional-charges', { idCliente: base.idCliente, idContrato: base.idContrato, tipo: form.tipoCargo, monto: Number(form.monto), fecha: form.fecha, observacion: form.observacion });
      if (action === 'event') await api.post('/commercial/events', { ...base, tipo: 'CONTACTO_CLIENTE', canal: form.canal, fecha: form.fecha + 'T12:00:00Z', observacion: form.observacion });
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

  return <details className="billing-workspace-section" open>
    <summary><span>Facturas y gestiones de cobranza</span><strong>{result?.pagination.totalRows ?? 0}</strong></summary>
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
    <Modal title={selected ? `Factura ${selected.idFactura}` : 'Factura'} open={Boolean(selected)} onClose={() => { if (!saving) { setSelected(null); setAction(null); } }}>
      {selected && <section className="stack">
        <p><strong>{selected.contrato?.cliente?.nombreCompleto ?? 'Sin cliente'}</strong> · Contrato {selected.idContrato ?? '—'}</p>
        <p>Monto: {money(selected.monto)} · Pagado: {money(selected.pagado)} · Saldo: {money(selected.saldo)} · Estado: {selected.estadoCalculado}</p>
        <p>Vencimiento original: {formatDateOnly(selected.fechaLimitePago)} · Vigente: {formatDateOnly(selected.fechaVencimientoEfectiva)}</p>
        {selected.estado === 'Anulada' && <p>Documento anulado: su diferencia contable no es deuda cobrable.</p>}
        {message && <p className="inline-status" role="status">{message}</p>}
        {selected.contrato?.cliente && <div className="table-actions">
          {permissions.manageBilling && selected.aceptaPagos && <button disabled={saving} onClick={() => openAction('payment')}>Registrar pago</button>}
          {permissions.manageCommercialCollections && (['agreement', 'extension', 'condition', 'charge', 'event'] as Action[]).map(key => <button key={key} className="secondary compact" disabled={saving || (['agreement', 'extension', 'condition'].includes(key) && !selected.aceptaPagos)} onClick={() => openAction(key)}>{labels[key]}</button>)}
        </div>}
        {action && <form className="stack" onSubmit={submit}>
          <h3>{labels[action]}</h3>
          {['payment', 'agreement', 'charge'].includes(action) && <label>Monto<input type="number" min="0.01" max={action === 'charge' ? 9999999999.99 : selected.saldo ?? undefined} step="0.01" required value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} /></label>}
          {action === 'payment' && <><label>Medio de pago<input required maxLength={30} value={form.pasarela} onChange={e => setForm({ ...form, pasarela: e.target.value })} /></label><label>Referencia de transacción<input maxLength={100} value={form.codigoTransaccion} onChange={e => setForm({ ...form, codigoTransaccion: e.target.value })} /></label></>}
          {['agreement', 'charge', 'event'].includes(action) && <label>Fecha<input type="date" required value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></label>}
          {action === 'agreement' && <><label>Condiciones<textarea required minLength={3} maxLength={2000} value={form.condiciones} onChange={e => setForm({ ...form, condiciones: e.target.value })} /></label><label>Cantidad de cuotas<input type="number" min={1} max={60} required value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} /></label><button type="button" className="secondary" onClick={prepareInstallments}>Generar detalle de cuotas</button>
            {cuotas.map((c, i) => <div className="workflow-grid" key={c.numero}><label>Monto cuota {c.numero}<input type="number" step="0.01" min="0.01" required value={c.monto} onChange={e => setCuotas(cuotas.map((x, index) => index === i ? { ...x, monto: e.target.value } : x))} /></label><label>Vencimiento cuota {c.numero}<input type="date" required min={form.fecha} value={c.fechaVencimiento} onChange={e => setCuotas(cuotas.map((x, index) => index === i ? { ...x, fechaVencimiento: e.target.value } : x))} /></label></div>)}</>}
          {action === 'extension' && <label>Nueva fecha<input type="date" required min={selected.fechaVencimientoEfectiva} value={form.nuevaFecha} onChange={e => setForm({ ...form, nuevaFecha: e.target.value })} /></label>}
          {action === 'condition' && <><label>Tipo<select value={form.tipoCambio} onChange={e => setForm({ ...form, tipoCambio: e.target.value, valorNuevo: '' })}><option value="DIA_PAGO">Día de pago</option><option value="FECHA_COMPROMETIDA">Fecha comprometida</option></select></label><label>Nuevo valor<input type={form.tipoCambio === 'DIA_PAGO' ? 'number' : 'date'} min={form.tipoCambio === 'DIA_PAGO' ? 1 : selected.fechaVencimientoEfectiva} max={form.tipoCambio === 'DIA_PAGO' ? 28 : undefined} required value={form.valorNuevo} onChange={e => setForm({ ...form, valorNuevo: e.target.value })} /></label></>}
          {action === 'charge' && <><label>Tipo de cargo<select value={form.tipoCargo} onChange={e => setForm({ ...form, tipoCargo: e.target.value })}>{['REPOSICION', 'RECONEXION', 'RETIRO', 'OTRO'].map(t => <option key={t}>{t}</option>)}</select></label><p>El cargo queda pendiente de facturación. No modifica por sí solo el saldo de esta factura.</p></>}
          {action === 'event' && <label>Canal<select value={form.canal} onChange={e => setForm({ ...form, canal: e.target.value })}>{['TELEFONO', 'EMAIL', 'WHATSAPP', 'PRESENCIAL', 'OTRO'].map(t => <option key={t}>{t}</option>)}</select></label>}
          {['extension', 'condition', 'charge', 'event'].includes(action) && <label>Motivo / observación<textarea required minLength={3} maxLength={1000} value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })} /></label>}
          <div className="table-actions"><button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar'}</button><button disabled={saving} className="secondary" type="button" onClick={() => setAction(null)}>Cancelar</button></div>
        </form>}
        <details open><summary>Pagos ({selected.pagos.length})</summary>{selected.pagos.map(p => <section key={p.idPago}><p>{formatDateOnly(p.fechaPago)} · {money(p.monto)} · {p.pasarela} · {p.codigoTransaccion ?? 'Sin referencia'}</p><PaymentTaxDocument idPago={p.idPago} canManage={permissions.manageBilling} canReconcile={permissions.reconcileTaxDocuments} /></section>)}</details>
        <details><summary>Convenios y cuotas ({selected.convenios.length})</summary>{selected.convenios.map(c => <section className="stack" key={c.idConvenio}><h3>Convenio {c.idConvenio}: {c.estado}</h3><p>{money(c.montoComprometido)} · {c.condiciones}</p>{c.cuotas.map(q => <p key={q.idCuota}>Cuota {q.numero}: {money(q.monto)} · {formatDateOnly(q.fechaVencimiento)} · {q.estado}</p>)}{permissions.approveAgreements && c.estado === 'PENDIENTE' && <button disabled={saving} onClick={() => void approve(c.idConvenio)}>Aprobar convenio {c.idConvenio}</button>}</section>)}</details>
        <details><summary>Prórrogas ({selected.prorrogas.length})</summary>{selected.prorrogas.map(p => <p key={p.idProrroga}>{formatDateOnly(p.fechaOriginal)} → {formatDateOnly(p.nuevaFecha)} · {p.estado} · {p.motivo}</p>)}</details>
        <details><summary>Cargos del contrato ({selected.cargos.length})</summary>{selected.cargos.map(c => <p key={c.idCargo}>{c.tipo} · {money(c.monto)} · {c.estado} · {c.observacion}</p>)}</details>
        <details><summary>Cambios de condiciones ({selected.cambios.length})</summary>{selected.cambios.map(c => <p key={c.idCambio}>{c.tipoCambio}: {c.valorAnterior} → {c.valorNuevo} · {c.justificacion}</p>)}</details>
        <details><summary>Gestiones comerciales ({selected.eventos.length})</summary>{selected.eventos.map(e => <p key={e.idEvento}>{formatDateOnly(e.fecha)} · {e.tipo} · {e.canal} · {e.observacion}</p>)}</details>
      </section>}
    </Modal>
  </details>;
}
