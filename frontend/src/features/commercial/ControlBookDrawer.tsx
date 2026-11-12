import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CalendarDays, CreditCard, Handshake, IdCard, Phone, Unplug, Wallet } from 'lucide-react';
import { api, apiErrorMessage, type Customer, type CustomerService } from '../../api';
import { CustomerStatusBadge } from '../customers/CustomerStatusBadge';
import { ControlBookCustomerContracts } from './ControlBookCustomerContracts';
import { ControlBookHistory } from './ControlBookHistory';
import { ControlBookModal } from './ControlBookModal';
import { ACTION_LABELS, ActionName, ControlRow, type InvoiceFocus, CONTROL_ACTIONS, actionDisabledReason, buildInstallments, currency, dateLabel, managementRelations, today } from './control-book-model';
import { contactDateTimeInput, contactDateTimeISO } from './control-book-contact-time';
import { ControlBookManualPayment } from './ControlBookManualPayment';
import { ControlBookWithdrawal } from './ControlBookWithdrawal';

function DetailList({ values }: { values: Array<[string, string | number | null | undefined]> }) {
  return <dl className="control-detail-list">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

const ACTION_ICONS = { event: Phone, agreement: Handshake, extension: CalendarClock, paymentDay: CalendarDays, charge: Wallet };
const VISIBLE_ACTIONS = ['event', 'agreement', 'extension', 'paymentDay', 'charge'] as const;
const CONTACT_REASONS = [['event', 'Contacto de cobranza'], ['lastNotice', 'Último aviso'], ['withdrawal', 'Aviso de retiro']] as const;
const SAVE_LABELS: Record<ActionName, string> = { event: 'Guardar contacto', lastNotice: 'Guardar último aviso', withdrawal: 'Guardar aviso de retiro', agreement: 'Crear convenio', extension: 'Guardar prórroga', paymentDay: 'Guardar día de pago', charge: 'Guardar cargo' };

export type ControlBookRecordView = 'profile' | 'invoices' | 'activity' | 'documents';

export function ControlBookDrawer({ row: sourceRow, customer, companyName, revision, canManage, canManagePayments = false, canViewBilling, canViewDocuments, onClose, onSaved, onBusyChange, onOpenBilling, financialTools, feedback }: {
  row: ControlRow; canManage: boolean; onClose: () => void; onSaved: (message: string) => void;
  customer?: Customer; companyName?: string;
  revision: number;
  canViewBilling: boolean; canViewDocuments: boolean;
  canManagePayments?: boolean;
  onBusyChange: (busy: boolean) => void; onOpenBilling: (row: InvoiceFocus) => void;
  financialTools?: (view: ControlBookRecordView) => ReactNode;
  feedback?: ReactNode;
}) {
  const [view, setView] = useState<ControlBookRecordView>('profile');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [contexts, setContexts] = useState<ControlRow[]>([]);
  const [selectedContext, setSelectedContext] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const target = contexts.find(item => item.rowId === selectedContext);
  const row = target ?? contexts[0] ?? sourceRow;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  useEffect(() => {
    setContexts([]); setContextError('');
    if (!selectedContractId) { setContextLoading(false); return; }
    const controller = new AbortController();
    setContextLoading(true);
    void (async () => {
      const items: ControlRow[] = [];
      for (let page = 1, pages = 1; page <= pages; page += 1) {
        const { data } = await api.get<{ items: ControlRow[]; pagination: { totalPages: number } }>('/commercial/control-book', { signal: controller.signal, params: { idEmpresa: sourceRow.idEmpresa, idCliente: sourceRow.idCliente, idContrato: selectedContractId, page, pageSize: 100 } });
        if (controller.signal.aborted) return;
        pages = data.pagination.totalPages;
        items.push(...data.items.filter(item => item.idCliente === sourceRow.idCliente && item.idEmpresa === sourceRow.idEmpresa && item.idContrato === selectedContractId));
      }
      if (controller.signal.aborted) return;
      setContexts(items);
      setSelectedContext(previous => items.some(item => item.rowId === previous) ? previous : items.length === 1 ? items[0].rowId : '');
    })().catch(err => { if (!controller.signal.aborted) setContextError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
    return () => controller.abort();
  }, [sourceRow.idCliente, sourceRow.idEmpresa, selectedContractId, revision]);
  const [action, setAction] = useState<ActionName | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [services, setServices] = useState<CustomerService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(false);
  const [servicesReload, setServicesReload] = useState(0);
  const initialForm = () => ({ canal: 'TELEFONO', fecha: today(), fechaContacto: contactDateTimeInput(), observacion: '', monto: String(row.saldoPendiente ?? ''), cuotas: '2', condiciones: '', nuevaFecha: '', diaPago: String(row.diaPago ?? ''), tipoCargo: 'REPOSICION' });
  const [form, setForm] = useState(initialForm);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const installments = buildInstallments(Number(form.monto), Number(form.cuotas), form.fecha);
  const isContactAction = action === 'event' || action === 'lastNotice' || action === 'withdrawal';

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
  // La baja por morosidad solo aparece cuando el plan seleccionado tiene un servicio suspendido.
  const contractServices = services.filter(service => service.idContrato === selectedContractId);
  const canStartWithdrawal = canManage && Boolean(selectedContractId) && contractServices.some(service => service.estadoOperativo === 'Suspendido');
  const scopedCompany = companyName ?? services.find(service => service.empresa)?.empresa?.nombre
    ?? contracts.find(contract => contract.plan?.empresa)?.plan?.empresa?.nombre
    ?? (customer?.empresa?.idEmpresa === row.idEmpresa ? customer?.empresa?.nombre : null);
  const primaryAddress = customer?.direcciones?.find(address => address.esPrincipal && address.direccionCompleta)?.direccionCompleta
    ?? customer?.direcciones?.find(address => address.direccionCompleta)?.direccionCompleta;

  function openAction(next: ActionName) {
    const eligible = contexts.filter(item => !actionDisabledReason(next, item));
    if (!selectedContractId || contextLoading || !canManage || !CONTROL_ACTIONS.includes(next) || !eligible.length || saving) return;
    const selected = eligible.length === 1 || next === 'paymentDay' || next === 'charge' ? eligible[0] : null;
    setSelectedContext(selected?.rowId ?? '');
    setAction(next); setStep(0); setError(''); setForm({ ...initialForm(), monto: next === 'charge' ? '' : String(selected?.saldoPendiente ?? ''), diaPago: String(selected?.diaPago ?? '') });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || contextLoading || !action || !canManage || !CONTROL_ACTIONS.includes(action) || pending.current) return;
    const disabled = actionDisabledReason(action, row);
    if (disabled) { setError(disabled); return; }
    const contactTimestamp = isContactAction ? contactDateTimeISO(form.fechaContacto) : null;
    if (isContactAction && !contactTimestamp) { setError('Selecciona una fecha y hora válidas.'); return; }
    if (action === 'agreement') {
      if (!installments.length || !form.condiciones.trim()) { setError('Completa las condiciones y las cuotas con montos válidos.'); return; }
      if (Number(form.monto) > Number(row.saldoPendiente)) { setError('El monto del convenio no puede superar el saldo pendiente.'); return; }
      if (step < 1) { setError(''); setStep(1); return; }
    } else if (action !== 'charge' && !form.observacion.trim()) { setError('Escribe una observación o justificación.'); return; }
    if (action === 'extension' && row.fechaVencimientoEfectiva && form.nuevaFecha <= row.fechaVencimientoEfectiva.slice(0, 10)) { setError('La nueva fecha debe ser posterior al vencimiento vigente.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      const base = managementRelations(row);
      if (action === 'event' || action === 'lastNotice' || action === 'withdrawal') {
        await api.post(action === 'withdrawal' ? '/commercial/withdrawal-notices' : '/commercial/events', {
          ...base, tipo: action === 'lastNotice' ? 'ULTIMO_AVISO_CORTE' : action === 'withdrawal' ? 'AVISO_PREVIO_RETIRO' : 'CONTACTO_CLIENTE',
          canal: form.canal, fecha: contactTimestamp, observacion: form.observacion.trim(),
        });
      }
      if (action === 'agreement') await api.post('/commercial/agreements', { ...base, montoComprometido: Number(form.monto), cantidadCuotas: Number(form.cuotas), condiciones: form.condiciones.trim(), fechaInicio: form.fecha, cuotas: installments });
      if (action === 'extension') await api.post('/commercial/extensions', { idFactura: row.idFactura, nuevaFecha: form.nuevaFecha, motivo: form.observacion.trim() });
      if (action === 'paymentDay') await api.post('/commercial/payment-condition-changes', { idCliente: row.idCliente, idContrato: base.idContrato, tipoCambio: 'DIA_PAGO', valorNuevo: form.diaPago, justificacion: form.observacion.trim() });
      if (action === 'charge') await api.post('/commercial/additional-charges', { idCliente: row.idCliente, idContrato: base.idContrato, idServicio: base.idServicio, tipo: form.tipoCargo, monto: Number(form.monto), fecha: form.fecha, observacion: form.observacion.trim() });
      if (mounted.current) {
        onSaved(action === 'agreement' ? 'Convenio creado correctamente.' : action === 'charge' ? 'Cargo registrado. Pendiente de facturación; no modifica el saldo actual.' : 'Gestión registrada correctamente.');
        setAction(null);
      }
    } catch (err) { if (mounted.current) setError(apiErrorMessage(err)); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  }
  function openInvoice(invoice: InvoiceFocus) {
    setView('invoices');
    onOpenBilling(invoice);
  }

  return <ControlBookModal title={row.nombre} record busy={saving} onClose={onClose}
    headerDetails={<>
      <div className="control-customer-meta">
        <span><IdCard size={15} aria-hidden="true"/>{row.rut ? 'RUT ' + row.rut : 'Sin RUT'}</span>
        {customer?.estado && <CustomerStatusBadge value={customer.estado}/>}
      </div>
      <DetailList values={[
        ['Empresa', scopedCompany], ['Origen', customer?.origenContacto], ['Teléfono', customer?.telefono ?? row.telefono],
        ['Correo', customer?.email ?? row.email], ['Dirección', primaryAddress ?? row.direccion],
      ]}/>
    </>}
    navigation={<nav className="control-record-views" aria-label="Vistas del cliente">
      {([['profile', 'Ficha del cliente'], ['invoices', 'Facturas y pagos'], ['activity', 'Contactos y acuerdos'], ...(canViewDocuments ? [['documents', 'Documentos tributarios']] as const : [])] as const).map(([key, label]) => (
        <button key={key} type="button" aria-current={view === key ? 'page' : undefined} disabled={saving} onClick={event => {
          setView(key);
          event.currentTarget.closest('dialog')?.querySelector('.control-book-modal-content')?.scrollTo({ top: 0 });
        }}>{label}</button>
      ))}
    </nav>}>
    {feedback}
    <div className="control-customer-layout">
      <div className="control-customer-content">
        {view === 'profile' && <ControlBookCustomerContracts row={sourceRow} contracts={contracts} services={services} selectedContractId={selectedContractId}
          onSelect={id => { setSelectedContractId(id); setSelectedContext(''); setContexts([]); }}
          loading={servicesLoading} error={servicesError} onRetry={() => setServicesReload(value => value + 1)}/>}
        {view === 'profile' && contextLoading && <p role="status">Cargando plan…</p>}
        {view === 'profile' && contextError && <p role="alert">{contextError}</p>}
        <ControlBookHistory row={row} contracts={contracts} revision={revision} view={view} paused={Boolean(action) || paymentOpen || withdrawalOpen}
          onOpenInvoice={canViewBilling ? openInvoice : undefined}/>
        {financialTools?.(view)}
      </div>
      {(canManage || canManagePayments) && view === 'profile' && <section className="control-customer-actions" aria-label="Acciones del cliente">
        <div className="control-customer-action-group">{canManage && view === 'profile' && VISIBLE_ACTIONS.map(value => {
          const Icon = ACTION_ICONS[value];
          return <button type="button" key={value} disabled={!selectedContractId || contextLoading || !contexts.some(item => !actionDisabledReason(value, item)) || saving} onClick={() => openAction(value)}>
            <Icon size={16} aria-hidden="true"/>{value === 'event' ? 'Registrar gestión' : ACTION_LABELS[value]}
          </button>;
        })}{canViewBilling && canManagePayments && <button type="button" disabled={!selectedContractId || contextLoading || !contexts.some(item => item.idFactura && Number(item.saldoPendiente) > 0) || saving} onClick={() => setPaymentOpen(true)}><CreditCard size={16} aria-hidden="true"/>Pago manual</button>}{canStartWithdrawal && <button type="button" disabled={contextLoading || saving} onClick={() => setWithdrawalOpen(true)}><Unplug size={16} aria-hidden="true"/>Iniciar baja y retiro</button>}</div>
      </section>}
    </div>
    {action && <ControlBookModal title={isContactAction ? 'Registrar gestión' : ACTION_LABELS[action]} busy={saving} onClose={closeAction}>
    <div className="control-modal-customer"><strong>{row.nombre}</strong><span>{row.plan ?? 'Sin plan'}</span></div>
    <form className={"control-action-form" + (action === "agreement" ? " control-agreement-form" : "")} onSubmit={(event) => void submit(event)}>
      <fieldset disabled={saving}>
        {!['paymentDay', 'charge'].includes(action) && <label className="control-action-document">Documento<select required value={selectedContext} disabled={saving || step > 0} onChange={event => {
          const selected = contexts.find(item => item.rowId === event.target.value && !actionDisabledReason(action, item));
          setSelectedContext(selected?.rowId ?? ''); setError(''); setForm({ ...form, monto: String(selected?.saldoPendiente ?? '') });
        }}><option value="">Seleccionar fecha de vencimiento</option>{contexts.filter(item => !actionDisabledReason(action, item)).map(item => <option key={item.rowId} value={item.rowId}>{item.idFactura ? dateLabel(item.fechaVencimientoEfectiva) : 'Sin factura'}{contexts.some(other => other.rowId !== item.rowId && other.fechaVencimientoEfectiva === item.fechaVencimientoEfectiva) ? ` (${item.numeroDocumento ?? item.idFactura})` : ''}</option>)}</select></label>}
        {target && <>
        {action === 'agreement' && <>
          {step === 0 && <div className="control-form-grid">
            <label>Monto comprometido<input type="number" min="1" max={row.saldoPendiente ?? undefined} step="0.01" required value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })}/><small>Saldo: {currency.format(row.saldoPendiente ?? 0)}</small></label>
            <label>Cantidad de cuotas<input type="number" min="1" max="60" required value={form.cuotas} onChange={(event) => setForm({ ...form, cuotas: event.target.value })}/></label>
            <label>Primera cuota<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label>
            <label className="control-full-field">Condiciones<textarea required value={form.condiciones} onChange={(event) => setForm({ ...form, condiciones: event.target.value })} placeholder="Describe el compromiso de pago acordado con el cliente."/></label>
          </div>}
          {step >= 1 && <>
            <h3 ref={reviewHeading} tabIndex={-1}>Cuotas del convenio</h3>
            <div className="control-installments"><table><caption className="control-sr-only">Cuotas del convenio</caption><thead><tr><th scope="col">Cuota</th><th scope="col">Vencimiento</th><th scope="col">Monto</th></tr></thead><tbody>{installments.map((item) => <tr key={item.numero}><td>{item.numero}</td><td>{dateLabel(item.fechaVencimiento)}</td><td>{currency.format(item.monto)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={2}>Total</th><td>{currency.format(Number(form.monto))}</td></tr></tfoot></table></div>
          </>}
        </>}
        {isContactAction && <>
          <div className="control-form-grid">
            <label className="control-full-field">Motivo<select value={action} onChange={event => { const next = event.target.value as ActionName; if (CONTACT_REASONS.some(([key]) => key === next) && !actionDisabledReason(next, row)) { setAction(next); setError(''); } }}>
              {CONTACT_REASONS.map(([key, label]) => <option key={key} value={key} disabled={Boolean(actionDisabledReason(key, row))}>{label}</option>)}
            </select></label>
            <label>Canal utilizado<select value={form.canal} onChange={(event) => setForm({ ...form, canal: event.target.value })}>{[['TELEFONO', 'Teléfono'], ['EMAIL', 'Correo'], ['WHATSAPP', 'WhatsApp'], ['PRESENCIAL', 'Presencial'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Fecha y hora del contacto<input type="datetime-local" required value={form.fechaContacto} onChange={(event) => setForm({ ...form, fechaContacto: event.target.value })}/><small>Hora de Chile</small></label>
          </div>
          <p className="control-muted">Registra una comunicación realizada con el cliente.</p>
        </>}
        {action === 'extension' && <><DetailList values={[[ 'Vencimiento original', dateLabel(row.fechaVencimiento) ], [ 'Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva) ]]}/><label>Nueva fecha<input type="date" required value={form.nuevaFecha} onChange={(event) => setForm({ ...form, nuevaFecha: event.target.value })}/></label></>}
        {action === 'paymentDay' && <><DetailList values={[[ 'Contrato', row.numeroContrato ?? (row.idContrato ? `#${row.idContrato}` : null) ], [ 'Día mensual actual', row.diaPago ? `Día ${row.diaPago}` : null ]]}/><label>Nuevo día de pago<input type="number" min="1" max="28" required value={form.diaPago} onChange={(event) => setForm({ ...form, diaPago: event.target.value })}/><small>Entre el 1 y el 28 de cada mes.</small></label></>}
        {action === 'charge' && <><div className="control-form-grid"><label>Concepto<select value={form.tipoCargo} onChange={(event) => setForm({ ...form, tipoCargo: event.target.value })}>{[['REPOSICION', 'Reposición'], ['RECONEXION', 'Reconexión'], ['RETIRO', 'Retiro'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Monto<input type="number" min="1" step="0.01" required value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })}/></label><label>Fecha<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label></div></>}
        {action !== 'agreement' && <label className="control-form-observation">{['event', 'lastNotice', 'withdrawal'].includes(action) ? 'Qué se informó o acordó con el cliente' : 'Motivo / observación'}{action === 'charge' && ' (opcional)'}<textarea placeholder="Describe lo acordado con el cliente y los próximos pasos." required={action !== 'charge'} value={form.observacion} onChange={(event) => setForm({ ...form, observacion: event.target.value })}/></label>}
        </>}
      </fieldset>
      {error && <p className="control-feedback error" role="alert">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={() => { if (action === 'agreement' && step > 0) setStep(step - 1); else closeAction(); setError(''); }}>{action === 'agreement' && step > 0 ? 'Atrás' : 'Cancelar'}</button><button type="submit" disabled={saving || !target || contextLoading}>{saving ? 'Guardando…' : action === 'agreement' ? step === 1 ? 'Crear convenio' : 'Continuar' : SAVE_LABELS[action]}</button></footer>
    </form></ControlBookModal>}
    {withdrawalOpen && selectedContractId && <ControlBookWithdrawal services={contractServices} customerName={row.nombre} plan={row.plan} canManage={canManage}
      onBusyChange={setSaving} onClose={() => setWithdrawalOpen(false)} onSaved={message => { setWithdrawalOpen(false); onSaved(message); }}/>}
    {paymentOpen && selectedContractId && <ControlBookManualPayment contexts={contexts} contractId={selectedContractId} customerId={sourceRow.idCliente} companyId={sourceRow.idEmpresa} canManage={canManagePayments} onBusyChange={setSaving} onClose={() => setPaymentOpen(false)} onSaved={message => { setPaymentOpen(false); onSaved(message); }}/>}
  </ControlBookModal>;
}
