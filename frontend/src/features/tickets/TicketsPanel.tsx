import { useState } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Ticket, type TicketCategory, type UserRow } from '../../api';
import { rutPattern } from '../../constants';
import { formatWorkOrderValue, normalizeRutInput } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { StatusBadge } from '../../shared/components';
import { TicketManagementModal } from './TicketManagementModal';

export function TicketsPanel({
  tickets,
  categories,
  permissions,
  onChanged,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  permissions: DashboardPermissions;
  users?: UserRow[];
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ rut: '', idCategoria: '', idServicio: '', prioridad: 'Media', descripcion: '' });
  const [status, setStatus] = useState('');
  const [customerPreview, setCustomerPreview] = useState<Customer | null>(null);
  const [ticketServices, setTicketServices] = useState<CustomerService[]>([]);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);

  const selectedTicket = tickets.find((ticket) => ticket.idTicket === selectedId) ?? null;

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

          if (!createForm.idCategoria) {
            setStatus('Selecciona una categoría de falla.');
            return;
          }

          if (createForm.descripcion.trim().length < 10) {
            setStatus('Describe brevemente el problema reportado por el cliente.');
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
              <option value="">Ticket general del cliente</option>
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
            {categories.map((category) => (
              <option key={category.idCategoria} value={category.idCategoria}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>
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
        <button disabled={!createForm.idCategoria}>Crear ticket</button>
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
                    <StatusBadge value={formatWorkOrderValue(ticket.estado)} />
                  </td>
                  <td>
                    <button
                      className="secondary compact operational-manage-button"
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
