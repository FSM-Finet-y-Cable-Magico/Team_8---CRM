import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Check, ClipboardList, Pencil, Save, Wrench } from 'lucide-react';
import { api, apiErrorMessage, type Ticket, type TicketCategory } from '../../api';
import { formatWorkOrderValue } from '../../lib';
import type { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import {
  isCompletedTicketWorkOrder, isGeneralTicketCategory, isTechnicalTicketReadOnly,
  isTerminationTicketCategory, isWithdrawalTicketCategory, ticketAttentionAvailability,
  ticketReportedProblem, ticketErrorMessage,
} from './ticket-presentation';
import './ticket-management.css';

const priorities = ['Alta', 'Media', 'Baja'];

export function TicketManagementModal({ ticket, categories, permissions, onClose, onChanged }: {
  ticket: Ticket;
  categories: TicketCategory[];
  permissions: DashboardPermissions;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [savedCategory, setSavedCategory] = useState(String(ticket.idCategoria));
  const [savedPriority, setSavedPriority] = useState(ticket.prioridad);
  const [draft, setDraft] = useState<{ category: string; priority: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const pending = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const categoryInput = useRef<HTMLSelectElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => setSavedCategory(String(ticket.idCategoria)), [ticket.idCategoria]);
  useEffect(() => setSavedPriority(ticket.prioridad), [ticket.prioridad]);

  const canEdit = permissions.classifyTickets && !isTechnicalTicketReadOnly(ticket);
  const editing = canEdit && draft !== null;
  const order = ticket.workOrders?.find(item => !isCompletedTicketWorkOrder(item.estado)) ?? ticket.workOrders?.[0];
  const report = ticketReportedProblem(ticket);
  const categoryName = categories.find(item => String(item.idCategoria) === savedCategory)?.nombre
    ?? (savedCategory === String(ticket.idCategoria) ? ticket.categoria?.nombre : null)
    ?? 'Sin categoría';
  const generalCategories = categories.filter(category => isGeneralTicketCategory(category)
    && !isWithdrawalTicketCategory(category) && !isTerminationTicketCategory(category));
  const attentionIds = new Set(ticketAttentionAvailability(categories).options.map(category => category.idCategoria));
  const attentionCategories = generalCategories.filter(category => attentionIds.has(category.idCategoria));
  const historicalCategories = generalCategories.filter(category => !attentionIds.has(category.idCategoria));

  useEffect(() => {
    const dialog = content.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    content.current?.focus({ preventScroll: true });
    const keyboard = (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        if (!pending.current) close.current();
      }
      if (keyEvent.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, select, [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement as HTMLElement;
      if (!first) { keyEvent.preventDefault(); content.current?.focus(); return; }
      if (keyEvent.shiftKey && (active === first || !controls.includes(active))) {
        keyEvent.preventDefault();
        last.focus();
      } else if (!keyEvent.shiftKey && (active === last || !controls.includes(active))) {
        keyEvent.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', keyboard);
    return () => { dialog.removeEventListener('keydown', keyboard); if (opener?.isConnected) opener.focus(); };
  }, []);

  useEffect(() => {
    if (editing) categoryInput.current?.focus();
    else if (restoreEditFocus.current) {
      editButton.current?.focus();
      restoreEditFocus.current = false;
    }
  }, [editing]);

  function endEditing() {
    restoreEditFocus.current = true;
    setDraft(null);
  }

  async function saveManagement(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !draft || pending.current) return;
    const categoryChanged = draft.category !== savedCategory;
    const priorityChanged = draft.priority !== savedPriority;
    if (!categoryChanged && !priorityChanged) return;
    if ((categoryChanged && !generalCategories.some(category => String(category.idCategoria) === draft.category))
      || (priorityChanged && !priorities.includes(draft.priority))) {
      setFeedback({ kind: 'error', text: 'Selecciona una categoría y una prioridad válidas.' });
      return;
    }

    pending.current = true;
    setBusy(true);
    setFeedback(null);
    const completed: string[] = [];
    try {
      if (categoryChanged) {
        await api.patch(`/tickets/${ticket.idTicket}/category`, { idCategoria: Number(draft.category) });
        setSavedCategory(draft.category);
        completed.push('categoría');
      }
      if (priorityChanged) {
        await api.patch(`/tickets/${ticket.idTicket}/priority`, { prioridad: draft.priority });
        setSavedPriority(draft.priority);
        completed.push('prioridad');
      }
      endEditing();
      setFeedback({ kind: 'success', text: 'Cambios guardados.' });
    } catch (error) {
      const detail = ticketErrorMessage(apiErrorMessage(error));
      const text = completed.length
        ? `Se guardó: ${completed.join(', ')}. Quedan cambios pendientes. ${detail}`
        : detail;
      setFeedback({ kind: 'error', text });
    } finally {
      pending.current = false;
      setBusy(false);
      if (completed.length) onChanged();
    }
  }

  return <Modal title="Gestionar ticket" open onClose={() => { if (!pending.current) onClose(); }}>
    <div className="ticket-management" ref={content} tabIndex={-1} aria-busy={busy}>
      <form id="ticket-panel-management" onSubmit={saveManagement}>
        <section className="ticket-overview" aria-label="Resumen del ticket">
          <header className="ticket-overview-heading">
            <span className="ticket-overview-icon"><ClipboardList size={22} aria-hidden="true" /></span>
            <div><p>Ticket de soporte</p><h3>{ticket.codigoSeguimiento ?? `Ticket #${ticket.idTicket}`}</h3></div>
            <div className="ticket-status" role="group" aria-label="Estado del ticket">
              <StatusBadge value={ticket.estadoPresentacion ?? formatWorkOrderValue(ticket.estado)} />
            </div>
          </header>
          <dl className="ticket-context">
            <div><dt>Cliente</dt><dd>{ticket.cliente?.nombreCompleto ?? 'Sin cliente asociado'}</dd></div>
            <div><dt>RUT</dt><dd>{ticket.cliente?.rut ?? 'No registrado'}</dd></div>
            <div><dt>Servicio</dt><dd>{ticket.idServicio ? `Servicio #${ticket.idServicio}` : 'Atención general'}</dd></div>
          </dl>
          <div className="ticket-report"><strong>Problema reportado</strong><p>{report || 'Sin descripción registrada.'}</p></div>
          <div className="ticket-details">
            {editing && draft ? <fieldset className="ticket-classification" disabled={busy} aria-label="Clasificación del ticket">
              <label>Categoría
                <select ref={categoryInput} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>
                  {!generalCategories.some(category => String(category.idCategoria) === draft.category)
                    && <option value={draft.category} disabled>{categoryName}</option>}
                  {attentionCategories.length > 0 && <optgroup label="Atención comercial">
                    {attentionCategories.map(category => <option key={category.idCategoria} value={category.idCategoria}>{category.nombre}</option>)}
                  </optgroup>}
                  {historicalCategories.length > 0 && <optgroup label="Técnicas y otras categorías históricas">
                    {historicalCategories.map(category => <option key={category.idCategoria} value={category.idCategoria}>{category.nombre}</option>)}
                  </optgroup>}
                </select>
              </label>
              <label>Prioridad
                <select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}>
                  {!priorities.includes(draft.priority) && <option disabled>{draft.priority}</option>}
                  {priorities.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
            </fieldset> : <dl className="ticket-classification">
              <div><dt>Categoría</dt><dd>{categoryName}</dd></div>
              <div><dt>Prioridad</dt><dd><StatusBadge value={formatWorkOrderValue(savedPriority)} /></dd></div>
            </dl>}
            <div className="ticket-order-field">
              <span>Orden técnica</span>
              <section className="ticket-order" aria-label="Orden técnica asociada">
                <Wrench size={17} aria-hidden="true" />
                <div>
                  <strong>{order ? order.codigoSeguimiento ?? `Orden #${order.idOt}` : 'Sin orden técnica asociada'}</strong>
                  {order && <span>{formatWorkOrderValue(order.tipoOt)}</span>}
                </div>
                {order && <StatusBadge value={formatWorkOrderValue(order.estado)} />}
              </section>
            </div>
          </div>
        </section>
        {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`ticket-feedback ${feedback.kind}`}>
          {feedback.kind === 'success' && <Check size={17} aria-hidden="true" />}{feedback.text}
        </p>}
        <footer className="ticket-modal-footer">
          {editing && draft ? <>
            <button type="button" className="secondary" disabled={busy} onClick={() => { endEditing(); setFeedback(null); }}>Cancelar edición</button>
            <button type="submit" disabled={busy || (draft.category === savedCategory && draft.priority === savedPriority)}>
              <Save size={16} aria-hidden="true" />{busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </> : <>
            <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
            {canEdit && <button ref={editButton} type="button" onClick={() => {
              setFeedback(null);
              setDraft({ category: savedCategory, priority: savedPriority });
            }}><Pencil size={16} aria-hidden="true" />Editar ticket</button>}
          </>}
        </footer>
      </form>
    </div>
  </Modal>;
}
