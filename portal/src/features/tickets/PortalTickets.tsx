import { FormEvent } from 'react';
import { CustomerService, Ticket, TicketCategory } from '../../api';

type TicketForm = {
  idCategoria: string;
  idServicio: string;
  prioridad: string;
  descripcion: string;
};

export function PortalTickets({
  services,
  tickets,
  categories,
  form,
  onFormChange,
  onCreate,
}: {
  services: CustomerService[];
  tickets: Ticket[];
  categories: TicketCategory[];
  form: TicketForm;
  onFormChange: (form: TicketForm) => void;
  onCreate: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate();
  }

  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">Soporte</span>
        <h2>Tickets</h2>
      </div>
      <form className="portal-stack" onSubmit={submit}>
        <label>
          Servicio
          <select value={form.idServicio} onChange={(event) => onFormChange({ ...form, idServicio: event.target.value })}>
            <option value="">Ticket general</option>
            {services.map((service) => (
              <option key={service.idServicio} value={service.idServicio}>
                Servicio {service.idServicio} - {service.tipoServicio}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoría
          <select value={form.idCategoria} onChange={(event) => onFormChange({ ...form, idCategoria: event.target.value })}>
            <option value="">Seleccionar categoría</option>
            {categories.map((category) => (
              <option key={category.idCategoria} value={category.idCategoria}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select value={form.prioridad} onChange={(event) => onFormChange({ ...form, prioridad: event.target.value })}>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        <label>
          Descripción
          <textarea value={form.descripcion} onChange={(event) => onFormChange({ ...form, descripcion: event.target.value })} />
        </label>
        <button type="submit" disabled={!form.idCategoria}>
          Crear ticket
        </button>
      </form>
      <section className="portal-stack">
        <h3>Mis tickets</h3>
        {!tickets.length && <p className="portal-muted">No tienes tickets registrados.</p>}
        {tickets.map((ticket) => (
          <section className="portal-list-item" key={ticket.idTicket}>
            <strong>{ticket.codigoSeguimiento ?? `Ticket ${ticket.idTicket}`}</strong>
            <span>{ticket.categoria?.nombre ?? 'Sin categoría'} · {ticket.prioridad} · {ticket.estado}</span>
            <span>{ticket.descripcion ?? '-'}</span>
          </section>
        ))}
      </section>
    </article>
  );
}
