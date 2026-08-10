import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type InstallAvailability, type Prospect } from '../../api';
import { addYearsToInputDate, dateInputValue } from '../../lib';

export function InstallOrderForm({ prospect, onChanged }: { prospect: Prospect; onChanged: () => void }) {
  const [form, setForm] = useState({
    tipoConexion: '',
    fechaProgramada: '',
    horaVisita: '',
    prioridad: 'Media',
    observaciones: '',
  });
  const [availability, setAvailability] = useState<InstallAvailability | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const today = dateInputValue(new Date());
  const latestInstallDate = addYearsToInputDate(today, 1);
  const hasContractedPlan = Boolean(prospect.idCliente);
  const canCreate = prospect.estadoPipeline === 'Aceptado' && hasContractedPlan;

  useEffect(() => {
    setForm({
      tipoConexion: '',
      fechaProgramada: '',
      horaVisita: '',
      prioridad: 'Media',
      observaciones: '',
    });
    setAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
  }, [prospect.idProspecto]);

  function updateSchedule(field: 'fechaProgramada' | 'horaVisita', value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setAvailability(null);
    setTechnicianId('');
    setStatus('');
    setError('');
  }

  function validateRequiredFields() {
    if (!form.tipoConexion || !form.fechaProgramada || !form.horaVisita) {
      return 'Completa tipo de conexión, fecha y hora de la visita.';
    }

    if (form.fechaProgramada < today) {
      return 'La fecha de instalación no puede ser anterior a hoy.';
    }

    if (form.fechaProgramada > latestInstallDate) {
      return 'La fecha de instalación no puede superar un año desde hoy.';
    }

    return '';
  }

  async function checkAvailability() {
    setStatus('');
    setError('');
    const validationError = validateRequiredFields();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const { data } = await api.get<InstallAvailability>(
        `/prospects/${prospect.idProspecto}/install-availability`,
        {
          params: {
            fechaProgramada: form.fechaProgramada,
            horaVisita: form.horaVisita,
          },
        },
      );
      setAvailability(data);
      setTechnicianId(data.tecnicosDisponibles[0] ? String(data.tecnicosDisponibles[0].idTecnico) : '');

      if (data.tecnicosDisponibles.length) {
        setStatus(data.mensaje);
      } else {
        setError(data.mensaje);
      }
    } catch (err) {
      setAvailability(null);
      setTechnicianId('');
      setError(apiErrorMessage(err));
    }
  }

  function selectAlternative(alternative: InstallAvailability['alternativas'][number]) {
    setForm((current) => ({
      ...current,
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
    }));
    setAvailability({
      fechaProgramada: alternative.fechaProgramada,
      horaVisita: alternative.horaVisita,
      tecnicosDisponibles: alternative.tecnicosDisponibles,
      alternativas: [],
      mensaje: 'Horario alternativo seleccionado. Confirma el técnico asignado.',
    });
    setTechnicianId(
      alternative.tecnicosDisponibles[0] ? String(alternative.tecnicosDisponibles[0].idTecnico) : '',
    );
    setError('');
    setStatus('Horario alternativo seleccionado. Confirma el técnico asignado.');
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
      setAvailability(null);
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
      {prospect.estadoPipeline === 'Aceptado' && !hasContractedPlan && (
        <p className="alert">Primero registra correctamente el plan contratado del prospecto.</p>
      )}
      {prospect.estadoPipeline !== 'Aceptado' && (
        <p className="inline-status">La orden de instalación ya fue generada para este prospecto.</p>
      )}
      <div className="install-form-grid">
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
        <label>
          Fecha de la visita
          <input
            type="date"
            min={today}
            max={latestInstallDate}
            disabled={!canCreate}
            value={form.fechaProgramada}
            onChange={(event) => updateSchedule('fechaProgramada', event.target.value)}
          />
        </label>
        <label>
          Hora de la visita
          <input
            type="time"
            disabled={!canCreate}
            value={form.horaVisita}
            onChange={(event) => updateSchedule('horaVisita', event.target.value)}
          />
        </label>
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
      <button type="button" className="secondary" disabled={!canCreate} onClick={() => void checkAvailability()}>
        Verificar disponibilidad técnica
      </button>

      {availability?.tecnicosDisponibles.length ? (
        <label>
          Técnico asignado
          <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
            {availability.tecnicosDisponibles.map((technician) => (
              <option key={technician.idTecnico} value={technician.idTecnico}>
                {technician.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {availability && !availability.tecnicosDisponibles.length && availability.alternativas.length > 0 && (
        <div className="alternative-slots">
          <strong>Horarios alternativos sugeridos</strong>
          <div className="button-row">
            {availability.alternativas.map((alternative) => (
              <button
                key={`${alternative.fechaProgramada}-${alternative.horaVisita}`}
                type="button"
                className="secondary compact"
                onClick={() => selectAlternative(alternative)}
              >
                {alternative.fechaProgramada} {alternative.horaVisita} ({alternative.tecnicosDisponibles.length} técnico(s))
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" disabled={!canCreate || !technicianId} onClick={() => void createInstallOrder()}>
        Generar Orden de Instalación
      </button>
      {error && <p className="alert">{error}</p>}
      {status && <p className="inline-status">{status}</p>}
    </div>
  );
}
