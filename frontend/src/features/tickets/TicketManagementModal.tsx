import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ClipboardList, MessageSquare, Save, SlidersHorizontal, Wrench } from 'lucide-react';
import { api, apiErrorMessage, type Ticket, type TicketCategory } from '../../api';
import { formatDateTime, formatWorkOrderValue } from '../../lib';
import type { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { isCompletedTicketWorkOrder, isTechnicalTicketReadOnly, PENDING_ORDER_MESSAGE, ticketContent, ticketErrorMessage } from './ticket-presentation';
import './ticket-management.css';

type Tab = 'management' | 'activity' | 'resolution';
const states = ['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'];
const emptyDiagnosis = () => ({ causaRaiz: '', descripcionProblema: '', accionesRealizadas: '', estadoFinalServicio: 'Activo', observaciones: '' });
const ticketFields = (ticket: Ticket) => ({ category: String(ticket.idCategoria), priority: ticket.prioridad, status: ticket.estado });

export function TicketManagementModal({ ticket, categories, permissions, onClose, onChanged }: {
  ticket: Ticket;
  categories: TicketCategory[];
  permissions: DashboardPermissions;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('management');
  const [saved, setSaved] = useState(() => ticketFields(ticket));
  const [draft, setDraft] = useState(() => ticketFields(ticket));
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [diagnosis, setDiagnosis] = useState(emptyDiagnosis);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const pending = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  const order = ticket.workOrders?.find(item => !isCompletedTicketWorkOrder(item.estado)) ?? ticket.workOrders?.[0];
  const technicalReadOnly = isTechnicalTicketReadOnly(ticket);
  const hasOpenOrder = Boolean(ticket.hasOpenWorkOrder || ticket.workOrders?.some(item => !isCompletedTicketWorkOrder(item.estado)));
  const closureBlocked = hasOpenOrder && ['Resuelto', 'Cerrado'].includes(draft.status);
  const categoryChanged = permissions.classifyTickets && draft.category !== saved.category;
  const priorityChanged = permissions.classifyTickets && draft.priority !== saved.priority;
  const statusChanged = permissions.updateTicketStatus && draft.status !== saved.status;
  const hasChanges = categoryChanged || priorityChanged || statusChanged;
  const canManage = !technicalReadOnly && (permissions.classifyTickets || permissions.updateTicketStatus);
  const resolved = ['Resuelto', 'Cerrado'].includes(saved.status);
  const { report, activities } = ticketContent(ticket);
  const tabs = [
    { id: 'management' as const, label: 'Gestión', icon: SlidersHorizontal },
    { id: 'activity' as const, label: 'Seguimiento', icon: MessageSquare },
    ...(!technicalReadOnly && permissions.diagnoseTickets ? [{ id: 'resolution' as const, label: 'Resolución', icon: CheckCircle2 }] : []),
  ];

  useEffect(() => {
    const dialog = content.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    content.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending.current) close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); content.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', keyboard as EventListener);
    return () => { dialog.removeEventListener('keydown', keyboard as EventListener); if (opener?.isConnected) opener.focus(); };
  }, []);

  function startSaving() {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setFeedback(null); return true;
  }

  function finishSaving() { pending.current = false; setBusy(false); }

  async function saveManagement(event: FormEvent) {
    event.preventDefault();
    if (technicalReadOnly || !hasChanges || (statusChanged && closureBlocked) || !startSaving()) return;
    const completed: string[] = [];
    try {
      // The existing API has separate endpoints. Track each success so a retry
      // only sends the fields that could not be saved.
      if (categoryChanged) {
        await api.patch(`/tickets/${ticket.idTicket}/category`, { idCategoria: Number(draft.category) });
        setSaved(current => ({ ...current, category: draft.category })); completed.push('categoría');
      }
      if (priorityChanged) {
        await api.patch(`/tickets/${ticket.idTicket}/priority`, { prioridad: draft.priority });
        setSaved(current => ({ ...current, priority: draft.priority })); completed.push('prioridad');
      }
      if (statusChanged) {
        await api.patch(`/tickets/${ticket.idTicket}/status`, { estado: draft.status, comentario: comment.trim() });
        setSaved(current => ({ ...current, status: draft.status })); setComment(''); completed.push('estado');
      }
      setFeedback({ kind: 'success', text: 'Cambios guardados.' });
    } catch (error) {
      const detail = ticketErrorMessage(apiErrorMessage(error));
      setFeedback({ kind: 'error', text: completed.length ? `Se guardó: ${completed.join(', ')}. Quedan cambios pendientes. ${detail}` : detail });
    } finally { if (completed.length) onChanged(); finishSaving(); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (technicalReadOnly || !permissions.registerTechnicalNotes || note.trim().length < 3 || !startSaving()) return;
    try {
      await api.post(`/tickets/${ticket.idTicket}/technical-notes`, { observacion: note.trim() });
      setNote(''); setFeedback({ kind: 'success', text: 'Observación agregada al seguimiento.' }); onChanged();
    } catch (error) { setFeedback({ kind: 'error', text: ticketErrorMessage(apiErrorMessage(error)) }); }
    finally { finishSaving(); }
  }

  async function saveDiagnosis(event: FormEvent) {
    event.preventDefault();
    if (technicalReadOnly || !permissions.diagnoseTickets || hasOpenOrder || resolved || !diagnosis.causaRaiz.trim() || !startSaving()) return;
    try {
      await api.post(`/tickets/${ticket.idTicket}/diagnosis`, diagnosis);
      setSaved(current => ({ ...current, status: 'Resuelto' }));
      setDraft(current => ({ ...current, status: 'Resuelto' })); setComment('');
      setDiagnosis(emptyDiagnosis()); setFeedback({ kind: 'success', text: 'Diagnóstico registrado. El ticket está resuelto.' }); onChanged();
    } catch (error) { setFeedback({ kind: 'error', text: ticketErrorMessage(apiErrorMessage(error)) }); }
    finally { finishSaving(); }
  }

  const footer = (label?: string, disabled = false) => <footer className="ticket-modal-footer">
    {tab === 'management' && hasChanges && <span>Tienes cambios sin guardar</span>}
    <div><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cerrar</button>
      {label && <button type="submit" disabled={busy || disabled}><Save size={16} aria-hidden="true" />{busy ? 'Guardando…' : label}</button>}</div>
  </footer>;

  return <Modal title="Gestionar ticket" open onClose={() => { if (!pending.current) onClose(); }}>
    <div className="ticket-management" ref={content} tabIndex={-1} aria-busy={busy}>
      <section className="ticket-overview" aria-label="Resumen del ticket">
        <header className="ticket-overview-heading">
          <span className="ticket-overview-icon"><ClipboardList size={22} aria-hidden="true" /></span>
          <div><p>Ticket de soporte</p><h3>{ticket.codigoSeguimiento ?? `Ticket ${ticket.idTicket}`}</h3></div>
          <StatusBadge value={technicalReadOnly ? ticket.estadoPresentacion ?? formatWorkOrderValue(saved.status) : formatWorkOrderValue(saved.status)} />
        </header>
        <dl className="ticket-context">
          <div><dt>Cliente</dt><dd>{ticket.cliente?.nombreCompleto ?? 'Sin cliente asociado'}</dd></div>
          <div><dt>RUT</dt><dd>{ticket.cliente?.rut ?? 'No registrado'}</dd></div>
          <div><dt>Servicio</dt><dd>{ticket.idServicio ? `Servicio #${ticket.idServicio}` : 'Atención general'}</dd></div>
        </dl>
        <div className="ticket-report"><strong>Problema reportado</strong><p>{report || 'Sin descripción registrada.'}</p></div>
      </section>

      {technicalReadOnly && <p className="ticket-notice" role="status">Solo consulta: este ticket se gestiona desde operaciones técnicas. Puedes revisar su estado y seguimiento aquí.</p>}

      <div className="ticket-tabs" role="tablist" aria-label="Secciones del ticket">
        {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`ticket-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`ticket-panel-${id}`} tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`ticket-tab-${tabs[next].id}`)?.focus(); }
          }}><Icon size={17} aria-hidden="true" />{label}{id === 'activity' && activities.length > 0 && <span className="ticket-tab-count">{activities.length}</span>}</button>)}
      </div>

      {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`ticket-feedback ${feedback.kind}`}>{feedback.kind === 'success' && <Check size={17} aria-hidden="true" />}{feedback.text}</p>}

      {tab === 'management' && <form id="ticket-panel-management" role="tabpanel" aria-labelledby="ticket-tab-management" onSubmit={saveManagement}>
        <div className="ticket-panel-content">
          <header className="ticket-section-heading"><h3>Organiza la atención</h3><p>Clasifica el caso y actualiza su avance.</p></header>
          {canManage ? <fieldset className="ticket-fields" disabled={busy}>
            {permissions.classifyTickets ? <>
              <label>Categoría<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>
                {!categories.some(category => String(category.idCategoria) === draft.category) && <option value={draft.category}>{ticket.categoria?.nombre ?? 'Categoría actual'}</option>}
                {categories.map(category => <option key={category.idCategoria} value={category.idCategoria}>{category.nombre}</option>)}
              </select></label>
              <label>Prioridad<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}>{['Alta', 'Media', 'Baja'].map(value => <option key={value}>{value}</option>)}</select></label>
            </> : <div className="ticket-readonly ticket-field-wide"><span>Categoría: <strong>{ticket.categoria?.nombre ?? 'Sin categoría'}</strong></span><span>Prioridad: <StatusBadge value={formatWorkOrderValue(saved.priority)} /></span></div>}
            {permissions.updateTicketStatus && <label>Estado del ticket<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
              {states.map((value, index) => <option key={value} disabled={index < states.indexOf(saved.status)}>{value}</option>)}
            </select></label>}
            <div className={'ticket-order-field' + (permissions.updateTicketStatus ? '' : ' ticket-field-wide')}><span>Orden técnica</span><section className="ticket-order" aria-label="Orden técnica asociada"><Wrench size={17} aria-hidden="true" /><div><strong>{order ? order.codigoSeguimiento ?? `Orden #${order.idOt}` : 'Sin orden técnica asociada'}</strong>{order && <span>{formatWorkOrderValue(order.tipoOt)}</span>}</div>{order && <StatusBadge value={formatWorkOrderValue(order.estado)} />}</section></div>
            {statusChanged && <label className="ticket-field-wide">Motivo del cambio <span className="ticket-optional">Opcional</span><textarea maxLength={500} rows={2} value={comment} onChange={event => setComment(event.target.value)} placeholder="Añade contexto sobre este avance" /></label>}
          </fieldset> : <><p className="ticket-muted">Tienes acceso de consulta a este ticket.</p><div className="ticket-readonly"><span>Categoría: <strong>{ticket.categoria?.nombre ?? 'Sin categoría'}</strong></span><span>Prioridad: <StatusBadge value={formatWorkOrderValue(saved.priority)} /></span></div></>}
          {!canManage && <section className="ticket-order" aria-label="Orden técnica asociada"><Wrench size={17} aria-hidden="true" /><div><strong>{order ? `Orden técnica ${order.codigoSeguimiento ?? `#${order.idOt}`}` : 'Sin orden técnica asociada'}</strong>{order && <span>{formatWorkOrderValue(order.tipoOt)}</span>}</div>{order && <StatusBadge value={formatWorkOrderValue(order.estado)} />}</section>}
          {hasOpenOrder && <p className="ticket-notice" role={closureBlocked ? 'alert' : undefined}>{PENDING_ORDER_MESSAGE} Puedes continuar agregando observaciones en Seguimiento.</p>}
        </div>
        {footer(canManage ? 'Guardar cambios' : undefined, !hasChanges || (statusChanged && closureBlocked))}
      </form>}

      {tab === 'activity' && <div id="ticket-panel-activity" role="tabpanel" aria-labelledby="ticket-tab-activity">
        <div className="ticket-panel-content">
          <header className="ticket-section-heading"><h3>Seguimiento del caso</h3><p>Consulta los avances y registra nuevas observaciones.</p></header>
          {!technicalReadOnly && permissions.registerTechnicalNotes && <form className="ticket-note-form" onSubmit={saveNote}>
            <label>Nueva observación<textarea maxLength={1000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Describe la gestión realizada o el próximo paso" disabled={busy} required minLength={3} /></label>
            <div><span className="ticket-muted">La observación se añade al historial.</span><button type="submit" disabled={busy || note.trim().length < 3}><MessageSquare size={16} aria-hidden="true" />{busy ? 'Guardando…' : 'Agregar observación'}</button></div>
          </form>}
          {activities.length ? <ol className="ticket-activity-list">{activities.map((entry, index) => <li key={`${entry.kind}-${index}`}>
            <span className="ticket-activity-dot" aria-hidden="true">{entry.kind === 'diagnosis' ? <CheckCircle2 size={16} /> : <MessageSquare size={16} />}</span>
            <article><header><strong>{entry.kind === 'diagnosis' ? 'Diagnóstico registrado' : entry.kind === 'status' ? 'Comentario de seguimiento' : 'Observación técnica'}</strong>{entry.date && <time dateTime={entry.date}>{formatDateTime(entry.date)}</time>}</header>{entry.author && <small>{entry.author}</small>}<p>{entry.text.replace(/^Causa raiz:/m, 'Causa raíz:').replace(/^Estado final:/m, 'Estado observado:')}</p></article>
          </li>)}</ol> : <div className="ticket-empty"><MessageSquare size={24} aria-hidden="true" /><strong>Aún no hay seguimiento registrado</strong><p>Los comentarios, observaciones y diagnósticos aparecerán aquí.</p></div>}
        </div>{footer()}
      </div>}

      {tab === 'resolution' && !technicalReadOnly && permissions.diagnoseTickets && <form id="ticket-panel-resolution" role="tabpanel" aria-labelledby="ticket-tab-resolution" onSubmit={saveDiagnosis}>
        <div className="ticket-panel-content">
          <header className="ticket-section-heading"><h3>{resolved ? 'Ticket resuelto' : 'Registra la solución'}</h3><p>{resolved ? 'Puedes consultar el diagnóstico y los avances en Seguimiento.' : 'Al guardar el diagnóstico, el ticket quedará resuelto.'}</p></header>
          {resolved ? <div className="ticket-empty ticket-resolved"><CheckCircle2 size={28} aria-hidden="true" /><strong>{saved.status === 'Cerrado' ? 'Este ticket ya está cerrado' : 'La atención de este ticket ha finalizado'}</strong><button type="button" className="secondary" onClick={() => setTab('activity')}>Ver seguimiento</button></div> : <>
            {hasOpenOrder && <p className="ticket-notice">{PENDING_ORDER_MESSAGE} Registra los avances en Seguimiento.</p>}
            <fieldset className="ticket-fields" disabled={busy || hasOpenOrder}>
              <label className="ticket-field-wide">Causa raíz<input placeholder="¿Qué originó la falla?" maxLength={200} required value={diagnosis.causaRaiz} onChange={event => setDiagnosis({ ...diagnosis, causaRaiz: event.target.value })} /></label>
              <label>Problema detectado<textarea rows={3} placeholder="Describe lo que encontraste" maxLength={1000} value={diagnosis.descripcionProblema} onChange={event => setDiagnosis({ ...diagnosis, descripcionProblema: event.target.value })} /></label>
              <label>Acciones realizadas<textarea rows={3} placeholder="Describe cómo se solucionó" maxLength={1000} value={diagnosis.accionesRealizadas} onChange={event => setDiagnosis({ ...diagnosis, accionesRealizadas: event.target.value })} /></label>
              <label className="ticket-field-wide">Estado observado del servicio<select value={diagnosis.estadoFinalServicio} onChange={event => setDiagnosis({ ...diagnosis, estadoFinalServicio: event.target.value })}><option value="Activo">Operativo</option><option value="En Mantencion">Requiere mantención</option></select><small className="ticket-muted">Se registra como parte del diagnóstico.</small></label>
            </fieldset>
          </>}
        </div>{footer(resolved ? undefined : 'Guardar y resolver ticket', hasOpenOrder || !diagnosis.causaRaiz.trim())}
      </form>}
    </div>
  </Modal>;
}
