import { useEffect, useState } from 'react';
import { FileClock, FileText, Download } from 'lucide-react';
import { api, apiErrorMessage, type BillingInvoiceDetail } from '../../api';
import { ControlBookModal } from './ControlBookModal';
import { type InvoiceFocus, currency, dateLabel } from './control-book-model';
import { type InstallmentDetail, installmentPaymentIds } from './control-book-installments';

type Document = { intention: { estado: string; folio: string | null; artefactoEstado: string; artefactoUrl: string | null } | null };
function PaymentDocument({ id }: { id: number }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.get<Document>(`/tax-documents/payments/${id}`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setDocument(data); })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  const doc = document?.intention;
  const link = doc?.estado === 'GENERADO' && doc.artefactoEstado === 'DISPONIBLE' && doc.artefactoUrl && /^https:\/\/www\.facturacion\.cl\/(sistema|plano)\/descargar\.php\?/.test(doc.artefactoUrl) ? doc.artefactoUrl : null;
  return <div className="control-tax-document-file">
    {link ? <><FileText size={22} aria-hidden="true"/><div><strong>Documento tributario</strong><p>Folio {doc?.folio ?? '—'}</p></div><a href={link} target="_blank" rel="noreferrer"><Download size={17} aria-hidden="true"/>Abrir documento</a></> : <><FileClock size={24} aria-hidden="true"/><div><strong>{loading ? 'Consultando documento…' : 'Documento tributario pendiente'}</strong><p>{error || 'Se mostrará aquí cuando esté disponible.'}</p></div></>}
  </div>;
}

export function ControlBookTaxDocument({ invoice: focus, scope, onClose }: {
  invoice: InvoiceFocus; scope: string; onClose: () => void;
}) {
  const [invoice, setInvoice] = useState<BillingInvoiceDetail | null>(null);
  const [quota, setQuota] = useState<InstallmentDetail['cuotas'][number] | null>(null);
  const [paymentIds, setPaymentIds] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!focus.idFactura || String(focus.idEmpresa) !== scope) throw new Error('El documento no pertenece a la empresa seleccionada.');
      const { data } = await api.get<BillingInvoiceDetail>(`/billing/invoices/${focus.idFactura}`, { params: { scope }, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (data.idFactura !== focus.idFactura || data.contrato?.cliente?.idCliente !== focus.idCliente || data.contrato.idEmpresa !== focus.idEmpresa) throw new Error('El documento no corresponde al cliente seleccionado.');
      if (focus.idCuota) {
        if (!focus.idConvenio) throw new Error('No se pudo identificar el convenio de la cuota.');
        const { data: detail } = await api.get<InstallmentDetail>(`/commercial/agreements/${focus.idConvenio}/allocations`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (detail.idConvenio !== focus.idConvenio || detail.idFactura !== focus.idFactura || detail.idEmpresa !== focus.idEmpresa) throw new Error('La cuota no corresponde al documento seleccionado.');
        const selectedQuota = detail.cuotas.find(item => item.idCuota === focus.idCuota);
        if (!selectedQuota || selectedQuota.estado !== 'PAGADA' || selectedQuota.saldo === null || Number(selectedQuota.saldo) !== 0) throw new Error('El documento estará disponible cuando la cuota esté pagada.');
        setQuota(selectedQuota); setPaymentIds(installmentPaymentIds(detail, selectedQuota.idCuota));
      } else if (data.estadoCalculado !== 'Pagada' || data.saldo === null || Number(data.saldo) > 0) throw new Error('El documento estará disponible cuando la factura esté pagada.');
      setInvoice(data);
    })().catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [focus.idFactura, focus.idCliente, focus.idEmpresa, focus.idConvenio, focus.idCuota, scope]);
  const payments = invoice?.pagos.filter(payment => paymentIds === null || paymentIds.includes(payment.idPago)) ?? [];
  return <ControlBookModal title="Documento tributario" onClose={onClose}>
    {loading && <p role="status">Consultando documento…</p>}
    {error && <p role="alert" className="control-feedback error">{error}</p>}
    {invoice && <>
      <div className="control-modal-customer"><strong>{invoice.contrato?.cliente?.nombreCompleto}</strong><span>{quota ? `Cuota ${quota.numero} — Convenio ${focus.idConvenio}` : `Pagada el ${dateLabel(payments.at(-1)?.fechaPago)}`} — {currency.format(Number(quota?.imputado ?? invoice.pagado))}</span></div>
      {payments.length ? payments.map(payment => <PaymentDocument key={payment.idPago} id={payment.idPago}/>) : <div className="control-tax-document-file"><FileClock size={24} aria-hidden="true"/><div><strong>Documento tributario pendiente</strong><p>Se mostrará aquí cuando esté disponible.</p></div></div>}
    </>}
    <footer className="control-form-footer"><button type="button" className="control-outline" onClick={onClose}>Cerrar</button></footer>
  </ControlBookModal>;
}
