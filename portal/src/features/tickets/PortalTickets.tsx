import { CustomerService, Ticket, TicketCategory } from '../../api';
import { PortalTicketForm, PortalTicketFormValue } from './PortalTicketForm';

function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('es-CL');
}

function serviceLabel(services: CustomerService[], idServicio?: number | null) {
  const service = services.find((item) => item.idServicio === idServicio);

  if (!idServicio) {
    return 'Ticket general';
  }

  return service ? `Servicio ${service.idServicio} - ${service.tipoServicio}` : `Servicio ${idServicio}`;
}

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
  form: PortalTicketFormValue;
  onFormChange: (form: PortalTicketFormValue) => void;
  onCreate: () => void;
}) {
  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">Soporte</span>
        <h2>Crear ticket</h2>
        <p className="portal-muted">El ticket queda registrado con origen Portal y visible para el equipo interno.</p>
      </div>

      <PortalTicketForm
        services={services}
        categories={categories}
        form={form}
        onFormChange={onFormChange}
        onSubmit={onCreate}
      />

      <section className="portal-stack">
        <h3>Mis tickets</h3>
        {!tickets.length && <p className="portal-muted">No tienes tickets registrados.</p>}
        {tickets.map((ticket) => (
          <section className="portal-list-item" key={ticket.idTicket}>
            <div className="portal-item-heading">
              <strong>{ticket.codigoSeguimiento ?? `Ticket ${ticket.idTicket}`}</strong>
              <span className="portal-chip">{ticket.estado}</span>
            </div>
            <span>{ticket.categoria?.nombre ?? 'Sin categoría'} · {ticket.prioridad}</span>
            <span>Servicio: {serviceLabel(services, ticket.idServicio)}</span>
            <span>Fecha: {formatDate(ticket.fechaCreacion)}</span>
            <span>
              Orden de trabajo:{' '}
              {ticket.workOrders?.[0]?.codigoSeguimiento ?? (ticket.workOrders?.[0] ? `OT #${ticket.workOrders[0].idOt}` : '-')}
            </span>
            <span>{ticket.descripcion ?? '-'}</span>
          </section>
        ))}
      </section>
    </article>
  );
}
