import { useEffect, useState } from 'react';
import { api } from '../../api';

type View = { estado: string; hashOriginal: string; hashFirmado: string | null; vence: string;
  firmado: string | null; correo: string; consentimiento: string; consentimientoVersion: string };
const root = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
export function PublicSignaturePage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);

  async function call(path: string, extra = {}, signal?: AbortSignal) {
    const response = await fetch(root + '/contract-signatures/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store', body: JSON.stringify({ token, ...extra }), signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
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
  return <main className="public-signature"><section className="workflow-panel">
    <h1>Firma de contrato</h1>
    {message && <p role="status" className="inline-status">{message}</p>}
    {!view ? <p>Abre el enlace personal recibido por correo para revisar tu documento.</p> : <>
      <p>Correo de verificación: {view.correo}</p>
      <p>{view.estado === 'FIRMADA' ? 'Tu aceptación quedó registrada. Puedes descargar el PDF con su constancia.'
        : 'Descarga y revisa el contrato. Después solicita el código que enviaremos a tu correo.'}</p>
      <button disabled={busy} onClick={download}>Descargar {view.estado === 'FIRMADA' ? 'contrato firmado' : 'PDF para revisar'}</button>
      <details><summary>Huella del documento original</summary><p className="signature-hash">{view.hashOriginal}</p></details>
      {view.estado !== 'FIRMADA' && <>
        <p>El enlace vence el {new Date(view.vence).toLocaleString('es-CL')}.</p>
        <button className="secondary" disabled={busy || !reviewed} onClick={() => operation(async () => {
          await call('code'); setMessage('Código enviado. Vence en 10 minutos. Espera 60 segundos para solicitar otro.');
        })}>Enviar código a mi correo</button>
        <form onSubmit={e => { e.preventDefault(); return operation(async () => {
          await call('sign', { code, hashOriginal: reviewed, consent, consentVersion: view.consentimientoVersion });
          setView(await (await call('view')).json()); setCode(''); setConsent(false);
          setMessage('Firma registrada. El documento con su constancia está disponible para descargar.');
        }); }}>
          <label>Código de seis dígitos<input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} /></label>
          <label><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /> {view.consentimiento}</label>
          <button disabled={busy || !reviewed || !consent || code.length !== 6} type="submit">Aceptar y firmar el contrato</button>
        </form>
      </>}
    </>}
  </section></main>;
}
