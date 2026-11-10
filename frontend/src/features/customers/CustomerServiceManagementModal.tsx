import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Router, ShieldCheck } from 'lucide-react';
import {
  api,
  apiErrorMessage,
  CommercialWarranty,
  Customer,
  CustomerService,
  G1EquipmentResponse,
  G1Unit,
  Plan,
} from '../../api';
import { dateInputValue, formatDateOnly, formatDateTime, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { ContractDocuments } from './ContractDocuments';
import { PlanChangeHistory } from './PlanChangeHistory';
import { HistoricalG3Closure } from './HistoricalG3Closure';
import { WorkOrderTechnicalEvidence } from '../installations/WorkOrderTechnicalEvidence';
import './service-management.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];

function customerAddress(customer: Customer, service: CustomerService) {
  const serviceAddress = service.direccion?.direccionCompleta?.trim();
  if (serviceAddress) return serviceAddress;
  const primaryAddress = customer.direcciones?.find((address) => address.esPrincipal && address.direccionCompleta?.trim())
    ?? customer.direcciones?.find((address) => address.direccionCompleta?.trim());
  return primaryAddress?.direccionCompleta.trim() ?? 'No registrada';
}

function companyName(contract: CustomerContract, customer: Customer) {
  return contract.plan?.empresa?.nombre ?? customer.empresa?.nombre ?? customer.empresas?.[0] ?? '-';
}

function formatCurrency(value?: string | number | null) {
  if (value == null || value === '') return 'No registrado';
  const amount = Number(value);
  return Number.isFinite(amount) ? '$' + amount.toLocaleString('es-CL') : '-';
}

function serviceErrorMessage(error: unknown) {
  const message = apiErrorMessage(error);
  return /\bG[1238]\b|BLOQUEADO_|ratificaci[oó]n|prisma|payload|status code 5\d\d/i.test(message)
    ? 'No se pudo completar la operación. Inténtalo nuevamente.' : message;
}

function technicalValue(service: CustomerService, key: string) {
  const value = service.datosTecnicos?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'Sin información';
}

function g1Type(unit: G1Unit) {
  if (!unit.tipo_equipo) return '-';
  if (typeof unit.tipo_equipo === 'string') return unit.tipo_equipo;
  return [unit.tipo_equipo.nombre, unit.tipo_equipo.marca, unit.tipo_equipo.modelo].filter(Boolean).join(' · ');
}

function emptyWarrantyForm() {
  const start = dateInputValue(new Date());
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  return { tipo: 'Garantía de servicio', fechaInicio: start, fechaTermino: dateInputValue(endDate), cobertura: '', monto: '', observaciones: '', numeroSerieEquipo: '' };
}

export function CustomerServiceManagementModal({
  open,
  customer,
  contract,
  service,
  plans,
  permissions,
  onClose,
  onRefresh,
  onOpenObservations,
}: {
  open: boolean;
  customer: Customer;
  contract: CustomerContract;
  service: CustomerService;
  plans: Plan[];
  permissions: DashboardPermissions;
  onClose: () => void;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
  onOpenObservations: (target: { tipoEntidad: string; idEntidad: number; label: string; idCliente?: number; idEmpresa?: number | null }) => void;
}) {
  const { message, showMessage, clearMessage } = useTransientMessage();
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');
  const [deactivateObservation, setDeactivateObservation] = useState('');
  const [g1Equipment, setG1Equipment] = useState<G1Unit[]>([]);
  const [equipmentStatus, setEquipmentStatus] = useState('');
  const [warranties, setWarranties] = useState<CommercialWarranty[]>([]);
  const [warrantyStatus, setWarrantyStatus] = useState('');
  const [warrantyFormOpen, setWarrantyFormOpen] = useState(false);
  const [warrantyForm, setWarrantyForm] = useState(emptyWarrantyForm());
  const content = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = content.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    content.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', keyboard as EventListener);
    return () => { dialog.removeEventListener('keydown', keyboard as EventListener); if (opener?.isConnected) opener.focus(); };
  }, [open]);

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.activo !== false && plan.idPlan !== contract.plan?.idPlan && (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa)),
    [plans, contract.idEmpresa, contract.plan?.idPlan],
  );
  const nextPlan = activePlans.find((plan) => plan.idPlan === Number(newPlanId)) ?? null;

  useEffect(() => {
    if (!open) {
      setChangePlanOpen(false);
      setDeactivateOpen(false);
      setWarrantyFormOpen(false);
      setNewPlanId('');
      setPlanObservation('');
      setDeactivateObservation('');
      clearMessage();
      return;
    }
    let active = true;
    setG1Equipment([]); setWarranties([]);
    setEquipmentStatus('Consultando equipos…');
    setWarrantyStatus('Cargando garantías…');
    api.get<G1EquipmentResponse<G1Unit[]>>(`/integrations/g1/services/${service.idServicio}/equipment`)
      .then(({ data }) => { if (active) { setG1Equipment(data.data); setEquipmentStatus(data.data.length ? '' : 'Sin asignación oficial confirmada para este servicio.'); } })
      .catch(() => { if (active) { setG1Equipment([]); setEquipmentStatus('No se pudieron consultar los equipos. Vuelve a abrir el servicio para intentarlo nuevamente.'); } });
    api.get<CommercialWarranty[]>('/commercial-warranties', { params: { idServicio: service.idServicio } })
      .then(({ data }) => { if (active) { setWarranties(data); setWarrantyStatus(''); } })
      .catch(() => { if (active) { setWarranties([]); setWarrantyStatus('No se pudieron consultar las garantías. Vuelve a abrir el servicio para intentarlo nuevamente.'); } });
    return () => { active = false; };
  }, [open, service.idServicio, clearMessage]);

  async function reloadWarranties() {
    const { data } = await api.get<CommercialWarranty[]>('/commercial-warranties', { params: { idServicio: service.idServicio } });
    setWarranties(data);
  }

  async function savePlanChange(event: FormEvent) {
    event.preventDefault();
    if (savingPlan || !newPlanId) { if (!newPlanId) showMessage('Selecciona el nuevo plan.'); return; }
    setSavingPlan(true);
    try {
      const { data } = await api.post('/contracts/' + contract.idContrato + '/change-plan', { newPlanId: Number(newPlanId), fechaEfectiva, observaciones: planObservation.trim() || undefined });
      setChangePlanOpen(false); setNewPlanId(''); setPlanObservation('');
      await onRefresh(service.idServicio); setPlanRevision((value) => value + 1);
      showMessage(data.cambioPlan?.estadoCambio === 'Pendiente' ? 'Cambio programado.' : 'Cambio de plan aplicado.');
    } catch (error) { showMessage(serviceErrorMessage(error)); } finally { setSavingPlan(false); }
  }

  async function deactivateService(event: FormEvent) {
    event.preventDefault();
    try {
      await api.patch('/services/' + service.idServicio + '/deactivate', { observacion: deactivateObservation.trim() || undefined });
      setDeactivateOpen(false); setDeactivateObservation(''); await onRefresh(service.idServicio); showMessage('Servicio dado de baja.');
    } catch (error) { showMessage(serviceErrorMessage(error)); }
  }

  async function createWarranty(event: FormEvent) {
    event.preventDefault();
    try {
      await api.post('/commercial-warranties', {
        idEmpresa: service.idEmpresa ?? undefined,
        idCliente: customer.idCliente,
        idServicio: service.idServicio,
        idContrato: contract.idContrato,
        tipo: warrantyForm.tipo.trim(),
        fechaInicio: warrantyForm.fechaInicio,
        fechaTermino: warrantyForm.fechaTermino,
        cobertura: warrantyForm.cobertura.trim(),
        monto: warrantyForm.monto ? Number(warrantyForm.monto) : undefined,
        observaciones: warrantyForm.observaciones.trim() || undefined,
        numeroSerieEquipo: warrantyForm.numeroSerieEquipo.trim() || undefined,
      });
      await reloadWarranties();
      setWarrantyForm(emptyWarrantyForm());
      setWarrantyFormOpen(false);
      showMessage('Garantía comercial creada.');
    } catch (error) { showMessage(serviceErrorMessage(error)); }
  }

  async function deactivateWarranty(idGarantia: number) {
    try {
      await api.patch(`/commercial-warranties/${idGarantia}/deactivate`);
      await reloadWarranties();
      showMessage('Garantía comercial desactivada.');
    } catch (error) { showMessage(serviceErrorMessage(error)); }
  }

  const installation = service.instalacion;
  const installationTechnician = installation?.fuente === 'G3'
    ? installation.idTecnicoG3 ? `Técnico #${installation.idTecnicoG3}` : 'No registrado'
    : installation?.tecnico?.nombreCompleto ?? 'No registrado';
  const installationCode = installation?.codigoSeguimiento
    ?? (installation?.idOt != null
      ? `OT #${installation.idOt}`
      : 'Sin OT correlacionada con este servicio');
  const resultadoLlamadaG3 = service.datosTecnicos?.resultadoLlamadaG3;
  const resueltoRemotamenteG3 = service.datosTecnicos?.resueltoRemotamenteG3;
  const materialesG3 = service.datosTecnicos?.materialesG3;

  return (
    <Modal title="Gestionar servicio" open={open} onClose={onClose}>
      <div className="customer-service-management service-management-view" ref={content} tabIndex={-1}>
        {message && <p role="status" className="inline-status customer-transient-status">{message}</p>}
        <section className="service-summary" aria-label="Resumen del servicio">
          <header>
            <div><p>Servicio #{service.idServicio}</p><h3>{contract.plan?.nombreComercial ?? 'Plan no registrado'}</h3><span>{customer.nombreCompleto} · {companyName(contract, customer)}</span></div>
            <StatusBadge value={formatWorkOrderValue(service.estadoOperativo)} />
          </header>
          <dl><div><dt>Precio mensual</dt><dd>{formatCurrency(contract.plan?.precioMensual)}</dd></div><div><dt>Dirección de instalación</dt><dd>{customerAddress(customer, service)}</dd></div></dl>
        </section>

        <div className="customer-service-actions service-actions" aria-label="Acciones del servicio">
          {permissions.changeCustomerPlan && service.estadoOperativo !== 'Baja' && <button type="button" className="secondary compact" aria-expanded={changePlanOpen} aria-controls="service-change-plan" onClick={() => { setChangePlanOpen(value => !value); setDeactivateOpen(false); }}>Modificar plan</button>}
          {permissions.manageObservations && <button type="button" className="secondary compact" onClick={() => onOpenObservations({ tipoEntidad: 'Servicio', idEntidad: service.idServicio, idCliente: customer.idCliente, idEmpresa: service.idEmpresa, label: 'Servicio ' + service.idServicio })}>Observaciones</button>}
          {permissions.manageServices && service.estadoOperativo !== 'Baja' && <button type="button" className="compact service-deactivate-trigger" aria-expanded={deactivateOpen} aria-controls="service-deactivate" onClick={() => { setDeactivateOpen(value => !value); setChangePlanOpen(false); }}>Dar de baja</button>}
        </div>

        {changePlanOpen && <form id="service-change-plan" className="workflow-grid service-inline-form" onSubmit={savePlanChange}>
          <header className="service-form-heading"><h3>Modificar plan</h3><p>Selecciona el nuevo plan y la fecha en que debe aplicarse.</p></header>
          <label>Nuevo plan<select required disabled={savingPlan} value={newPlanId} onChange={event => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
          <label>Fecha efectiva<input type="date" required disabled={savingPlan} min={dateInputValue(new Date())} value={fechaEfectiva} onChange={event => setFechaEfectiva(event.target.value)} /></label>
          {!activePlans.length && <p className="service-form-wide service-muted">No hay otros planes disponibles para esta empresa.</p>}
          {nextPlan && <p className="service-form-wide service-new-plan">{nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)} al mes</p>}
          <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea disabled={savingPlan} value={planObservation} onChange={event => setPlanObservation(event.target.value)} /></label>
          <div className="service-form-actions"><button type="button" className="secondary" disabled={savingPlan} onClick={() => setChangePlanOpen(false)}>Cancelar</button><button type="submit" disabled={savingPlan || !newPlanId}>{savingPlan ? 'Guardando…' : 'Guardar cambio'}</button></div>
        </form>}

        {deactivateOpen && <form id="service-deactivate" className="workflow-grid service-inline-form" onSubmit={deactivateService}>
          <header className="service-form-heading"><h3>Dar de baja el servicio</h3><p>Confirma la baja de este servicio. Puedes dejar una observación para el registro.</p></header>
          <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea value={deactivateObservation} onChange={event => setDeactivateObservation(event.target.value)} /></label>
          <div className="service-form-actions"><button type="button" className="secondary" onClick={() => setDeactivateOpen(false)}>Cancelar</button><button type="submit" className="danger">Confirmar baja</button></div>
        </form>}

        <div className="service-details-list">
          <details className="service-details-section">
            <summary><FileText size={18} aria-hidden="true" /><span>Contrato y plan<small>Datos del contrato, documentos y cambios de plan</small></span></summary>
            <div className="service-details-content">
              <dl className="customer-readonly-details">
                <div><dt>Contrato</dt><dd>#{contract.idContrato}</dd></div>
                <div><dt>Fecha de contratación</dt><dd>{contract.fechaInicio ? formatDateOnly(contract.fechaInicio) : 'No registrada'}</dd></div>
                <div><dt>Tipo de servicio</dt><dd>{service.tipoServicio}</dd></div>
                <div><dt>Velocidad</dt><dd>{contract.plan?.velocidadMbps ? contract.plan.velocidadMbps + ' Mbps' : 'No registrada'}</dd></div>
              </dl>
              {permissions.manageContracts && <ContractDocuments idContrato={contract.idContrato} canGenerate={permissions.generateDigitalContract} />}
              {permissions.changeCustomerPlan && <PlanChangeHistory idContrato={contract.idContrato} revision={planRevision} />}
            </div>
          </details>

          <details className="service-details-section">
            <summary><Router size={18} aria-hidden="true" /><span>Instalación y equipos<small>Visita técnica, conexión y equipos instalados</small></span></summary>
            <div className="service-details-content">
              <section className="service-subsection">
                <h3>Datos de instalación</h3>
                {!installation && <p className="service-muted">Sin antecedente de instalación correlacionado con este servicio. Esto no demuestra que no exista una instalación histórica; consulta el historial de instalaciones.</p>}
                <dl className="customer-readonly-details">
                  <div><dt>Técnico instalador</dt><dd>{installationTechnician}</dd></div>
                  <div><dt>Fecha de instalación</dt><dd>{installation?.fechaCompletada ? formatDateOnly(installation.fechaCompletada) : 'No registrada'}</dd></div>
                  <div><dt>Orden de trabajo</dt><dd>{installationCode}</dd></div>
                  {installation?.fuente === 'G3' && <div><dt>Fecha de registro del cierre</dt><dd>{installation.fechaProcesamiento ? formatDateTime(installation.fechaProcesamiento) : 'No registrada'}</dd></div>}
                  <div><dt>Dirección MAC</dt><dd>{technicalValue(service, 'macAddress')}</dd></div>
                  <div><dt>Puerto OLT</dt><dd>{technicalValue(service, 'puertoOlt')}</dd></div>
                  <div><dt>Potencia óptica</dt><dd>{technicalValue(service, 'potenciaOpticaDbm')}</dd></div>
                  {typeof resultadoLlamadaG3 === 'string' && <div><dt>Resultado de llamada</dt><dd>{resultadoLlamadaG3}</dd></div>}
                  {typeof resueltoRemotamenteG3 === 'boolean' && <div><dt>Resuelto remotamente</dt><dd>{resueltoRemotamenteG3 ? 'Sí' : 'No'}</dd></div>}
                  {Array.isArray(materialesG3) && <div><dt>Materiales utilizados</dt><dd>{materialesG3.length} registro(s)</dd></div>}
                  <div><dt>Seguimiento de activación de inventario</dt><dd>{service.integracionG1?.estadoIntegracion ? formatWorkOrderValue(service.integracionG1.estadoIntegracion.replace(/_/g, ' ')) : 'Sin evento de activación registrado; esto no determina si existió una instalación.'}</dd></div>
                </dl>
                {service.integracionG1?.ultimoErrorSanitizado && <p className="inline-status">No se pudo actualizar la asignación de equipos.</p>}
              </section>
              <section className="service-subsection">
                <h3>Equipos asignados oficialmente</h3>
                <p className="service-muted">La asignación la confirma Inventario y Bodega. Un equipo declarado en una OT no acredita su asignación al servicio.</p>
                {equipmentStatus && <p className="service-muted" role="status">{equipmentStatus}</p>}
                {g1Equipment.map(unit => <dl className="customer-readonly-details service-record" key={unit.id_unidad ?? unit.numero_serie}>
                  <div><dt>Equipo</dt><dd>{g1Type(unit)}</dd></div>
                  <div><dt>Número de serie</dt><dd>{unit.numero_serie}</dd></div>
                  <div><dt>Estado físico</dt><dd>{unit.estado}</dd></div>
                  <div><dt>Fecha de instalación</dt><dd>{unit.fecha_instalacion ? formatDateOnly(unit.fecha_instalacion) : 'No registrada'}</dd></div>
                  <div><dt>Orden de trabajo</dt><dd>{unit.id_ot ?? 'No registrada'}</dd></div>
                  <div><dt>Garantía del equipo</dt><dd>{unit.garantia?.vigente === true ? 'Vigente' : unit.garantia?.vigente === false ? 'Vencida' : 'Sin información'}</dd></div>
                  <div><dt>Vencimiento de la garantía</dt><dd>{unit.garantia?.fecha_vencimiento ? formatDateOnly(unit.garantia.fecha_vencimiento) : 'No registrado'}</dd></div>
                </dl>)}
              </section>
              <WorkOrderTechnicalEvidence evidence={installation?.antecedenteTecnico} />
              {open && installation?.fuente === 'G3' && installation.estado === 'COMPLETADA' && <HistoricalG3Closure key={service.idServicio} idServicio={service.idServicio} />}
            </div>
          </details>

          <details className="service-details-section">
            <summary><ShieldCheck size={18} aria-hidden="true" /><span>Garantías del servicio<small>Cobertura y vigencia de las garantías comerciales</small></span></summary>
            <div className="service-details-content">
              {warrantyStatus && <p role="status" className="service-muted">{warrantyStatus}</p>}
              {warranties.map(warranty => <div className="service-record" key={warranty.idGarantia}>
                <header className="service-record-heading"><h3>{warranty.tipo}</h3><StatusBadge value={formatWorkOrderValue(warranty.estado)} /></header>
                <dl className="customer-readonly-details">
                  <div><dt>Vigencia</dt><dd>{formatDateOnly(warranty.fechaInicio)} — {formatDateOnly(warranty.fechaTermino)}</dd></div>
                  <div><dt>Cobertura</dt><dd>{warranty.cobertura}</dd></div>
                  <div><dt>Monto</dt><dd>{formatCurrency(warranty.monto)}</dd></div>
                  <div><dt>Número de serie del equipo</dt><dd>{warranty.numeroSerieEquipo ?? 'Sin equipo asociado'}</dd></div>
                </dl>
                {permissions.manageCommercialWarranties && warranty.estado === 'ACTIVA' && <button type="button" className="secondary compact" onClick={() => void deactivateWarranty(warranty.idGarantia)}>Desactivar garantía</button>}
              </div>)}
              {!warranties.length && !warrantyStatus && <p className="service-muted">No hay garantías registradas para este servicio.</p>}
              {permissions.manageCommercialWarranties && service.estadoOperativo === 'Activo' && <button type="button" className="secondary compact service-warranty-trigger" aria-expanded={warrantyFormOpen} onClick={() => setWarrantyFormOpen(value => !value)}>Nueva garantía comercial</button>}
              {warrantyFormOpen && <form className="workflow-grid service-inline-form" onSubmit={createWarranty}>
                <header className="service-form-heading"><h3>Nueva garantía comercial</h3></header>
                <label>Tipo<input required maxLength={60} value={warrantyForm.tipo} onChange={event => setWarrantyForm({ ...warrantyForm, tipo: event.target.value })} /></label>
                <label>Monto <span className="service-optional">Opcional</span><input type="number" min="0.01" step="0.01" value={warrantyForm.monto} onChange={event => setWarrantyForm({ ...warrantyForm, monto: event.target.value })} /></label>
                <label>Fecha de inicio<input required type="date" value={warrantyForm.fechaInicio} onChange={event => setWarrantyForm({ ...warrantyForm, fechaInicio: event.target.value })} /></label>
                <label>Fecha de término<input required type="date" value={warrantyForm.fechaTermino} onChange={event => setWarrantyForm({ ...warrantyForm, fechaTermino: event.target.value })} /></label>
                <label className="service-form-wide">Número de serie del equipo <span className="service-optional">Opcional</span><input maxLength={80} value={warrantyForm.numeroSerieEquipo} onChange={event => setWarrantyForm({ ...warrantyForm, numeroSerieEquipo: event.target.value })} /></label>
                <label className="service-form-wide">Cobertura<textarea required value={warrantyForm.cobertura} onChange={event => setWarrantyForm({ ...warrantyForm, cobertura: event.target.value })} /></label>
                <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea value={warrantyForm.observaciones} onChange={event => setWarrantyForm({ ...warrantyForm, observaciones: event.target.value })} /></label>
                <div className="service-form-actions"><button type="button" className="secondary" onClick={() => setWarrantyFormOpen(false)}>Cancelar</button><button type="submit">Crear garantía</button></div>
              </form>}
            </div>
          </details>
        </div>
        <footer className="service-modal-footer"><button type="button" className="secondary" onClick={onClose}>Cerrar</button></footer>
      </div>
    </Modal>
  );
}
