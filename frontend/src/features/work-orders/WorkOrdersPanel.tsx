import { useEffect, useState } from 'react';
import { CircleCheckBig, ClipboardList, Wrench } from 'lucide-react';
import { api, apiErrorMessage, type WorkOrder } from '../../api';
import {
  formatConnectionType,
  formatDateOnly,
  formatDateTime,
  formatWorkOrderValue,
  normalizeWorkOrderValue,
} from '../../lib';
import { HistoryBox, Modal, StatusBadge } from '../../shared/components';

export function WorkOrdersPanel({ workOrders, onChanged }: { workOrders: WorkOrder[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ potenciaOpticaDbm: '', observaciones: '', estadoFinalServicio: 'Activo' });
  const [status, setStatus] = useState('');

  const selectedOrder = workOrders.find((order) => order.idOt === selectedId) ?? null;
  const selectedOrderIsInstallation = normalizeWorkOrderValue(selectedOrder?.tipoOt) === 'instalacion';
  const selectedOrderIsCompleted = normalizeWorkOrderValue(selectedOrder?.estado) === 'completada';
  const selectedOrderHasTicket = Boolean(selectedOrder?.idTicket) && !selectedOrderIsInstallation;

  useEffect(() => {
    setForm({ potenciaOpticaDbm: '', observaciones: '', estadoFinalServicio: 'Activo' });
    setStatus('');
  }, [selectedId]);

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

  async function completeInstallation() {
    if (!selectedOrder) {
      return;
    }

    try {
      const { data } = await api.patch(`/work-orders/${selectedOrder.idOt}/complete-installation`, {
        potenciaOpticaDbm: form.potenciaOpticaDbm ? Number(form.potenciaOpticaDbm) : undefined,
        observaciones: form.observaciones,
      });
      setStatus(
        `Instalación completada. Fecha de creación: ${formatDateTime(data.prospect.fechaCreacion)}. ` +
        `Fecha de conversión: ${formatDateOnly(data.prospect.fechaConversion)}. ` +
        `Tiempo de conversión calculado: ${data.prospect.tiempoConversionDias} día(s).`,
      );
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function completeRepair() {
    if (!selectedOrder) {
      return;
    }

    if (form.observaciones.trim().length < 3) {
      setStatus('Ingresa las observaciones de cierre de la orden.');
      return;
    }

    try {
      const { data } = await api.patch(`/work-orders/${selectedOrder.idOt}/complete-repair`, {
        potenciaOpticaDbm: form.potenciaOpticaDbm ? Number(form.potenciaOpticaDbm) : undefined,
        observaciones: form.observaciones.trim(),
        estadoFinalServicio: form.estadoFinalServicio,
      });
      setStatus(`Orden completada y ticket ${data.ticket?.codigoSeguimiento ?? data.ticket?.idTicket ?? ''} resuelto.`);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="work-orders-panel stack">
      <div className="section-heading">
        <h2>Órdenes de trabajo</h2>
        <p>Listado operativo de visitas, soporte e instalaciones registradas.</p>
      </div>
      <div className="table-wrap work-orders-table-wrap">
        <table className="work-orders-table operational-table">
          <thead>
            <tr>
              <th>Código OT</th>
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

            {selectedOrderIsInstallation ? (
              <section className="work-order-completion">
                <div className="work-order-section-heading">
                  <span aria-hidden="true">
                    {selectedOrderIsCompleted
                      ? <CircleCheckBig size={21} strokeWidth={1.8} />
                      : <Wrench size={21} strokeWidth={1.8} />}
                  </span>
                  <div>
                    <h3>{selectedOrderIsCompleted ? 'Instalación completada' : 'Cierre de instalación'}</h3>
                    <p>
                      {selectedOrderIsCompleted
                        ? 'La orden ya fue completada. Puedes consultar aquí los datos registrados.'
                        : 'Registra los datos técnicos para confirmar la instalación y activar al cliente.'}
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
                {!selectedOrder.prospecto?.fechaCreacion && (
                  <p className="alert">No se puede completar la instalación: falta la fecha de creación del prospecto.</p>
                )}
                <div className="workflow-grid work-order-technical-grid">
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Potencia óptica</span>
                    <span className="work-order-measurement">
                      <input
                        aria-label="Potencia óptica en dBm"
                        type="number"
                        step="0.01"
                        placeholder="-19.50"
                        value={form.potenciaOpticaDbm}
                        onChange={(event) => setForm({ ...form, potenciaOpticaDbm: event.target.value })}
                      />
                      <span>dBm</span>
                    </span>
                  </label>
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Observaciones</span>
                    <textarea
                      placeholder="Agrega observaciones técnicas"
                      value={form.observaciones}
                      onChange={(event) => setForm({ ...form, observaciones: event.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="work-order-complete-button"
                  disabled={selectedOrderIsCompleted || !selectedOrder.prospecto?.fechaCreacion}
                  onClick={completeInstallation}
                >
                  Confirmar instalación y activar cliente
                </button>
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
                    <h3>{selectedOrderIsCompleted ? 'Trabajo técnico completado' : 'Cierre de trabajo técnico'}</h3>
                    <p>
                      {selectedOrderIsCompleted
                        ? 'La orden ya fue completada y el ticket asociado quedó actualizado.'
                        : 'Registra el cierre de la visita para resolver el ticket asociado.'}
                    </p>
                  </div>
                </div>
                <div className="workflow-grid work-order-technical-grid">
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Potencia óptica</span>
                    <span className="work-order-measurement">
                      <input
                        aria-label="Potencia óptica en dBm"
                        type="number"
                        step="0.01"
                        placeholder="-19.50"
                        value={form.potenciaOpticaDbm}
                        onChange={(event) => setForm({ ...form, potenciaOpticaDbm: event.target.value })}
                      />
                      <span>dBm</span>
                    </span>
                  </label>
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Estado final del servicio</span>
                    <select
                      value={form.estadoFinalServicio}
                      onChange={(event) => setForm({ ...form, estadoFinalServicio: event.target.value })}
                    >
                      <option value="Activo">Activo</option>
                      <option value="En Mantencion">En Mantención</option>
                    </select>
                  </label>
                  <label className="work-order-technical-field">
                    <span className="work-order-field-label">Observaciones de cierre</span>
                    <textarea
                      placeholder="Describe el diagnóstico y las acciones realizadas"
                      value={form.observaciones}
                      onChange={(event) => setForm({ ...form, observaciones: event.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="work-order-complete-button"
                  disabled={selectedOrderIsCompleted}
                  onClick={completeRepair}
                >
                  Completar orden y resolver ticket
                </button>
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
            {status && <p className="inline-status">{status}</p>}
          </div>
        ) : (
          <p className="inline-status">Selecciona una orden de trabajo para gestionarla.</p>
        )}
      </Modal>
    </section>
  );
}
