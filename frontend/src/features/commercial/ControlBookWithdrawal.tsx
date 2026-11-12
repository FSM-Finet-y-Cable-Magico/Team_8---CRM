import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type CustomerService } from '../../api';
import { ControlBookModal } from './ControlBookModal';
import { currency, dateLabel } from './control-book-model';

export type WithdrawalCheck = { code: string; label: string; ok: boolean; message: string };
export type WithdrawalEligibility = {
  idServicio: number; motivo: string; eligible: boolean; habilitado: boolean;
  checks: WithdrawalCheck[]; firstFailure: WithdrawalCheck | null;
  contexto: {
    empresa: { idEmpresa: number | null; nombre: string | null };
    cliente: { idCliente: number; nombre: string | null; rut: string | null };
    contrato: { idContrato: number; estado: string | null; plan: string | null } | null;
    servicio: { idServicio: number; tipo: string; estado: string };
    deuda: { overdueCount: number; uncoveredCount: number; coveredByAgreementCount: number; totalExigible: number; maxDiasAtraso: number };
    aviso: { idEvento: number; fecha: string | null } | null;
    solicitudActiva: { idSolicitudRetiro: number; estado: string } | null;
    responsable: { idUsuario: number; nombre: string };
  };
};
type InitiateResult = { solicitud: { idSolicitudRetiro: number }; ticket: { idTicket: number; codigoSeguimiento: string | null }; repetido: boolean };

export const MIN_WITHDRAWAL_OBSERVATION = 10;

/**
 * «Iniciar baja y retiro» dentro de la ficha del Libro de Control. Solo muestra lo que el backend
 * determina: los requisitos, el contexto precargado y si la operación está habilitada en este ambiente.
 * Registrar crea la solicitud y el ticket «Baja de servicio»; el servicio NO cambia a Baja.
 */
export function ControlBookWithdrawal({ services, customerName, plan, canManage, onClose, onSaved, onBusyChange }: {
  services: CustomerService[]; customerName: string; plan: string | null; canManage: boolean;
  onClose: () => void; onSaved: (message: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const candidates = services.filter(service => service.estadoOperativo !== 'Baja');
  const suspended = candidates.filter(service => service.estadoOperativo === 'Suspendido');
  const [serviceId, setServiceId] = useState(suspended.length === 1 ? String(suspended[0].idServicio) : '');
  const [eligibility, setEligibility] = useState<WithdrawalEligibility | null>(null);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [observation, setObservation] = useState(''), [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  useEffect(() => {
    setEligibility(null); setError(''); setConfirmed(false);
    if (!serviceId) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void api.get<WithdrawalEligibility>(`/service-withdrawals/eligibility/${serviceId}`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.idServicio !== Number(serviceId)) throw new Error('La consulta no corresponde al servicio seleccionado.');
        setEligibility(data);
      })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serviceId]);

  const ready = Boolean(eligibility?.eligible && eligibility.habilitado && canManage);
  const observationOk = observation.trim().length >= MIN_WITHDRAWAL_OBSERVATION;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || loading || !ready || !eligibility) return;
    if (!observationOk) { setError(`Describe la gestión de cobranza (mínimo ${MIN_WITHDRAWAL_OBSERVATION} caracteres).`); return; }
    if (!confirmed) { setError('Confirma la operación para continuar.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post<InitiateResult>('/service-withdrawals/initiate', {
        idServicio: eligibility.idServicio, idContrato: eligibility.contexto.contrato?.idContrato, observaciones: observation.trim(), confirmacion: true,
      });
      const ticket = data.ticket.codigoSeguimiento ?? `#${data.ticket.idTicket}`;
      onSaved(data.repetido
        ? `La baja ya estaba iniciada: solicitud N° ${data.solicitud.idSolicitudRetiro} y ticket ${ticket}. El servicio sigue suspendido.`
        : `Solicitud de retiro N° ${data.solicitud.idSolicitudRetiro} y ticket ${ticket} registrados. El servicio sigue suspendido hasta confirmar el retiro técnico.`);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  const context = eligibility?.contexto;
  const debt = context?.deuda;
  return <ControlBookModal title="Iniciar baja y retiro" busy={saving} onClose={() => { if (!pending.current) onClose(); }}>
    <div className="control-modal-customer"><strong>{customerName}</strong><span>{plan ?? '—'}</span></div>
    <form className="control-action-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={saving}>
        <label>Servicio<select required value={serviceId} onChange={event => setServiceId(event.target.value)}>
          <option value="">Seleccionar servicio</option>
          {candidates.map(service => <option key={service.idServicio} value={String(service.idServicio)}>{service.tipoServicio} · {service.estadoOperativo}</option>)}
        </select></label>
        {loading && <p role="status" className="control-muted">Consultando requisitos…</p>}
        {context && <>
          <dl className="control-detail-list">
            {([
              ['Empresa', context.empresa.nombre],
              ['Cliente', [context.cliente.nombre, context.cliente.rut].filter(Boolean).join(' · ') || null],
              ['Contrato', context.contrato ? `#${context.contrato.idContrato}${context.contrato.plan ? ' · ' + context.contrato.plan : ''}` : null],
              ['Servicio', context.servicio.tipo],
              ['Estado del servicio', context.servicio.estado],
              ['Deuda vencida', debt && debt.uncoveredCount > 0 ? `${currency.format(debt.totalExigible)} · ${debt.maxDiasAtraso} días` : debt && debt.coveredByAgreementCount > 0 ? 'Con convenio activo' : 'Sin deuda vencida'],
              ['Aviso previo de retiro', context.aviso ? dateLabel(context.aviso.fecha) : 'No registrado'],
              ['Motivo', 'Morosidad'],
              ['Responsable', context.responsable.nombre],
            ] as Array<[string, string | null]>).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
          </dl>
          <ul className="control-muted" aria-label="Requisitos">
            {eligibility!.checks.map(item => <li key={item.code}>{item.ok ? '✓' : '✗'} {item.label}{item.ok ? '' : ` — ${item.message}`}</li>)}
          </ul>
          {!eligibility!.habilitado && <p role="status" className="control-muted">La baja guiada aún no está habilitada en este ambiente: falta aprobar el registro que vincula solicitud, aviso y ticket. No se registrará nada.</p>}
          {ready && <>
            <label className="control-form-observation">Observaciones de cobranza<textarea required maxLength={1000} value={observation} onChange={event => setObservation(event.target.value)} placeholder="Gestiones realizadas, respuesta del cliente y motivo del retiro."/></label>
            <label><span><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo iniciar la baja y el retiro de equipos de este servicio.</span>
              <small>Se crean la solicitud de retiro y el ticket «Baja de servicio». El servicio sigue suspendido y la deuda se conserva; la baja efectiva requiere el retiro técnico confirmado.</small></label>
          </>}
        </>}
      </fieldset>
      {error && <p role="alert" className="control-feedback error">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || loading || !ready || !observationOk || !confirmed}>{saving ? 'Registrando…' : 'Iniciar baja y retiro'}</button></footer>
    </form>
  </ControlBookModal>;
}
