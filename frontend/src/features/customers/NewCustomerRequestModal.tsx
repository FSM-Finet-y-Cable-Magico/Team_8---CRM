import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ClipboardPlus, Info, Send, UserRound } from 'lucide-react';
import { api, apiErrorMessage, type Customer, type CustomerService } from '../../api';
import { dateInputValue, formatWorkOrderValue } from '../../lib';
import { Modal, StatusBadge } from '../../shared/components';
import type { CustomerServicesLoadStatus } from './customer-services-state';
import './customer-request-modal.css';

const requestTypes = ['Cambio de plan', 'Consulta comercial', 'Actualización de datos', 'Retiro de servicio', 'Otro'];
const hints: Record<string, string> = {
  'Cambio de plan': 'Indica el plan o la velocidad que solicita el cliente.',
  'Consulta comercial': 'Describe la consulta y la información que necesita el cliente.',
  'Actualización de datos': 'Indica qué datos solicita actualizar el cliente.',
  'Retiro de servicio': 'Describe el motivo del retiro y cualquier indicación para la atención.',
  Otro: 'Describe la solicitud y el resultado que espera el cliente.',
};

function requestError(error: unknown) {
  const message = apiErrorMessage(error);
  return /G[1238]\b|BLOQUEADO_|ratificaci[oó]n|prisma|payload|status code 5\d\d/i.test(message)
    ? 'No se pudo registrar la solicitud. Inténtalo nuevamente.' : message;
}

export function NewCustomerRequestModal({ customer, services, servicesStatus, onClose, onCreated }: {
  customer: Customer;
  services: CustomerService[];
  servicesStatus: CustomerServicesLoadStatus;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [type, setType] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [requestedDate, setRequestedDate] = useState(() => dateInputValue(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const withdrawal = type === 'Retiro de servicio';
  const selectedService = services.find(service => String(service.idServicio) === serviceId);
  const loadingServices = servicesStatus === 'loading' || servicesStatus === 'idle';
  const valid = Boolean(type && description.trim() && description.trim().length <= 1000
    && (!serviceId || selectedService)
    && (!withdrawal || (selectedService && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate))));

  useEffect(() => {
    const dialog = form.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    form.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending.current) close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); form.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', keyboard as EventListener);
    return () => { dialog.removeEventListener('keydown', keyboard as EventListener); if (opener?.isConnected) opener.focus(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (withdrawal) {
        await api.post('/service-withdrawals', { idServicio: Number(serviceId), motivo: description.trim(), fechaSolicitada: requestedDate });
      } else {
        await api.post('/requests', { idCliente: customer.idCliente, tipoSolicitud: type,
          idServicio: serviceId ? Number(serviceId) : undefined, descripcion: description.trim(), canalOrigen: 'CRM', estado: 'Abierta' });
      }
    } catch (err) { setError(requestError(err)); pending.current = false; setBusy(false); return; }
    // A failed list refresh must never invite a second submission of a saved request.
    pending.current = false; setBusy(false);
    onCreated(withdrawal ? 'Solicitud de retiro registrada. La fecha y la visita quedan pendientes de confirmación.' : 'Solicitud registrada.');
  }

  return <Modal title="Nueva solicitud" open onClose={() => { if (!pending.current) onClose(); }}>
    <form className="customer-request-form" ref={form} tabIndex={-1} onSubmit={submit} aria-busy={busy}>
      <div className="customer-request-content">
        <section className="customer-request-customer" aria-label="Cliente de la solicitud">
          <span className="customer-request-avatar"><UserRound size={21} aria-hidden="true" /></span>
          <div><span>Solicitud para</span><h3>{customer.nombreCompleto}</h3><p>{customer.rut ?? 'RUT no registrado'}</p></div>
        </section>
        <header className="customer-request-heading"><ClipboardPlus size={19} aria-hidden="true" /><div><h3>¿Qué necesita el cliente?</h3><p>Selecciona el motivo y describe la atención solicitada.</p></div></header>
        <fieldset className="customer-request-fields" disabled={busy}>
          <label>Tipo de solicitud<select required value={type} onChange={event => { setType(event.target.value); setError(''); }}><option value="" disabled>Seleccionar tipo</option>{requestTypes.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Servicio asociado{!withdrawal && <span className="customer-request-optional">Opcional</span>}<select required={withdrawal} disabled={loadingServices || !services.length} value={serviceId} onChange={event => setServiceId(event.target.value)}>
            <option value="">{loadingServices ? 'Cargando servicios…' : withdrawal ? 'Seleccionar servicio' : 'Solicitud general del cliente'}</option>
            {services.map(service => <option key={service.idServicio} value={service.idServicio}>{service.contrato?.plan?.nombreComercial ?? service.tipoServicio} · #{service.idServicio}</option>)}
          </select></label>
          {selectedService && <div className="customer-request-service"><div><strong>{selectedService.contrato?.plan?.nombreComercial ?? selectedService.tipoServicio}</strong><span>{selectedService.tipoServicio}{selectedService.direccion?.direccionCompleta ? ` · ${selectedService.direccion.direccionCompleta}` : ''}</span></div><StatusBadge value={formatWorkOrderValue(selectedService.estadoOperativo)} /></div>}
          {servicesStatus === 'error' && <p className="customer-request-hint customer-request-wide">No se pudieron cargar los servicios. Puedes registrar una solicitud general o volver a abrir el cliente para consultar sus servicios.</p>}
          {!loadingServices && servicesStatus !== 'error' && !services.length && <p className="customer-request-hint customer-request-wide">{withdrawal ? 'Este cliente no tiene servicios disponibles para solicitar un retiro.' : 'Este cliente no tiene servicios registrados. La solicitud se asociará al cliente.'}</p>}
          {withdrawal && <label className="customer-request-wide">Fecha solicitada para el retiro<input type="date" required value={requestedDate} onChange={event => setRequestedDate(event.target.value)} /><small>La fecha está sujeta a confirmación.</small></label>}
          <label className="customer-request-wide">{withdrawal ? 'Motivo del retiro' : 'Descripción de la solicitud'}<textarea required rows={4} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder={hints[type] ?? 'Cuéntanos qué solicita el cliente'} aria-describedby="customer-request-description-help" /><small id="customer-request-description-help" className="customer-request-description-help"><span>Incluye los detalles necesarios para dar seguimiento.</span><span>{description.length}/1000</span></small></label>
        </fieldset>
        {type === 'Cambio de plan' && <p className="customer-request-info"><Info size={17} aria-hidden="true" />Aquí registras la petición del cliente. El cambio de plan se aplica desde Gestionar servicio.</p>}
        {error && <p role="alert" className="alert customer-request-error">{error}</p>}
      </div>
      <footer className="customer-request-footer"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" disabled={busy || !valid}><Send size={16} aria-hidden="true" />{busy ? 'Registrando…' : withdrawal ? 'Registrar retiro' : 'Registrar solicitud'}</button></footer>
    </form>
  </Modal>;
}
