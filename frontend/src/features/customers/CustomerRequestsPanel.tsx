import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerRequest, CustomerService } from '../../api';
import { formatDateTime, formatWorkOrderValue } from '../../lib';
import { Modal, StatusBadge } from '../../shared/components';
import { ObservationsModal } from '../observations';
import { NewCustomerRequestModal } from './NewCustomerRequestModal';
import type { CustomerServicesLoadStatus } from './customer-services-state';

const closed = ['Cerrada', 'No Factible', 'Cancelada'];

export function CustomerRequestsPanel({ customer, services, servicesStatus = services.length ? 'success' : 'empty', onChanged }: {
  customer: Customer; services: CustomerService[]; servicesStatus?: CustomerServicesLoadStatus; onChanged: () => void;
}) {
  const [rows, setRows] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

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

  function created(success: string) {
    setCreating(false); setMessage(success);
    void load().catch(() => setMessage(success + ' No se pudo actualizar la lista. Vuelve a abrir el cliente para consultarla.'));
    onChanged();
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
    {creating && <NewCustomerRequestModal key={customer.idCliente} customer={customer} services={services} servicesStatus={servicesStatus} onClose={() => setCreating(false)} onCreated={created} />}
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
