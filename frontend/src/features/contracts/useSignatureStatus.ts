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
  const refresh = useCallback(async () => {
    if (!idContrato) return null;
    try {
      const { data } = await api.get<SignatureStatus>('/contracts/' + idContrato + '/signature');
      if (currentId.current !== idContrato) return null;
      if (!data?.policy || !['automatic','manual','unknown'].includes(data.policy.mode)) { setStored(null); return null; }
      if (currentId.current !== idContrato) return null;
      setStored({ id: idContrato, data }); return data;
    } catch { if (currentId.current === idContrato) setStored(null); return null; } // Unknown policy is never permission for manual signing.
  }, [idContrato]);
  useEffect(() => {
    let active = true; setStored(null);
    if (!idContrato) return;
    const load = () => { if (active) void refresh(); };
    load(); const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [idContrato, revision, refresh]);
  return { status: stored && stored.id === idContrato ? stored.data : null, refresh };
}
