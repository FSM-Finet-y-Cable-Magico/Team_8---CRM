import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Ticket, type TicketCategory, type UserRow } from '../../api';
import { rutPattern } from '../../constants';
import { canonicalRut, formatWorkOrderValue } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { StatusBadge, ToastNotice } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { TicketManagementModal } from './TicketManagementModal';
import { isTerminationTicketCategory, manualTicketCategories, ticketMatchesSearch } from './ticket-presentation';
import { contactDateTimeInput, contactDateTimeISO } from '../commercial/control-book-contact-time';

const TERMINATION_CHANNELS = [['TELEFONO', 'Teléfono'], ['PRESENCIAL', 'Presencial'], ['CORREO', 'Correo'], ['WHATSAPP', 'WhatsApp'], ['PORTAL', 'Portal de clientes'], ['OTRO', 'Otro']] as const;
type TerminationResult = { repetido: boolean; ticket: { idTicket: number; codigoSeguimiento: string | null } | null; retiroTecnico: string; despacho?: { idOtG3: number | null } | null; despachoPendiente?: string };

export function TicketsPanel({
  tickets,
  categories,
  permissions,
  onChanged,
  focusedTicketId,
  onFocusConsumed,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  permissions: DashboardPermissions;
  users?: UserRow[];
  onChanged: () => void;
  focusedTicketId?: number | null;
  onFocusConsumed?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ rut: '', idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
  const [status, setStatus] = useState('');
  const [customerPreview, setCustomerPreview] = useState<Customer | null>(null);
  const [ticketServices, setTicketServices] = useState<CustomerService[]>([]);
  const { message: customerLookupMessage, showMessage, clearMessage } = useTransientMessage(3000);
  const [lookupTone, setLookupTone] = useState<'success' | 'error'>('success');
  const lookupRevision = useRef(0);
  const [managementOpen, setManagementOpen] = useState(false);
  const [query, setQuery] = useState('');
  // FINET 13-11-2026: «Término de servicio» registers the customer's requirement (identity, date/time, evidence).
  const [termination, setTermination] = useState({ canal: 'TELEFONO', solicitante: 'TITULAR', requerimientoEn: contactDateTimeInput(), evidencia: '', identidad: false });
  const [terminating, setTerminating] = useState(false);

  const visibleTickets = tickets.filter(ticket => ticketMatchesSearch(ticket, query));
  const selectedTicket = tickets.find((ticket) => ticket.idTicket === selectedId) ?? null;
  useEffect(() => {
    if (!focusedTicketId || !tickets.some(ticket => ticket.idTicket === focusedTicketId)) return;
    setSelectedId(focusedTicketId);
    setManagementOpen(true);
    onFocusConsumed?.();
  }, [focusedTicketId, tickets, onFocusConsumed]);
  // Solo se ofrecen las categorías de atención que el servidor habilita; no se muestra aviso de catálogo.
  // «Baja de servicio» no se ofrece: se genera solo al iniciar la baja desde el Libro de Control.
  const attentionCategories = manualTicketCategories(categories);
  const selectedCategory = attentionCategories.find(category => String(category.idCategoria) === createForm.idCategoria);
  const terminationSelected = Boolean(selectedCategory && isTerminationTicketCategory(selectedCategory));

  /** Voluntary termination: commercial termination now; the technical withdrawal follows (it never waits for it). */
  async function registerTermination(rut: string) {
    if (terminating) return;
    if (!createForm.idServicio) { setStatus('Selecciona el servicio que el titular pide terminar.'); return; }
    const requerimientoEn = contactDateTimeISO(termination.requerimientoEn);
    if (!requerimientoEn) { setStatus('Indica la fecha y hora del requerimiento.'); return; }
    if (termination.evidencia.trim().length < 5) { setStatus('Registra la evidencia del requerimiento (grabación, correo, folio u otro respaldo).'); return; }
    if (!termination.identidad) { setStatus('Confirma que verificaste la identidad y autorización del solicitante.'); return; }
    setTerminating(true);
    try {
      const { data } = await api.post<TerminationResult>('/service-withdrawals/voluntary', {
        rut, idServicio: Number(createForm.idServicio), canal: termination.canal, solicitante: termination.solicitante, requerimientoEn,
        evidencia: termination.evidencia.trim(), descripcion: createForm.descripcion.trim(), confirmacionIdentidad: true,
      });
      const ticket = data.ticket ? data.ticket.codigoSeguimiento ?? `#${data.ticket.idTicket}` : '';
      const technical = data.retiroTecnico === 'DATOS_INCOMPLETOS' ? 'El retiro de equipos queda pendiente: faltan datos de dirección o identificación.'
        : data.despacho?.idOtG3 ? `Orden de retiro N° ${data.despacho.idOtG3} creada.` : 'El retiro de equipos queda pendiente de envío.';
      setStatus(data.repetido ? `El término ya estaba registrado (ticket ${ticket}).` : `Término registrado y aplicado (ticket ${ticket}). ${technical} La deuda existente se conserva.`);
      setTermination(current => ({ ...current, evidencia: '', identidad: false }));
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setTerminating(false);
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    if (!permissions.createTickets || !createForm.rut.trim()) return;
    const revision = ++lookupRevision.current;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && revision === lookupRevision.current;
    const timer = window.setTimeout(async () => {
      const input = createForm.rut.trim();
      const term = canonicalRut(input);
      if (!term) { setLookupTone('error'); showMessage('Cliente no encontrado'); return; }
      let customer: Customer;
      try {
        const { data } = await api.get<Customer>('/customers/search', { params: { term }, signal: controller.signal });
        if (!current()) return;
        customer = data;
        setCustomerPreview(data);
        setLookupTone('success'); showMessage('Cliente encontrado');
      } catch (err) {
        if (current()) { setLookupTone('error'); showMessage(apiErrorMessage(err)); }
        return;
      }
      try {
        const { data } = await api.get<CustomerService[]>(`/services/customer/${customer.idCliente}`, { signal: controller.signal });
        if (current()) setTicketServices(data);
      } catch {
        if (current()) { setLookupTone('error'); showMessage('No se pudieron cargar los servicios del cliente. Inténtalo nuevamente.'); }
      }
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [createForm.rut, permissions.createTickets, showMessage]);

  return (
    <section className={`tickets-workspace${permissions.createTickets ? '' : ' tickets-workspace--readonly'}`}>
      <div className="tickets-workspace-heading">
        <h2>{permissions.createTickets ? 'Registrar ticket' : 'Tickets'}</h2>
        <div className="tickets-search" role="search" aria-label="Buscar tickets">
          <input type="search" className="tickets-search-input" aria-label="Buscar ticket"
            placeholder="Buscar por código, cliente, RUT, categoría, servicio u OT" maxLength={120}
            value={query} onChange={event => setQuery(event.target.value)} />
        </div>
      </div>
      <div className="workspace-grid">
      {permissions.createTickets && <form
        className="ticket-create-form stack"
        onSubmit={(event) => {
          event.preventDefault();
          const rut = canonicalRut(customerPreview?.rut ?? createForm.rut);

          if (!rut || !rutPattern.test(rut)) {
            setStatus('Ingresa el RUT del cliente con guion, por ejemplo 11111111-1.');
            return;
          }

          if (!attentionCategories.some(category => String(category.idCategoria) === createForm.idCategoria)) {
            setStatus('Selecciona una categoría oficial de atención disponible.');
            return;
          }

          if (createForm.descripcion.trim().length < 10) {
            setStatus('Describe brevemente el problema reportado por el cliente.');
            return;
          }

          if (terminationSelected) {
            void registerTermination(rut);
            return;
          }

          void run(
            () =>
              api.post('/tickets', {
                rut,
                idCategoria: Number(createForm.idCategoria),
                idServicio: createForm.idServicio ? Number(createForm.idServicio) : undefined,
                prioridad: createForm.prioridad,
                descripcion: createForm.descripcion.trim(),
              }),
            'Ticket creado',
          );
        }}
      >
        <label>
          RUT cliente
          <input
            value={createForm.rut}
            onChange={(event) => {
              lookupRevision.current++;
              setCreateForm(current => ({ ...current, rut: event.target.value, idServicio: '' }));
              setCustomerPreview(null);
              setTicketServices([]);
              clearMessage();
            }}
            placeholder="11111111-1"
            required
          />
        </label>
        {customerPreview && (
          <section className="customer-preview">
            <h3>{customerPreview.nombreCompleto}</h3>
            <p><strong>RUT:</strong> {customerPreview.rut ?? '-'}</p>
            <p><strong>Teléfono:</strong> {customerPreview.telefono ?? '-'}</p>
            <p><strong>Correo:</strong> {customerPreview.email ?? '-'}</p>
            <p><strong>Estado:</strong> {customerPreview.estado}</p>
          </section>
        )}
        {ticketServices.length > 0 && (
          <label>
            Servicio asociado
            <select
              value={createForm.idServicio}
              onChange={(event) => setCreateForm({ ...createForm, idServicio: event.target.value })}
            >
              <option value="">{terminationSelected ? 'Seleccionar servicio a terminar' : 'Ticket general del cliente'}</option>
              {ticketServices.map((service) => (
                <option key={service.idServicio} value={service.idServicio}>
                  Servicio {service.idServicio} - {service.tipoServicio} - {service.estadoOperativo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Categoría
          <select value={createForm.idCategoria} onChange={(event) => setCreateForm({ ...createForm, idCategoria: event.target.value })}>
            <option value="">Seleccionar</option>
            {attentionCategories.map((category) => (
              <option key={category.idCategoria} value={category.idCategoria}>
                {category.nombreAtencion}
              </option>
            ))}
          </select>
        </label>
        {terminationSelected && <>
          <label>
            Canal del requerimiento
            <select value={termination.canal} onChange={(event) => setTermination({ ...termination, canal: event.target.value })}>
              {TERMINATION_CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Fecha y hora del requerimiento
            <input type="datetime-local" required value={termination.requerimientoEn} onChange={(event) => setTermination({ ...termination, requerimientoEn: event.target.value })} />
          </label>
          <label>
            Solicitante
            <select value={termination.solicitante} onChange={(event) => setTermination({ ...termination, solicitante: event.target.value })}>
              <option value="TITULAR">Titular del servicio</option>
              <option value="REPRESENTANTE">Representante autorizado</option>
            </select>
          </label>
          <label>
            Evidencia del requerimiento
            <input required maxLength={500} value={termination.evidencia} onChange={(event) => setTermination({ ...termination, evidencia: event.target.value })} placeholder="N° de grabación, correo recibido, folio u otro respaldo" />
          </label>
          <label>
            <span><input type="checkbox" checked={termination.identidad} onChange={(event) => setTermination({ ...termination, identidad: event.target.checked })} /> Verifiqué la identidad del titular (o la autorización del representante).</span>
          </label>
          <p className="inline-status">El término comercial se aplica al registrar, sin esperar la visita técnica. La deuda existente se conserva y el retiro de equipos sigue su curso.</p>
        </>}
        <label>
          Prioridad
          <select value={createForm.prioridad} onChange={(event) => setCreateForm({ ...createForm, prioridad: event.target.value })}>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <label>
          Descripción
          <textarea
            value={createForm.descripcion}
            onChange={(event) => setCreateForm({ ...createForm, descripcion: event.target.value })}
            placeholder="Cliente reporta intermitencia o perdida de servicio"
            required
          />
        </label>
        <button disabled={terminating || !attentionCategories.some(category => String(category.idCategoria) === createForm.idCategoria)}>{terminationSelected ? (terminating ? 'Registrando…' : 'Registrar término') : 'Crear ticket'}</button>
        {status && <p className="inline-status">{status}</p>}
      </form>}

      <section className="tickets-list-section" aria-label="Listado de tickets">
        <div className="table-wrap tickets-table-wrap">
          <table className="tickets-table operational-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Categoría</th>
                <th>Servicio</th>
                <th>OT</th>
                <th className="operational-badge-column">Prioridad</th>
                <th className="operational-badge-column">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleTickets.map((ticket) => (
                <tr key={ticket.idTicket}>
                  <td>{ticket.codigoSeguimiento ?? ticket.idTicket}</td>
                  <td>{ticket.cliente?.nombreCompleto ?? '-'}</td>
                  <td>{ticket.categoria?.nombre ?? ticket.idCategoria}</td>
                  <td>{ticket.idServicio ?? '-'}</td>
                  <td>{ticket.workOrders?.[0] ? `#${ticket.workOrders[0].idOt}` : '-'}</td>
                  <td className="operational-badge-column">
                    <StatusBadge value={formatWorkOrderValue(ticket.prioridad)} />
                  </td>
                  <td className="operational-badge-column">
                    <StatusBadge value={ticket.estadoPresentacion ?? formatWorkOrderValue(ticket.estado)} />
                  </td>
                  <td>
                    <button
                      className="secondary compact crm-table-action"
                      onClick={() => {
                        setSelectedId(ticket.idTicket);
                        setManagementOpen(true);
                      }}
                    >
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
              {visibleTickets.length === 0 && <tr>
                <td colSpan={8} className="empty-state" role="status">
                  {query.trim() ? 'No se encontraron tickets que coincidan con la búsqueda.' : 'No hay tickets registrados.'}
                </td>
              </tr>}
            </tbody>
          </table>
        </div>

        {managementOpen && selectedTicket && <TicketManagementModal
          key={selectedTicket.idTicket}
          ticket={selectedTicket}
          categories={categories}
          permissions={permissions}
          onClose={() => setManagementOpen(false)}
          onChanged={onChanged}
        />}
      </section>
      </div>
      <ToastNotice message={customerLookupMessage} tone={lookupTone} onDismiss={clearMessage} />
    </section>
  );
}
