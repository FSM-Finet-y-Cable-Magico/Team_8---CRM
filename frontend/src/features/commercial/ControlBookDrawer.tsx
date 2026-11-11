import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, CalendarDays, Handshake, IdCard, Package, Phone, Wallet } from 'lucide-react';
import { api, apiErrorMessage, type Customer, type CustomerService } from '../../api';
import { CustomerStatusBadge } from '../customers/CustomerStatusBadge';
import { ControlBookCustomerContracts } from './ControlBookCustomerContracts';
import { ControlBookHistory } from './ControlBookHistory';
import { ControlBookModal } from './ControlBookModal';
import { ACTION_LABELS, ActionName, ControlRow, CONTROL_ACTIONS, actionDisabledReason, buildInstallments, currency, dateLabel, managementRelations, today } from './control-book-model';

function DetailList({ values }: { values: Array<[string, string | number | null | undefined]> }) {
  return <dl className="control-detail-list">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

const ACTION_ICONS = { event: Phone, lastNotice: Bell, withdrawal: Package, agreement: Handshake, extension: CalendarClock, paymentDay: CalendarDays, charge: Wallet };
const SAVE_LABELS: Record<ActionName, string> = { event: 'Guardar contacto', lastNotice: 'Guardar último aviso', withdrawal: 'Guardar aviso de retiro', agreement: 'Crear convenio', extension: 'Guardar prórroga', paymentDay: 'Guardar día de pago', charge: 'Guardar cargo' };

export type ControlBookRecordView = 'profile' | 'invoices' | 'activity' | 'documents';

export function ControlBookDrawer({ row, customer, companyName, revision, canManage, canViewBilling, canViewDocuments, onClose, onSaved, onBusyChange, onOpenBilling, financialTools, feedback }: {
  row: ControlRow; canManage: boolean; onClose: () => void; onSaved: (message: string) => void;
  customer?: Customer; companyName?: string;
  revision: number;
  canViewBilling: boolean; canViewDocuments: boolean;
  onBusyChange: (busy: boolean) => void; onOpenBilling: (row: Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'>) => void;
  financialTools?: (view: ControlBookRecordView) => ReactNode;
  feedback?: ReactNode;
}) {
  const [view, setView] = useState<ControlBookRecordView>('profile');
  const [action, setAction] = useState<ActionName | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [services, setServices] = useState<CustomerService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(false);
  const [servicesReload, setServicesReload] = useState(0);
  const initialForm = () => ({ canal: 'TELEFONO', fecha: today(), observacion: '', monto: String(row.saldoPendiente ?? ''), cuotas: '2', condiciones: '', nuevaFecha: '', diaPago: String(row.diaPago ?? ''), tipoCargo: 'REPOSICION' });
  const [form, setForm] = useState(initialForm);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const installments = buildInstallments(Number(form.monto), Number(form.cuotas), form.fecha);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (step > 0) reviewHeading.current?.focus(); }, [step]);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  useEffect(() => {
    const controller = new AbortController();
    setServicesLoading(true);
    setServicesError(false);
    void api.get<CustomerService[]>(`/services/customer/${row.idCliente}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setServices(data.filter(service => service.idCliente === row.idCliente && service.idEmpresa === row.idEmpresa));
      })
      .catch(() => { if (!controller.signal.aborted) setServicesError(true); })
      .finally(() => { if (!controller.signal.aborted) setServicesLoading(false); });
    return () => controller.abort();
  }, [row.idCliente, row.idEmpresa, revision, servicesReload]);
  const closeAction = useCallback(() => { if (!pending.current) { setAction(null); setError(''); } }, []);

  const contracts = customer?.contratos?.filter(contract => contract.idEmpresa === row.idEmpresa) ?? [];
  const scopedCompany = companyName ?? services.find(service => service.empresa)?.empresa?.nombre
    ?? contracts.find(contract => contract.plan?.empresa)?.plan?.empresa?.nombre
    ?? (customer?.empresa?.idEmpresa === row.idEmpresa ? customer?.empresa?.nombre : null);
  const primaryAddress = customer?.direcciones?.find(address => address.esPrincipal && address.direccionCompleta)?.direccionCompleta
    ?? customer?.direcciones?.find(address => address.direccionCompleta)?.direccionCompleta;

  function openAction(next: ActionName) {
    if (!canManage || !CONTROL_ACTIONS.includes(next) || actionDisabledReason(next, row) || saving) return;
    setAction(next); setStep(0); setError(''); setForm({ ...initialForm(), ...(next === 'charge' ? { monto: '' } : {}) });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !canManage || !CONTROL_ACTIONS.includes(action) || pending.current) return;
    const disabled = actionDisabledReason(action, row);
    if (disabled) { setError(disabled); return; }
    if (action === 'agreement') {
      if (!installments.length || !form.condiciones.trim()) { setError('Completa las condiciones y las cuotas con montos válidos.'); return; }
      if (Number(form.monto) > Number(row.saldoPendiente)) { setError('El monto del convenio no puede superar el saldo pendiente.'); return; }
      if (step < 2) { setError(''); setStep(step + 1); return; }
    } else if (action !== 'charge' && !form.observacion.trim()) { setError('Escribe una observación o justificación.'); return; }
    if (action === 'extension' && row.fechaVencimientoEfectiva && form.nuevaFecha <= row.fechaVencimientoEfectiva.slice(0, 10)) { setError('La nueva fecha debe ser posterior al vencimiento vigente.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const base = managementRelations(row);
      if (action === 'event' || action === 'lastNotice' || action === 'withdrawal') {
        await api.post(action === 'withdrawal' ? '/commercial/withdrawal-notices' : '/commercial/events', {
          ...base, tipo: action === 'lastNotice' ? 'ULTIMO_AVISO_CORTE' : action === 'withdrawal' ? 'AVISO_PREVIO_RETIRO' : 'CONTACTO_CLIENTE',
          canal: form.canal, fecha: form.fecha + 'T12:00:00.000Z', observacion: form.observacion.trim(),
        });
      }
      if (action === 'agreement') await api.post('/commercial/agreements', { ...base, montoComprometido: Number(form.monto), cantidadCuotas: Number(form.cuotas), condiciones: form.condiciones.trim(), fechaInicio: form.fecha, cuotas: installments });
      if (action === 'extension') await api.post('/commercial/extensions', { idFactura: row.idFactura, nuevaFecha: form.nuevaFecha, motivo: form.observacion.trim() });
      if (action === 'paymentDay') await api.post('/commercial/payment-condition-changes', { idCliente: row.idCliente, idContrato: base.idContrato, tipoCambio: 'DIA_PAGO', valorNuevo: form.diaPago, justificacion: form.observacion.trim() });
      if (action === 'charge') await api.post('/commercial/additional-charges', { idCliente: row.idCliente, idContrato: base.idContrato, idServicio: base.idServicio, tipo: form.tipoCargo, monto: Number(form.monto), fecha: form.fecha, observacion: form.observacion.trim() });
      if (mounted.current) {
        onSaved(action === 'agreement' ? 'Convenio creado. Pendiente de aprobación administrativa.' : action === 'charge' ? 'Cargo registrado. Pendiente de facturación; no modifica el saldo actual.' : 'Gestión registrada correctamente.');
        setAction(null);
      }
    } catch (err) { if (mounted.current) setError(apiErrorMessage(err)); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  }
  function openInvoice(invoice: Pick<ControlRow, 'idCliente' | 'idFactura' | 'idEmpresa'>) {
    setView('invoices');
    onOpenBilling(invoice);
  }

  return <ControlBookModal title={row.nombre} record busy={saving} onClose={onClose}
    headerDetails={<>
      <div className="control-customer-meta">
        <span><IdCard size={15} aria-hidden="true"/>{row.rut ? 'RUT ' + row.rut : 'Sin RUT'}</span>
        {customer?.estado && <CustomerStatusBadge value={customer.estado}/>}
      </div>
      {view === 'profile' && <DetailList values={[
        ['Empresa', scopedCompany], ['Origen', customer?.origenContacto], ['Teléfono', customer?.telefono ?? row.telefono],
        ['Correo', customer?.email ?? row.email], ['Dirección', primaryAddress ?? row.direccion],
      ]}/>}
    </>}
    navigation={<nav className="control-record-views" aria-label="Vistas del cliente">
      {([['profile', 'Ficha del cliente'], ['invoices', 'Facturas y pagos'], ['activity', 'Contactos y acuerdos'], ...(canViewDocuments ? [['documents', 'Documentos tributarios']] as const : [])] as const).map(([key, label]) => (
        <button key={key} type="button" aria-current={view === key ? 'page' : undefined} disabled={saving} onClick={event => {
          setView(key);
          event.currentTarget.closest('dialog')?.scrollTo({ top: 0 });
        }}>{label}</button>
      ))}
    </nav>}>
    {feedback}
    <div className="control-customer-layout">
      <div className="control-customer-content">
        {view === 'profile' && <ControlBookCustomerContracts row={row} contracts={contracts} services={services}
          loading={servicesLoading} error={servicesError} onRetry={() => setServicesReload(value => value + 1)}/>}
        <ControlBookHistory row={row} revision={revision} view={view}
          onOpenInvoice={canViewBilling ? openInvoice : undefined}/>
        {view === 'activity' && row.observacionRelevante && <section className="control-record-note"><h3>Observación reciente</h3><p>{row.observacionRelevante}</p></section>}
        {financialTools?.(view)}
      </div>
      {canManage && (view === 'profile' || view === 'activity') && <aside className="control-customer-actions" aria-labelledby="control-customer-actions-title">
        <h3 id="control-customer-actions-title">Gestiones comerciales</h3>
        <div className="control-customer-action-group">{CONTROL_ACTIONS.map(value => {
          const Icon = ACTION_ICONS[value];
          return <button type="button" key={value} disabled={Boolean(actionDisabledReason(value, row)) || saving} onClick={() => openAction(value)}>
            <Icon size={16} aria-hidden="true"/>{ACTION_LABELS[value]}
          </button>;
        })}</div>
      </aside>}
    </div>
    {action && <ControlBookModal title={ACTION_LABELS[action]} busy={saving} onClose={closeAction}>
    <div className="control-modal-customer"><strong>{row.nombre}</strong><span>{row.plan ?? 'Sin plan'}</span></div>
    <form className="control-action-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={saving}>
        {action === 'agreement' && <>
          <ol className="control-steps" aria-label="Etapas del convenio">{['Condiciones', 'Cuotas', 'Revisión'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step >= index ? 'active' : ''}><span>{index + 1}</span>{label}</li>)}</ol>
          {step === 0 && <div className="control-form-grid">
            <label>Monto comprometido<input type="number" min="1" max={row.saldoPendiente ?? undefined} step="0.01" required value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })}/><small>Saldo: {currency.format(row.saldoPendiente ?? 0)}</small></label>
            <label>Cantidad de cuotas<input type="number" min="1" max="60" required value={form.cuotas} onChange={(event) => setForm({ ...form, cuotas: event.target.value })}/></label>
            <label>Primera cuota<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label>
            <label className="control-full-field">Condiciones<textarea required value={form.condiciones} onChange={(event) => setForm({ ...form, condiciones: event.target.value })} placeholder="Describe el compromiso de pago acordado con el cliente."/></label>
          </div>}
          {step >= 1 && <>
            <h3 ref={reviewHeading} tabIndex={-1}>{step === 1 ? 'Vista previa de cuotas' : 'Revisar convenio'}</h3>
            {step === 2 && <DetailList values={[[ 'Monto comprometido', currency.format(Number(form.monto)) ], [ 'Cantidad de cuotas', form.cuotas ], [ 'Condiciones', form.condiciones ]]}/>}
            <div className="control-installments"><table><caption className="control-sr-only">Cuotas del convenio</caption><thead><tr><th scope="col">Cuota</th><th scope="col">Vencimiento</th><th scope="col">Monto</th></tr></thead><tbody>{installments.map((item) => <tr key={item.numero}><td>{item.numero}</td><td>{dateLabel(item.fechaVencimiento)}</td><td>{currency.format(item.monto)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={2}>Total</th><td>{currency.format(Number(form.monto))}</td></tr></tfoot></table></div>
            <p className="control-muted">Cuotas mensuales. Los meses más cortos utilizan su último día.</p>
          </>}
          <p className="control-muted">El convenio quedará pendiente de aprobación administrativa.</p>
        </>}
        {(['event', 'lastNotice', 'withdrawal'] as (ActionName | null)[]).includes(action) && <>
          <DetailList values={[[ 'Teléfono del cliente', row.telefono ], [ 'Correo del cliente', row.email ]]}/><div className="control-form-grid"><label>Canal utilizado<select value={form.canal} onChange={(event) => setForm({ ...form, canal: event.target.value })}>{[['TELEFONO', 'Teléfono'], ['EMAIL', 'Correo'], ['WHATSAPP', 'WhatsApp'], ['PRESENCIAL', 'Presencial'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Fecha del contacto<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label></div>
        </>}
        {action === 'extension' && <><DetailList values={[[ 'Vencimiento original', dateLabel(row.fechaVencimiento) ], [ 'Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva) ]]}/><label>Nueva fecha<input type="date" required value={form.nuevaFecha} onChange={(event) => setForm({ ...form, nuevaFecha: event.target.value })}/></label></>}
        {action === 'paymentDay' && <><p className="control-muted">Día mensual actual: {row.diaPago ?? 'Sin definir'}. El cambio se aplica a las próximas facturas.</p><label>Nuevo día de pago<input type="number" min="1" max="28" required value={form.diaPago} onChange={(event) => setForm({ ...form, diaPago: event.target.value })}/><small>Entre el 1 y el 28 de cada mes.</small></label></>}
        {action === 'charge' && <><div className="control-form-grid"><label>Concepto<select value={form.tipoCargo} onChange={(event) => setForm({ ...form, tipoCargo: event.target.value })}>{[['REPOSICION', 'Reposición'], ['RECONEXION', 'Reconexión'], ['RETIRO', 'Retiro'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Monto<input type="number" min="1" step="0.01" required value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })}/></label><label>Fecha<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label></div><p className="control-muted">Quedará pendiente de facturación. No se registra como pago ni aumenta el saldo actual.</p></>}
        {action !== 'agreement' && <label className="control-form-observation">{['event', 'lastNotice', 'withdrawal'].includes(action) ? 'Qué se informó o acordó con el cliente' : 'Motivo / observación'}{action === 'charge' && ' (opcional)'}<textarea placeholder="Describe lo acordado con el cliente y los próximos pasos." required={action !== 'charge'} value={form.observacion} onChange={(event) => setForm({ ...form, observacion: event.target.value })}/></label>}
      </fieldset>
      {error && <p className="control-feedback error" role="alert">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={() => { if (action === 'agreement' && step > 0) setStep(step - 1); else closeAction(); setError(''); }}>{action === 'agreement' && step > 0 ? 'Atrás' : 'Cancelar'}</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : action === 'agreement' ? step === 2 ? 'Crear convenio' : 'Continuar' : SAVE_LABELS[action]}</button></footer>
    </form></ControlBookModal>}
  </ControlBookModal>;
}
