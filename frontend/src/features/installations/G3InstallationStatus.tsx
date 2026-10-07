import { useCallback, useEffect, useState } from 'react';
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
    return String(record.nombre_completo ?? record.nombre ?? record.direccion_completa ?? 'Sin detalle disponible');
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
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const path = prospectId ? `/integrations/g3/prospects/${prospectId}/installation` : `/integrations/g3/contracts/${contractId}/installation`;
      const { data } = await api.get<G3InstallationTracking | null>(path);
      setTracking(data);
    } catch (cause) { setError(apiErrorMessage(cause)); } finally { setLoading(false); }
  }, [contractId, prospectId]);
  useEffect(() => { void load(); }, [load]);

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
    <p>Solicita la visita técnica para coordinar la instalación.</p>
    <button type="button" disabled={!canRequest || busy || Boolean(error)} onClick={() => void run('request')}>{busy ? 'Enviando…' : 'Solicitar instalación'}</button>
    {!canRequest && <p className="alert">Primero confirma el contrato firmado y la factibilidad.</p>}
    {error && <><p className="alert">{error}</p><button type="button" className="secondary" disabled={busy} onClick={() => void load()}>Reintentar consulta</button></>}
  </div>;

  const state = STATE_LABELS[tracking.estadoPresentacion] ?? 'En seguimiento';
  return <div className="g3-installation-card">
    <header><div><strong>Instalación técnica</strong></div><StatusBadge value={state} /></header>
    <dl className="customer-readonly-details">
      <div><dt>Orden</dt><dd>{tracking.codigoOtG3 ?? tracking.idOtG3 ?? 'Pendiente de respuesta'}</dd></div>
      <div><dt>Fecha solicitud</dt><dd>{formatDateTime(tracking.fechaSolicitud)}</dd></div>
      <div><dt>Última sincronización</dt><dd>{formatDateTime(tracking.fechaUltimaSincronizacion)}</dd></div>
      <div><dt>Intentos</dt><dd>{tracking.intentos}</dd></div>
      {tracking.detalle && <><div><dt>Técnico</dt><dd>{textValue(tracking.detalle.tecnico)}</dd></div><div><dt>Dirección</dt><dd>{textValue(tracking.detalle.direccion)}</dd></div></>}
    </dl>
    {tracking.estadoOriginalG3 && <p className="inline-status">Estado informado: {tracking.estadoOriginalG3}. Se mantiene en seguimiento y no activa el servicio.</p>}
    {tracking.estadoPresentacion === 'CANCELADA' && <p className="inline-status">La cancelación no activa al cliente ni elimina el contrato.</p>}
    {tracking.estadoPresentacion === 'PENDIENTE_CLIENTE_AUSENTE' && <p className="inline-status">Cliente ausente. La visita queda pendiente de reprogramación.</p>}
    {tracking.ultimoErrorSanitizado && <p className="alert">{tracking.ultimoErrorSanitizado}</p>}
    <div className="button-row">
      {(tracking.idOtG3 || tracking.codigoOtG3) && <button type="button" className="secondary" disabled={busy} onClick={() => void run('detail')}>Ver detalle</button>}
      {(tracking.idOtG3 || tracking.codigoOtG3) && <button type="button" className="secondary" disabled={busy} onClick={() => void run('reconcile')}>Consultar cierre</button>}
      {tracking.estadoIntegracion === 'FALLIDA_REINTENTABLE' && <button type="button" disabled={busy} onClick={() => void run('retry')}>Reintentar envío</button>}
    </div>
    {error && <p className="alert">{error}</p>}
  </div>;
}
