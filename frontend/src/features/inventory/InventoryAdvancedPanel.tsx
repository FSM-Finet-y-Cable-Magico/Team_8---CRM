import { ChevronDown } from 'lucide-react';
import { type AdvancedInventory, type WorkOrder } from '../../api';
import { formatDateOnly, formatDateTime } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { StatCard } from '../../shared/components';

type InventoryAdvancedPanelProps = {
  advancedInventory: AdvancedInventory | null;
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
};

export function InventoryAdvancedPanel({ advancedInventory }: InventoryAdvancedPanelProps) {
  const consumibles = advancedInventory?.consumibles ?? [];
  const alertas = advancedInventory?.alertasStock ?? [];
  const cajasNap = advancedInventory?.cajasNap ?? [];
  const transferencias = advancedInventory?.transferencias ?? [];
  const usoMateriales = advancedInventory?.usoMateriales ?? [];
  const mantenciones = advancedInventory?.mantenciones ?? [];

  return (
    <section className="inventory-advanced full-width-panel stack">
      <section className="inventory-advanced-overview">
        <div className="section-heading inventory-advanced-heading">
          <div><h2>Histórico de inventario avanzado</h2><p>Antecedentes conservados para consulta. Las cantidades corresponden al momento del registro.</p></div>
        </div>
        <div className="advanced-summary-grid">
          <StatCard label="Materiales históricos" value={consumibles.length} hint="Registros conservados" />
          <StatCard label="Alertas históricas" value={alertas.length} hint="Registros conservados" />
          <StatCard label="NAP históricas" value={cajasNap.length} hint="Infraestructura registrada" />
          <StatCard label="Consumos históricos" value={usoMateriales.length} hint="Consumos registrados" />
        </div>
      </section>

      <p className="inline-status">Estos antecedentes son de solo lectura y no indican disponibilidad actual.</p>

      <details className="inventory-advanced-section">
        <summary><span>Materiales históricos <small>{consumibles.length}</small></span><ChevronDown size={17} /></summary>
        <div className="inventory-advanced-section-content advanced-tables-grid">
          <article className="inventory-data-panel stack">
            <h3>Registros conservados</h3>
            <div className="table-wrap"><table><thead><tr><th>Material</th><th>Bodega histórica</th><th>Cantidad histórica</th><th>Registro</th></tr></thead><tbody>
              {consumibles.map((stock) => <tr key={stock.idStock}><td>{stock.tipoEquipo?.nombre ?? '-'}</td><td>{stock.bodega?.nombre ?? '-'}</td><td>{stock.cantidadDisponible}</td><td>Histórico</td></tr>)}
            </tbody></table></div>
            {!consumibles.length && <p className="empty-state">No hay materiales históricos.</p>}
          </article>
          <article className="inventory-data-panel stack">
            <h3>Alertas históricas</h3>
            <div className="inventory-low-stock-list">
              {alertas.map((stock) => <article key={stock.idStock} className="inventory-low-stock-item"><strong>{stock.tipoEquipo?.nombre ?? `Stock ${stock.idStock}`}</strong><span>{stock.cantidadDisponible} registrado(s) · mínimo: {stock.umbralMinimo}</span></article>)}
            </div>
            {!alertas.length && <p className="empty-state">No hay alertas históricas.</p>}
          </article>
        </div>
      </details>

      <details className="inventory-advanced-section">
        <summary><span>NAP y actividad histórica <small>{cajasNap.length + transferencias.length + mantenciones.length}</small></span><ChevronDown size={17} /></summary>
        <div className="inventory-advanced-section-content advanced-tables-grid inventory-activity-grid">
          <article className="inventory-data-panel stack">
            <h3>Cajas NAP registradas</h3>
            <div className="compact-list">{cajasNap.map((box) => <div key={box.idCajaNap} className="compact-list-item"><strong>{box.identificadorUnico ?? `NAP ${box.idCajaNap}`}</strong><span>{box.zona ?? '-'} · Poste {box.numeroPoste ?? '-'}</span></div>)}</div>
            {!cajasNap.length && <p className="empty-state">No hay cajas NAP históricas.</p>}
          </article>
          <article className="inventory-data-panel stack">
            <h3>Transferencias y mantenciones registradas</h3>
            <div className="compact-list">
              {transferencias.slice(0, 5).map((transfer) => <div key={transfer.idTransferencia} className="compact-list-item"><strong>Transferencia {transfer.idTransferencia}</strong><span>{transfer.idEmpresaOrigen ?? '-'} a {transfer.idEmpresaDestino ?? '-'} · {formatDateOnly(transfer.fechaTransferencia)}</span></div>)}
              {mantenciones.slice(0, 5).map((row) => <div key={row.idHistorial} className="compact-list-item"><strong>{row.unidad?.numeroSerie ?? `Equipo ${row.idUnidad ?? '-'}`}</strong><span>{row.motivo ?? '-'} · {formatDateTime(row.fechaHora)}</span></div>)}
            </div>
            {!transferencias.length && !mantenciones.length && <p className="empty-state">Sin actividad histórica.</p>}
          </article>
        </div>
      </details>
    </section>
  );
}