import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Check, Download, FileText, ShieldCheck } from 'lucide-react';
import './public-signature.css';

type View = { estado: string; hashOriginal: string; hashFirmado: string | null; vence: string;
  firmado: string | null; correo: string; consentimiento: string; consentimientoVersion: string };
const root = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
export function PublicSignaturePage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState('');
  const [consent, setConsent] = useState(false);

  async function call(path: string, extra = {}, signal?: AbortSignal) {
    const response = await fetch(root + '/contract-signatures/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store', body: JSON.stringify({ token, ...extra }), signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof data.message === 'string' && /contrato fue cancelado|solicitud no vigente|enlace no disponible|enlace expiró/i.test(data.message)) {
        setView(null); setReviewed(''); setConsent(false);
      }
      throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo continuar. Contacta a la empresa.');
    }
    return response;
  }
  useEffect(() => {
    // A fragment is not sent in HTTP logs or Referrer. Keep the capability only in memory.
    history.replaceState(null, '', location.pathname);
    const controller = new AbortController();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setMessage('Enlace inválido. Abre el enlace recibido por correo.'); return; }
    void call('view', {}, controller.signal).then(r => r.json()).then(setView).catch(e => {
      if (e.name !== 'AbortError') setMessage(e.message);
    });
    return () => controller.abort();
  }, [token]);

  async function operation(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo continuar'); }
    finally { setBusy(false); }
  }
  async function download() {
    await operation(async () => {
      if (!view) return;
      const blob = await (await call('pdf')).blob();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
        .map(n => n.toString(16).padStart(2, '0')).join('');
      const expected = view.estado === 'FIRMADA' ? view.hashFirmado : view.hashOriginal;
      if (hash !== expected) throw new Error('La huella del PDF no coincide. Contacta a la empresa.');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = view.estado === 'FIRMADA' ? 'contrato-firmado.pdf' : 'contrato-para-revisar.pdf';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReviewed(view.hashOriginal);
    });
  }
  const signed = view?.estado === 'FIRMADA';
  return <main className="public-signature"><section className={`signature-card${signed ? ' signature-card--signed' : ''}`}>
    <div className="signature-emblem" aria-hidden="true">{signed ? <Check size={44} strokeWidth={2.5} /> : <FileText size={36} />}</div>
    <span className="signature-eyebrow">{signed ? 'Proceso completado' : 'Documento para su revisión'}</span>
    <h1>{signed ? 'Contrato firmado' : 'Firma de contrato'}</h1>
    {message && <p role="status" className="signature-notice">{message}</p>}
    {!view ? <p>Abre el enlace personal recibido por correo para revisar tu documento.</p> : <>
      <p className="signature-intro">{signed ? 'Su firma se ha registrado correctamente. Descargue su contrato junto con la constancia de aceptación y conserve una copia.'
        : 'Descargue y lea su contrato. Cuando haya revisado sus condiciones, podrá aceptarlo y firmarlo desde esta página.'}</p>
      <button className="signature-download" disabled={busy} onClick={download}><Download size={18} />{signed ? 'Descargar contrato firmado' : 'Descargar contrato para revisar'}</button>
      {view.estado !== 'FIRMADA' && <>
        <p className="signature-expiry">Disponible hasta el {new Date(view.vence).toLocaleString('es-CL')}.</p>
        <form onSubmit={e => { e.preventDefault(); return operation(async () => {
          await call('sign', { hashOriginal: reviewed, consent, consentVersion: view.consentimientoVersion });
          setView(await (await call('view')).json()); setConsent(false); setMessage('');
        }); }}>
          <label className="signature-consent"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /><span>{view.consentimiento}</span></label>
          <button disabled={busy || !reviewed || !consent} type="submit">{busy ? 'Procesando…' : 'Aceptar y firmar el contrato'}</button>
        </form>
      </>}
      <footer className="signature-footer"><ShieldCheck size={17} /><span>Enlace personal enviado a {view.correo}</span></footer>
    </>}
  </section></main>;
}
