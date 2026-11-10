import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
import { useSignatureStatus } from './useSignatureStatus';
export function ContractSignatureActions({ idContrato, canSend, revision, onChanged }: {
  idContrato: number; canSend: boolean; revision: number; onChanged?: () => void;
}) {
  const { status: state, refresh } = useSignatureStatus(idContrato, revision);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const notified = useRef('');
  useEffect(() => {
    if (state?.solicitud?.estado === 'FIRMADA' && notified.current !== state.solicitud.idSolicitud) {
      notified.current = state.solicitud.idSolicitud; onChanged?.();
    }
  }, [state?.solicitud?.estado, state?.solicitud?.idSolicitud, onChanged]);
  useEffect(() => { setBusy(false); setMessage(''); }, [idContrato]);
  if (!state) return null;
  if (state.policy.mode === 'unknown') return <p role="status">{state.policy.reason ?? 'Modo de firma pendiente de autorización'}</p>;
  if (state.policy.mode !== 'automatic' && !state.signedDownloadAvailable) return null;
  async function action(kind: 'send' | 'cancel' | 'download' | 'retry') {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const path = '/contracts/' + idContrato + '/signature';
      if (kind === 'download') {
        const { data } = await api.get(path + '/download', { responseType: 'blob' });
        const url = URL.createObjectURL(data), link = document.createElement('a');
        link.href = url; link.download = 'contrato-firmado.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        if (kind === 'send') await api.post(path);
        else if (kind === 'retry') await api.post(path + '/retry-delivery');
        else await api.patch(path + '/cancel');
        await refresh();
        setMessage(kind === 'send' ? 'Solicitud registrada. Revisa la entrega del correo.' : kind === 'cancel' ? 'Solicitud anulada. Genera una nueva versión para reenviar.' : 'Entrega revisada.');
      }
    } catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section><h4>Firma por correo</h4>
    {state.policy.reason && <p role="status">{state.policy.reason}</p>}
    <p>Solicitud: {state.solicitud?.estado ?? 'Sin solicitud'}{state.solicitud && ' · Correo: ' + state.solicitud.correoEstado}</p>
    {message && <p role="status">{message}</p>}
    {canSend && state.enabled && state.sendAllowed && <button className="secondary compact" disabled={busy} onClick={() => void action('send')}>Enviar a firma</button>}
    {canSend && state.enabled && state.solicitud?.estado === 'PENDIENTE' && <button className="secondary compact" disabled={busy} onClick={() => void action('cancel')}>Anular solicitud</button>}
    {state.signedDownloadAvailable && <button className="secondary compact" disabled={busy} onClick={() => void action('download')}>Descargar contrato con constancia</button>}
    {canSend && state.enabled && state.solicitud?.estado === 'FIRMADA' && state.solicitud.firmaCorreoEstado === 'FALLIDO' && <button disabled={busy} onClick={() => void action('retry')}>Reintentar entrega confirmada como fallida</button>}
    <button className="secondary compact" disabled={busy} onClick={() => void refresh()}>Consultar estado</button>
  </section>;
}
