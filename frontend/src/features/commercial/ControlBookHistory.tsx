import { useEffect, useState } from 'react';
import { ChevronDown, FileText, RefreshCw } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';
import { ControlRow, currency, dateLabel, readable } from './control-book-model';
import type { ControlBookRecordView } from './ControlBookDrawer';
import { InstallmentAllocationsPanel } from './InstallmentAllocationsPanel';

type HistoryInvoice = {
  idFactura: number; idContrato: number; plan: string | null; periodoMes: number; periodoAnio: number;
  tipoDocumento: string | null; folio: string | null; contexto: string | null; fechaEmision: string | null; fechaVencimiento: string;
  fechaVencimientoEfectiva: string; monto: number | null; pagado: number; saldo: number | null; estado: string;
  pagos: Array<{ idPago: number; monto: number; fecha: string; medio: string; referencia: string | null }>;
};
type Movement = {
  key: string; tipo: string; fecha: string; fechaRegistro: string; detalle: string | null; estado: string | null;
  responsable: string | null; idContrato: number | null; idFactura: number | null; contexto: string | null; canal?: string; monto?: number;
  fechaOriginal?: string; nuevaFecha?: string; valorAnterior?: string; valorNuevo?: string;
  fechaAprobacion?: string | null; aprobador?: string | null;
  cuotas?: Array<{ numero: number; monto: number; fechaVencimiento: string; estado: string; fechaPago: string | null }>;
};
type History = { idCliente: number; invoices: HistoryInvoice[]; movements: Movement[] };
const titles: Record<string, string> = {
  CONTACTO_CLIENTE: 'Contacto con el cliente', ULTIMO_AVISO_CORTE: 'Último aviso antes del corte',
  AVISO_PREVIO_RETIRO: 'Aviso de retiro', AVISO_PREVENTIVO: 'Aviso preventivo', OTRO_EVENTO_COMERCIAL: 'Gestión comercial',
  CONVENIO: 'Convenio de pago', PRORROGA: 'Prórroga', DIA_PAGO: 'Cambio del día de pago mensual', FECHA_COMPROMETIDA: 'Cambio de fecha comprometida',
};
const money = (value: number | null) => value === null ? '—' : currency.format(value);
const period = (invoice: HistoryInvoice) => new Date(invoice.periodoAnio, invoice.periodoMes - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
const documentLabel = (invoice: HistoryInvoice) => (invoice.tipoDocumento ? readable(invoice.tipoDocumento) : 'Factura') + (invoice.folio ? ' · ' + invoice.folio : '');
const documentStatus = (state: string) => 'control-status ' + (state === 'Vencida' ? 'status-deuda_vencida' : state === 'Pagada' ? 'status-al_dia' : state === 'Pendiente' || state === 'Parcial' ? 'status-saldo_pendiente' : '');

export function ControlBookHistory({ row, revision, view, onOpenInvoice }: {
  row: ControlRow; revision: number; view: ControlBookRecordView;
  onOpenInvoice?: (invoice: Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'>) => void;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(row.idFactura);
  const [expandedMovement, setExpandedMovement] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.get<History>(`/commercial/control-book/customers/${row.idCliente}/history`, { params: { idEmpresa: row.idEmpresa }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setHistory(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setHistory(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row.idCliente, row.idEmpresa, revision, reload]);

  const invoices = history?.invoices ?? [];
  const movements = history?.movements ?? [];
  const selectedInvoice = invoices.find(invoice => invoice.idFactura === selectedInvoiceId) ?? invoices[0];
  const portfolioInvoice = selectedInvoice?.idFactura === row.idFactura;
  const title = view === 'activity' ? 'Contactos y acuerdos' : 'Facturas y pagos';
  return <section className="control-history" aria-label={title} aria-busy={loading} hidden={view !== 'invoices' && view !== 'activity'}>
    <header><h3>{title}</h3><button type="button" className="control-text-button" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} aria-hidden="true"/>Actualizar historial</button></header>
    {loading && <p role="status">Cargando historial…</p>}
    {error && <p role="alert" className="control-feedback error">{error}</p>}
    {history && <>
      <div hidden={view !== 'invoices'} className="control-record-layout">
      {invoices.length === 0 ? <p className="control-muted">Sin facturas.</p> : <>
        <div className="control-history-table"><table><caption className="control-sr-only">Facturas y pagos por mes</caption><thead><tr><th scope="col">Mes / documento</th><th scope="col">Servicio / contrato</th><th scope="col">Monto</th><th scope="col">Pagado</th><th scope="col">Pendiente</th><th scope="col">Estado / vencimiento</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.idFactura} className={invoice.idFactura === selectedInvoice?.idFactura ? 'control-history-selected' : undefined}>
          <th scope="row"><button type="button" className="control-invoice-select" aria-pressed={invoice.idFactura === selectedInvoice?.idFactura} onClick={() => setSelectedInvoiceId(invoice.idFactura)}><strong>{period(invoice)}</strong><small>{documentLabel(invoice)}</small></button></th>
          <td>{invoice.contexto || invoice.plan || '—'}</td><td>{money(invoice.monto)}</td><td>{money(invoice.pagado)}</td><td>{money(invoice.saldo)}</td><td><span className={documentStatus(invoice.estado)}>{invoice.estado}</span><small>{dateLabel(invoice.fechaVencimientoEfectiva)}</small></td>
        </tr>)}</tbody></table></div>
        {selectedInvoice && <section className="control-invoice-detail" aria-label="Detalle de la factura seleccionada">
          <header>
            <div><h4>{period(selectedInvoice)}</h4><p>{documentLabel(selectedInvoice)}</p></div>
            <span className={documentStatus(selectedInvoice.estado)}>{selectedInvoice.estado}</span>
            {onOpenInvoice && <button type="button" className="control-outline" onClick={() => onOpenInvoice({ idFactura: selectedInvoice.idFactura, idCliente: row.idCliente, idEmpresa: row.idEmpresa })}><FileText size={16} aria-hidden="true"/>Ver factura / pagos</button>}
          </header>
          <dl>{[
            ['Facturado', money(selectedInvoice.monto)], ['Pagado', money(selectedInvoice.pagado)], ['Saldo pendiente', money(selectedInvoice.saldo)],
            ['Emisión', dateLabel(selectedInvoice.fechaEmision)], ['Vencimiento original', dateLabel(selectedInvoice.fechaVencimiento)],
            ['Vencimiento vigente', dateLabel(selectedInvoice.fechaVencimientoEfectiva)],
            ...(portfolioInvoice && row.diasAtraso !== null ? [['Días de atraso', row.diasAtraso]] : []),
            ...(portfolioInvoice && Number(row.saldoFavor) > 0 ? [['Saldo a favor', money(row.saldoFavor)]] : []),
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {selectedInvoice.pagos.length > 0 && <details><summary>Ver pagos ({selectedInvoice.pagos.length})</summary>{selectedInvoice.pagos.map(p => <p key={p.idPago}><strong>{money(p.monto)}</strong> · {dateLabel(p.fecha)} · {p.medio}{p.referencia && ' · ' + p.referencia}</p>)}</details>}
        </section>}
      </>}
      </div>
      <div hidden={view !== 'activity'}>
      {movements.length === 0 ? <p className="control-muted">Sin gestiones registradas.</p> : <div className="control-history-table">
        <table>
          <caption className="control-sr-only">Contactos, avisos y acuerdos del cliente</caption>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Gestión</th><th scope="col">Responsable</th><th scope="col">Estado</th></tr></thead>
          {movements.map(movement => {
        const invoice = history.invoices.find(item => item.idFactura === movement.idFactura);
        const expanded = expandedMovement === movement.key;
        return <tbody key={movement.key}>
          <tr>
            <td><time dateTime={movement.fecha}>{dateLabel(movement.fecha)}</time></td>
            <th scope="row"><button type="button" className="control-movement-toggle" aria-expanded={expanded} onClick={() => setExpandedMovement(expanded ? null : movement.key)}>{titles[movement.tipo] ?? readable(movement.tipo)}<ChevronDown size={15} aria-hidden="true"/></button></th>
            <td>{movement.responsable ?? '—'}</td><td>{readable(movement.estado)}</td>
          </tr>
          <tr hidden={!expanded}><td colSpan={4}>
          <p className="control-muted">{[movement.canal && readable(movement.canal), invoice && period(invoice), movement.contexto].filter(Boolean).join(' · ')}</p>
          {movement.fechaRegistro.slice(0, 10) !== movement.fecha.slice(0, 10) && <p className="control-muted">Registrado el {dateLabel(movement.fechaRegistro)}</p>}
          {movement.monto !== undefined && <p><strong>{money(movement.monto)}</strong></p>}
          {movement.fechaOriginal && <p>Vencimiento original: {dateLabel(movement.fechaOriginal)} → nueva fecha: {dateLabel(movement.nuevaFecha)}</p>}
          {movement.valorNuevo && <p>{movement.tipo === 'DIA_PAGO' ? `Día mensual: ${movement.valorAnterior} → ${movement.valorNuevo}` : `${dateLabel(movement.valorAnterior)} → ${dateLabel(movement.valorNuevo)}`}</p>}
          {movement.detalle && <p>{movement.detalle}</p>}
          {movement.fechaAprobacion && <p className="control-muted">Aprobado el {dateLabel(movement.fechaAprobacion)}{movement.aprobador && ' por ' + movement.aprobador}</p>}
          {movement.cuotas && <details><summary>Ver cuotas ({movement.cuotas.length})</summary>{movement.cuotas.map(q => <p key={q.numero}>Cuota {q.numero}: {money(q.monto)} · vence {dateLabel(q.fechaVencimiento)} · {readable(q.estado)}{q.fechaPago && ' · pagada el ' + dateLabel(q.fechaPago)}</p>)}</details>}
          {movement.tipo === 'CONVENIO' && row.idEmpresa !== null && row.idEmpresa > 0 && /^agreement-[1-9]\d*$/.test(movement.key) && <InstallmentAllocationsPanel key={`${row.idEmpresa}:${movement.key}`} idConvenio={Number(movement.key.slice('agreement-'.length))} idEmpresa={row.idEmpresa} onChanged={() => setReload(value => value + 1)} />}
          </td></tr>
        </tbody>;
      })}</table></div>}
      </div>
    </>}
  </section>;
}
