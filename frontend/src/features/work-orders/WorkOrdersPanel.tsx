import { useState } from 'react';
import { CircleCheckBig, ClipboardList, Wrench } from 'lucide-react';
import { type WorkOrder } from '../../api';
import {
  formatConnectionType,
  formatDateOnly,
  formatDateTime,
  formatWorkOrderValue,
  normalizeWorkOrderValue,
  isInstallationWorkOrder, isCompletedWorkOrder, isTerminalWorkOrder,
} from '../../lib';
import { HistoryBox, Modal, StatusBadge } from '../../shared/components';
import { WorkOrderTechnicalEvidence } from '../installations/WorkOrderTechnicalEvidence';

export function WorkOrdersPanel({ workOrders }: { workOrders: WorkOrder[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const selectedOrder = workOrders.find((order) => order.idOt === selectedId) ?? null;
  const selectedOrderIsInstallation = isInstallationWorkOrder(selectedOrder?.tipoOt);
  const selectedOrderIsCompleted = isCompletedWorkOrder(selectedOrder?.estado);
  const selectedOrderIsTerminal = isTerminalWorkOrder(selectedOrder?.estado);
  const selectedOrderHasTicket = Boolean(selectedOrder?.idTicket) && !selectedOrderIsInstallation;

  function ownerLabel(order: WorkOrder) {
    if (order.prospecto?.idProspecto) {
      return order.prospecto.nombreCompleto?.trim()
        || order.cliente?.nombreCompleto?.trim()
        || `Prospecto #${order.prospecto.idProspecto}`;
    }

    if (order.idCliente) {
      return order.cliente?.nombreCompleto?.trim() || `Cliente #${order.idCliente}`;
    }

    if (order.idTicket) {
      return `Ticket ${order.ticket?.codigoSeguimiento ?? order.idTicket}`;
    }

    return 'Sin asociado';
  }

  function formatWorkOrderTicketCode(order: WorkOrder) {
    const code = order.ticket?.codigoSeguimiento?.trim();

    if (code) {
      return code;
    }

    return '-';
  }

  function formatWorkOrderCode(order: WorkOrder) {
    const code = order.codigoSeguimiento?.trim();

    if (code) {
      return code;
    }

    const normalizedType = normalizeWorkOrderValue(order.tipoOt);
    const prefix = normalizedType.includes('instalacion')
      ? 'INS'
      : normalizedType.includes('reparacion')
        ? 'REP'
        : normalizedType.includes('soporte')
          ? 'SOP'
          : 'OTR';

    return `OT-${prefix}-${String(order.idOt).padStart(6, '0')}`;
  }

  return (
    <section className="work-orders-panel stack">
      <div className="section-heading">
        <h2>Órdenes de trabajo</h2>
        <p>Consulta las visitas, reparaciones e instalaciones registradas.</p>
      </div>
      <div className="table-wrap work-orders-table-wrap">
        <table className="work-orders-table operational-table">
          <thead>
            <tr>
              <th>Código OT</th>
              <th>Registro</th>
              <th>Tipo</th>
              <th>Asociado</th>
              <th>Ticket</th>
              <th>Fecha</th>
              <th>Técnico</th>
              <th className="operational-badge-column">Prioridad</th>
              <th className="operational-badge-column">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((order) => (
              <tr key={order.idOt}>
                <td className="work-order-id">{formatWorkOrderCode(order)}</td>
                <td><span className="source-badge">Histórico</span></td>
                <td><span className="work-order-type">{formatWorkOrderValue(order.tipoOt)}</span></td>
                <td>{ownerLabel(order)}</td>
                <td>{formatWorkOrderTicketCode(order)}</td>
                <td>
                  {order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}
                  {order.horaVisita ? ` ${order.horaVisita}` : ''}
                </td>
                <td>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</td>
                <td className="operational-badge-column"><StatusBadge value={formatWorkOrderValue(order.prioridad)} /></td>
                <td className="operational-badge-column"><StatusBadge value={formatWorkOrderValue(order.estado)} /></td>
                <td>
                  <button
                    className="secondary compact operational-manage-button"
                    onClick={() => {
                      setSelectedId(order.idOt);
                      setModalOpen(true);
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
      {!workOrders.length && <p className="empty-state">No hay órdenes de trabajo disponibles.</p>}

      <Modal title="Gestionar orden de trabajo" open={modalOpen} onClose={() => setModalOpen(false)}>
        {selectedOrder ? (
          <div className="workflow-panel modal-workflow work-order-workflow">
            <section className="work-order-overview">
              <header className="work-order-overview-header">
                <span className="work-order-overview-icon" aria-hidden="true">
                  <ClipboardList size={23} strokeWidth={1.8} />
                </span>
                <div>
                  <p>Orden de trabajo</p>
                  <h3>{formatWorkOrderCode(selectedOrder)}</h3>
                </div>
                <StatusBadge value={formatWorkOrderValue(selectedOrder.estado)} />
              </header>

              <dl className="work-order-overview-data">
                <div>
                  <dt>Código OT</dt>
                  <dd>{formatWorkOrderCode(selectedOrder)}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{formatWorkOrderValue(selectedOrder.tipoOt)}</dd>
                </div>
                <div>
                  <dt>Asociado</dt>
                  <dd>{ownerLabel(selectedOrder)}</dd>
                </div>
                <div>
                  <dt>Ticket</dt>
                  <dd>{formatWorkOrderTicketCode(selectedOrder)}</dd>
                </div>
                <div>
                  <dt>Técnico</dt>
                  <dd>{selectedOrder.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd>
                </div>
                <div>
                  <dt>Prioridad</dt>
                  <dd><StatusBadge value={formatWorkOrderValue(selectedOrder.prioridad)} /></dd>
                </div>
                <div>
                  <dt>Visita</dt>
                  <dd>
                    {selectedOrder.fechaProgramada ? formatDateOnly(selectedOrder.fechaProgramada) : 'Sin fecha'}{' '}
                    {selectedOrder.horaVisita ?? 'Sin hora'}
                  </dd>
                </div>
                <div>
                  <dt>Conexión</dt>
                  <dd>{selectedOrder.tipoConexion ? formatConnectionType(selectedOrder.tipoConexion) : 'No registrada'}</dd>
                </div>
                {selectedOrder.observacionesAgenda && (
                  <div className="work-order-overview-note">
                    <dt>Observaciones de agenda</dt>
                    <dd>{selectedOrder.observacionesAgenda}</dd>
                  </div>
                )}
              </dl>
            </section>

            <WorkOrderTechnicalEvidence evidence={selectedOrder.antecedenteTecnico} />
            {selectedOrderIsInstallation ? (
              <section className="work-order-completion">
                <div className="work-order-section-heading">
                  <span aria-hidden="true">
                    {selectedOrderIsCompleted
                      ? <CircleCheckBig size={21} strokeWidth={1.8} />
                      : <Wrench size={21} strokeWidth={1.8} />}
                  </span>
                  <div>
                    <h3>{selectedOrderIsCompleted ? 'Instalación completada' : selectedOrderIsTerminal ? 'Instalación no completada' : 'Instalación pendiente de cierre'}</h3>
                    <p>
                      {selectedOrderIsCompleted
                        ? 'Consulta los antecedentes registrados de esta instalación.'
                        : selectedOrderIsTerminal ? 'Una OT cerrada o cancelada no acredita por sí sola una instalación completada.' : 'El cierre de esta instalación aún no está registrado.'}
                    </p>
                  </div>
                </div>
                <div className="history-grid">
                  <HistoryBox title="Fecha de creación del prospecto" value={formatDateTime(selectedOrder.prospecto?.fechaCreacion)} />
                  <HistoryBox title="Fecha de conversión" value={formatDateOnly(selectedOrder.prospecto?.fechaConversion)} />
                  <HistoryBox
                    title="Tiempo de conversión"
                    value={
                      selectedOrder.prospecto?.tiempoConversionDias === null || selectedOrder.prospecto?.tiempoConversionDias === undefined
                        ? 'Pendiente'
                        : `${selectedOrder.prospecto.tiempoConversionDias} día(s)`
                    }
                  />
                </div>
                <p className="inline-status">Esta orden está disponible para consulta de solo lectura.</p>
              </section>
            ) : selectedOrderHasTicket ? (
              <section className="work-order-completion">
                <div className="work-order-section-heading">
                  <span aria-hidden="true">
                    {selectedOrderIsCompleted
                      ? <CircleCheckBig size={21} strokeWidth={1.8} />
                      : <Wrench size={21} strokeWidth={1.8} />}
                  </span>
                  <div>
                    <h3>{selectedOrderIsCompleted ? 'Trabajo técnico completado' : 'Trabajo técnico pendiente de cierre'}</h3>
                    <p>
                      {selectedOrderIsCompleted
                        ? 'Esta orden consta completada; sus datos históricos se conservan sin modificaciones.'
                        : 'El cierre técnico está pendiente. Puedes registrar observaciones y dar seguimiento desde Tickets.'}
                    </p>
                  </div>
                </div>
                <p className="inline-status">{selectedOrderIsCompleted ? 'Consulta de solo lectura de los antecedentes del trabajo técnico.' : 'Consulta de solo lectura. El cierre técnico está pendiente de confirmación.'}</p>
              </section>
            ) : (
              <div className="work-order-information">
                <span aria-hidden="true">
                  <CircleCheckBig size={21} strokeWidth={1.8} />
                </span>
                <div>
                  <strong>Orden registrada</strong>
                  <p>Esta orden no requiere cierre de instalación desde este panel.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="inline-status">Selecciona una orden de trabajo para gestionarla.</p>
        )}
      </Modal>
    </section>
  );
}
