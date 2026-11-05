import { useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type BillingOverview, type Customer } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { formatDateTime } from '../../lib';
import { BillingInvoicesPanel } from '../billing/BillingInvoicesPanel';
import { ExternalTaxDocumentsPanel } from '../billing/ExternalTaxDocumentsPanel';
import { ControlRow } from './control-book-model';

type InvoiceFocus = Pick<ControlRow, 'idFactura' | 'idCliente' | 'idEmpresa'>;

export function ControlBookFinancePanel({ row, scope, customers, permissions, revision, onChanged, focusedInvoice, onFocusConsumed }: {
  row: ControlRow; scope: string; customers: Customer[]; permissions: DashboardPermissions; revision: number; onChanged: () => void;
  focusedInvoice: InvoiceFocus | null; onFocusConsumed: () => void;
}) {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [taxOpen, setTaxOpen] = useState(false);
  const pending = useRef(false);
  const notificationKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void api.get<BillingOverview>('/billing/overview', { params: { scope }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setOverview(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setOverview(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, revision]);

  async function run(operation: () => Promise<unknown>, notice: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setStatus(''); setError('');
    try {
      const result = await operation();
      setStatus(notice || (typeof result === 'string' ? 'Aviso: ' + result : 'Operación registrada.'));
      onChanged();
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function notify(tipo: 'Preventiva' | 'Ultimo aviso') {
    const key = `${row.idFactura}:${tipo}`;
    const correlationId = notificationKeys.current.get(key) ?? crypto.randomUUID();
    notificationKeys.current.set(key, correlationId);
    const { data } = await api.post('/billing/notifications', { idCliente: row.idCliente, idFactura: row.idFactura, tipo, correlationId });
    notificationKeys.current.delete(key);
    return String(data.estadoEnvio);
  }

  const invoice = overview?.morosos.find(i => i.idFactura === row.idFactura && i.cliente.idCliente === row.idCliente);
  const scheduled = overview?.cortesProgramados.some(i => i.idFactura === row.idFactura && i.idContrato === row.idContrato && i.cliente.idCliente === row.idCliente);
  const simulated = overview?.modoNotificacion === 'mock';
  const noticesDisabled = loading || overview?.modoNotificacion === 'disabled';
  const notifications = overview?.notificaciones.filter(n => n.idCliente === row.idCliente) ?? [];

  return <section className="control-finance" aria-label="Pagos y avisos del cliente">
    {error && <p className="control-feedback error" role="alert">{error}</p>}
    {status && <p className="control-feedback" role="status">{status}</p>}
    {permissions.manageBilling && invoice && <div className="control-invoice-actions" role="group" aria-label="Acciones de la factura seleccionada">
      <button type="button" className="control-outline" disabled={busy || noticesDisabled} onClick={() => void run(() => notify('Preventiva'), '')}>{simulated ? 'Simular aviso preventivo' : 'Enviar aviso preventivo'}</button>
      {scheduled && <>
        <button type="button" className="control-outline" disabled={busy || noticesDisabled} onClick={() => void run(() => notify('Ultimo aviso'), '')}>{simulated ? 'Simular último aviso' : 'Enviar último aviso'}</button>
        <button type="button" className="control-outline" disabled={busy} onClick={() => void run(() => api.patch(`/billing/contracts/${row.idContrato}/suspend`), 'Servicio suspendido por no pago.')}>Suspender por no pago</button>
      </>}
    </div>}
    <BillingInvoicesPanel scope={scope} permissions={permissions} revision={revision} onChanged={onChanged} focusedInvoice={focusedInvoice} onFocusConsumed={onFocusConsumed} showList={false}/>
    {notifications.length > 0 && <details className="control-history-section">
      <summary>Avisos enviados al cliente <span>{notifications.length}</span></summary>
      <ol className="control-history-timeline">{notifications.map(n => <li key={n.idNotificacion}><div className="control-history-entry-title"><strong>{n.canal}</strong><time>{formatDateTime(n.fechaEnvio)}</time></div><p>{n.estadoEnvio === 'SIMULADO' ? 'Simulado; no se envió al cliente' : n.estadoEnvio}</p></li>)}</ol>
    </details>}
    {permissions.viewExternalTaxDocuments && <details className="control-history-section" onToggle={event => setTaxOpen(event.currentTarget.open)}>
      <summary>Documentos tributarios del cliente</summary>
      {taxOpen && <ExternalTaxDocumentsPanel key={scope + '-' + row.idCliente} customers={customers} scope={scope} writeCompanyId={Number(scope)} canManage={permissions.manageExternalTaxDocuments} fixedCustomerId={row.idCliente}/>}
    </details>}
  </section>;
}
