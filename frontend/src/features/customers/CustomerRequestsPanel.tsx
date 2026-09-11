import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerRequest, CustomerService } from '../../api';
import { formatDateTime, formatWorkOrderValue } from '../../lib';
import { Modal, StatusBadge } from '../../shared/components';
import { ObservationsModal } from '../observations';

const closed = ['Cerrada', 'No Factible', 'Cancelada'];
const emptyForm = { tipoSolicitud: 'Cambio de plan', idServicio: '', descripcion: '' };

export function CustomerRequestsPanel({ customer, services, onChanged }: {
  customer: Customer; services: CustomerService[]; onChanged: () => void;
}) {
  const [rows, setRows] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<CustomerRequest | null>(null);
  const [nextStatus, setNextStatus] = useState('En Gestion');
  const [note, setNote] = useState('');
  const [feasible, setFeasible] = useState('');
  const [reason, setReason] = useState('');
  const [observing, setObserving] = useState<CustomerRequest | null>(null);
  const load = useCallback(async () => {
    const { data } = await api.get<CustomerRequest[]>(`/requests/customer/${customer.idCliente}`);
    setRows(data);
  }, [customer.idCliente]);
  useEffect(() => {
    let active = true;
    setLoading(true); setRows([]); setMessage(''); setSelected(null);
    api.get<CustomerRequest[]>(`/requests/customer/${customer.idCliente}`)
      .then(({ data }) => { if (active) setRows(data); })
      .catch(error => { if (active) setMessage(apiErrorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer.idCliente]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    try {
      await api.post('/requests', { ...form, idCliente: customer.idCliente,
        idServicio: form.idServicio ? Number(form.idServicio) : undefined,
        canalOrigen: 'CRM', estado: 'Abierta', descripcion: form.descripcion.trim() });
      setCreating(false); setForm(emptyForm); await load(); onChanged(); setMessage('Solicitud registrada.');
    } catch (error) { setMessage(apiErrorMessage(error)); }
    finally { setBusy(false); }
  }
  function manage(row: CustomerRequest) {
    setSelected(row); setNextStatus(row.estado === 'Abierta' ? 'En Gestion' : row.estado);
    setNote(row.observaciones ?? ''); setFeasible(''); setReason(''); setMessage('');
  }
  async function update(event: FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setMessage('');
    try {
      if (feasible) {
        await api.patch(`/requests/${selected.idSolicitud}/feasibility`, {
          factible: feasible === 'si', motivoNoFactible: reason.trim() || undefined, observaciones: note.trim(),
        });
      }
      if (feasible !== 'no') await api.patch(`/requests/${selected.idSolicitud}/status`, { estado: nextStatus, observaciones: note.trim() });
      setSelected(null); await load(); onChanged(); setMessage('Solicitud actualizada.');
    } catch (error) { setMessage(apiErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-panel">
    <header className="section-heading compact-heading"><div><h3>Solicitudes del cliente</h3>
      <p>{rows.filter(r => !closed.includes(r.estado)).length} abiertas · {rows.filter(r => closed.includes(r.estado)).length} cerradas en la lista</p></div>
      <button className="secondary compact" onClick={() => { setCreating(true); setMessage(''); }}><Plus size={15} /> Nueva solicitud</button></header>
    {message && <p role="status" className="inline-status">{message}</p>}
    {loading ? <p>Cargando solicitudes…</p> : <div className="table-wrap"><table><thead><tr><th>Solicitud</th><th>Servicio</th><th>Estado</th><th>Fecha</th><th>Acción</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.idSolicitud}><td>{row.tipoSolicitud}</td><td>{row.servicio?.contrato?.plan?.nombreComercial ?? 'General'}</td><td><StatusBadge value={row.estado} /></td><td>{formatDateTime(row.fechaCreacion)}</td><td><button className="secondary compact" onClick={() => manage(row)}>Ver detalle</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="empty-state">Sin solicitudes registradas.</p>}</div>}
    <Modal title="Nueva solicitud" open={creating} onClose={() => { if (!busy) setCreating(false); }}>
      <form className="workflow-grid" onSubmit={create}>
        <label>Tipo de solicitud<select value={form.tipoSolicitud} onChange={e => setForm({ ...form, tipoSolicitud: e.target.value })}>{['Cambio de plan', 'Consulta comercial', 'Actualización de datos', 'Baja de servicio', 'Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Servicio asociado<select value={form.idServicio} onChange={e => setForm({ ...form, idServicio: e.target.value })}><option value="">General del cliente</option>{services.map(s => <option key={s.idServicio} value={s.idServicio}>{s.contrato?.plan?.nombreComercial ?? s.tipoServicio} · #{s.idServicio}</option>)}</select></label>
        <label>Descripción<textarea required maxLength={1000} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label>
        {message && <p role="alert" className="alert">{message}</p>}
        <button disabled={busy || !form.descripcion.trim()}>{busy ? 'Guardando…' : 'Registrar solicitud'}</button>
      </form>
    </Modal>
    <Modal title="Detalle de solicitud" open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }}>
      {selected && <div className="stack"><h3>{selected.tipoSolicitud}</h3><p>{selected.descripcion}</p><StatusBadge value={selected.estado} />
        <p>Creada: {formatDateTime(selected.fechaCreacion)}{selected.fechaCierre ? ` · Cerrada: ${formatDateTime(selected.fechaCierre)}` : ''}</p>
        <p>Evaluación registrada: {selected.factible === null ? 'Pendiente' : selected.factible ? 'Factible' : 'No factible'}{selected.motivoNoFactible ? ` · ${selected.motivoNoFactible}` : ''}</p>
        <button className="secondary compact" onClick={() => setObserving(selected)}>Observaciones</button>
        {closed.includes(selected.estado) ? <p>{selected.observaciones || 'Esta solicitud está cerrada.'}</p> : <form className="workflow-grid" onSubmit={update}>
          <label>Estado<select value={nextStatus} onChange={e => setNextStatus(e.target.value)}>{['Abierta', 'En Gestion', 'Cerrada', 'Cancelada'].map(x => <option key={x} value={x}>{formatWorkOrderValue(x)}</option>)}</select></label>
          <label>Registrar evaluación<select value={feasible} onChange={e => setFeasible(e.target.value)}><option value="">Sin cambio</option><option value="si">Factible</option><option value="no">No factible</option></select></label>
          {feasible === 'no' && <label>Motivo de no factibilidad<input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>}
          <label>Observaciones de gestión<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
          {message && <p role="alert" className="alert">{message}</p>}
          <button disabled={busy || (feasible === 'no' && !reason.trim())}>{busy ? 'Guardando…' : 'Guardar gestión'}</button>
        </form>}
      </div>}
    </Modal>
    <ObservationsModal target={observing ? { tipoEntidad: 'Solicitud', idEntidad: observing.idSolicitud, label: observing.tipoSolicitud } : null} onClose={() => setObserving(null)} onSaved={onChanged} />
  </section>;
}
