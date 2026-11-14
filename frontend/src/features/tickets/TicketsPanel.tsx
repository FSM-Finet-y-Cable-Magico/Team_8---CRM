import { useState } from 'react';
import { useEffect } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Ticket, type TicketCategory, type UserRow } from '../../api';
import { rutPattern } from '../../constants';
import { formatWorkOrderValue, normalizeRutInput } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { StatusBadge } from '../../shared/components';
import { TicketManagementModal } from './TicketManagementModal';
import { isTerminationTicketCategory, manualTicketCategories } from './ticket-presentation';
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
  const [customerLookupStatus, setCustomerLookupStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  // FINET 13-11-2026: «Término de servicio» registers the customer's requirement (identity, date/time, evidence).
  const [termination, setTermination] = useState({ canal: 'TELEFONO', solicitante: 'TITULAR', requerimientoEn: contactDateTimeInput(), evidencia: '', identidad: false });
  const [terminating, setTerminating] = useState(false);

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

  async function lookupTicketCustomer() {
    const rut = normalizeRutInput(createForm.rut);

    if (!rutPattern.test(rut)) {
      setCustomerPreview(null);
      setTicketServices([]);
      setCustomerLookupStatus('Ingresa un RUT válido para consultar al cliente.');
      return;
    }

    try {
      const { data } = await api.get<Customer>('/customers/search', { params: { term: rut } });
      setCreateForm((current) => ({ ...current, rut }));
      setCustomerPreview(data);
      const servicesResult = await api.get<CustomerService[]>(`/services/customer/${data.idCliente}`);
      setTicketServices(servicesResult.data);
      setCustomerLookupStatus('Cliente encontrado');
    } catch (err) {
      setCustomerPreview(null);
      setTicketServices([]);
      setCustomerLookupStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="workspace-grid">
      {permissions.createTickets && <form
        className="ticket-create-form stack"
        onSubmit={(event) => {
          event.preventDefault();
          const rut = normalizeRutInput(createForm.rut);

          if (!rutPattern.test(rut)) {
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
        <h2>Registrando ticket de soporte</h2>
        <label>
          RUT cliente
          <input
            value={createForm.rut}
            onChange={(event) => {
              setCreateForm({ ...createForm, rut: event.target.value, idServicio: '' });
              setCustomerPreview(null);
              setTicketServices([]);
              setCustomerLookupStatus('');
            }}
            onBlur={() => {
              if (createForm.rut.trim()) {
                void lookupTicketCustomer();
              }
            }}
            placeholder="11111111-1"
            required
          />
        </label>
        <button type="button" className="secondary" onClick={() => void lookupTicketCustomer()}>
          Buscar datos del cliente
        </button>
        {customerLookupStatus && <p className="inline-status">{customerLookupStatus}</p>}
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

      <section className="tickets-list-section">
        <h2>Tickets</h2>
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
              {tickets.map((ticket) => (
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
    </section>
  );
}
