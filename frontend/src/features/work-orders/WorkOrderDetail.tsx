import {
  CalendarDays, ClipboardList, FileText, Hash, History, Monitor, Package,
  Radio, Ticket, Timer, UserRound, Wrench,
} from 'lucide-react';
import type { WorkOrder } from '../../api';
import {
  formatConnectionType, formatDateOnly, formatDateTime, formatWorkOrderValue,
} from '../../lib';
import { StatusBadge } from '../../shared/components';

export function WorkOrderDetail({ order, code, owner, ticket, onClose }: {
  order: WorkOrder;
  code: string;
  owner: string;
  ticket: string;
  onClose: () => void;
}) {
  const evidence = order.antecedenteTecnico;
  const installed = evidence?.equiposDeclarados?.instalados ?? [];
  const removed = evidence?.equiposDeclarados?.retirados ?? [];

  return <div className="work-order-detail">
    <header className="work-order-detail-header">
      <div className="work-order-detail-identity">
        <span className="work-order-detail-type"><ClipboardList size={15} aria-hidden="true" />{formatWorkOrderValue(order.tipoOt)}</span>
        <h3>{code}</h3>
        <p><UserRound size={15} aria-hidden="true" />{owner}</p>
      </div>
      <div className="work-order-detail-status">
        <span aria-label={`Estado: ${formatWorkOrderValue(order.estado)}`}><StatusBadge value={formatWorkOrderValue(order.estado)} /></span>
      </div>
    </header>

    <dl className="work-order-detail-agenda">
      <div>
        <span className="work-order-detail-icon"><CalendarDays size={21} aria-hidden="true" /></span>
        <div><dt>Visita programada</dt><dd>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '—'}</dd>
          <dd className="work-order-detail-secondary">Hora: {order.horaVisita?.trim() || '—'}</dd></div>
      </div>
      <div>
        <span className="work-order-detail-icon"><UserRound size={21} aria-hidden="true" /></span>
        <div><dt>Técnico asignado</dt><dd>{order.tecnico?.nombreCompleto?.trim() || '—'}</dd>
          <dd className="work-order-detail-secondary">Conexión: {order.tipoConexion ? formatConnectionType(order.tipoConexion) : '—'}</dd></div>
      </div>
    </dl>

    <section className="work-order-detail-section" aria-label="Resumen técnico">
      <header className="work-order-detail-section-heading">
        <h4><Wrench size={17} aria-hidden="true" />Resumen técnico</h4>
      </header>
      <dl className="work-order-detail-metrics">
        <div><dt><CalendarDays size={15} aria-hidden="true" />Fecha técnica</dt>
          <dd>{evidence?.fechaCompletada
            ? <time dateTime={evidence.fechaCompletada}>{/^\d{4}-\d{2}-\d{2}$/.test(evidence.fechaCompletada) ? formatDateOnly(evidence.fechaCompletada) : formatDateTime(evidence.fechaCompletada)}</time>
            : '—'}</dd></div>
        <div><dt><Radio size={15} aria-hidden="true" />Potencia óptica</dt>
          <dd>{evidence?.potenciaOpticaDbm == null ? '—' : <>{evidence.potenciaOpticaDbm}<small className="work-order-detail-unit">dBm</small></>}</dd></div>
        <div><dt><Monitor size={15} aria-hidden="true" />Resolución remota</dt><dd>{evidence?.resueltoRemotamente == null ? '—' : evidence.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>
        {[
          { label: 'Equipos declarados · Instalados', series: installed },
          { label: 'Equipos declarados · Retirados', series: removed },
        ].map(({ label, series }) => (
          <div key={label}>
            <dt><Package size={15} aria-hidden="true" />{label}</dt>
            <dd>{series.length ? (
              <ul className="work-order-detail-equipment">
                {series.map((serial, index) => <li key={`${serial}-${index}`}>{serial}</li>)}
              </ul>
            ) : '—'}</dd>
          </div>
        ))}
        <div>
          <dt><FileText size={15} aria-hidden="true" />Observaciones de cierre</dt>
          <dd className="work-order-detail-note">{order.observacionesCierre?.trim() || '—'}</dd>
        </div>
      </dl>
    </section>

    <section className="work-order-detail-section work-order-detail-additional" aria-label="Información adicional">
      <header className="work-order-detail-section-heading"><h4><History size={17} aria-hidden="true" />Información adicional</h4></header>
      <dl className="work-order-detail-metrics">
        <div><dt><Hash size={15} aria-hidden="true" />Registro OT</dt><dd>#{order.idOt}</dd></div>
        <div><dt><Ticket size={15} aria-hidden="true" />Ticket</dt><dd>{ticket}</dd></div>
        <div><dt><UserRound size={15} aria-hidden="true" />ID del técnico en CRM</dt><dd>{order.idTecnico ?? '—'}</dd></div>
        <div><dt><UserRound size={15} aria-hidden="true" />ID del técnico en OT</dt><dd>{evidence?.idTecnicoRegistrado ?? '—'}</dd></div>
        <div><dt><UserRound size={15} aria-hidden="true" />ID del técnico externo</dt><dd>{evidence?.idTecnicoExterno ?? '—'}</dd></div>
      </dl>
      <dl className="work-order-detail-metrics">
        <div><dt><CalendarDays size={15} aria-hidden="true" />Creación del prospecto</dt><dd>{order.prospecto?.fechaCreacion ? formatDateTime(order.prospecto.fechaCreacion) : '—'}</dd></div>
        <div><dt><CalendarDays size={15} aria-hidden="true" />Conversión</dt><dd>{order.prospecto?.fechaConversion ? formatDateOnly(order.prospecto.fechaConversion) : '—'}</dd></div>
        <div><dt><Timer size={15} aria-hidden="true" />Tiempo de conversión</dt><dd>{order.prospecto?.tiempoConversionDias == null ? '—' : `${order.prospecto.tiempoConversionDias} día(s)`}</dd></div>
      </dl>
      <div className="work-order-detail-observation"><h5><FileText size={15} aria-hidden="true" />Observaciones de agenda</h5><p>{order.observacionesAgenda?.trim() || '—'}</p></div>
    </section>

    <footer className="work-order-detail-footer"><button type="button" className="secondary compact crm-table-action" onClick={onClose}>Cerrar</button></footer>
  </div>;
}
