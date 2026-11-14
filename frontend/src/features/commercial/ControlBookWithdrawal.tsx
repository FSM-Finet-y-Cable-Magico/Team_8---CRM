import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type CustomerService } from '../../api';
import { ControlBookModal } from './ControlBookModal';
import { currency, dateLabel } from './control-book-model';

export type WithdrawalCheck = { code: string; label: string; ok: boolean; message: string };
export type WithdrawalDispatchView = {
  estadoDespacho: string; intentos?: number; idOtG3: number | null; estadoOt?: string | null; cancelable?: boolean;
  cierreRecibido?: boolean; recepcionSincronizada?: boolean; aplicado?: boolean; ultimoErrorCodigo?: string | null;
};
export type WithdrawalFollowUp = {
  idSolicitudRetiro: number; estado: string; flujoGuiado: boolean;
  ticket: { idTicket: number; codigoSeguimiento: string | null; estado: string } | null;
  despacho: WithdrawalDispatchView | null;
};
export type WithdrawalEligibility = {
  idServicio: number; motivo: string; eligible: boolean; habilitado: boolean; despachoG3Habilitado?: boolean; bajaAutomaticaHabilitada?: boolean;
  checks: WithdrawalCheck[]; firstFailure: WithdrawalCheck | null; seguimiento?: WithdrawalFollowUp | null;
  contexto: {
    empresa: { idEmpresa: number | null; nombre: string | null };
    cliente: { idCliente: number; nombre: string | null; rut: string | null };
    contrato: { idContrato: number; estado: string | null } | null;
    servicio: { idServicio: number; tipo: string; estado: string };
    deuda: { overdueCount: number; uncoveredCount: number; coveredByAgreementCount: number; totalExigible: number; maxDiasAtraso: number };
    aviso: { idEvento: number; fecha: string | null } | null;
    direccionRetiro: { direccion: string | null; comuna: string | null } | null;
    solicitudActiva: { idSolicitudRetiro: number; estado: string } | null;
    responsable: { idUsuario: number; nombre: string };
  };
};
type InitiateResult = {
  solicitud: { idSolicitudRetiro: number }; ticket: { idTicket: number; codigoSeguimiento: string | null }; repetido: boolean;
  despacho?: { estadoDespacho: string; idOtG3: number | null } | null; despachoPendiente?: string;
};

/** Technical dispatch status in user language (no group codes): the request is registered either way. */
function dispatchMessage(result: InitiateResult) {
  if (result.despacho?.idOtG3) return `Orden de retiro técnico N° ${result.despacho.idOtG3} creada.`;
  return 'La orden de retiro técnico queda pendiente de envío.';
}

const DISPATCH_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente de envío', ENVIANDO: 'Enviando', REINTENTABLE: 'Envío fallido; se puede reintentar', ACEPTADA: 'Orden aceptada',
  RECHAZADA: 'Orden rechazada; requiere revisión', INCONSISTENTE: 'Requiere revisión', CANCELADA: 'Cancelada', CANCELACION_NO_APLICABLE: 'La orden ya no admite cancelación',
};
const ORDER_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', ASIGNADA: 'Asignada a técnico', EN_CURSO: 'En curso', PENDIENTE_APROBACION: 'Cerrada por el técnico; pendiente de aprobación',
  COMPLETADA: 'Aprobada por el jefe técnico', CANCELADA: 'Cancelada',
};
const REQUEST_LABELS: Record<string, string> = { REGISTRADA: 'Registrada', EN_GESTION: 'En gestión', CANCELADA: 'Cancelada', CERRADA: 'Cerrada' };
const STEPS = ['Requisitos', 'Datos de la baja', 'Confirmación'] as const;

export const MIN_WITHDRAWAL_OBSERVATION = 10;

/**
 * «Dar de baja el servicio» (FINET 13-11-2026), opened from the Libro de Control only after the service is suspended and
 * never on top of «Suspender servicio». Three steps: (1) requirements computed by the backend, (2) preloaded data and the
 * management observation, (3) explicit confirmation. It creates the request + official «Baja de servicio» ticket +
 * private link + audit in one operation (POST /service-withdrawals/initiate); the service does NOT change to Baja here.
 * With a request already active, the same access shows its real follow-up (ticket, technical order, closure) and the
 * actions that are actually possible, instead of a second registration.
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
  const [step, setStep] = useState(0);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);
  useEffect(() => {
    setEligibility(null); setError(''); setConfirmed(false); setStep(0);
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
  }, [serviceId, reload]);

  const followUp = eligibility?.seguimiento ?? null;
  const ready = Boolean(eligibility?.eligible && eligibility.habilitado && canManage && !followUp);
  const observationOk = observation.trim().length >= MIN_WITHDRAWAL_OBSERVATION;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || loading || !ready || !eligibility) return;
    if (step === 0) { setError(''); setStep(1); return; }
    if (!observationOk) { setError(`Describe la gestión de cobranza (mínimo ${MIN_WITHDRAWAL_OBSERVATION} caracteres).`); return; }
    if (step === 1) { setError(''); setStep(2); return; }
    if (!confirmed) { setError('Confirma la operación para continuar.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post<InitiateResult>('/service-withdrawals/initiate', {
        idServicio: eligibility.idServicio, idContrato: eligibility.contexto.contrato?.idContrato, observaciones: observation.trim(), confirmacion: true,
      });
      const ticket = data.ticket.codigoSeguimiento ?? `#${data.ticket.idTicket}`;
      onSaved(data.repetido
        ? `La baja ya estaba iniciada: solicitud N° ${data.solicitud.idSolicitudRetiro} y ticket ${ticket}. El servicio sigue suspendido.`
        : `Solicitud de retiro N° ${data.solicitud.idSolicitudRetiro} y ticket ${ticket} registrados. ${dispatchMessage(data)} El servicio sigue suspendido hasta que el retiro técnico sea aprobado.`);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  /** Follow-up actions: only the ones the backend can actually perform; the view is re-read afterwards. */
  async function followUpAction(kind: 'dispatch' | 'order-status' | 'cancel') {
    if (pending.current || !followUp) return;
    if (kind === 'cancel' && (cancelReason.trim().length < 5 || cancelReason.trim().length > 300)) { setError('Indica el motivo de la cancelación (5 a 300 caracteres).'); return; }
    pending.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await api.post(`/service-withdrawals/${followUp.idSolicitudRetiro}/${kind}`, kind === 'cancel' ? { motivo: cancelReason.trim() } : {});
      if (kind === 'cancel') { onSaved(`Retiro cancelado: solicitud N° ${followUp.idSolicitudRetiro}. El servicio sigue suspendido y la deuda se conserva.`); return; }
      setNotice(kind === 'dispatch' ? 'Envío de la orden técnica procesado.' : 'Estado de la orden técnica actualizado.');
      setReload(value => value + 1);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  const context = eligibility?.contexto;
  const debt = context?.deuda;
  const contextRows: Array<[string, string | null]> = context ? [
    ['Empresa', context.empresa.nombre],
    ['Cliente', [context.cliente.nombre, context.cliente.rut].filter(Boolean).join(' · ') || null],
    ['Contrato', context.contrato ? `#${context.contrato.idContrato}${plan ? ' · ' + plan : ''}` : null],
    ['Servicio', context.servicio.tipo],
    ['Estado del servicio', context.servicio.estado],
    ['Deuda vencida', debt && debt.uncoveredCount > 0 ? `${currency.format(debt.totalExigible)} · ${debt.maxDiasAtraso} días` : debt && debt.coveredByAgreementCount > 0 ? 'Con convenio activo' : 'Sin deuda vencida'],
    ['Aviso previo de retiro', context.aviso ? dateLabel(context.aviso.fecha) : 'No registrado'],
    ['Dirección de retiro', [context.direccionRetiro?.direccion, context.direccionRetiro?.comuna].filter(Boolean).join(', ') || null],
    ['Motivo', 'Morosidad'],
    ['Responsable', context.responsable.nombre],
  ] : [];
  const details = (rows: Array<[string, string | null | undefined]>, label?: string) => <dl className="control-detail-list" aria-label={label}>
    {rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}
  </dl>;
  const dispatch = followUp?.despacho ?? null;
  const canDispatch = Boolean(followUp && eligibility?.despachoG3Habilitado && dispatch && ['PENDIENTE', 'REINTENTABLE'].includes(dispatch.estadoDespacho));
  const canReadOrder = Boolean(followUp && dispatch?.idOtG3 && !dispatch.aplicado);
  const canCancel = Boolean(followUp && followUp.flujoGuiado && dispatch && dispatch.cancelable !== false && !dispatch.aplicado);

  return <ControlBookModal title="Dar de baja el servicio" busy={saving} onClose={() => { if (!pending.current) onClose(); }}>
    <div className="control-modal-customer"><strong>{customerName}</strong><span>{plan ?? '—'}</span></div>
    <form className="control-action-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={saving}>
        {!followUp && <ol className="control-steps" aria-label="Pasos">
          {STEPS.map((label, index) => <li key={label} className={index === step ? 'active' : undefined} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
        </ol>}
        {step === 0 && <>
          <label>Servicio<select required value={serviceId} onChange={event => setServiceId(event.target.value)}>
            <option value="">Seleccionar servicio</option>
            {candidates.map(service => <option key={service.idServicio} value={String(service.idServicio)}>{service.tipoServicio} · {service.estadoOperativo}</option>)}
          </select></label>
          {loading && <p role="status" className="control-muted">Consultando requisitos…</p>}
        </>}
        {context && followUp && <>
          <h3>Seguimiento de la baja</h3>
          {details([
            ['Solicitud', `N° ${followUp.idSolicitudRetiro} · ${REQUEST_LABELS[followUp.estado] ?? followUp.estado}`],
            ['Ticket', followUp.ticket ? `${followUp.ticket.codigoSeguimiento ?? '#' + followUp.ticket.idTicket} · ${followUp.ticket.estado}` : 'Sin ticket vinculado'],
            ['Orden técnica de retiro', dispatch ? (DISPATCH_LABELS[dispatch.estadoDespacho] ?? dispatch.estadoDespacho) + (dispatch.idOtG3 ? ` · N° ${dispatch.idOtG3}` : '') : 'Sin orden preparada'],
            ['Estado de la orden', dispatch?.estadoOt ? ORDER_LABELS[dispatch.estadoOt] ?? dispatch.estadoOt : 'Sin información'],
            ['Cierre técnico recibido', dispatch?.cierreRecibido ? 'Sí' : 'No'],
            ['Baja aplicada', dispatch?.aplicado ? 'Sí' : 'No; el servicio sigue suspendido'],
          ], 'Seguimiento')}
          {!followUp.flujoGuiado && <p role="status" className="control-muted">Esta solicitud no se creó desde el Libro de Control; revísala antes de continuar.</p>}
          {eligibility?.despachoG3Habilitado === false && <p role="status" className="control-muted">El envío de la orden técnica está deshabilitado en este ambiente: la solicitud queda registrada sin orden.</p>}
          {eligibility?.bajaAutomaticaHabilitada === false && <p role="status" className="control-muted">La baja efectiva automática está deshabilitada en este ambiente: aunque la orden se apruebe, el servicio seguirá suspendido hasta habilitarla.</p>}
          {dispatch?.estadoOt === 'PENDIENTE_APROBACION' && <p role="status" className="control-muted">El técnico cerró la orden; la baja se aplica cuando el jefe técnico la apruebe.</p>}
          {notice && <p role="status" className="control-muted">{notice}</p>}
          {canManage && canCancel && <label className="control-form-observation">Motivo de cancelación (si corresponde)<textarea maxLength={300} value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="Por ejemplo: el cliente pagó la deuda."/></label>}
          {canManage && <div className="control-form-footer">
            {canDispatch && <button type="button" onClick={() => void followUpAction('dispatch')}>Enviar orden de retiro</button>}
            {canReadOrder && <button type="button" onClick={() => void followUpAction('order-status')}>Consultar estado de la orden</button>}
            {canCancel && <button type="button" className="control-text-button" onClick={() => void followUpAction('cancel')}>Cancelar retiro</button>}
          </div>}
        </>}
        {context && !followUp && step === 0 && <>
          {details(contextRows)}
          {details(eligibility!.checks.map(item => [item.label, item.ok ? '✓ Cumple' : `✗ ${item.message}`] as [string, string]), 'Requisitos')}
          {!eligibility!.habilitado && <p role="status" className="control-muted">La baja guiada aún no está habilitada en este ambiente: falta habilitar el registro privado que vincula solicitud, aviso, ticket y retiro técnico. No se registrará nada.</p>}
        </>}
        {context && ready && step === 1 && <>
          <h3 ref={heading} tabIndex={-1}>Datos de la baja</h3>
          {details(contextRows)}
          <label className="control-form-observation">Observaciones de gestión y técnicas<textarea required maxLength={1000} value={observation} onChange={event => setObservation(event.target.value)} placeholder="Gestiones de cobranza realizadas, respuesta del cliente e indicaciones para el retiro."/></label>
        </>}
        {context && ready && step === 2 && <>
          <h3 ref={heading} tabIndex={-1}>Confirmación</h3>
          {details([['Servicio', `${context.servicio.tipo} · ${context.servicio.estado}`], ['Contrato', context.contrato ? `#${context.contrato.idContrato}` : null],
            ['Deuda vencida', debt ? currency.format(debt.totalExigible) : null], ['Observaciones', observation.trim()]])}
          <label><span><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo dar de baja este servicio y solicitar el retiro de sus equipos.</span>
            <small>Se crean la solicitud de retiro y el ticket «Baja de servicio». El servicio sigue suspendido y la deuda se conserva; la baja se aplica cuando el retiro técnico es aprobado.</small></label>
        </>}
      </fieldset>
      {error && <p role="alert" className="control-feedback error">{error}</p>}
      <footer className="control-form-footer">
        <button type="button" className="control-text-button" disabled={saving} onClick={() => { if (step > 0 && !followUp) { setStep(step - 1); setError(''); } else onClose(); }}>{step > 0 && !followUp ? 'Atrás' : followUp ? 'Cerrar' : 'Cancelar'}</button>
        {!followUp && <button type="submit" disabled={saving || loading || !ready || (step === 1 && !observationOk) || (step === 2 && !confirmed)}>{saving ? 'Registrando…' : step < 2 ? 'Continuar' : 'Crear solicitud y ticket'}</button>}
      </footer>
    </form>
  </ControlBookModal>;
}
