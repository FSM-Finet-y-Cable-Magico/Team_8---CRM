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
          <h3>Instalación administrada por G3</h3>
          <p>El cierre técnico, el equipo instalado y sus estados físicos se registran en G3/G1. CRM recibe el resultado por integración.</p>
        </div>
      </div>
      <dl className="customer-readonly-details">
        <div><dt>OT histórica local</dt><dd>{order.codigoSeguimiento ?? `#${order.idOt}`}</dd></div>
        <div><dt>Estado</dt><dd>{formatWorkOrderValue(order.estado)}</dd></div>
        <div><dt>Fecha programada</dt><dd>{order.fechaProgramada ? formatDateOnly(order.fechaProgramada) : '-'}</dd></div>
        <div><dt>Fuente operativa</dt><dd>G3</dd></div>
      </dl>
      <p className="inline-status">No hay cierre local ni asignación de inventario físico desde CRM.</p>
    </div>
  );
}