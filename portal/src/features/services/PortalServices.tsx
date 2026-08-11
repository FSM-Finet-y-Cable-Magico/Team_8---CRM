import { CustomerService } from '../../api';

const visibleTechnicalKeys = [
  'tecnologia',
  'velocidad',
  'ipAsignada',
  'macAddress',
  'puertoOlt',
  'cajaNap',
  'numeroPoste',
];

function technicalEntries(service: CustomerService) {
  const data = service.datosTecnicos;

  if (!data || typeof data !== 'object') {
    return [];
  }

  return visibleTechnicalKeys
    .map((key) => [key, data[key]] as const)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
}

function technicalLabel(key: string) {
  const labels: Record<string, string> = {
    tecnologia: 'Tecnología',
    velocidad: 'Velocidad',
    ipAsignada: 'IP asignada',
    macAddress: 'MAC Address',
    puertoOlt: 'Puerto OLT',
    cajaNap: 'Caja NAP',
    numeroPoste: 'Número de poste',
  };

  return labels[key] ?? key;
}

export function PortalServices({ services }: { services: CustomerService[] }) {
  return (
    <article className="portal-panel portal-stack">
      <div>
        <span className="portal-eyebrow">Mis servicios</span>
        <h2>Servicios contratados</h2>
      </div>
      {!services.length && <p className="portal-muted">No hay servicios contratados registrados.</p>}
      {services.map((service) => {
        const entries = technicalEntries(service);

        return (
          <section className="portal-list-item" key={service.idServicio}>
            <div className="portal-item-heading">
              <strong>{service.tipoServicio}</strong>
              <span className="portal-chip">{service.estadoOperativo}</span>
            </div>
            <span>Plan: {service.contrato?.plan?.nombreComercial ?? 'Sin plan asociado'}</span>
            <span>Dirección: {service.direccion?.direccionCompleta ?? 'Sin dirección registrada'}</span>
            <span>Comuna: {service.direccion?.comuna ?? '-'}</span>
            <span>Equipos asociados: {service.equipos?.length ?? 0}</span>
            {service.observaciones && <span>Observaciones: {service.observaciones}</span>}

            {entries.length > 0 && (
              <div className="portal-soft-box">
                <strong>Datos técnicos</strong>
                {entries.map(([key, value]) => (
                  <span key={key}>{technicalLabel(key)}: {String(value)}</span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}
