import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bell, CalendarClock, CalendarDays, Handshake, Info, Package, Phone, Wallet, X } from 'lucide-react';
import { api, apiErrorMessage } from '../../api';
import { ControlBookActionModal } from './ControlBookActionModal';
import { ACTION_LABELS, ActionName, ControlRow, VIEW_ACTIONS, WORK_VIEWS, WorkView, actionDisabledReason, buildInstallments, currency, dateLabel, managementRelations, readable, recordContext, today } from './control-book-model';

function DetailList({ values }: { values: Array<[string, string | number | null | undefined]> }) {
  return <dl className="control-detail-list">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

function RecordFields({ title, values }: { title: string; values: Array<[string, string | number | null | undefined]> }) {
  return <table className="control-fields-table"><caption>{title}</caption><thead className="control-sr-only"><tr><th scope="col">Campo</th><th scope="col">Información</th></tr></thead><tbody>{values.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value === null || value === undefined || value === '' ? '—' : value}</td></tr>)}</tbody></table>;
}

const ACTION_ICONS = { event: Phone, lastNotice: Bell, withdrawal: Package, agreement: Handshake, extension: CalendarClock, paymentDay: CalendarDays, charge: Wallet };
const ACTION_DESCRIPTIONS = {
  event: 'Deja constancia del contacto realizado con el cliente. No se envían mensajes desde este formulario.',
  lastNotice: 'Registra el último aviso realizado antes del corte. No se envían mensajes desde este formulario.',
  withdrawal: 'Registra un aviso previo de retiro para el servicio seleccionado.',
  agreement: 'Define las condiciones, revisa las cuotas y confirma el compromiso de pago.',
  extension: 'Acuerda una nueva fecha de vencimiento para este documento.',
  paymentDay: 'Actualiza el día de pago mensual del contrato y registra el motivo.',
  charge: 'Registra un cargo adicional que quedará pendiente de facturación.',
};

export function ControlBookDrawer({ row, view = 'general', canManage, canViewCustomers, canViewBilling, onClose, onSaved, onBusyChange, onOpenCustomers, onOpenBilling }: {
  row: ControlRow; canManage: boolean; onClose: () => void; onSaved: (message: string) => void;
  view?: WorkView;
  canViewCustomers: boolean; canViewBilling: boolean;
  onBusyChange: (busy: boolean) => void; onOpenCustomers: (row: ControlRow) => void; onOpenBilling: (row: ControlRow) => void;
}) {
  const tab = WORK_VIEWS[view].tab;
  const [action, setAction] = useState<ActionName | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialForm = () => ({ canal: 'TELEFONO', fecha: today(), observacion: '', monto: String(row.saldoPendiente ?? ''), cuotas: '2', condiciones: '', nuevaFecha: '', diaPago: String(row.diaPago ?? ''), tipoCargo: 'REPOSICION' });
  const [form, setForm] = useState(initialForm);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const installments = buildInstallments(Number(form.monto), Number(form.cuotas), form.fecha);
  const ActionIcon = action ? ACTION_ICONS[action] : null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (step > 0) reviewHeading.current?.focus(); }, [step]);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  const closeAction = useCallback(() => { if (!pending.current) { setAction(null); setError(''); } }, []);
  useEffect(() => {
    if (action) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || saving) return;
      event.preventDefault(); onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [action, saving, onClose]);

  function openAction(next: ActionName) {
    if (!canManage || !VIEW_ACTIONS[view].includes(next) || actionDisabledReason(next, row) || saving) return;
    setAction(next); setStep(0); setError(''); setForm(initialForm());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !canManage || !VIEW_ACTIONS[view].includes(action) || pending.current) return;
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
  return <section ref={detail} id="control-detail-panel" className="control-drawer" aria-labelledby="control-drawer-title">
    <div className="control-record-layout"><div className="control-record-card">
    <button type="button" className="control-icon control-record-close" aria-label={'Cerrar ficha y volver a ' + WORK_VIEWS[view].label.toLocaleLowerCase('es-CL')} title="Cerrar ficha" disabled={saving} onClick={onClose}><X size={20}/></button>
    <header className="control-drawer-header">
      <span className="control-customer-avatar" aria-hidden="true">{row.nombre.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-CL')}</span>
      <div>
        <h2 id="control-drawer-title" ref={heading} tabIndex={-1}>{row.nombre}</h2>
        <p>{row.rut ?? 'Sin RUT'} · {recordContext(row)}</p>
        <span className={'control-status status-' + row.estadoComercial.toLowerCase()}>{readable(row.estadoComercial)}</span>
      </div>
    </header>

      <div className="control-drawer-balance">
        {(view === 'general' || view === 'billing') && <><div className="control-balance-context"><span>Monto del documento</span><strong>{row.montoDocumento === null ? '—' : currency.format(row.montoDocumento)}</strong></div><div className="control-balance-context"><span>Pagado</span><strong>{row.totalPagado === null ? '—' : currency.format(row.totalPagado)}</strong></div></>}
        <div><span>Saldo pendiente</span><strong>{row.saldoPendiente === null ? '—' : currency.format(row.saldoPendiente)}</strong></div><div><span>Días de atraso</span><strong>{row.diasAtraso ?? '—'}</strong></div>
      </div>
      <div className="control-record-fields">
        {tab === 'summary' && <>
          <RecordFields title="Cliente y servicio" values={[
            ['Plan', row.plan], ['Estado del servicio', readable(row.estadoServicio)], ['Zona', row.zona], ['Día de pago', row.diaPago],
            ['Servicios asociados', row.serviciosRelacionados.join(', ') || 'Sin servicio'], ['Instalación', dateLabel(row.fechaInstalacion)],
          ]}/>
          <RecordFields title="Contacto" values={[[ 'Teléfono', row.telefono ], [ 'Correo', row.email ], [ 'Dirección', row.direccion ]]}/>
          <RecordFields title="Condiciones comerciales" values={[[ 'Convenio activo', row.convenioActivo ? 'Sí' : 'No' ], [ 'Prórroga activa', row.prorrogaActiva ? 'Sí' : 'No' ], [ 'Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva) ]]}/>
          <section className="control-record-note"><h3>Observación</h3><p>{row.observacionRelevante || 'Sin observaciones.'}</p></section>
        </>}
        {tab === 'billing' && <>
          <RecordFields title="Documento y vencimientos" values={[
            ['Documento', row.idFactura ? (row.tipoDocumento ? readable(row.tipoDocumento) : 'Documento') + ' ' + row.numeroDocumento : 'Sin facturas'], ['Estado', readable(row.estadoDocumento)],
            ['Emisión', dateLabel(row.fechaEmision)], ['Vencimiento original', dateLabel(row.fechaVencimiento)], ['Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva)],
          ]}/>
          <RecordFields title="Pagos y cargos" values={[
            ['Saldo a favor', currency.format(row.saldoFavor ?? 0)], ['Último pago', dateLabel(row.ultimoPago)], ['Forma de pago', row.formaPago],
            ['Voucher / transacción', row.codigoTransaccion], ['Valor recibido', currency.format(row.valorRecibido ?? 0)],
            ['Cargos por facturar', currency.format(row.cargosPendientes)],
          ]}/><p className="control-record-help">Los cargos pendientes de facturación se muestran separados del saldo exigible.</p>
        </>}
        {tab === 'history' && <>
          <RecordFields title="Contacto" values={[[ 'Teléfono', row.telefono ], [ 'Correo', row.email ], [ 'Estado del servicio', readable(row.estadoServicio) ]]}/>
          <RecordFields title="Última gestión registrada" values={[
            ['Gestión', row.ultimaGestion ? readable(row.ultimaGestion) : 'Sin gestiones registradas'], ['Fecha', dateLabel(row.fechaUltimaGestion)], ['Responsable', row.responsableUltimaGestion],
          ]}/>
          <RecordFields title="Avisos y servicio" values={[
            ['Aviso de retiro', row.avisoRetiro ? 'Registrado' : 'Sin aviso'],
            ['Retiro pendiente', row.retiroPendiente ? 'Sí' : 'No'], ['Corte comercial', dateLabel(row.fechaCorte)], ['Estado del corte', readable(row.estadoCorte)],
          ]}/>
          <section className="control-record-note"><h3>Observación</h3><p>{row.observacionRelevante || 'Sin observaciones.'}</p></section>
        </>}
        {tab === 'commitments' && <>
          <RecordFields title="Acuerdos y fechas de pago" values={[
            ['Convenio activo', row.convenioActivo ? 'Sí' : 'No'], ['Prórroga activa', row.prorrogaActiva ? 'Sí' : 'No'],
            ['Día de pago', row.diaPago], ['Fecha comprometida', dateLabel(row.cambioFecha)],
            ['Vencimiento original', dateLabel(row.fechaVencimiento)], ['Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva)],
          ]}/><p className="control-record-help">Los convenios requieren aprobación administrativa. Los cambios se registran desde las acciones comerciales.</p>
        </>}
      </div>
      {(view === 'general' || view === 'billing') && (canViewCustomers && view === 'general' || canViewBilling && row.idFactura) && <div className="control-detail-links">{view === 'general' && canViewCustomers && <button onClick={() => onOpenCustomers(row)}>Ver ficha del cliente<ArrowUpRight size={14}/></button>}{canViewBilling && row.idFactura && <button onClick={() => onOpenBilling(row)}>Ver cobranza / factura<ArrowUpRight size={14}/></button>}</div>}
      </div>
      {canManage && <aside className="control-management" aria-label="Acciones comerciales"><h3>Gestionar cliente</h3><div className="control-management-actions">{VIEW_ACTIONS[view].map(value => {
        const reason = actionDisabledReason(value, row);
        const Icon = ACTION_ICONS[value];
        return <button type="button" key={value} disabled={Boolean(reason)} onClick={() => openAction(value)}><Icon size={17} aria-hidden="true"/><span>{ACTION_LABELS[value]}{reason && <small>{reason}</small>}</span></button>;
      })}</div></aside>}
      </div>
    {action && <ControlBookActionModal title={ACTION_LABELS[action]} description={ACTION_DESCRIPTIONS[action]} icon={ActionIcon && <ActionIcon size={22}/>} busy={saving} dark={Boolean(detail.current?.closest('.theme-dark'))} onClose={closeAction}>
    <div className="control-modal-customer"><strong>{row.nombre}</strong><span>{recordContext(row)}</span></div>
    <form className="control-action-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={saving}>
        {action !== 'agreement' && <legend>{['event', 'lastNotice', 'withdrawal'].includes(action) ? 'Datos del contacto' : action === 'extension' ? 'Fecha acordada' : action === 'paymentDay' ? 'Condición de pago' : 'Detalle del cargo'}</legend>}
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
          <p className="control-form-note"><Info size={16}/>El convenio quedará pendiente de aprobación administrativa.</p>
        </>}
        {(['event', 'lastNotice', 'withdrawal'] as (ActionName | null)[]).includes(action) && <>
          <div className="control-form-grid"><label>Canal<select value={form.canal} onChange={(event) => setForm({ ...form, canal: event.target.value })}>{[['TELEFONO', 'Teléfono'], ['EMAIL', 'Correo'], ['WHATSAPP', 'WhatsApp'], ['PRESENCIAL', 'Presencial'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Fecha<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label></div>
        </>}
        {action === 'extension' && <><DetailList values={[[ 'Vencimiento original', dateLabel(row.fechaVencimiento) ], [ 'Vencimiento vigente', dateLabel(row.fechaVencimientoEfectiva) ]]}/><label>Nueva fecha<input type="date" required value={form.nuevaFecha} onChange={(event) => setForm({ ...form, nuevaFecha: event.target.value })}/></label></>}
        {action === 'paymentDay' && <><p className="control-muted">Día de pago actual: {row.diaPago ?? 'Sin definir'}</p><label>Nuevo día de pago<input type="number" min="1" max="28" required value={form.diaPago} onChange={(event) => setForm({ ...form, diaPago: event.target.value })}/><small>Entre el 1 y el 28 de cada mes.</small></label></>}
        {action === 'charge' && <><div className="control-form-grid"><label>Concepto<select value={form.tipoCargo} onChange={(event) => setForm({ ...form, tipoCargo: event.target.value })}>{[['REPOSICION', 'Reposición'], ['RECONEXION', 'Reconexión'], ['RETIRO', 'Retiro'], ['OTRO', 'Otro']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Monto<input type="number" min="1" step="0.01" required value={form.monto} onChange={(event) => setForm({ ...form, monto: event.target.value })}/></label><label>Fecha<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></label></div><p className="control-form-note"><Info size={16}/>Quedará pendiente de facturación. No se registra como pago ni aumenta el saldo actual.</p></>}
        {action === 'withdrawal' && <p className="control-form-note"><Info size={16}/>Se registrará un aviso previo a retiro para el servicio {row.idServicio}.</p>}
        {action !== 'agreement' && <label className="control-form-observation">Observación / justificación{action === 'charge' && ' (opcional)'}<textarea placeholder="Describe lo acordado con el cliente y los próximos pasos." required={action !== 'charge'} value={form.observacion} onChange={(event) => setForm({ ...form, observacion: event.target.value })}/></label>}
      </fieldset>
      {error && <p className="control-feedback error" role="alert">{error}</p>}
      <footer className="control-form-footer"><button type="button" className="control-text-button" disabled={saving} onClick={() => { if (action === 'agreement' && step > 0) setStep(step - 1); else closeAction(); setError(''); }}>{action === 'agreement' && step > 0 ? 'Atrás' : 'Cancelar'}</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : action === 'agreement' ? step === 2 ? 'Crear convenio' : 'Continuar' : 'Confirmar registro'}</button></footer>
    </form></ControlBookActionModal>}
  </section>;
}
