import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type InventoryUnit, type WorkOrder } from '../../api';

const equipmentModes = ['Propiedad empresa', 'Arriendo', 'Prestamo', 'Compra', 'Propio cliente'];
const normalizedEquipmentState = (value: string) => value
  .trim()
  .toLocaleLowerCase('es-CL')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export function InstallationCompletionForm({
  order,
  inventory,
  canComplete,
  onChanged,
}: {
  order: WorkOrder;
  inventory: InventoryUnit[];
  canComplete: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    potenciaOpticaDbm: '',
    observaciones: '',
    idUnidad: '',
    tipoEquipo: '',
    numeroSerie: '',
    modelo: '',
    macAddress: '',
    puertoOlt: '',
    modalidadAsignacion: 'Propiedad empresa',
    valorArriendoMensual: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm({
      potenciaOpticaDbm: '',
      observaciones: '',
      idUnidad: '',
      tipoEquipo: '',
      numeroSerie: '',
      modelo: '',
      macAddress: '',
      puertoOlt: '',
      modalidadAsignacion: 'Propiedad empresa',
      valorArriendoMensual: '',
    });
    setError('');
  }, [order.idOt]);

  const availableEquipment = inventory.filter((unit) =>
    normalizedEquipmentState(unit.estado) === 'disponible'
    && unit.idEmpresa === order.idEmpresa
    && unit.idServicio === null
    && unit.idClienteInstalado === null,
  );

  function selectEquipment(value: string) {
    const unit = availableEquipment.find((item) => item.idUnidad === Number(value));

    setForm((current) => ({
      ...current,
      idUnidad: value,
      tipoEquipo: unit?.tipoEquipo?.nombre ?? '',
      numeroSerie: unit?.numeroSerie ?? '',
      modelo: unit?.modelo ?? '',
      macAddress: unit?.macAddress ?? '',
      puertoOlt: unit?.puertoOlt ?? '',
    }));
    setError('');
  }

  async function completeInstallation() {
    setError('');
    setSubmitting(true);

    try {
      await api.patch(`/work-orders/${order.idOt}/complete-installation`, {
        potenciaOpticaDbm: form.potenciaOpticaDbm ? Number(form.potenciaOpticaDbm) : undefined,
        observaciones: form.observaciones.trim() || undefined,
        idUnidad: form.idUnidad ? Number(form.idUnidad) : undefined,
        numeroSerie: form.numeroSerie.trim() || undefined,
        modelo: form.modelo.trim() || undefined,
        macAddress: form.macAddress.trim() || undefined,
        puertoOlt: form.puertoOlt.trim() || undefined,
        modalidadAsignacion: form.idUnidad ? form.modalidadAsignacion : undefined,
        valorArriendoMensual: form.modalidadAsignacion === 'Arriendo' && form.valorArriendoMensual
          ? Number(form.valorArriendoMensual)
          : undefined,
      });
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workflow-panel modal-workflow work-order-workflow">
      <div className="workflow-grid work-order-technical-grid">
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Potencia óptica</span>
          <span className="work-order-measurement">
            <input type="number" step="0.01" placeholder="-19.50" value={form.potenciaOpticaDbm} onChange={(event) => setForm({ ...form, potenciaOpticaDbm: event.target.value })} />
            <span>dBm</span>
          </span>
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Observaciones de cierre</span>
          <textarea value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} />
        </label>
        <label className="work-order-technical-field full-width-field">
          <span className="work-order-field-label">Equipo de inventario</span>
          <select value={form.idUnidad} onChange={(event) => selectEquipment(event.target.value)}>
            <option value="">Sin equipo asignado</option>
            {availableEquipment.map((unit) => (
              <option key={unit.idUnidad} value={unit.idUnidad}>
                {unit.tipoEquipo?.nombre ?? 'Equipo'} · {unit.modelo ?? 'Modelo no registrado'} · {unit.numeroSerie}
              </option>
            ))}
          </select>
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Tipo de equipo</span>
          <input placeholder="Selecciona un equipo" readOnly value={form.tipoEquipo} />
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Número de serie del equipo</span>
          <input placeholder="Selecciona un equipo" readOnly value={form.numeroSerie} />
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Modelo</span>
          <input value={form.modelo} onChange={(event) => setForm({ ...form, modelo: event.target.value })} />
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">MAC</span>
          <input value={form.macAddress} onChange={(event) => setForm({ ...form, macAddress: event.target.value })} />
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Puerto OLT</span>
          <input value={form.puertoOlt} onChange={(event) => setForm({ ...form, puertoOlt: event.target.value })} />
        </label>
        <label className="work-order-technical-field">
          <span className="work-order-field-label">Modalidad del equipo</span>
          <select value={form.modalidadAsignacion} onChange={(event) => setForm({ ...form, modalidadAsignacion: event.target.value, valorArriendoMensual: event.target.value === 'Arriendo' ? form.valorArriendoMensual : '' })}>
            {equipmentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>
        {form.modalidadAsignacion === 'Arriendo' && (
          <label className="work-order-technical-field">
            <span className="work-order-field-label">Valor de arriendo mensual</span>
            <input type="number" min="0" value={form.valorArriendoMensual} onChange={(event) => setForm({ ...form, valorArriendoMensual: event.target.value })} />
          </label>
        )}
      </div>
      {!canComplete && <p className="inline-status">Tu rol puede consultar la agenda, pero no completar instalaciones.</p>}
      <button type="button" className="work-order-complete-button" disabled={!canComplete || submitting} onClick={() => void completeInstallation()}>
        {submitting ? 'Completando...' : 'Confirmar instalación y activar cliente'}
      </button>
      {error && <p className="alert">{error}</p>}
    </div>
  );
}
