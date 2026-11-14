import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
import { ControlBookModal } from './ControlBookModal';
import { currency } from './control-book-model';

/** Same shape as BillingService.suspensionEligibility() (GET /billing/contracts/:id/suspension-eligibility). */
export type SuspensionEligibility = {
  idContrato: number; elegible: boolean; yaSuspendido: boolean; motivo: { code: string; message: string } | null;
  umbralDias: number; motivoSuspension: string;
  facturas: Array<{ idFactura: number; saldoExigible: number; diasAtraso: number; fechaVencimientoEfectiva: string }>;
  deuda: { facturasVencidas: number; cubiertasPorConvenio: number; bajoUmbral: number; facturasSobreUmbral: number; totalExigibleSobreUmbral: number; maxDiasAtraso: number };
  serviciosAfectados: Array<{ idServicio: number; tipoServicio: string | null }>;
  empresa: { idEmpresa: number | null; nombre: string | null };
  contrato: { idContrato: number; estado: string };
  cliente: { idCliente: number; nombre: string | null } | null;
};
type SuspendResult = { yaSuspendido?: boolean; serviciosSuspendidos?: number[] };

/**
 * «Suspender servicio» (CU-30, FINET 13-11-2026): AUTOMATIC eligibility computed by the backend, MANUAL execution with
 * explicit confirmation. Nothing is suspended without this confirmation (there is no cron), and the backend evaluates
 * the same rule again right before writing. The scope is the contract and its active services in this company.
 */
export function ControlBookSuspension({ contractId, customerName, plan, canManage, onClose, onSaved, onBusyChange }: {
  contractId: number; customerName: string; plan: string | null; canManage: boolean;
  onClose: () => void; onSaved: (message: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [eligibility, setEligibility] = useState<SuspensionEligibility | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [observation, setObservation] = useState(''), [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  useEffect(() => {
    setEligibility(null); setError(''); setConfirmed(false);
    const controller = new AbortController(); setLoading(true);
    void api.get<SuspensionEligibility>(`/billing/contracts/${contractId}/suspension-eligibility`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.idContrato !== contractId) throw new Error('La consulta no corresponde al contrato seleccionado.');
        setEligibility(data);
      })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [contractId]);

  const ready = Boolean(eligibility?.elegible && canManage);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || loading || !ready) return;
    if (!confirmed) { setError('Confirma la suspensión para continuar.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.patch<SuspendResult>(`/billing/contracts/${contractId}/suspend`, { observacion: observation.trim() || undefined });
      const count = data.serviciosSuspendidos?.length ?? 0;
      onSaved(data.yaSuspendido
        ? 'El contrato ya estaba suspendido; no se modificó nada.'
        : `Servicio suspendido por no pago (${count} servicio${count === 1 ? '' : 's'}).`);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }

  const data = eligibility;
  return <ControlBookModal title="Suspender servicio" busy={saving} onClose={() => { if (!pending.current) onClose(); }}>
    <div className="control-modal-customer"><strong>{customerName}</strong><span>{plan ?? '—'}</span></div>
    <form className="control-action-form control-service-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={saving}>
        {loading && <p role="status" className="control-muted">Cargando…</p>}
        {data && <>
          <dl className="control-detail-list">
            {([
              ['Empresa', data.empresa.nombre],
              ['Contrato', `#${data.contrato.idContrato} · ${data.contrato.estado}`],
              ['Servicios afectados', data.serviciosAfectados.length ? data.serviciosAfectados.map(item => item.tipoServicio ?? `#${item.idServicio}`).join(', ') : 'Ninguno'],
              ['Saldo exigible vencido', currency.format(data.deuda.totalExigibleSobreUmbral)],
              ['Mayor atraso', `${data.deuda.maxDiasAtraso} días`],
              ['Motivo', data.motivoSuspension],
            ] as Array<[string, string | null]>).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
          </dl>
          {ready && <>
            <label className="control-form-observation">Observación (opcional)<textarea maxLength={1000} value={observation} onChange={event => setObservation(event.target.value)} placeholder="Gestión previa o indicación interna."/></label>
            <label className="control-confirmation">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
              <span>Confirmo suspender el servicio por no pago.</span>
            </label>
          </>}
        </>}
      </fieldset>
      {error && <p role="alert" className="control-feedback error">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || loading || !ready || !confirmed}>{saving ? 'Suspendiendo…' : 'Suspender servicio'}</button></footer>
    </form>
  </ControlBookModal>;
}
