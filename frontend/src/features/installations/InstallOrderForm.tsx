import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type InstallDayAvailability, type InstallTimeSlot, type Prospect } from '../../api';
import { addYearsToInputDate, dateInputValue } from '../../lib';
import { InstallSchedulePicker } from './InstallSchedulePicker';

export function InstallOrderForm({ prospect, onChanged }: { prospect: Prospect; onChanged: () => void }) {
  const [form, setForm] = useState({
    tipoConexion: '',
    fechaProgramada: '',
    horaVisita: '',
    prioridad: 'Media',
    observaciones: '',
  });
  const [dayAvailability, setDayAvailability] = useState<InstallDayAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [technicianId, setTechnicianId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const today = dateInputValue(new Date());
  const latestInstallDate = addYearsToInputDate(today, 1);
  const hasContractedPlan = Boolean(prospect.idCliente);
  const hasSignedContract = Boolean(
    prospect.contratos?.some((contract) => ['Firmado', 'Activo'].includes(contract.estado ?? '')),
  );
  const canCreate = (prospect.estadoPipeline === 'Aceptado' && hasContractedPlan)
    || (!prospect.idCliente && hasSignedContract);

  useEffect(() => {
    setForm({
      tipoConexion: '',
      fechaProgramada: '',
      horaVisita: '',
      prioridad: 'Media',
      observaciones: '',
    });
    setDayAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
  }, [prospect.idProspecto]);

  async function selectInstallDate(value: string) {
    setForm((current) => ({ ...current, fechaProgramada: value, horaVisita: '' }));
    setDayAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
    if (!value || !canCreate) return;
    setAvailabilityLoading(true);

    try {
      const { data } = await api.get<InstallDayAvailability>(
        `/prospects/${prospect.idProspecto}/install-day-availability`,
        { params: { fechaProgramada: value } },
      );
      setDayAvailability(data);
    } catch (err) {
      setDayAvailability(null);
      setTechnicianId('');
      setError(apiErrorMessage(err));
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function selectInstallTime(slot: InstallTimeSlot) {
    if (!slot.disponible) return;
    setForm((current) => ({ ...current, horaVisita: slot.horaVisita }));
    setTechnicianId(
      slot.tecnicosDisponibles[0] ? String(slot.tecnicosDisponibles[0].idTecnico) : '',
    );
    setError('');
    setStatus('');
  }

  function validateRequiredFields() {
    if (!form.tipoConexion || !form.fechaProgramada || !form.horaVisita) {
      return 'Completa tipo de conexión, fecha y hora de la visita.';
    }

    if (form.fechaProgramada < today) return 'La fecha de instalación no puede ser anterior a hoy.';
    if (form.fechaProgramada > latestInstallDate) return 'La fecha de instalación no puede superar un año desde hoy.';
    return '';
  }

  async function createInstallOrder() {
    setStatus('');
    setError('');
    const validationError = validateRequiredFields();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!technicianId) {
      setError('Verifica la disponibilidad y selecciona un técnico antes de crear la orden.');
      return;
    }

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/install-orders`, {
        ...form,
        idTecnico: Number(technicianId),
      });
      setStatus(
        `Orden de Instalación ${data.orden.idOt} creada y asignada a ${data.orden.tecnico.nombreCompleto}. ` +
        `El prospecto avanzó a Instalación Programada.`,
      );
      setDayAvailability(null);
      setTechnicianId('');
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="install-order-form">
      <h3>Generar orden de instalación</h3>
      <p className="detail-line">
        Prospecto: {prospect.nombreCompleto} - Estado: {prospect.estadoPipeline}
      </p>
      {!canCreate && (
        <p className="alert">Primero confirma la firma del contrato y el plan del prospecto.</p>
      )}
      <div className="install-order-basic-fields">
        <label>
          Tipo de conexión
          <select
            value={form.tipoConexion}
            disabled={!canCreate}
            onChange={(event) => {
              setForm((current) => ({ ...current, tipoConexion: event.target.value }));
              setError('');
            }}
          >
            <option value="">Seleccionar tipo de conexión</option>
            <option value="Fibra Optica">Fibra Óptica</option>
            <option value="Television">Televisión</option>
          </select>
        </label>
      </div>
      <InstallSchedulePicker
        date={form.fechaProgramada}
        time={form.horaVisita}
        min={today}
        max={latestInstallDate}
        slots={dayAvailability?.horarios}
        loading={availabilityLoading}
        disabled={!canCreate}
        onDateChange={(value) => void selectInstallDate(value)}
        onTimeChange={selectInstallTime}
      />
      <div className="install-order-details-grid">
        <label>
          Prioridad
          <select
            value={form.prioridad}
            disabled={!canCreate}
            onChange={(event) => setForm((current) => ({ ...current, prioridad: event.target.value }))}
          >
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </label>
        {form.horaVisita && <label>
          Técnico asignado
          <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
            {dayAvailability?.horarios.find((slot) => slot.horaVisita === form.horaVisita)?.tecnicosDisponibles.map((technician) => (
              <option key={technician.idTecnico} value={technician.idTecnico}>{technician.nombreCompleto}</option>
            ))}
          </select>
        </label>}
        <label className="full-width-field">
          Observaciones de agenda
          <textarea
            maxLength={300}
            disabled={!canCreate}
            value={form.observaciones}
            onChange={(event) => setForm((current) => ({ ...current, observaciones: event.target.value }))}
          />
        </label>
      </div>

      <button type="button" disabled={!canCreate || !technicianId} onClick={() => void createInstallOrder()}>
        Generar orden de trabajo
      </button>
      {error && <p className="alert">{error}</p>}
      {status && <p className="inline-status">{status}</p>}
    </div>
  );
}
