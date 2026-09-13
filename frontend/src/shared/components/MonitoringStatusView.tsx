import type { MonitoringStatus } from '../../api';
import { formatDateTime } from '../../lib';

export function MonitoringStatusView({ status }: { status: MonitoringStatus | null }) {
  if (!status) {
    return <p className="inline-status">Sin datos de monitoreo cargados.</p>;
  }

  return (
    <div className="monitoring-status-card">
      <p><strong>Estado:</strong> {status.estadoConexion}</p>
      <p>{status.mensaje}</p>
      <p><strong>Última medición:</strong> {formatDateTime(status.ultimaMedicion?.timestampMedicion)}</p>
      <p><strong>Potencia óptica:</strong> {status.ultimaMedicion?.potenciaActualDbm ?? 'No disponible'} dBm</p>
      <p><strong>Latencia:</strong> {status.latenciaEstado}</p>
      <p><strong>Equipo:</strong> {status.equipo?.numeroSerie ?? 'Sin equipo asociado'}</p>
      <p><strong>Caja NAP:</strong> {status.cajaNap?.identificadorUnico ?? status.cajaNap?.zona ?? 'Sin dato'}</p>
      {status.historial.length > 0 && (
        <ul className="compact-list">
          {status.historial.slice(0, 4).map((event) => (
            <li key={event.idHistorialOnt}>
              {event.evento ?? 'Evento'} - {formatDateTime(event.timestamp)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
