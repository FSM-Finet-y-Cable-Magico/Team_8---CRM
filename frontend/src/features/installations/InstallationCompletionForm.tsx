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
          <h3>Detalle de instalación</h3>
          <p>Consulta la información de la visita y su estado registrado.</p>
        </div>
      </div>
      <dl className="customer-readonly-details">
        <div><dt>Orden de trabajo</dt><dd>{order.codigoSeguimiento ?? `#${order.idOt}`}</dd></div>
        <div><dt>Estado</dt><dd>{formatWorkOrderValue(order.estado)}</dd></div>
        <div><dt>Fecha programada</dt><dd>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}</dd></div>
      </dl>
      <p className="inline-status">Esta orden está disponible para consulta de solo lectura.</p>
    </div>
  );
}
