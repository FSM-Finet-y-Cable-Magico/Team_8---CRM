import { CustomerService } from '../../api';

export function PortalServices({ services }: { services: CustomerService[] }) {
  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">Mis servicios</span>
        <h2>Servicios contratados</h2>
      </div>
      {!services.length && <p className="portal-muted">No hay servicios contratados registrados.</p>}
      {services.map((service) => (
        <section className="portal-list-item" key={service.idServicio}>
          <strong>{service.tipoServicio} · {service.estadoOperativo}</strong>
          <span>Plan: {service.contrato?.plan?.nombreComercial ?? 'Sin plan asociado'}</span>
          <span>Dirección: {service.direccion?.direccionCompleta ?? 'Sin dirección registrada'}</span>
          <span>Equipos asociados: {service.equipos?.length ?? 0}</span>
        </section>
      ))}
    </article>
  );
}
