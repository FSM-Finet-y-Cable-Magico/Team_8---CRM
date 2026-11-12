import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { api, apiErrorMessage, type CustomerService, type G3InstallationTracking } from '../../api';
import { formatDateTime, userFacingMessage } from '../../lib';
import { StatusBadge, ToastNotice } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

const STATE_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', ASIGNADA: 'Asignada', EN_CURSO: 'En curso', COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada', PENDIENTE_CLIENTE_AUSENTE: 'Cliente ausente', EN_SEGUIMIENTO: 'En seguimiento',
};

function textValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.nombre_completo ?? record.nombre ?? record.direccion_completa ?? 'No informado');
  }
  return '-';
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
    <div><dt>Técnico</dt><dd>{technician && technician !== 'No informado' ? technician : technicianId ? 'ID #' + technicianId : '—'}</dd></div>
    <div><dt>Fecha y hora de instalación</dt><dd>{date ? formatDateTime(date) : '—'}</dd></div>
    <div><dt>Equipos declarados en la orden</dt><dd>{series.length ? [...new Set(series)].join(' · ') : '—'}</dd></div>
    {typeof power === 'number' && <div><dt>Potencia óptica</dt><dd>{power} dBm</dd></div>}
  </dl>;
}

export function G3InstallationStatus({ prospectId, contractId, canRequest, onChanged, compact = false, installationSummary = false, hideRequest = false, service }: {
  prospectId?: number; contractId?: number; canRequest: boolean; onChanged?: () => void; compact?: boolean;
  installationSummary?: boolean; hideRequest?: boolean; service?: CustomerService;
}) {
  const [tracking, setTracking] = useState<G3InstallationTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requirements, setRequirements] = useState<{ idContrato: number; comunaFaltante: boolean; puedeCompletarComuna?: boolean } | null>(null);
  const [comuna, setComuna] = useState('');
  const [sameAddress, setSameAddress] = useState(false);
  const [notice, setNotice] = useState('');
  const { message, showMessage, clearMessage } = useTransientMessage(5000);
  const trackingError = tracking?.ultimoErrorSanitizado
    ? userFacingMessage(tracking.ultimoErrorSanitizado, 'No se pudo actualizar la instalación. Inténtalo nuevamente más tarde.')
    : '';
  const feedback = error || notice || trackingError;
  useEffect(() => {
    if (!compact) return;
    if (!tracking || !feedback || loading || busy) {
      clearMessage();
      return;
    }
    showMessage(feedback);
  }, [compact, tracking, feedback, loading, busy, showMessage, clearMessage]);
  const loadRevision = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const savedInstallation = service?.instalacion;
  const savedCompletion = Boolean(savedInstallation && (savedInstallation.estado === 'COMPLETADA'
    || savedInstallation.fechaProcesamiento || savedInstallation.fechaCompletada));
  useEffect(() => { setComuna(''); setSameAddress(false); setNotice(''); }, [contractId, prospectId]);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const revision = ++loadRevision.current;
    setLoading(true); setError(''); setRequirements(null);
    try {
      const path = prospectId ? `/integrations/g3/prospects/${prospectId}/installation` : `/integrations/g3/contracts/${contractId}/installation`;
      const { data } = await api.get<G3InstallationTracking | null>(path, { signal: controller.signal });
      if (revision !== loadRevision.current || controller.signal.aborted) return;
      setTracking(data);
      if (!data && canRequest && !savedCompletion) {
        const result = await api.post('/integrations/g3/installation-requirements', prospectId ? { idProspecto: prospectId } : { idContrato: contractId }, { signal: controller.signal });
        if (revision === loadRevision.current && !controller.signal.aborted) setRequirements(result.data);
      }
    } catch (cause) {
      if (revision === loadRevision.current && !controller.signal.aborted) setError(apiErrorMessage(cause));
    } finally {
      if (revision === loadRevision.current && !controller.signal.aborted) setLoading(false);
    }
  }, [canRequest, contractId, prospectId, savedCompletion]);
  useEffect(() => {
    void load();
    return () => {
      loadController.current?.abort();
      loadRevision.current += 1;
    };
  }, [load]);

  async function completeData() {
    if (!requirements || !sameAddress || !comuna.trim()) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/integrations/g3/contracts/${requirements.idContrato}/installation-data`, { comuna: comuna.trim(), confirmarMismaDireccion: true });
      setRequirements(data); setComuna(''); setSameAddress(false);
      setNotice('Comuna guardada. El contrato firmado y su PDF conservan sus datos.');
      onChanged?.();
    } catch (cause) { setError(apiErrorMessage(cause)); } finally { setBusy(false); }
  }

  async function run(action: 'request' | 'retry' | 'detail' | 'reconcile') {
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'request') {
        const { data } = await api.post<G3InstallationTracking>('/integrations/g3/installations', prospectId ? { idProspecto: prospectId } : { idContrato: contractId });
        setTracking(data);
      } else if (tracking) {
        const path = `/integrations/g3/installations/${tracking.idIntegracion}`;
        if (action === 'detail') {
          const { data } = await api.get<G3InstallationTracking>(path); setTracking(data);
        } else {
          const { data } = await api.post(`${path}/${action}`);
          if (action === 'reconcile' && data.available === false) setNotice('El cierre técnico aún no está confirmado. La instalación continúa en seguimiento.');
          await load();
        }
      }
      onChanged?.();
    } catch (cause) { setError(apiErrorMessage(cause)); } finally { setBusy(false); }
  }

  if (loading) return <p className="inline-status">Consultando instalación técnica…</p>;
  if (installationSummary && !tracking && savedCompletion) return <section className="customer-installation-summary" aria-label="Instalación">
    <header><div className="customer-installation-order"><span>Orden de instalación</span><strong>{savedInstallation?.codigoSeguimiento ?? savedInstallation?.idOt ?? '—'}</strong></div><StatusBadge value="Completada" /></header>
    {completedFields(null, service)}
  </section>;
  if (installationSummary && !tracking && !canRequest) return <p className="customer-contract-note" role={error ? 'status' : undefined}>{error || 'Sin orden de instalación registrada.'}</p>;
  if (!tracking) return <div className="g3-installation-card">
    {installationSummary ? <p>Sin orden de instalación registrada.</p> : <>
      {!hideRequest && <p>Solicita la instalación para coordinar la visita del equipo técnico.</p>}
      <p>Se requieren contrato firmado, factibilidad aprobada, identificación del cliente, teléfono móvil, dirección y comuna.</p>
    </>}
    {requirements?.comunaFaltante && !requirements.puedeCompletarComuna && <p role="alert">Falta la comuna. Solicita a Comercial o Administración completar los datos de instalación.</p>}
    {requirements?.comunaFaltante && requirements.puedeCompletarComuna && <fieldset disabled={busy}>
      <legend>Completar datos de instalación</legend>
      <p role="alert">Ingresa la comuna verificada del domicilio contratado y confirma que corresponde a la misma dirección.</p>
      <label>Comuna obligatoria<input value={comuna} maxLength={80} onChange={event => setComuna(event.target.value)} /></label>
      <label><input type="checkbox" checked={sameAddress} onChange={event => setSameAddress(event.target.checked)} />Confirmo que corresponde a la misma dirección contratada.</label>
      <p>Si la dirección contratada es incorrecta, solicita revisión y la aprobación o firma que corresponda antes de continuar.</p>
      <button type="button" disabled={!comuna.trim() || !sameAddress || busy} onClick={() => void completeData()}>Guardar comuna</button>
    </fieldset>}
    {!hideRequest && <button type="button" disabled={!canRequest || !requirements || requirements.comunaFaltante || busy} onClick={() => void run('request')}>{busy ? 'Enviando…' : 'Solicitar instalación'}</button>}
    {!canRequest && <p className="alert">Primero confirma el contrato firmado y la factibilidad.</p>}
    {error && <p className="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;

  const completed = tracking.estadoIntegracion === 'COMPLETADA' || Boolean(tracking.fechaCierreProcesado);
  const state = completed ? 'Completada' : STATE_LABELS[tracking.estadoPresentacion] ?? 'En seguimiento';
  const delivered = Boolean(tracking.idOtG3 || tracking.codigoOtG3);
  const retryable = tracking.estadoIntegracion === 'FALLIDA_REINTENTABLE';
  const consultClosure = delivered && !completed && (!installationSummary || canRequest) && (
    <button type="button" className={compact ? 'secondary compact crm-table-action' : 'secondary'} disabled={busy} onClick={() => void run('reconcile')}>Consultar cierre</button>
  );
  const refreshButton = delivered && <button type="button" className="installation-refresh-state" aria-label="Actualizar estado de instalación" title="Actualizar estado de instalación" aria-busy={busy} disabled={busy} onClick={() => void run('detail')}>
    <RefreshCw size={17} aria-hidden="true" />
  </button>;
  if (installationSummary) return <section className="customer-installation-summary" aria-label="Instalación">
    <header>
      <div className="customer-installation-order"><span>Orden de instalación</span><strong>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'Por asignar'}</strong></div>
      <div className="installation-status-actions"><StatusBadge value={state} />{refreshButton}</div>
    </header>
    {completed ? completedFields(tracking, service?.instalacion?.fuente === 'G3' && service.idServicio === tracking.idServicio ? service : undefined)
      : <dl className="customer-contract-facts installation-facts">
        <div><dt>Fecha de solicitud</dt><dd>{formatDateTime(tracking.fechaSolicitud)}</dd></div>
        {tracking.fechaUltimaSincronizacion && <div><dt>Última actualización</dt><dd>{formatDateTime(tracking.fechaUltimaSincronizacion)}</dd></div>}
      </dl>}
    {consultClosure && <details className="installation-closure-options"><summary>Opciones de instalación</summary>{consultClosure}</details>}
    {retryable && canRequest && <div><button type="button" className="secondary compact" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button></div>}
    <ToastNotice message={message} tone={error || !notice ? 'error' : 'info'} onDismiss={clearMessage} />
  </section>;
  return <div className="g3-installation-card">
    <header>
      <div className="installation-delivery-heading">{delivered ? <CheckCircle2 size={20} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}<strong>{delivered ? 'Orden de instalación enviada a terreno' : 'Orden de instalación pendiente de envío'}</strong></div>
      {compact ? <div className="installation-status-actions">
        <StatusBadge value={state} />
        {refreshButton}
      </div> : <StatusBadge value={state} />}
    </header>
    <dl className="customer-readonly-details">
      <div><dt>Orden de trabajo</dt><dd>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'Pendiente de asignación'}</dd></div>
      <div><dt>Fecha solicitud</dt><dd>{formatDateTime(tracking.fechaSolicitud)}</dd></div>
      <div><dt>Última actualización</dt><dd>{formatDateTime(tracking.fechaUltimaSincronizacion)}</dd></div>
      {tracking.fechaCierreProcesado && <div><dt>Fecha de confirmación del cierre</dt><dd>{formatDateTime(tracking.fechaCierreProcesado)}</dd></div>}
      <div><dt>Intentos de envío</dt><dd>{tracking.intentos}</dd></div>
      {tracking.estadoRemotoG3 && <div><dt>Estado informado por el equipo técnico</dt><dd>{STATE_LABELS[tracking.estadoRemotoG3] ?? 'Pendiente de revisión'}</dd></div>}
      {tracking.detalle && <>
        <div><dt>Técnico</dt><dd>{tracking.detalle.tecnico ? textValue(tracking.detalle.tecnico) : tracking.detalle.idTecnicoG3 ? `Técnico #${tracking.detalle.idTecnicoG3}` : 'Sin asignar'}</dd></div>
        <div><dt>Dirección</dt><dd>{textValue(tracking.detalle.direccion)}</dd></div>
        <div><dt>Fecha de finalización</dt><dd>{tracking.detalle.fechaCompletada ? formatDateTime(tracking.detalle.fechaCompletada) : 'No registrada'}</dd></div>
        {tracking.detalle.potenciaOpticaDbm != null && <div><dt>Potencia óptica</dt><dd>{tracking.detalle.potenciaOpticaDbm} dBm</dd></div>}
        {tracking.detalle.resultadoLlamada && <div><dt>Resultado llamada</dt><dd>{tracking.detalle.resultadoLlamada}</dd></div>}
        {tracking.detalle.resueltoRemotamente != null && <div><dt>Resuelto remotamente</dt><dd>{tracking.detalle.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>}
        {tracking.detalle.materiales && <div><dt>Materiales informados</dt><dd>{tracking.detalle.materiales.length} registro(s)</dd></div>}
      </>}
    </dl>
    {completed && <p className="inline-status">La instalación ya tiene un cierre confirmado.</p>}
    {(tracking.estadoOriginalRemotoG3 || tracking.estadoOriginalG3) && <p className="inline-status">La última actualización técnica está pendiente de revisión. {completed ? 'Se conserva el cierre confirmado de la instalación.' : 'La instalación continúa en seguimiento.'}</p>}
    {tracking.estadoPresentacion === 'CANCELADA' && <p className="inline-status">La cancelación no activa al cliente ni elimina el contrato.</p>}
    {tracking.estadoPresentacion === 'PENDIENTE_CLIENTE_AUSENTE' && <p className="inline-status">No fue posible realizar la visita por ausencia del cliente. Está pendiente coordinar una nueva fecha.</p>}
    {!compact && trackingError && <p className="alert">{trackingError}</p>}
    {compact && consultClosure && <details className="installation-closure-options">
      <summary>Opciones de instalación</summary>
      {consultClosure}
    </details>}
    {(!compact || retryable) && <div className="button-row">
      {!compact && delivered && <button type="button" className="secondary" disabled={busy} onClick={() => void run('detail')}>Detalle</button>}
      {!compact && consultClosure}
      {retryable && <button type="button" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button>}
    </div>}
    {compact ? <ToastNotice message={message} tone={error || !notice ? 'error' : 'info'} onDismiss={clearMessage} /> : <>
      {error && <p className="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </div>;
}
