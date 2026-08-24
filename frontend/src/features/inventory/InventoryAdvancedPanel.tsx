import { FormEvent, useState } from 'react';
import { api, apiErrorMessage, type AdvancedInventory, type WorkOrder } from '../../api';
import { formatDateOnly, formatDateTime } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { StatCard } from '../../shared/components';

export function InventoryAdvancedPanel({
  advancedInventory,
  workOrders,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  advancedInventory: AdvancedInventory | null;
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState('');
  const [consumableForm, setConsumableForm] = useState({ tipoNombre: '', bodegaNombre: '', cantidadDisponible: '0', umbralMinimo: '0' });
  const [movementForm, setMovementForm] = useState({ idStock: '', tipoMovimiento: 'Salida', cantidad: '1', idOt: '' });
  const [napForm, setNapForm] = useState({ identificadorUnico: '', zona: '', numeroPoste: '', capacidadPuertos: '8' });

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      setStatus('');
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function createConsumable(event: FormEvent) {
    event.preventDefault();

    if (!consumableForm.tipoNombre.trim() || !consumableForm.bodegaNombre.trim()) {
      setStatus('Indica tipo de consumible y bodega.');
      return;
    }

    await run(
      () => api.post('/inventory/consumables', {
        idEmpresa: writeCompanyId,
        tipoNombre: consumableForm.tipoNombre.trim(),
        bodegaNombre: consumableForm.bodegaNombre.trim(),
        cantidadDisponible: Number(consumableForm.cantidadDisponible),
        umbralMinimo: Number(consumableForm.umbralMinimo),
      }),
      'Stock consumible registrado',
    );
  }

  async function recordConsumableMovement(event: FormEvent) {
    event.preventDefault();

    if (!movementForm.idStock) {
      setStatus('Selecciona un consumible para registrar movimiento.');
      return;
    }

    await run(
      () => api.post(`/inventory/consumables/${movementForm.idStock}/movements`, {
        tipoMovimiento: movementForm.tipoMovimiento,
        cantidad: Number(movementForm.cantidad),
        idOt: movementForm.idOt ? Number(movementForm.idOt) : undefined,
      }),
      'Movimiento de consumible registrado',
    );
  }

  async function createNapBox(event: FormEvent) {
    event.preventDefault();

    if (!napForm.identificadorUnico.trim() || !napForm.zona.trim()) {
      setStatus('Indica identificador y zona de la caja NAP.');
      return;
    }

    await run(
      () => api.post('/inventory/nap-boxes', {
        idEmpresa: writeCompanyId,
        identificadorUnico: napForm.identificadorUnico.trim(),
        zona: napForm.zona.trim(),
        numeroPoste: napForm.numeroPoste.trim() || undefined,
        capacidadPuertos: Number(napForm.capacidadPuertos),
      }),
      'Caja NAP registrada',
    );
  }

  const consumibles = advancedInventory?.consumibles ?? [];
  const alertas = advancedInventory?.alertasStock ?? [];
  const cajasNap = advancedInventory?.cajasNap ?? [];
  const transferencias = advancedInventory?.transferencias ?? [];
  const usoMateriales = advancedInventory?.usoMateriales ?? [];
  const mantenciones = advancedInventory?.mantenciones ?? [];

  return (
    <section className="inventory-advanced full-width-panel stack">
      <section className="panel stack">
        <div className="section-heading">
          <h2>Inventario avanzado</h2>
          <p>Consumibles, cajas NAP, transferencias, mantenciones y consumo de materiales por OT.</p>
        </div>
        {status && <p className="inline-status">{status}</p>}
        <div className="advanced-summary-grid">
          <StatCard label="Consumibles" value={consumibles.length} hint="Materiales controlados" />
          <StatCard label="Stock bajo" value={alertas.length} hint="Bajo umbral minimo" />
          <StatCard label="Cajas NAP" value={cajasNap.length} hint="Registradas por zona" />
          <StatCard label="Uso materiales" value={usoMateriales.length} hint="Salidas asociadas a OT" />
        </div>
      </section>

      {permissions.manageInventory && (
        <section className="advanced-forms-grid">
          <form className="panel stack" onSubmit={createConsumable}>
            <h2>Stock consumible</h2>
            <input placeholder="Tipo de material, ej: Cable drop" value={consumableForm.tipoNombre} onChange={(event) => setConsumableForm({ ...consumableForm, tipoNombre: event.target.value })} />
            <input placeholder="Bodega" value={consumableForm.bodegaNombre} onChange={(event) => setConsumableForm({ ...consumableForm, bodegaNombre: event.target.value })} />
            <input type="number" min="0" placeholder="Cantidad" value={consumableForm.cantidadDisponible} onChange={(event) => setConsumableForm({ ...consumableForm, cantidadDisponible: event.target.value })} />
            <input type="number" min="0" placeholder="Umbral minimo" value={consumableForm.umbralMinimo} onChange={(event) => setConsumableForm({ ...consumableForm, umbralMinimo: event.target.value })} />
            <button>Registrar stock</button>
          </form>

          <form className="panel stack" onSubmit={recordConsumableMovement}>
            <h2>Movimiento de consumible</h2>
            <select value={movementForm.idStock} onChange={(event) => setMovementForm({ ...movementForm, idStock: event.target.value })}>
              <option value="">Seleccionar consumible</option>
              {consumibles.map((stock) => (
                <option key={stock.idStock} value={stock.idStock}>
                  {stock.tipoEquipo?.nombre ?? `Stock ${stock.idStock}`} - {stock.cantidadDisponible}
                </option>
              ))}
            </select>
            <select value={movementForm.tipoMovimiento} onChange={(event) => setMovementForm({ ...movementForm, tipoMovimiento: event.target.value })}>
              <option value="Entrada">Entrada</option>
              <option value="Salida">Salida</option>
              <option value="Ajuste">Ajuste</option>
            </select>
            <input type="number" min="0" value={movementForm.cantidad} onChange={(event) => setMovementForm({ ...movementForm, cantidad: event.target.value })} />
            <select value={movementForm.idOt} onChange={(event) => setMovementForm({ ...movementForm, idOt: event.target.value })}>
              <option value="">OT opcional</option>
              {workOrders.map((order) => (
                <option key={order.idOt} value={order.idOt}>
                  OT {order.idOt} - {order.tipoOt}
                </option>
              ))}
            </select>
            <button>Registrar movimiento</button>
          </form>

          <form className="panel stack" onSubmit={createNapBox}>
            <h2>Caja NAP</h2>
            <input placeholder="Identificador unico" value={napForm.identificadorUnico} onChange={(event) => setNapForm({ ...napForm, identificadorUnico: event.target.value })} />
            <input placeholder="Zona" value={napForm.zona} onChange={(event) => setNapForm({ ...napForm, zona: event.target.value })} />
            <input placeholder="Numero de poste" value={napForm.numeroPoste} onChange={(event) => setNapForm({ ...napForm, numeroPoste: event.target.value })} />
            <input type="number" min="1" value={napForm.capacidadPuertos} onChange={(event) => setNapForm({ ...napForm, capacidadPuertos: event.target.value })} />
            <button>Registrar caja NAP</button>
          </form>
        </section>
      )}

      <section className="advanced-tables-grid">
        <article className="panel stack">
          <h2>Consumibles</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Material</th><th>Bodega</th><th>Disponible</th><th>Umbral</th></tr>
              </thead>
              <tbody>
                {consumibles.map((stock) => (
                  <tr key={stock.idStock}>
                    <td>{stock.tipoEquipo?.nombre ?? '-'}</td>
                    <td>{stock.bodega?.nombre ?? '-'}</td>
                    <td>{stock.cantidadDisponible}</td>
                    <td>{stock.umbralMinimo ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!consumibles.length && <p className="empty-state">No hay consumibles registrados.</p>}
        </article>

        <article className="panel stack">
          <h2>Alertas de stock bajo</h2>
          <div className="compact-list">
            {alertas.map((stock) => (
              <div key={stock.idStock} className="compact-list-item">
                <strong>{stock.tipoEquipo?.nombre ?? `Stock ${stock.idStock}`}</strong>
                <span>{stock.cantidadDisponible} disponible(s), umbral {stock.umbralMinimo}</span>
              </div>
            ))}
          </div>
          {!alertas.length && <p className="empty-state">Sin alertas de stock bajo.</p>}
        </article>

        <article className="panel stack">
          <h2>Cajas NAP</h2>
          <div className="compact-list">
            {cajasNap.map((box) => (
              <div key={box.idCajaNap} className="compact-list-item">
                <strong>{box.identificadorUnico ?? `NAP ${box.idCajaNap}`}</strong>
                <span>{box.zona ?? '-'} - Poste {box.numeroPoste ?? '-'}</span>
              </div>
            ))}
          </div>
          {!cajasNap.length && <p className="empty-state">No hay cajas NAP registradas.</p>}
        </article>

        <article className="panel stack">
          <h2>Transferencias y mantenciones</h2>
          <div className="compact-list">
            {transferencias.slice(0, 5).map((transfer) => (
              <div key={transfer.idTransferencia} className="compact-list-item">
                <strong>Transferencia {transfer.idTransferencia}</strong>
                <span>{transfer.idEmpresaOrigen ?? '-'} a {transfer.idEmpresaDestino ?? '-'} - {formatDateOnly(transfer.fechaTransferencia)}</span>
              </div>
            ))}
            {mantenciones.slice(0, 5).map((row) => (
              <div key={row.idHistorial} className="compact-list-item">
                <strong>{row.unidad?.numeroSerie ?? `Equipo ${row.idUnidad ?? '-'}`}</strong>
                <span>{row.motivo ?? '-'} - {formatDateTime(row.fechaHora)}</span>
              </div>
            ))}
          </div>
          {!transferencias.length && !mantenciones.length && <p className="empty-state">Sin transferencias o mantenciones recientes.</p>}
        </article>
      </section>
    </section>
  );
}
