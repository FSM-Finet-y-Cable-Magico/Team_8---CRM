import { type InventoryUnit, type WorkOrder } from '../../api';
import { formatDateOnly, formatWorkOrderValue } from '../../lib';

export function InstallationCompletionForm({
  order,
}: {
  order: WorkOrder;
  inventory: InventoryUnit[];
  canComplete: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="workflow-panel modal-workflow work-order-workflow">
      <div className="work-order-section-heading">
        <div>
          <h3>Resumen de instalación</h3>
          <p>Consulta los datos de la visita y el estado registrado.</p>
        </div>
      </div>
      <dl className="customer-readonly-details">
        <div><dt>Orden</dt><dd>{order.codigoSeguimiento ?? `#${order.idOt}`}</dd></div>
        <div><dt>Estado</dt><dd>{formatWorkOrderValue(order.estado)}</dd></div>
        <div><dt>Fecha programada</dt><dd>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}</dd></div>
        <div><dt>Técnico</dt><dd>{order.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd></div>
      </dl>
    </div>
  );
}
