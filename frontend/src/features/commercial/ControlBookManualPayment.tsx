import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type BillingInvoiceDetail } from '../../api';
import { ControlBookModal } from './ControlBookModal';
import { type ControlRow, currency, dateLabel } from './control-book-model';
import { type InstallmentDetail } from './control-book-installments';

export function ControlBookManualPayment({ contexts, contractId, customerId, companyId, canManage, onClose, onSaved, onBusyChange }: {
  contexts: ControlRow[]; contractId: number; customerId: number; companyId: number | null;
  canManage: boolean; onClose: () => void; onSaved: (message: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const candidates = contexts.filter(item => item.idCliente === customerId && item.idEmpresa === companyId && item.idContrato === contractId && item.idFactura && Number(item.saldoPendiente) > 0)
    .filter((item, index, items) => items.findIndex(other => other.idFactura === item.idFactura) === index);
  const [invoiceId, setInvoiceId] = useState(candidates.length === 1 ? String(candidates[0].idFactura) : '');
  const [invoice, setInvoice] = useState<BillingInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [amount, setAmount] = useState(''), [method, setMethod] = useState('Transferencia'), [reference, setReference] = useState('');
  const [agreements, setAgreements] = useState<InstallmentDetail[]>([]);
  const [quotaId, setQuotaId] = useState('');
  const pending = useRef(false);
  const selected = candidates.find(item => String(item.idFactura) === invoiceId);
  const allowedInvoiceId = selected?.idFactura ?? null;
  const quota = agreements.flatMap(agreement => agreement.cuotas).find(item => String(item.idCuota) === quotaId);
  const payableAgreements = agreements.filter(agreement => agreement.cuotas.some(item => item.saldo !== null && Number(item.saldo) > 0));
  const agreementTarget = payableAgreements.find(agreement => `agreement-${agreement.idConvenio}` === quotaId);
  const agreementBalance = (agreement: InstallmentDetail) => agreement.cuotas.reduce((sum, item) => sum + (item.saldo === null ? 0 : Number(item.saldo)), 0);
  const payableBalance = quota ? Number(quota.saldo) : agreementTarget ? agreementBalance(agreementTarget) : Number(invoice?.saldo);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  useEffect(() => {
    setInvoice(null); setAmount(''); setReference(''); setError(''); setAgreements([]); setQuotaId('');
    if (!allowedInvoiceId) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void api.get<BillingInvoiceDetail>(`/billing/invoices/${allowedInvoiceId}`, { params: { scope: String(companyId) }, signal: controller.signal }).then(async ({ data }) => {
      if (controller.signal.aborted) return;
      if (data.idFactura !== allowedInvoiceId || data.idContrato !== contractId || data.contrato?.cliente?.idCliente !== customerId || data.contrato.idEmpresa !== companyId) throw new Error('La factura no corresponde al plan seleccionado.');
      const details = await Promise.all(data.convenios.filter(agreement => agreement.estado === 'APROBADO').map(async agreement => {
        const { data: detail } = await api.get<InstallmentDetail>(`/commercial/agreements/${agreement.idConvenio}/allocations`, { signal: controller.signal });
        if (detail.idConvenio !== agreement.idConvenio || detail.idFactura !== allowedInvoiceId || detail.idEmpresa !== companyId) throw new Error('Las cuotas no corresponden al documento seleccionado.');
        return detail;
      }));
      if (controller.signal.aborted) return;
      const firstAgreement = details.find(agreement => agreement.cuotas.some(item => item.saldo !== null && Number(item.saldo) > 0));
      setInvoice(data); setAgreements(details); setQuotaId(firstAgreement ? `agreement-${firstAgreement.idConvenio}` : '');
      setAmount(data.aceptaPagos ? String(firstAgreement ? Math.min(agreementBalance(firstAgreement), Number(data.saldo)) : data.saldo ?? '') : '');
    }).catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowedInvoiceId, companyId, contractId, customerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || loading || !canManage || !invoice?.aceptaPagos || !selected || (quotaId && !agreementTarget && (!quota || quota.saldo === null || Number(quota.saldo) <= 0))) return;
    if (payableAgreements.length && !quota && !agreementTarget) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > Number(invoice.saldo) || value > payableBalance || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) { setError('Ingresa un monto válido que no supere el saldo pendiente.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      await api.post('/billing/payments', { idFactura: invoice.idFactura, ...(quota ? { idCuota: quota.idCuota } : agreementTarget ? { idConvenio: agreementTarget.idConvenio } : {}), monto: value, pasarela: method, codigoTransaccion: reference.trim() || undefined });
      onSaved('Pago registrado correctamente.');
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }
  return <ControlBookModal title="Pago manual" busy={saving} onClose={() => { if (!pending.current) onClose(); }}>
    <div className="control-modal-customer"><strong>{contexts[0]?.nombre}</strong><span>{contexts[0]?.plan ?? '—'}</span></div>
    <form className="control-manual-payment" onSubmit={event => void submit(event)}>
      <fieldset disabled={saving}>
        <label>Documento a pagar<select required value={invoiceId} onChange={event => setInvoiceId(event.target.value)}><option value="">Seleccionar fecha de vencimiento</option>{candidates.map(item => <option key={item.rowId} value={String(item.idFactura)}>{dateLabel(item.fechaVencimientoEfectiva)}{candidates.some(other => other.idFactura !== item.idFactura && other.fechaVencimientoEfectiva === item.fechaVencimientoEfectiva) ? ` (${item.numeroDocumento ?? item.idFactura})` : ''}</option>)}</select></label>
        {loading && <p role="status" className="control-muted">Consultando saldo…</p>}
        {invoice && <>
          {payableAgreements.length > 0 && <label>Aplicar pago a<select value={quotaId} onChange={event => {
            const next = agreements.flatMap(agreement => agreement.cuotas).find(item => String(item.idCuota) === event.target.value);
            const nextAgreement = payableAgreements.find(item => `agreement-${item.idConvenio}` === event.target.value);
            setQuotaId(next ? String(next.idCuota) : nextAgreement ? `agreement-${nextAgreement.idConvenio}` : '');
            setAmount(String(Math.min(next ? Number(next.saldo) : nextAgreement ? agreementBalance(nextAgreement) : 0, Number(invoice.saldo)))); setError('');
          }}>{payableAgreements.flatMap(agreement => [<option key={`agreement-${agreement.idConvenio}`} value={`agreement-${agreement.idConvenio}`}>Convenio {agreement.idConvenio} completo</option>, ...agreement.cuotas.filter(item => item.saldo !== null && Number(item.saldo) > 0).map(item => <option key={item.idCuota} value={String(item.idCuota)}>Cuota {item.numero} — {dateLabel(item.fechaVencimiento)}</option>)])}</select></label>}
          <dl className="control-payment-summary"><div><dt>Saldo {quota ? 'de la cuota' : agreementTarget ? 'del convenio' : 'de la factura'}</dt><dd>{currency.format(payableBalance)}</dd></div><div><dt>Vencimiento</dt><dd>{dateLabel(quota?.fechaVencimiento ?? invoice.fechaVencimientoEfectiva)}</dd></div></dl>
          {invoice.aceptaPagos && canManage ? <>
            <label>Monto a registrar<input type="number" inputMode="decimal" min="0.01" max={Math.min(payableBalance, Number(invoice.saldo))} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)}/></label>
            <div className="control-form-grid"><label>Medio de pago<select value={method} onChange={event => setMethod(event.target.value)}>{['Transferencia', 'Efectivo', 'Tarjeta', 'Otro'].map(value => <option key={value}>{value}</option>)}</select></label><label>Referencia <small>Opcional</small><input maxLength={100} value={reference} onChange={event => setReference(event.target.value)} placeholder="Código de la transacción"/></label></div>
          </> : <p role="status" className="control-muted">Esta factura no admite pagos.</p>}
        </>}
      </fieldset>
      {error && <p role="alert" className="control-feedback error">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" disabled={saving || loading || !invoice?.aceptaPagos || !canManage || !amount || Number(amount) <= 0 || Number(amount) > Number(invoice.saldo) || Number(amount) > payableBalance}>{saving ? 'Registrando…' : 'Registrar pago'}</button></footer>
    </form>
  </ControlBookModal>;
}
