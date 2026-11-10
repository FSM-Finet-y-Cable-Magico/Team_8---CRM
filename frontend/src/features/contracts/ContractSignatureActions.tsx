import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
type State = { enabled: boolean; solicitud: null | { estado: string; correoEstado: string; firmaCorreoEstado: string } };
export function ContractSignatureActions({ idContrato, canSend, revision }: { idContrato: number; canSend: boolean; revision: number }) {
  const [state, setState] = useState<State | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true; setState(null); setMessage('');
    api.get<State>('/contracts/' + idContrato + '/signature').then(({ data }) => { if (active) setState(data); })
      .catch(() => { /* Older or disabled deployments retain their current UI. */ });
    return () => { active = false; };
  }, [idContrato, revision]);
  if (!state?.enabled) return null;
  async function action(kind: 'send' | 'cancel' | 'download') {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const path = '/contracts/' + idContrato + '/signature';
      if (kind === 'download') {
        const { data } = await api.get(path + '/download', { responseType: 'blob' });
        const url = URL.createObjectURL(data), link = document.createElement('a');
        link.href = url; link.download = 'contrato-firmado.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        if (kind === 'send') await api.post(path); else await api.patch(path + '/cancel');
        setState((await api.get<State>(path)).data);
        setMessage(kind === 'send' ? 'Solicitud registrada. Revisa el estado de envío del correo.' : 'Solicitud anulada. Genera una nueva versión para reenviar.');
      }
    } catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section><h4>Firma por correo</h4>
    <p>Solicitud: {state.solicitud?.estado ?? 'Sin solicitud'}{state.solicitud && ' · Correo: ' + state.solicitud.correoEstado}</p>
    {message && <p role="status">{message}</p>}
    {canSend && state.solicitud?.estado !== 'FIRMADA' && <button className="secondary compact" disabled={busy} onClick={() => void action('send')}>Enviar a firma</button>}
    {canSend && state.solicitud?.estado === 'PENDIENTE' && <button className="secondary compact" disabled={busy} onClick={() => void action('cancel')}>Anular solicitud</button>}
    {state.solicitud?.estado === 'FIRMADA' && <button className="secondary compact" disabled={busy} onClick={() => void action('download')}>Descargar contrato con constancia</button>}
  </section>;
}
