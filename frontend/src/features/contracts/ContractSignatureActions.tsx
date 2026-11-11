import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';
import { useSignatureStatus } from './useSignatureStatus';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
export function ContractSignatureActions({ idContrato, canSend, revision, onChanged, compact = false, prospectList = false }: {
  idContrato: number; canSend: boolean; revision: number; onChanged?: () => void; compact?: boolean; prospectList?: boolean;
}) {
  const { status: state, refresh } = useSignatureStatus(idContrato, revision);
  const [busy, setBusy] = useState(false);
  const { message, showMessage: setMessage } = useTransientMessage();
  const notified = useRef('');
  useEffect(() => {
    if (state?.solicitud?.estado === 'FIRMADA' && notified.current !== state.solicitud.idSolicitud) {
      notified.current = state.solicitud.idSolicitud; onChanged?.();
    }
  }, [state?.solicitud?.estado, state?.solicitud?.idSolicitud, onChanged]);
  useEffect(() => { setBusy(false); setMessage(''); }, [idContrato]);
  if (!state) return error ? <section><p role="status">{error}</p>
    <button className="secondary compact" onClick={() => void refresh()}>Consultar estado de firma</button></section> : null;
  if (state.policy.mode === 'unknown' && !state.signedDownloadAvailable) return <p role="status">{state.policy.reason ?? 'El contrato no tiene una modalidad de firma autorizada. Solicita su asignación al administrador.'}</p>;
  if (state.policy.mode !== 'automatic' && !state.signedDownloadAvailable) return state.policy.reason
    ? <p role="status">{state.policy.reason}</p> : null;
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
        setMessage(kind === 'send' ? 'Solicitud registrada. Revisa la entrega del correo.' : kind === 'cancel' ? 'Solicitud anulada.' : 'Entrega revisada.');
      }
    } catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  const content = <>
    {!prospectList && state.policy.reason && <p role="status">{state.policy.reason}</p>}
    {(!prospectList || state.solicitud) && <p>Solicitud: {state.solicitud?.estado ?? 'Sin solicitud'}{state.solicitud && ' · Correo: ' + state.solicitud.correoEstado}</p>}
    {message && <p role="status">{message}</p>}
    {canSend && state.enabled && state.sendAllowed && <button className="secondary compact" disabled={busy} onClick={() => void action('send')}>Enviar a firma</button>}
    {canSend && state.enabled && state.solicitud?.estado === 'PENDIENTE' && <button className="secondary compact" disabled={busy} onClick={() => void action('cancel')}>Anular solicitud</button>}
    {state.signedDownloadAvailable && (prospectList
      ? <button type="button" className="prospect-document-download" aria-label="Descargar contrato con constancia" title="Descargar contrato con constancia" disabled={busy} onClick={() => void action('download')}><Download size={17} aria-hidden="true" /></button>
      : <button className="secondary compact" disabled={busy} onClick={() => void action('download')}>Descargar contrato con constancia</button>)}
    {canSend && state.enabled && state.solicitud?.estado === 'FIRMADA' && state.solicitud.firmaCorreoEstado === 'FALLIDO' && <button disabled={busy} onClick={() => void action('retry')}>Reintentar entrega confirmada como fallida</button>}
    <button className="secondary compact" disabled={busy} onClick={() => void refresh()}>Consultar estado</button>
  </>;
  if (prospectList) return <li className="prospect-signature-row"><div className="button-row">{content}</div></li>;
  return compact ? <details className="customer-contract-document-options"><summary>Firma por correo</summary>{content}</details>
    : <section><h4>Firma por correo</h4>{content}</section>;
}
