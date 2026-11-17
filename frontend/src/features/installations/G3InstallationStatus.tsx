import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { api, apiErrorMessage, type CustomerService, type G3InstallationTracking } from '../../api';
import { formatDateTime } from '../../lib';
import { StatusBadge, ToastNotice } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

const STATE_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', ASIGNADA: 'Asignada', EN_CURSO: 'En curso', COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada', PENDIENTE_CLIENTE_AUSENTE: 'Cliente ausente', EN_SEGUIMIENTO: 'En seguimiento',
};

function textValue(value: unknown, keys = ['nombre_completo', 'nombreCompleto', 'nombre']) {
  if (typeof value === 'string' && value.trim() && !['-', '—'].includes(value.trim())) return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const item = record[key];
      if (typeof item === 'string' && item.trim() && !['-', '—'].includes(item.trim())) return item.trim();
    }
  }
  return 'No registrado';
}

function trackingFields(tracking: G3InstallationTracking, className = 'customer-readonly-details') {
  const remoteState = tracking.estadoRemotoG3 ?? tracking.detalle?.estado;
  const technician = textValue(tracking.detalle?.tecnico);
  return <dl className={className}>
    <div><dt>Orden de trabajo</dt><dd>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'No registrado'}</dd></div>
    <div><dt>Fecha solicitud</dt><dd>{tracking.fechaSolicitud ? formatDateTime(tracking.fechaSolicitud) : 'No registrado'}</dd></div>
    <div><dt>Última actualización</dt><dd>{tracking.fechaUltimaSincronizacion ? formatDateTime(tracking.fechaUltimaSincronizacion) : 'No registrado'}</dd></div>
    <div><dt>Intentos de envío</dt><dd>{tracking.intentos ?? 'No registrado'}</dd></div>
    <div><dt>Estado informado por el equipo técnico</dt><dd>{remoteState ? STATE_LABELS[remoteState] ?? 'Pendiente de revisión' : 'No registrado'}</dd></div>
    <div><dt>Técnico</dt><dd>{technician !== 'No registrado' ? technician : tracking.detalle?.idTecnicoG3 ? `Técnico #${tracking.detalle.idTecnicoG3}` : 'No registrado'}</dd></div>
    <div><dt>Dirección</dt><dd>{textValue(tracking.detalle?.direccion, ['direccion_completa', 'direccionCompleta', 'direccion'])}</dd></div>
    <div><dt>Fecha de finalización</dt><dd>{tracking.detalle?.fechaCompletada ? formatDateTime(tracking.detalle.fechaCompletada) : 'No registrado'}</dd></div>
  </dl>;
}

function completedFields(tracking: G3InstallationTracking | null, service?: CustomerService) {
  const installation = service?.instalacion;
  const g3Data = installation?.fuente === 'G3' ? service?.datosTecnicos : undefined;
  const result = g3Data?.resultadoInstalacion as { equipos_instalados?: unknown } | null | undefined;
  const registered = installation?.antecedenteTecnico;
  const detail = tracking?.detalle;
  const technicianId = installation?.idTecnicoG3 ?? detail?.idTecnicoG3 ?? installation?.idTecnico;
  const technician = detail?.tecnico ? textValue(detail.tecnico) : installation?.tecnico?.nombreCompleto;
  const date = installation?.fechaCompletada ?? registered?.fechaCompletada ?? detail?.fechaCompletada;
  const power = g3Data?.potenciaOpticaDbm ?? registered?.potenciaOpticaDbm ?? detail?.potenciaOpticaDbm;
  const series = registered?.equiposDeclarados?.instalados ?? (Array.isArray(result?.equipos_instalados)
    ? result.equipos_instalados.flatMap((equipment: unknown) => {
      if (!equipment || typeof equipment !== 'object') return [];
      const item = equipment as Record<string, unknown>;
      const serial = item.numero_serie ?? item.numeroSerie ?? item.serial;
      return typeof serial === 'string' && serial.trim() ? [serial.trim()] : [];
    }) : []);
  return <dl className="customer-contract-facts installation-facts">
    <div><dt>Técnico</dt><dd>{technician && technician !== 'No registrado' ? technician : technicianId ? 'ID #' + technicianId : 'No registrado'}</dd></div>
    <div><dt>Fecha y hora de instalación</dt><dd>{date ? formatDateTime(date) : 'No registrado'}</dd></div>
    <div><dt>Equipos declarados en la orden</dt><dd>{series.length ? [...new Set(series)].join(' · ') : 'No registrado'}</dd></div>
    {typeof power === 'number' && <div><dt>Potencia óptica</dt><dd>{power} dBm</dd></div>}
  </dl>;
}

type InstallationTarget = { contractId: number; prospectId?: never } | { prospectId: number; contractId?: never };
const isCompleted = (tracking: G3InstallationTracking | null) => tracking?.estadoIntegracion === 'COMPLETADA' || Boolean(tracking?.fechaCierreProcesado);
function matchesTarget(tracking: G3InstallationTracking | null, contractId?: number, prospectId?: number) {
  return !tracking || ((contractId == null || tracking.idContrato == null || tracking.idContrato === contractId)
    && (prospectId == null || tracking.idProspecto == null || tracking.idProspecto === prospectId));
}
export function G3InstallationStatus({ prospectId, contractId, canRequest, blockedReason, onChanged, compact = false, installationSummary = false, hideRequest = false, service }: InstallationTarget & {
  canRequest: boolean; blockedReason?: string; onChanged?: () => void; compact?: boolean;
  installationSummary?: boolean; hideRequest?: boolean; service?: CustomerService;
}) {
  const [tracking, setTracking] = useState<G3InstallationTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [readFailed, setReadFailed] = useState(false);
  const [requirements, setRequirements] = useState<{ idContrato: number; comunaFaltante: boolean; puedeCompletarComuna?: boolean } | null>(null);
  const [comuna, setComuna] = useState('');
  const [sameAddress, setSameAddress] = useState(false);
  const [notice, setNotice] = useState('');
  const { message, showMessage, clearMessage } = useTransientMessage(5000);
  const feedback = error || notice;
  useEffect(() => {
    if (!compact) return;
    if (!tracking || !feedback || loading || busy) {
      clearMessage();
      return;
    }
    showMessage(feedback);
  }, [compact, tracking, feedback, loading, busy, showMessage, clearMessage]);
  const loadRevision = useRef(0);
  const mutationInFlight = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const savedInstallation = service?.instalacion;
  const savedCompletion = Boolean(savedInstallation && (savedInstallation.estado === 'COMPLETADA'
    || savedInstallation.fechaProcesamiento || savedInstallation.fechaCompletada));
  const loadOptions = useRef({ canRequest, savedCompletion, installationSummary });
  loadOptions.current = { canRequest, savedCompletion, installationSummary };
  const changedListener = useRef(onChanged);
  changedListener.current = onChanged;
  useEffect(() => { setComuna(''); setSameAddress(false); setNotice(''); }, [contractId, prospectId]);
  useEffect(() => {
    mutationInFlight.current = false;
    setBusy(false);
    return () => {
      actionController.current?.abort();
      actionController.current = null;
    };
  }, [contractId, prospectId]);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const revision = ++loadRevision.current;
    setLoading(true); setError(''); setReadFailed(false); setRequirements(null);
    setTracking(null);
    try {
      if ((prospectId == null) === (contractId == null)) { setError('No se pudo identificar el contrato de esta instalación.'); return; }
      const path = contractId != null ? `/integrations/g3/contracts/${contractId}/installation` : `/integrations/g3/prospects/${prospectId}/installation`;
      const { data } = await api.get<G3InstallationTracking | null>(path, { signal: controller.signal, timeout: 15000 });
      if (revision !== loadRevision.current || controller.signal.aborted) return;
      if (!matchesTarget(data, contractId, prospectId)) throw new Error('La consulta no corresponde a la instalación seleccionada.');
      setTracking(data);
      // The local lookup identifies the order; its detail is fetched on opening, just as on manual refresh.
      if (data && (data.idOtG3 || data.codigoOtG3) && !data.detalle) {
        try {
          const detail = await fetchDetail(data, controller.signal);
          if (revision !== loadRevision.current || controller.signal.aborted) return;
          setTracking(detail);
          if (!detail.detalle && detail.ultimoErrorSanitizado) setReadFailed(true);
          if (relationshipChanged(data, detail)) changedListener.current?.();
        } catch {
          if (revision === loadRevision.current && !controller.signal.aborted) setReadFailed(true);
        }
      }
      const options = loadOptions.current;
      if (!data && options.canRequest && !options.savedCompletion && !options.installationSummary) {
        const result = await api.post('/integrations/g3/installation-requirements', prospectId ? { idProspecto: prospectId } : { idContrato: contractId }, { signal: controller.signal });
        if (revision !== loadRevision.current || controller.signal.aborted) return;
        if (contractId != null && result.data.idContrato !== contractId) { setError('La validación no corresponde al contrato seleccionado. Vuelve a comprobar la instalación.'); return; }
        if (typeof result.data.comunaFaltante !== 'boolean') { setError('No se pudieron comprobar los requisitos de instalación.'); return; }
        if (revision === loadRevision.current && !controller.signal.aborted) setRequirements(result.data);
      }
    } catch {
      if (revision === loadRevision.current && !controller.signal.aborted) setReadFailed(true);
    } finally {
      if (revision === loadRevision.current && !controller.signal.aborted) setLoading(false);
    }
  }, [contractId, prospectId]);

  async function fetchDetail(base: G3InstallationTracking, signal: AbortSignal) {
    const { data } = await api.get<G3InstallationTracking>(`/integrations/g3/installations/${base.idIntegracion}`, { signal, timeout: 15000 });
    if (!data || data.idIntegracion !== base.idIntegracion || !matchesTarget(data, contractId, prospectId)
      || (data.idEmpresa != null && base.idEmpresa != null && data.idEmpresa !== base.idEmpresa)) {
      throw new Error('La consulta no corresponde a la instalación seleccionada.');
    }
    return data;
  }

  function relationshipChanged(before: G3InstallationTracking, after: G3InstallationTracking) {
    return isCompleted(after) !== isCompleted(before) || (after.idServicio ?? null) !== (before.idServicio ?? null);
  }
  useEffect(() => {
    void load();
    return () => {
      loadController.current?.abort();
      loadRevision.current += 1;
    };
  }, [load]);

  async function completeData() {
    if (mutationInFlight.current || !canRequest || !requirements || !sameAddress || !comuna.trim()) return;
    const controller = new AbortController();
    actionController.current = controller;
    const current = () => actionController.current === controller && !controller.signal.aborted;
    mutationInFlight.current = true;
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/integrations/g3/contracts/${requirements.idContrato}/installation-data`, { comuna: comuna.trim(), confirmarMismaDireccion: true }, { signal: controller.signal });
      if (!current()) return;
      setRequirements(data); setComuna(''); setSameAddress(false);
      setNotice('Comuna guardada. El contrato firmado y su PDF conservan sus datos.');
      onChanged?.();
    } catch (cause) { if (current()) setError(apiErrorMessage(cause)); }
    finally { if (current()) { mutationInFlight.current = false; setBusy(false); actionController.current = null; } }
  }

  async function run(action: 'request' | 'retry' | 'detail') {
    if (mutationInFlight.current || loading) return;
    if (action !== 'detail' && !canRequest) return;
    if (action === 'request' && (hideRequest || tracking || error || !requirements || requirements.comunaFaltante)) return;
    if (action !== 'request' && !tracking) return;
    const controller = new AbortController();
    actionController.current = controller;
    const current = () => actionController.current === controller && !controller.signal.aborted;
    mutationInFlight.current = true;
    setBusy(true); setError(''); setReadFailed(false); setNotice('');
    try {
      if (action === 'request') {
        const { data } = await api.post<G3InstallationTracking>('/integrations/g3/installations', prospectId ? { idProspecto: prospectId } : { idContrato: contractId }, { signal: controller.signal });
        if (!current()) return;
        if (!data || !matchesTarget(data, contractId, prospectId)) throw new Error('La respuesta no corresponde a la instalación solicitada.');
        setTracking(data);
      } else if (tracking) {
        const path = `/integrations/g3/installations/${tracking.idIntegracion}`;
        if (action === 'detail') {
          const data = await fetchDetail(tracking, controller.signal);
          if (!current()) return;
          // Keep the last detail visible when the remote service is temporarily unavailable.
          setTracking(data.detalle ? data : { ...data, detalle: tracking.detalle });
          if (!data.detalle && data.ultimoErrorSanitizado) setReadFailed(true);
          // A read-only refresh updates this card. Reload the customer only when its operational relationship changed.
          if (relationshipChanged(tracking, data)) onChanged?.();
          return;
        } else {
          await api.post(`${path}/${action}`, undefined, { signal: controller.signal });
          if (!current()) return;
          await load();
        }
      }
      if (current()) onChanged?.();
    } catch (cause) { if (current()) {
      if (action === 'detail') setReadFailed(true);
      else setError(apiErrorMessage(cause));
    } }
    finally { if (current()) { mutationInFlight.current = false; setBusy(false); actionController.current = null; } }
  }

  if (loading) return <p className="inline-status">Consultando instalación técnica…</p>;
  const retryRead = <button type="button" className="installation-refresh-state" aria-label="Actualizar estado de instalación" title="Actualizar estado de instalación" disabled={busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" /></button>;
  if (installationSummary && !tracking && savedCompletion) return <section className="customer-installation-summary" aria-label="Instalación">
    <header><div className="customer-installation-order"><span>Orden de instalación</span><strong>{savedInstallation?.codigoSeguimiento ?? savedInstallation?.idOt ?? '—'}</strong></div><StatusBadge value="Completada" /></header>
    {completedFields(null, service)}
    {readFailed && retryRead}
  </section>;
  if (!tracking && readFailed) return <div>{retryRead}</div>;
  if (installationSummary && !tracking) return <p className="customer-contract-note customer-installation-empty">Sin orden de instalación registrada.</p>;
  if (!tracking) return <div className="g3-installation-card">
    {requirements?.comunaFaltante && !requirements.puedeCompletarComuna && <p role="alert">Falta la comuna. Solicita a Comercial o Administración completar los datos de instalación.</p>}
    {requirements?.comunaFaltante && requirements.puedeCompletarComuna && <fieldset disabled={busy}>
      <legend>Completar datos de instalación</legend>
      <p role="alert">Ingresa la comuna verificada del domicilio contratado y confirma que corresponde a la misma dirección.</p>
      <label>Comuna obligatoria<input value={comuna} maxLength={80} onChange={event => setComuna(event.target.value)} /></label>
      <label><input type="checkbox" checked={sameAddress} onChange={event => setSameAddress(event.target.checked)} />Confirmo que corresponde a la misma dirección contratada.</label>
      <p>Si la dirección contratada es incorrecta, solicita revisión y la aprobación o firma que corresponda antes de continuar.</p>
      <button type="button" disabled={!comuna.trim() || !sameAddress || busy} onClick={() => void completeData()}>Guardar comuna</button>
    </fieldset>}
    {!hideRequest && <button type="button" disabled={!canRequest || !requirements || requirements.comunaFaltante || Boolean(error) || readFailed || busy} aria-busy={busy} onClick={() => void run('request')}>{busy ? 'Generando…' : 'Generar instalación'}</button>}
    {!canRequest && <p className="alert" role="alert">{blockedReason ?? 'No tienes permisos para solicitar instalaciones desde esta vista.'}</p>}
    {error && <><p className="alert" role="alert">{error}</p><button type="button" className="secondary compact" disabled={busy} onClick={() => void load()}>Volver a comprobar</button></>}
    {notice && <p role="status">{notice}</p>}
    {readFailed && retryRead}
  </div>;

  const completed = isCompleted(tracking);
  const state = completed ? 'Completada' : STATE_LABELS[tracking.estadoPresentacion] ?? 'En seguimiento';
  const delivered = Boolean(tracking.idOtG3 || tracking.codigoOtG3);
  const retryable = tracking.estadoIntegracion === 'FALLIDA_REINTENTABLE';
  const refreshButton = delivered && <button type="button" className="installation-refresh-state" aria-label="Actualizar estado de instalación" title="Actualizar estado de instalación" aria-busy={busy} disabled={busy} onClick={() => void run('detail')}>
    <RefreshCw size={17} aria-hidden="true" />
  </button>;
  if (installationSummary) return <section className="customer-installation-summary" aria-label="Instalación">
    <header>
      <div className="customer-installation-order"><span>Orden de instalación</span><strong>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'Por asignar'}</strong></div>
      <div className="installation-status-actions"><StatusBadge value={state} />{refreshButton}</div>
    </header>
    {completed ? completedFields(tracking, service?.instalacion?.fuente === 'G3' && service.idServicio === tracking.idServicio ? service : undefined)
      : trackingFields(tracking, 'customer-contract-facts installation-facts')}
    {retryable && canRequest && <div><button type="button" className="secondary compact" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button></div>}
    <ToastNotice message={message} tone={error || !notice ? 'error' : 'info'} onDismiss={clearMessage} />
  </section>;
  return <div className="g3-installation-card">
    <header>
      <div className="installation-delivery-heading">{delivered ? <CheckCircle2 size={20} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}<strong>{delivered ? 'Orden de instalación enviada a terreno' : 'Orden de instalación pendiente de envío'}</strong></div>
      <div className="installation-status-actions">
        <StatusBadge value={state} />
        {refreshButton}
      </div>
    </header>
    {trackingFields(tracking)}
    {tracking.detalle && (tracking.detalle.potenciaOpticaDbm != null || tracking.detalle.resultadoLlamada || tracking.detalle.resueltoRemotamente != null || tracking.detalle.materiales) && <dl className="customer-readonly-details">
        {tracking.detalle.potenciaOpticaDbm != null && <div><dt>Potencia óptica</dt><dd>{tracking.detalle.potenciaOpticaDbm} dBm</dd></div>}
        {tracking.detalle.resultadoLlamada && <div><dt>Resultado llamada</dt><dd>{tracking.detalle.resultadoLlamada}</dd></div>}
        {tracking.detalle.resueltoRemotamente != null && <div><dt>Resuelto remotamente</dt><dd>{tracking.detalle.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>}
        {tracking.detalle.materiales && <div><dt>Materiales informados</dt><dd>{tracking.detalle.materiales.length} registro(s)</dd></div>}
    </dl>}
    {completed && <p className="inline-status">La instalación ya tiene un cierre confirmado.</p>}
    {(tracking.estadoOriginalRemotoG3 || tracking.estadoOriginalG3) && <p className="inline-status">La última actualización técnica está pendiente de revisión. {completed ? 'Se conserva el cierre confirmado de la instalación.' : 'La instalación continúa en seguimiento.'}</p>}
    {tracking.estadoPresentacion === 'CANCELADA' && <p className="inline-status">La cancelación no activa al cliente ni elimina el contrato.</p>}
    {tracking.estadoPresentacion === 'PENDIENTE_CLIENTE_AUSENTE' && <p className="inline-status">No fue posible realizar la visita por ausencia del cliente. Está pendiente coordinar una nueva fecha.</p>}
    {retryable && canRequest && <div className="button-row">
      <button type="button" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button>
    </div>}
    {compact ? <ToastNotice message={message} tone={error || !notice ? 'error' : 'info'} onDismiss={clearMessage} /> : <>
      {error && <p className="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </div>;
}
