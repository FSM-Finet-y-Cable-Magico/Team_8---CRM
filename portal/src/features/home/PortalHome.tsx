import { PortalCustomer } from '../../api';

export function PortalHome({
  customer,
  servicesCount,
  ticketsCount,
  tvipCount,
  status,
  onRefresh,
  onLogout,
}: {
  customer: PortalCustomer;
  servicesCount: number;
  ticketsCount: number;
  tvipCount: number;
  status: string;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="portal-header">
      <div>
        <span className="portal-eyebrow">Inicio portal</span>
        <h1>{customer.nombreCompleto}</h1>
        <p>{customer.rut ?? 'Sin RUT'} · Estado: {customer.estado}</p>
      </div>
      <div className="portal-actions">
        <button type="button" className="portal-secondary-button" onClick={onRefresh}>
          Actualizar
        </button>
        <button type="button" className="portal-secondary-button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
      <section className="portal-summary">
        <article>
          <span>Servicios</span>
          <strong>{servicesCount}</strong>
        </article>
        <article>
          <span>Tickets</span>
          <strong>{ticketsCount}</strong>
        </article>
        <article>
          <span>TV IP</span>
          <strong>{tvipCount}</strong>
        </article>
      </section>
      {status && <p className="portal-status">{status}</p>}
    </header>
  );
}
