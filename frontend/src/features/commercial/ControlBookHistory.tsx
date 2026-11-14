import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useAutoRefresh } from '../../shared/hooks/useAutoRefresh';
import { api, apiErrorMessage, type Customer } from '../../api';
import { ControlRow, type InvoiceFocus, currency, dateLabel, readable } from './control-book-model';
import type { ControlBookRecordView } from './ControlBookDrawer';
import { contactDateLabel, contactTimeLabel } from './control-book-contact-time';
import { type InstallmentDetail } from './control-book-installments';

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

function AgreementInstallmentRows({ movement, invoice, row, contract, active, revision, onOpenInvoice }: { movement: Movement; invoice: HistoryInvoice; row: ControlRow; contract: string; active: boolean; revision: number; onOpenInvoice?: (invoice: InvoiceFocus) => void }) {
  const [quotas, setQuotas] = useState<InstallmentDetail['cuotas'] | null>(null);
  const columns = onOpenInvoice ? 10 : 9;
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active || !/^agreement-[1-9]\d*$/.test(movement.key)) return;
    const controller = new AbortController(); setQuotas(null); setError('');
    void api.get(`/commercial/agreements/${movement.key.slice(10)}/allocations`, { signal: controller.signal }).then(({data}) => {
      if (controller.signal.aborted) return;
      if (data.idEmpresa !== row.idEmpresa || data.idFactura !== invoice.idFactura || data.idConvenio !== Number(movement.key.slice(10))) throw new Error('Las cuotas no corresponden al documento.');
      setQuotas(data.cuotas);
    }).catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); });
    return () => controller.abort();
  }, [movement.key, invoice.idFactura, row.idEmpresa, active, revision]);
  return <>
    <tr className="control-agreement-caption"><th colSpan={columns}>Convenio #{movement.key.slice(10)}</th></tr>
    {error && <tr><td colSpan={columns} role="alert">{error}</td></tr>}
    {(movement.cuotas ?? []).map(quota => {
      const actual = quotas?.find(item => item.numero === quota.numero);
      return <tr key={quota.numero} className="control-agreement-quota"><th scope="row">Cuota {quota.numero} de {movement.cuotas!.length}</th><td>{invoice.folio ?? `#${invoice.idFactura}`}</td><td>{invoice.plan ?? '—'}</td><td>{contract}</td>
        <td className="control-money-cell">{money(quota.monto)}</td><td className="control-money-cell">{actual ? money(Number(actual.imputado)) : '—'}</td><td className="control-money-cell">{actual ? money(actual.saldo === null ? null : Number(actual.saldo)) : '—'}</td><td>{actual ? readable(actual.estado) : readable(quota.estado)}</td><td>{dateLabel(quota.fechaVencimiento)}</td>{onOpenInvoice && <td className="control-invoice-action-cell"><button type="button" className="control-invoice-open" disabled={!actual?.idCuota || actual.estado !== 'PAGADA' || actual.saldo === null || Number(actual.saldo) !== 0} title={actual?.estado === 'PAGADA' ? 'Ver documento de la cuota' : 'Disponible al pagar la cuota'} aria-label={`Documento tributario de cuota ${quota.numero}`} onClick={() => {
          if (actual?.idCuota && actual.estado === 'PAGADA' && actual.saldo !== null && Number(actual.saldo) === 0) onOpenInvoice({ idFactura: invoice.idFactura, idCliente: row.idCliente, idEmpresa: row.idEmpresa, idConvenio: Number(movement.key.slice(10)), idCuota: actual.idCuota });
        }}><FileText size={17} aria-hidden="true"/></button></td>}</tr>;
    })}
  </>;
}

export function ControlBookHistory({ row, contracts = [], revision, view, onOpenInvoice, paused = false }: {
  row: ControlRow; revision: number; view: ControlBookRecordView;
  contracts?: NonNullable<Customer['contratos']>;
  onOpenInvoice?: (invoice: InvoiceFocus) => void;
  paused?: boolean;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useAutoRefresh(() => { if (!loading) setReload(value => value + 1); }, !paused && (view === 'activity' || view === 'invoices'));
  const [expandedMovement, setExpandedMovement] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api.get<History>(`/commercial/control-book/customers/${row.idCliente}/history`, { params: { idEmpresa: row.idEmpresa }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setHistory(data); })
      .catch(err => { if (!controller.signal.aborted) { setError(apiErrorMessage(err)); setHistory(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row.idCliente, row.idEmpresa, revision, reload, view]);

  const invoices = history?.invoices ?? [];
  const movements = history?.movements ?? [];
  const contractLabel = (id: number) => contracts.find(contract => contract.idContrato === id)?.numeroContratoExterno
    ?? (id === row.idContrato ? row.numeroContrato : null) ?? `#${id}`;
  const title = view === 'activity' ? 'Contactos y acuerdos' : 'Facturas y pagos';
  return <section className="control-history" aria-label={title} aria-busy={loading} hidden={view !== 'invoices' && view !== 'activity'}>
    <header><h3>{title}</h3></header>
    {loading && <p role="status">Cargando historial…</p>}
    {error && <p role="alert" className="control-feedback error">{error}</p>}
    {history && <>
      <div hidden={view !== 'invoices'} className="control-record-layout">
      {invoices.length === 0 ? <p className="empty-state">Sin facturas.</p> : <>
        <div className="control-history-table control-invoice-table" role="region" aria-label="Facturas del cliente" tabIndex={0}><table><caption className="control-sr-only">Facturas y pagos por mes</caption><thead><tr>
          {['Mes', 'Documento', 'Servicio', 'Contrato', 'Monto', 'Pagado', 'Pendiente', 'Estado', 'Vencimiento'].map(label => <th key={label} scope="col" className={['Monto', 'Pagado', 'Pendiente'].includes(label) ? 'control-money-cell' : undefined}>{label}</th>)}
          {onOpenInvoice && <th scope="col" className="control-invoice-action-cell"><span className="control-sr-only">Documento tributario</span></th>}
        </tr></thead><tbody>{invoices.map(invoice => {
          const agreements = movements.filter(item => item.tipo === 'CONVENIO' && item.idFactura === invoice.idFactura && item.cuotas?.length);
          const expanded = expandedInvoice === invoice.idFactura;
          const toggle = () => setExpandedInvoice(expanded ? null : invoice.idFactura);
          return <Fragment key={invoice.idFactura}><tr className={agreements.length ? 'control-invoice-parent' : undefined} onClick={agreements.length ? toggle : undefined}>
          <th scope="row">{agreements.length ? <button type="button" className="control-movement-toggle" aria-expanded={expanded} onClick={event => {event.stopPropagation(); toggle();}}>{period(invoice)}<ChevronDown size={15} aria-hidden="true"/></button> : period(invoice)}</th><td>{documentLabel(invoice)}</td>
          <td>{invoice.plan ?? '—'}</td><td>{contractLabel(invoice.idContrato)}</td>
          <td className="control-money-cell">{money(invoice.monto)}</td><td className="control-money-cell">{money(invoice.pagado)}</td><td className="control-money-cell"><strong>{money(invoice.saldo)}</strong></td>
          <td><span className={documentStatus(invoice.estado)}>{invoice.estado}</span>{agreements.length > 0 && <small>En cuotas</small>}</td><td>{dateLabel(invoice.fechaVencimientoEfectiva)}</td>
          {onOpenInvoice && <td className="control-invoice-action-cell"><button type="button" className="control-invoice-open" disabled={invoice.estado !== 'Pagada' || invoice.saldo === null || Number(invoice.saldo) > 0} title={invoice.estado === 'Pagada' ? 'Ver documento tributario' : 'Disponible al completar el pago'} aria-label={`Documento tributario: ${invoice.folio ?? '#' + invoice.idFactura}`} onClick={event => {event.stopPropagation(); if (invoice.estado === 'Pagada' && invoice.saldo !== null && Number(invoice.saldo) <= 0) onOpenInvoice({ idFactura: invoice.idFactura, idCliente: row.idCliente, idEmpresa: row.idEmpresa });}}><FileText size={17} aria-hidden="true"/></button></td>}
        </tr>{expanded && agreements.map(movement => <AgreementInstallmentRows key={movement.key} movement={movement} invoice={invoice} row={row} contract={contractLabel(invoice.idContrato)} active={view === 'invoices'} revision={revision + reload} onOpenInvoice={onOpenInvoice}/>)}</Fragment>;
        })}</tbody></table></div>
      </>}
      </div>
      <div hidden={view !== 'activity'}>
      {movements.length === 0 ? <p className="empty-state">Sin gestiones registradas.</p> : <div className="control-history-table">
        <table>
          <caption className="control-sr-only">Contactos, avisos y acuerdos del cliente</caption>
          <thead><tr>{['Fecha', 'Hora', 'Gestión', 'Canal', 'Responsable', 'Estado'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          {movements.map(movement => {
        const invoice = history.invoices.find(item => item.idFactura === movement.idFactura);
        const expanded = expandedMovement === movement.key;
        return <tbody key={movement.key}>
          <tr>
            <td><time dateTime={movement.fecha}>{contactDateLabel(movement.fecha)}</time></td><td>{contactTimeLabel(movement.fecha)}</td>
            <th scope="row"><button type="button" className="control-movement-toggle" aria-expanded={expanded} onClick={() => setExpandedMovement(expanded ? null : movement.key)}>{titles[movement.tipo] ?? readable(movement.tipo)}<ChevronDown size={15} aria-hidden="true"/></button></th>
            <td>{movement.canal === 'EMAIL' ? 'Correo' : movement.canal === 'TELEFONO' ? 'Teléfono' : movement.canal === 'WHATSAPP' ? 'WhatsApp' : readable(movement.canal)}</td><td>{movement.responsable ?? '—'}</td><td>{readable(movement.estado)}</td>
          </tr>
          <tr hidden={!expanded}><td colSpan={6} className="control-movement-detail">
          <dl className="control-movement-context">
            <div><dt>Contrato</dt><dd>{movement.idContrato ? contractLabel(movement.idContrato) : '—'}</dd></div>
            <div><dt>Documento</dt><dd>{invoice ? documentLabel(invoice) : '—'}</dd></div>
            <div><dt>Registro</dt><dd>{contactDateLabel(movement.fechaRegistro)} · {contactTimeLabel(movement.fechaRegistro)}</dd></div>
          </dl>
          {movement.monto !== undefined && <p><strong>{money(movement.monto)}</strong></p>}
          {movement.fechaOriginal && <p>Vencimiento original: {dateLabel(movement.fechaOriginal)} → nueva fecha: {dateLabel(movement.nuevaFecha)}</p>}
          {movement.valorNuevo && <p>{movement.tipo === 'DIA_PAGO' ? `Día mensual: ${movement.valorAnterior} → ${movement.valorNuevo}` : `${dateLabel(movement.valorAnterior)} → ${dateLabel(movement.valorNuevo)}`}</p>}
          {movement.detalle && <p className="control-movement-observation">{movement.detalle}</p>}
          {movement.fechaAprobacion && <p className="control-muted">Aprobado el {dateLabel(movement.fechaAprobacion)}{movement.aprobador && ' por ' + movement.aprobador}</p>}
          {movement.cuotas && <p>{movement.cuotas.length} cuotas · {readable(movement.estado)}</p>}
          </td></tr>
        </tbody>;
      })}</table></div>}
      </div>
    </>}
  </section>;
}
