import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
import { ControlRow, currency, dateLabel, readable } from './control-book-model';

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

export function ControlBookHistory({ row, revision, onOpenInvoice }: { row: ControlRow; revision: number; onOpenInvoice?: (invoice: Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'>) => void }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.get<History>(`/commercial/control-book/customers/${row.idCliente}/history`, { params: { idEmpresa: row.idEmpresa }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setHistory(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setHistory(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row.idCliente, row.idEmpresa, revision, reload]);

  return <section className="control-history" aria-label="Historial del cliente" aria-busy={loading}>
    <header><h3>Historial del cliente</h3><button type="button" className="control-text-button" disabled={loading} onClick={() => setReload(value => value + 1)}>Actualizar historial</button></header>
    {loading && <p role="status">Cargando historial…</p>}
    {error && <p role="alert" className="control-feedback error">{error}</p>}
    {history && <>
      <details className="control-history-section" open>
      <summary>Facturas y pagos por mes <span>{history.invoices.length}</span></summary>
      {history.invoices.length === 0 ? <p className="control-muted">Sin facturas.</p> : <>
        <div className="control-history-table"><table><caption className="control-sr-only">Facturas y pagos por mes</caption><thead><tr><th scope="col">Mes / documento</th><th scope="col">Monto</th><th scope="col">Pagado</th><th scope="col">Pendiente</th><th scope="col">Estado / vencimiento</th></tr></thead><tbody>{history.invoices.map(invoice => <tr key={invoice.idFactura} className={invoice.idFactura === row.idFactura ? 'control-history-selected' : undefined}>
          <th scope="row"><strong>{period(invoice)}</strong><small>{documentLabel(invoice)}</small><small>{invoice.contexto || invoice.plan || 'Sin plan'}</small>{invoice.idFactura === row.idFactura && <small>Documento seleccionado</small>}
            {invoice.pagos.length > 0 && <details><summary>Ver pagos ({invoice.pagos.length})</summary><p>Emisión: {dateLabel(invoice.fechaEmision)} · Vencimiento original: {dateLabel(invoice.fechaVencimiento)}</p>{invoice.pagos.map(p => <p key={p.idPago}><strong>{money(p.monto)}</strong> · {dateLabel(p.fecha)} · {p.medio}{p.referencia && ' · ' + p.referencia}</p>)}</details>}
          </th><td>{money(invoice.monto)}</td><td>{money(invoice.pagado)}</td><td>{money(invoice.saldo)}</td><td><span className={'control-status ' + (invoice.estado === 'Vencida' ? 'status-deuda_vencida' : invoice.estado === 'Pagada' ? 'status-al_dia' : invoice.estado === 'Pendiente' || invoice.estado === 'Parcial' ? 'status-saldo_pendiente' : '')}>{invoice.estado}</span><small>{dateLabel(invoice.fechaVencimientoEfectiva)}</small>{onOpenInvoice && <button type="button" className="control-text-button" onClick={() => onOpenInvoice({ idFactura: invoice.idFactura, idCliente: row.idCliente, idEmpresa: row.idEmpresa })}>Ver factura / pagos</button>}</td>
        </tr>)}</tbody></table></div>
      </>}
      </details>
      <details className="control-history-section">
      <summary>Contactos, avisos y acuerdos <span>{history.movements.length}</span></summary>
      {history.movements.length === 0 ? <p className="control-muted">Sin gestiones registradas.</p> : <ol className="control-history-timeline">{history.movements.map(movement => {
        const invoice = history.invoices.find(item => item.idFactura === movement.idFactura);
        return <li key={movement.key}>
          <div className="control-history-entry-title"><strong>{titles[movement.tipo] ?? readable(movement.tipo)}</strong><time dateTime={movement.fecha}>{dateLabel(movement.fecha)}</time></div>
          <p className="control-muted">{[movement.responsable, movement.canal && readable(movement.canal), movement.estado && readable(movement.estado), invoice && period(invoice), movement.contexto].filter(Boolean).join(' · ')}</p>
          {movement.fechaRegistro.slice(0, 10) !== movement.fecha.slice(0, 10) && <p className="control-muted">Registrado el {dateLabel(movement.fechaRegistro)}</p>}
          {movement.monto !== undefined && <p><strong>{money(movement.monto)}</strong></p>}
          {movement.fechaOriginal && <p>Vencimiento original: {dateLabel(movement.fechaOriginal)} → nueva fecha: {dateLabel(movement.nuevaFecha)}</p>}
          {movement.valorNuevo && <p>{movement.tipo === 'DIA_PAGO' ? `Día mensual: ${movement.valorAnterior} → ${movement.valorNuevo}` : `${dateLabel(movement.valorAnterior)} → ${dateLabel(movement.valorNuevo)}`}</p>}
          {movement.detalle && <p>{movement.detalle}</p>}
          {movement.fechaAprobacion && <p className="control-muted">Aprobado el {dateLabel(movement.fechaAprobacion)}{movement.aprobador && ' por ' + movement.aprobador}</p>}
          {movement.cuotas && <details><summary>Ver cuotas ({movement.cuotas.length})</summary>{movement.cuotas.map(q => <p key={q.numero}>Cuota {q.numero}: {money(q.monto)} · vence {dateLabel(q.fechaVencimiento)} · {readable(q.estado)}{q.fechaPago && ' · pagada el ' + dateLabel(q.fechaPago)}</p>)}</details>}
        </li>;
      })}</ol>}
      </details>
    </>}
  </section>;
}
