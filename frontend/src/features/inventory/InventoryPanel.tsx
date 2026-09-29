import { FormEvent, useEffect, useState } from 'react';
import {
  api,
  apiErrorMessage,
  type AdvancedInventory,
  type Customer,
  type G1EquipmentResponse,
  type G1EquipmentType,
  type G1Unit,
  type InventoryUnit,
  type WorkOrder,
} from '../../api';
import { formatDateOnly, formatWorkOrderValue } from '../../lib';
import { type DashboardPermissions } from '../../permissions';

function equipmentTypeLabel(unit: G1Unit) {
  if (!unit.tipo_equipo) return '-';
  return typeof unit.tipo_equipo === 'string'
    ? unit.tipo_equipo
    : [unit.tipo_equipo.nombre, unit.tipo_equipo.marca, unit.tipo_equipo.modelo].filter(Boolean).join(' · ');
}

export function InventoryPanel(props: {
  inventory: InventoryUnit[];
  advancedInventory: AdvancedInventory | null;
  customers: Customer[];
  workOrders: WorkOrder[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onChanged: () => void;
}) {
  const [types, setTypes] = useState<G1EquipmentType[]>([]);
  const [typesStatus, setTypesStatus] = useState('Cargando catálogo G1…');
  const [serial, setSerial] = useState('');
  const [unit, setUnit] = useState<G1Unit | null>(null);
  const [serialStatus, setSerialStatus] = useState('');

  useEffect(() => {
    let active = true;
    setTypesStatus('Cargando catálogo G1…');
    api.get<G1EquipmentResponse<G1EquipmentType[]>>('/integrations/g1/equipment-types', {
      params: { idEmpresa: props.writeCompanyId, activo: true },
    }).then(({ data }) => {
      if (!active) return;
      setTypes(data.data);
      setTypesStatus(data.data.length ? '' : 'G1 no devolvió tipos de equipo activos.');
    }).catch((error) => {
      if (!active) return;
      setTypes([]);
      setTypesStatus(apiErrorMessage(error));
    });
    return () => { active = false; };
  }, [props.writeCompanyId]);

  async function searchUnit(event: FormEvent) {
    event.preventDefault();
    const value = serial.trim();
    if (!value) {
      setSerialStatus('Ingresa un número de serie.');
      return;
    }
    setUnit(null);
    setSerialStatus('Consultando G1…');
    try {
      const { data } = await api.get<G1EquipmentResponse<G1Unit>>('/integrations/g1/units/' + encodeURIComponent(value), {
        params: { idEmpresa: props.writeCompanyId },
      });
      setUnit(data.data);
      setSerialStatus('');
    } catch (error) {
      setSerialStatus(apiErrorMessage(error));
    }
  }

  return (
    <section className="inventory-workspace">
      <section className="inventory-list-section">
        <div className="inventory-list-heading">
          <div>
            <h2>Consulta de Inventario/Bodega</h2>
            <p>El inventario físico es administrado por G1. CRM solo consulta.</p>
          </div>
          <span>Fuente: G1</span>
        </div>

        <section className="customer-service-history">
          <header><h3>Dependencias de integración</h3></header>
          <p className="detail-line"><strong>CU-61: PARCIAL_BLOQUEADO_G1_P2.</strong> El consumo mensual actual requiere un endpoint G1 ratificado; los reportes locales disponibles son únicamente históricos.</p>
          <p className="detail-line"><strong>CU-18: PARCIAL_BLOQUEADO_G3.</strong> Poste y NAP pertenecen a G3 y siguen pendientes de un contrato técnico ratificado.</p>
        </section>

        <form className="inventory-create-form stack" onSubmit={searchUnit}>
          <h3>Consultar unidad por serie</h3>
          <label>
            Número de serie
            <input value={serial} onChange={(event) => setSerial(event.target.value)} maxLength={80} />
          </label>
          <button type="submit">Consultar en G1</button>
          {serialStatus && <p className="inline-status">{serialStatus}</p>}
        </form>

        {unit && (
          <div className="inventory-equipment-summary">
            <div className="inventory-equipment-summary-heading">
              <span>{unit.numero_serie.slice(0, 2)}</span>
              <div><h3>{unit.numero_serie}</h3><p>{equipmentTypeLabel(unit)}</p></div>
              <strong>{formatWorkOrderValue(unit.estado)}</strong>
            </div>
            <dl className="customer-readonly-details">
              <div><dt>Fuente</dt><dd>G1</dd></div>
              <div><dt>Estado físico oficial</dt><dd>{unit.estadoFisicoOficial ? 'Sí' : 'Estado no reconocido'}</dd></div>
              <div><dt>MAC</dt><dd>{unit.mac_address ?? '-'}</dd></div>
              <div><dt>Bodega actual</dt><dd>{unit.id_bodega_actual ?? '-'}</dd></div>
              <div><dt>Adquisición</dt><dd>{unit.fecha_adquisicion ? formatDateOnly(unit.fecha_adquisicion) : '-'}</dd></div>
              <div><dt>Garantía física</dt><dd>{unit.garantia?.vigente === true ? 'Vigente' : unit.garantia?.vigente === false ? 'Vencida' : 'Sin dato'}</dd></div>
              <div><dt>Vencimiento garantía física</dt><dd>{unit.garantia?.fecha_vencimiento ? formatDateOnly(unit.garantia.fecha_vencimiento) : '-'}</dd></div>
            </dl>
            <p className="detail-line">La garantía física proviene de G1 y es de solo lectura.</p>
          </div>
        )}

        <section className="customer-service-history">
          <header><h3>Catálogo de tipos de equipo</h3><span>Fuente: G1</span></header>
          {typesStatus && <p className="inline-status">{typesStatus}</p>}
          {types.length > 0 && (
            <div className="table-wrap">
              <table className="operational-table inventory-table">
                <thead><tr><th>Tipo</th><th>Categoría</th><th>Marca / modelo</th><th>Garantía</th></tr></thead>
                <tbody>{types.map((type) => (
                  <tr key={type.id_tipo_equipo}>
                    <td>{type.nombre}</td>
                    <td>{type.categoria ?? '-'}</td>
                    <td>{[type.marca, type.modelo].filter(Boolean).join(' · ') || '-'}</td>
                    <td>{type.garantia_dias ? `${type.garantia_dias} días` : '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <details className="inventory-management-section">
          <summary>Histórico local separado · Fuente: LEGACY_LOCAL</summary>
          <p className="detail-line">Estos registros se conservan solo para trazabilidad. No representan disponibilidad actual y no tienen acciones de escritura.</p>
          <div className="table-wrap">
            <table className="operational-table inventory-table">
              <thead><tr><th>Serie</th><th>Modelo</th><th>Estado histórico</th><th>Fuente</th></tr></thead>
              <tbody>{props.inventory.map((legacy) => (
                <tr key={legacy.idUnidad}>
                  <td>{legacy.numeroSerie}</td>
                  <td>{legacy.modelo ?? '-'}</td>
                  <td>{formatWorkOrderValue(legacy.estado)}</td>
                  <td>LEGACY_LOCAL</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!props.inventory.length && <p className="empty-state">No hay registros históricos locales.</p>}
        </details>
      </section>
    </section>
  );
}
