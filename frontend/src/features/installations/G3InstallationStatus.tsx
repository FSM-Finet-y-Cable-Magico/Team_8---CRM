import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type G3InstallationTracking } from '../../api';
import { formatDateTime } from '../../lib';
import { StatusBadge } from '../../shared/components';

const STATE_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente', ASIGNADA: 'Asignada', EN_CURSO: 'En curso', COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada', PENDIENTE_CLIENTE_AUSENTE: 'Cliente ausente', EN_SEGUIMIENTO: 'En seguimiento',
};

function textValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.nombre_completo ?? record.nombre ?? record.direccion_completa ?? 'Disponible en G3');
  }
  return '-';
}

export function G3InstallationStatus({ prospectId, contractId, canRequest, onChanged }: {
  prospectId?: number; contractId?: number; canRequest: boolean; onChanged?: () => void;
}) {
  const [tracking, setTracking] = useState<G3InstallationTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadRevision = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const revision = ++loadRevision.current;
    setLoading(true); setError('');
    try {
      const path = prospectId ? `/integrations/g3/prospects/${prospectId}/installation` : `/integrations/g3/contracts/${contractId}/installation`;
      const { data } = await api.get<G3InstallationTracking | null>(path, { signal: controller.signal });
      if (revision !== loadRevision.current || controller.signal.aborted) return;
      setTracking(data);
    } catch (cause) {
      if (revision === loadRevision.current && !controller.signal.aborted) setError(apiErrorMessage(cause));
    } finally {
      if (revision === loadRevision.current && !controller.signal.aborted) setLoading(false);
    }
  }, [contractId, prospectId]);
  useEffect(() => {
    void load();
    return () => {
      loadController.current?.abort();
      loadRevision.current += 1;
    };
  }, [load]);

  async function run(action: 'request' | 'retry' | 'detail' | 'reconcile') {
    setBusy(true); setError('');
    try {
      if (action === 'request') {
        const { data } = await api.post<G3InstallationTracking>('/integrations/g3/installations', prospectId ? { idProspecto: prospectId } : { idContrato: contractId });
        setTracking(data);
      } else if (tracking) {
        const path = `/integrations/g3/installations/${tracking.idIntegracion}`;
        if (action === 'detail') {
          const { data } = await api.get<G3InstallationTracking>(path); setTracking(data);
        } else { await api.post(`${path}/${action}`); await load(); }
      }
      onChanged?.();
    } catch (cause) { setError(apiErrorMessage(cause)); } finally { setBusy(false); }
  }

  if (loading) return <p className="inline-status">Consultando instalación técnica…</p>;
  if (!tracking) return <div className="g3-installation-card">
    <p>G3 administrará la orden, agenda, técnico, evidencia y cierre de terreno.</p>
    <button type="button" disabled={!canRequest || busy} onClick={() => void run('request')}>{busy ? 'Enviando…' : 'Solicitar instalación a G3'}</button>
    {!canRequest && <p className="alert">Primero confirma el contrato firmado y la factibilidad.</p>}
    {error && <p className="alert">{error}</p>}
  </div>;

  const state = STATE_LABELS[tracking.estadoPresentacion] ?? 'En seguimiento';
  const completed = tracking.estadoIntegracion === 'COMPLETADA' || Boolean(tracking.fechaCierreProcesado);
  return <div className="g3-installation-card">
    <header><div><strong>Instalación técnica</strong><span className="source-badge">Fuente G3</span></div><StatusBadge value={state} /></header>
    <dl className="customer-readonly-details">
      <div><dt>Código OT G3</dt><dd>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'Pendiente de respuesta'}</dd></div>
      <div><dt>Fecha solicitud</dt><dd>{formatDateTime(tracking.fechaSolicitud)}</dd></div>
      <div><dt>Última sincronización</dt><dd>{formatDateTime(tracking.fechaUltimaSincronizacion)}</dd></div>
      {tracking.fechaCierreProcesado && <div><dt>Cierre procesado en CRM</dt><dd>{formatDateTime(tracking.fechaCierreProcesado)}</dd></div>}
      <div><dt>Intentos</dt><dd>{tracking.intentos}</dd></div>
      {tracking.estadoRemotoG3 && <div><dt>Estado remoto informado</dt><dd>{STATE_LABELS[tracking.estadoRemotoG3] ?? tracking.estadoRemotoG3}</dd></div>}
      {tracking.detalle && <>
        <div><dt>Técnico</dt><dd>{tracking.detalle.tecnico ? textValue(tracking.detalle.tecnico) : tracking.detalle.idTecnicoG3 ? `ID técnico G3 #${tracking.detalle.idTecnicoG3}` : 'No informado por G3'}</dd></div>
        <div><dt>Dirección</dt><dd>{textValue(tracking.detalle.direccion)}</dd></div>
        <div><dt>Fecha completada G3</dt><dd>{tracking.detalle.fechaCompletada ? formatDateTime(tracking.detalle.fechaCompletada) : 'No informada por G3'}</dd></div>
        {tracking.detalle.potenciaOpticaDbm != null && <div><dt>Potencia óptica</dt><dd>{tracking.detalle.potenciaOpticaDbm} dBm</dd></div>}
        {tracking.detalle.resultadoLlamada && <div><dt>Resultado llamada</dt><dd>{tracking.detalle.resultadoLlamada}</dd></div>}
        {tracking.detalle.resueltoRemotamente != null && <div><dt>Resuelto remotamente</dt><dd>{tracking.detalle.resueltoRemotamente ? 'Sí' : 'No'}</dd></div>}
        {tracking.detalle.materiales && <div><dt>Materiales informados</dt><dd>{tracking.detalle.materiales.length} registro(s)</dd></div>}
      </>}
    </dl>
    {completed && <p className="inline-status">El cierre ya fue confirmado en CRM. Las consultas de detalle no modifican ese estado terminal.</p>}
    {tracking.estadoOriginalRemotoG3 && <p className="inline-status">Estado remoto informado por G3: {tracking.estadoOriginalRemotoG3}. El estado confirmado en CRM se conserva.</p>}
    {tracking.estadoOriginalG3 && <p className="inline-status">Estado original G3: {tracking.estadoOriginalG3}. Se mantiene en seguimiento y no activa el servicio.</p>}
    {tracking.estadoPresentacion === 'CANCELADA' && <p className="inline-status">La cancelación no activa al cliente ni elimina el contrato.</p>}
    {tracking.estadoPresentacion === 'PENDIENTE_CLIENTE_AUSENTE' && <p className="inline-status">Cliente ausente. La reprogramación queda pendiente del mecanismo que defina G3.</p>}
    {tracking.ultimoErrorSanitizado && <p className="alert">{tracking.ultimoErrorSanitizado}</p>}
    <div className="button-row">
      {(tracking.idOtG3 || tracking.codigoOtG3) && <button type="button" className="secondary" disabled={busy} onClick={() => void run('detail')}>Ver detalle</button>}
      {!completed && (tracking.idOtG3 || tracking.codigoOtG3) && <button type="button" className="secondary" disabled={busy} onClick={() => void run('reconcile')}>Consultar cierre</button>}
      {tracking.estadoIntegracion === 'FALLIDA_REINTENTABLE' && <button type="button" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button>}
    </div>
    {error && <p className="alert">{error}</p>}
  </div>;
}
