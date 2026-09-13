import { FormEvent, useEffect, useState } from 'react';
import { api, apiErrorMessage, OperationalObservation } from '../../api';
import { formatDateTime } from '../../lib';
import { Modal } from '../../shared/components';

export function ObservationsModal({
  target,
  onClose,
  onSaved,
}: {
  target: {
    tipoEntidad: string;
    idEntidad: number;
    label: string;
    idCliente?: number;
    idEmpresa?: number | null;
  } | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [observations, setObservations] = useState<OperationalObservation[]>([]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!target) {
      setObservations([]);
      setNote('');
      setStatus('');
      return;
    }

    void loadObservations();
  }, [target?.tipoEntidad, target?.idEntidad]);

  async function loadObservations() {
    if (!target) {
      return;
    }

    try {
      const { data } = await api.get<OperationalObservation[]>(`/observations/${target.tipoEntidad}/${target.idEntidad}`);
      setObservations(data);
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function saveObservation(event: FormEvent) {
    event.preventDefault();

    if (!target || !note.trim()) {
      return;
    }

    try {
      await api.post<OperationalObservation>('/observations', {
        tipoEntidad: target.tipoEntidad,
        idEntidad: target.idEntidad,
        idCliente: target.idCliente,
        idEmpresa: target.idEmpresa ?? undefined,
        observacion: note.trim(),
        visibilidad: 'Interna',
      });
      setNote('');
      await loadObservations();
      setStatus('Observación registrada');
      onSaved?.();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <Modal title={target ? `Observaciones - ${target.label}` : 'Observaciones'} open={Boolean(target)} onClose={onClose}>
      {target && (
        <section className="stack">
          <form className="stack" onSubmit={saveObservation}>
            <textarea
              placeholder="Registrar observación contextual"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="submit">Registrar observación</button>
          </form>
          {status && <p className="inline-status">{status}</p>}
          <div className="compact-list">
            {observations.map((observation) => (
              <section className="compact-list-item" key={observation.idObservacion}>
                <strong>{formatDateTime(observation.fechaCreacion)}</strong>
                <span>{observation.observacion}</span>
                <small>{observation.usuario?.nombreCompleto ?? 'Sistema'} - {observation.visibilidad ?? 'Interna'}</small>
              </section>
            ))}
            {!observations.length && <p className="empty-state">Sin observaciones registradas.</p>}
          </div>
        </section>
      )}
    </Modal>
  );
}
