import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, apiErrorMessage, type AdvancedInventory, type Customer, type InventoryUnit, type WorkOrder } from '../../api';
import { macPattern } from '../../constants';
import { formatWorkOrderValue } from '../../lib';
import { type DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { InventoryAdvancedPanel } from './InventoryAdvancedPanel';

export function InventoryPanel({
  inventory,
  advancedInventory,
  customers,
  workOrders,
  writeCompanyId,
  permissions,
  onChanged,
}: {
  inventory: InventoryUnit[];
  advancedInventory: AdvancedInventory | null;
  customers: Customer[];
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ numeroSerie: '', modelo: '', tipoNombre: 'Router/ONU', numeroPoste: '' });
  const [movementForm, setMovementForm] = useState({ tipoMovimiento: 'Compra', idCliente: '', idEmpresaDestino: '' });
  const [statusForm, setStatusForm] = useState({ estado: 'Disponible', motivo: '' });
  const [installForm, setInstallForm] = useState({ idCliente: '', idOt: '', macAddress: '', puertoOlt: '', modelo: '' });
  const [advancedUnitForm, setAdvancedUnitForm] = useState({
    blockReason: '',
    diagnosisResult: 'Funciona',
    transferCompanyId: '',
    maintenanceType: 'Preventiva',
    maintenanceDesc: '',
    evidenceOt: '',
    evidenceUrl: '',
  });
  const [status, setStatus] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [page, setPage] = useState(1);

  const selectedUnit = inventory.find((unit) => unit.idUnidad === selectedId) ?? null;
  const pageSize = 20;
  const paginatedInventory = inventory.slice((page - 1) * pageSize, page * pageSize);
  const eligibleCustomers = customers.filter(
    (customer) =>
      customer.idEmpresa === selectedUnit?.idEmpresa ||
      customer.contratos?.some((contract) => contract.idEmpresa === selectedUnit?.idEmpresa),
  );
  const eligibleInstallOrders = workOrders.filter(
    (order) =>
      order.tipoOt === 'Instalacion' &&
      order.idCliente === Number(installForm.idCliente) &&
      order.idEmpresa === selectedUnit?.idEmpresa,
  );

  useEffect(() => {
    if (selectedUnit) {
      setStatusForm({ estado: selectedUnit.estado, motivo: '' });
      setInstallForm((current) => ({ ...current, modelo: selectedUnit.modelo ?? '' }));
    }
  }, [selectedUnit?.idUnidad]);

  useEffect(() => { setPage(1); }, [inventory.length]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  function selectedUnitPayload() {
    if (!selectedUnit) {
      throw new Error('No hay equipo seleccionado');
    }

    return selectedUnit.idUnidad;
  }

  return (
    <section className="inventory-workspace">
      {permissions.manageInventory && <form
        className="inventory-create-form stack"
        onSubmit={(event) => {
          event.preventDefault();

          if (!createForm.numeroSerie.trim() || !createForm.tipoNombre.trim()) {
            setStatus('Ingresa numero de serie y tipo de equipo.');
            return;
          }

          void run(
            () =>
              api.post('/inventory/equipment', {
                numeroSerie: createForm.numeroSerie.trim(),
                modelo: createForm.modelo.trim() || undefined,
                tipoNombre: createForm.tipoNombre.trim(),
                numeroPoste: createForm.numeroPoste.trim() || undefined,
                idEmpresa: writeCompanyId,
              }),
            'Equipo creado en inventario',
          );
        }}
      >
        <h2>Registrar equipo</h2>
        <label>
          Numero de serie
          <input
            value={createForm.numeroSerie}
            onChange={(event) => setCreateForm({ ...createForm, numeroSerie: event.target.value })}
            placeholder="DEMO-FINET-RTR-002"
            maxLength={80}
            required
          />
        </label>
        <label>
          Modelo
          <input
            value={createForm.modelo}
            onChange={(event) => setCreateForm({ ...createForm, modelo: event.target.value })}
            placeholder="Huawei AX3 / FiberHome ONU"
            maxLength={80}
          />
        </label>
        <label>
          Tipo
          <input
            value={createForm.tipoNombre}
            onChange={(event) => setCreateForm({ ...createForm, tipoNombre: event.target.value })}
            placeholder="Router/ONU"
            maxLength={100}
            required
          />
        </label>
        <button>Crear equipo</button>
        {status && <p className="inline-status">{status}</p>}
      </form>}

      <section className="inventory-list-section">
        <div className="inventory-list-heading">
          <h2>Equipos por empresa</h2>
          <span>{inventory.length}</span>
        </div>
        <div className="table-wrap">
          <table className="operational-table inventory-table">
            <thead>
              <tr>
                <th>Serie</th>
                <th>Modelo</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Empresa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.map((unit) => (
                <tr key={unit.idUnidad}>
                  <td>{unit.numeroSerie}</td>
                  <td>{unit.modelo ?? '-'}</td>
                  <td>{unit.tipoEquipo?.nombre ?? unit.idTipoEquipo ?? '-'}</td>
                  <td className="inventory-status-cell">{formatWorkOrderValue(unit.estado)}</td>
                  <td>{unit.empresa?.nombre ?? `Empresa ${unit.idEmpresa ?? '-'}`}</td>
                  <td>
                    <button
                      className="secondary compact"
                      onClick={() => {
                        setSelectedId(unit.idUnidad);
                        setManagementOpen(true);
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
        <TablePagination currentPage={page} totalItems={inventory.length} pageSize={pageSize} onPageChange={setPage} />

        <Modal title="Gestionar equipo" open={managementOpen} onClose={() => setManagementOpen(false)}>
          {selectedUnit ? (
            <div className="inventory-management-modal">
              <div className="inventory-equipment-summary">
                <div className="inventory-equipment-summary-heading"><span>{selectedUnit.numeroSerie.slice(0, 2)}</span><div><h3>{selectedUnit.numeroSerie}</h3><p>{selectedUnit.modelo ?? 'Modelo no registrado'} · {selectedUnit.tipoEquipo?.nombre ?? 'Equipo de inventario'}</p></div><strong>{formatWorkOrderValue(selectedUnit.estado)}</strong></div>
              <p className="detail-line">
                Empresa: {selectedUnit.empresa?.nombre ?? `Empresa ${selectedUnit.idEmpresa ?? '-'}`}
                {selectedUnit.clienteInstalado ? ` - Cliente: ${selectedUnit.clienteInstalado.nombreCompleto}` : ''}
              </p>
              {(selectedUnit.macAddress || selectedUnit.puertoOlt) && (
                <p className="detail-line">
                  MAC: {selectedUnit.macAddress ?? '-'} - Puerto OLT: {selectedUnit.puertoOlt ?? '-'}
                </p>
              )}
              </div>
              <div className="inventory-management-flow">
                <details className="inventory-management-section" open>
                  <summary><span>Operación del equipo<small>Estado, movimiento y bloqueo</small></span><ChevronDown size={17} /></summary>
                  <div className="inventory-management-section-content inventory-action-grid">
                {permissions.manageInventory && <label>
                  Estado logico
                  <select value={statusForm.estado} onChange={(event) => setStatusForm({ ...statusForm, estado: event.target.value })}>
                    {['Disponible', 'En Revision', 'Instalado', 'Baja Definitiva', 'Bloqueado'].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Motivo del cambio de estado"
                    value={statusForm.motivo}
                    onChange={(event) => setStatusForm({ ...statusForm, motivo: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => api.patch(`/inventory/equipment/${selectedUnitPayload()}/status`, statusForm),
                        'Estado de equipo actualizado',
                      )
                    }
                  >
                    Actualizar
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Movimiento
                  <select
                    value={movementForm.tipoMovimiento}
                    onChange={(event) => setMovementForm({ ...movementForm, tipoMovimiento: event.target.value })}
                  >
                    {['Compra', 'Devolucion', 'Asignacion', 'Descarte', 'Transferencia'].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select value={movementForm.idCliente} onChange={(event) => setMovementForm({ ...movementForm, idCliente: event.target.value })}>
                    <option value="">Cliente opcional</option>
                    {customers.map((customer) => (
                      <option key={customer.idCliente} value={customer.idCliente}>
                        {customer.nombreCompleto}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="ID empresa destino, ej: 2"
                    value={movementForm.idEmpresaDestino}
                    onChange={(event) => setMovementForm({ ...movementForm, idEmpresaDestino: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () =>
                          api.post('/inventory/movements', {
                            idUnidad: selectedUnitPayload(),
                            tipoMovimiento: movementForm.tipoMovimiento,
                            idCliente: movementForm.idCliente ? Number(movementForm.idCliente) : undefined,
                            idEmpresaDestino: movementForm.idEmpresaDestino ? Number(movementForm.idEmpresaDestino) : undefined,
                            cantidad: 1,
                          }),
                        'Movimiento registrado',
                      )
                    }
                  >
                    Registrar
                  </button>
                </label>}
                {permissions.manageInventory && <label>
                  Bloquear equipo por uso malicioso
                  <input
                    placeholder="Motivo del bloqueo"
                    value={advancedUnitForm.blockReason}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, blockReason: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.blockReason.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/block`, { motivo: advancedUnitForm.blockReason.trim() }),
                        'Equipo bloqueado y baja registrada',
                      )
                    }
                  >
                    Bloquear
                  </button>
                </label>}

                  </div>
                </details>
                <details className="inventory-management-section">
                  <summary><span>Control técnico<small>Diagnóstico, traslado y mantención</small></span><ChevronDown size={17} /></summary>
                  <div className="inventory-management-section-content inventory-action-grid">
                {permissions.manageInventory && <label>
                  Diagnosticar equipo devuelto
                  <select
                    value={advancedUnitForm.diagnosisResult}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, diagnosisResult: event.target.value })}
                  >
                    <option value="Funciona">Funciona</option>
                    <option value="Danado">Danado</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/diagnosis`, { resultado: advancedUnitForm.diagnosisResult }),
                        'Diagnostico de equipo registrado',
                      )
                    }
                  >
                    Registrar diagnostico
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Transferir equipo entre empresas
                  <input
                    placeholder="ID empresa destino"
                    value={advancedUnitForm.transferCompanyId}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, transferCompanyId: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.transferCompanyId}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/transfer`, { idEmpresaDestino: Number(advancedUnitForm.transferCompanyId) }),
                        'Equipo transferido entre empresas',
                      )
                    }
                  >
                    Transferir
                  </button>
                </label>}

                {permissions.manageInventory && <label>
                  Registrar mantencion
                  <select
                    value={advancedUnitForm.maintenanceType}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, maintenanceType: event.target.value })}
                  >
                    <option value="Preventiva">Preventiva</option>
                    <option value="Correctiva">Correctiva</option>
                  </select>
                  <input
                    placeholder="Descripción de la mantencion"
                    value={advancedUnitForm.maintenanceDesc}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, maintenanceDesc: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.maintenanceDesc.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/equipment/${selectedUnitPayload()}/maintenance`, {
                          tipo: advancedUnitForm.maintenanceType,
                          descripcion: advancedUnitForm.maintenanceDesc.trim(),
                        }),
                        'Mantencion registrada',
                      )
                    }
                  >
                    Registrar mantencion
                  </button>
                </label>}

                  </div>
                </details>
                <details className="inventory-management-section">
                  <summary><span>Vinculación y evidencia<small>Cliente, orden y respaldo</small></span><ChevronDown size={17} /></summary>
                  <div className="inventory-management-section-content inventory-action-grid">
                {permissions.installEquipment && <label>
                  Adjuntar evidencia a orden de trabajo
                  <select value={advancedUnitForm.evidenceOt} onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, evidenceOt: event.target.value })}>
                    <option value="">Seleccionar OT</option>
                    {workOrders.map((order) => (
                      <option key={order.idOt} value={order.idOt}>
                        OT {order.idOt} - {order.tipoOt}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="URL o ruta local /uploads/..."
                    value={advancedUnitForm.evidenceUrl}
                    onChange={(event) => setAdvancedUnitForm({ ...advancedUnitForm, evidenceUrl: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!advancedUnitForm.evidenceOt || !advancedUnitForm.evidenceUrl.trim()}
                    onClick={() =>
                      void run(
                        () => api.post(`/inventory/work-orders/${advancedUnitForm.evidenceOt}/evidence`, { url: advancedUnitForm.evidenceUrl.trim() }),
                        'Evidencia adjuntada a la OT',
                      )
                    }
                  >
                    Adjuntar evidencia
                  </button>
                </label>}


                {permissions.installEquipment && <label>
                  Asociando serie, MAC y puerto OLT al cliente
                  <input value={selectedUnit.numeroSerie} readOnly aria-label="Número de serie asociado" />
                  <select
                    value={installForm.idCliente}
                    onChange={(event) => setInstallForm({ ...installForm, idCliente: event.target.value, idOt: '' })}
                  >
                    <option value="">Seleccionar cliente</option>
                    {eligibleCustomers.map((customer) => (
                      <option key={customer.idCliente} value={customer.idCliente}>
                        {customer.nombreCompleto} - {customer.rut ?? 'sin RUT'}
                      </option>
                    ))}
                  </select>
                  <select value={installForm.idOt} onChange={(event) => setInstallForm({ ...installForm, idOt: event.target.value })}>
                    <option value="">Orden de instalación opcional</option>
                    {eligibleInstallOrders.map((order) => (
                      <option key={order.idOt} value={order.idOt}>
                        Orden {order.idOt} - {order.estado}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="MAC AA:BB:CC:DD:EE:FF"
                    value={installForm.macAddress}
                    onChange={(event) => setInstallForm({ ...installForm, macAddress: event.target.value })}
                  />
                  <input
                    placeholder="Puerto OLT, ej: OLT-1/1/3"
                    value={installForm.puertoOlt}
                    onChange={(event) => setInstallForm({ ...installForm, puertoOlt: event.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!installForm.idCliente || !installForm.macAddress.trim() || !installForm.puertoOlt.trim()}
                    onClick={() =>
                      !macPattern.test(installForm.macAddress.trim())
                        ? setStatus('Ingresa una MAC valida, por ejemplo AA:BB:CC:DD:EE:FF.')
                        : !installForm.puertoOlt.trim()
                          ? setStatus('Ingresa el puerto OLT asociado a la instalación.')
                          : void run(
                            () =>
                              api.post(`/inventory/equipment/${selectedUnitPayload()}/install`, {
                                idCliente: Number(installForm.idCliente),
                                idOt: installForm.idOt ? Number(installForm.idOt) : undefined,
                                modelo: installForm.modelo.trim() || undefined,
                                macAddress: installForm.macAddress.trim().toUpperCase(),
                                puertoOlt: installForm.puertoOlt.trim(),
                              }),
                            'Equipo vinculado al cliente',
                          )
                    }
                  >
                    Vincular
                  </button>
                </label>}
                  </div>
                </details>
              </div>
              {status && <p className="inline-status">{status}</p>}
            </div>
          ) : (
            <p className="inline-status">Selecciona un equipo del inventario para gestionarlo.</p>
          )}
        </Modal>
      </section>

      <InventoryAdvancedPanel
        advancedInventory={advancedInventory}
        workOrders={workOrders}
        writeCompanyId={writeCompanyId}
        permissions={permissions}
        onChanged={onChanged}
      />
    </section>
  );
}
