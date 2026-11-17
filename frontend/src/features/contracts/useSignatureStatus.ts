import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
export type SignatureStatus = {
  enabled: boolean; sendAllowed?: boolean; signedDownloadAvailable?: boolean;
  policy: { mode: 'automatic'|'manual'|'unknown'; available: boolean; manualAllowed: boolean; reason: string | null };
  solicitud: null | { idSolicitud: string; estado: string; correoEstado: string; firmaCorreoEstado: string };
};
export function useSignatureStatus(idContrato?: number | null, revision = 0) {
  const currentId = useRef(idContrato); currentId.current = idContrato;
  const [stored, setStored] = useState<{ id: number; data: SignatureStatus } | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const failures = useRef(0);
  const nextRetry = useRef(0);
  const refresh = useCallback(async (background = false) => {
    if (!idContrato) return null;
    if (background && (pending.current || Date.now() < nextRetry.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))) return null;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = () => !controller.signal.aborted && currentId.current === idContrato;
    try {
      const { data } = await api.get<SignatureStatus>('/contracts/' + idContrato + '/signature', { signal: controller.signal, timeout: 15000 });
      if (!current()) return null;
      if (!data?.policy || !['automatic','manual','unknown'].includes(data.policy.mode)) {
        setStored(null); setError('No se pudo verificar la modalidad de firma. Consulta nuevamente o solicita revisión.'); return null;
      }
      failures.current = 0; nextRetry.current = 0;
      setStored(previous => previous?.id === idContrato && JSON.stringify(previous.data) === JSON.stringify(data) ? previous : { id: idContrato, data });
      setError(''); return data;
    } catch {
      if (current()) {
        failures.current++;
        nextRetry.current = Date.now() + Math.min(15000 * 2 ** Math.min(failures.current, 5), 300000);
        if (!background) setStored(null);
        setError('No se pudo consultar el estado de firma. No se confirmó ningún envío ni firma.');
      }
      return null;
    } finally {
      if (pending.current === controller) pending.current = null;
    } // Unknown policy is never permission for manual signing.
  }, [idContrato]);
  useEffect(() => {
    let active = true; setStored(null); setError(''); failures.current = 0; nextRetry.current = 0;
    if (!idContrato) return;
    const load = () => { if (active) void refresh(true); };
    load(); const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); pending.current?.abort(); pending.current = null; };
  }, [idContrato, revision, refresh]);
  return { status: stored && stored.id === idContrato ? stored.data : null, refresh, error };
}
