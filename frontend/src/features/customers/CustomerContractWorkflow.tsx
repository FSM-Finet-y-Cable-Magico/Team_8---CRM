import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronRight, CircleCheckBig, ClipboardList, Plus, Ticket as TicketIcon, Users, Wrench } from 'lucide-react';
import {
  api,
  apiErrorMessage,
  Customer,
  CustomerService,
  InstallAvailability,
  PaymentZone,
  Plan,
} from '../../api';
import { equipmentModeOptions, serviceStatusOptions, serviceTypeOptions } from '../../constants';
import { addYearsToInputDate, dateInputValue, formatDateOnly, formatWorkOrderValue, technicalEntries } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { HistoryBox, Modal, StatusBadge } from '../../shared/components';
import './customer-contract-workflow.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];
type Stage = 1 | 2 | 3;
type OperationTab = 'summary' | 'technical' | 'equipment' | 'tickets' | 'history';
type WorkOrder = NonNullable<CustomerService['ordenes']>[number];

const CLOSED_INSTALL_ORDER_STATES = ['completada', 'cancelada'];

const emptyServiceForm = () => ({ tipoServicio: 'Internet', idZonaPago: '', observaciones: '', caracteristicasComerciales: '' });
const emptyTechnicalForm = () => ({
  tipoServicio: 'Internet', estadoOperativo: 'Pendiente Instalacion', idZonaPago: '', observaciones: '', tecnologia: '', velocidad: '', macAddress: '', puertoOlt: '', ipAsignada: '', cajaNap: '', numeroPoste: '', caracteristicasComerciales: '',
});
const emptyEquipmentForm = () => ({ numeroSerie: '', modelo: '', macAddress: '', puertoOlt: '', observaciones: '', modalidadAsignacion: 'Propiedad empresa', valorArriendoMensual: '', fechaInicioAsignacion: '' });
const emptyInstallForm = () => ({ tipoConexion: '', fechaProgramada: '', horaVisita: '', prioridad: 'Media', observaciones: '' });

function normalize(value?: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function signed(contract?: CustomerContract | null) {
  return ['firmado', 'activo', 'suspendido', 'moroso'].includes(normalize(contract?.estado));
}

function pendingInstall(service?: CustomerService | null) {
  const state = normalize(service?.estadoOperativo);
  return state === 'pendiente' || (state.includes('pendiente') && state.includes('instalacion'));
}

function openInstallOrder(order: WorkOrder) {
  return normalize(order.tipoOt) === 'instalacion' && !CLOSED_INSTALL_ORDER_STATES.includes(normalize(order.estado));
}

function orderCode(order?: WorkOrder | null) {
  return order?.codigoSeguimiento?.trim() || (order ? `OT-INS-${String(order.idOt).padStart(6, '0')}` : '-');
}

function customerAddress(customer: Customer) {
  const fromTechnicalData = customer.datosTecnicos?.direccion;
  if (typeof fromTechnicalData === 'string' && fromTechnicalData.trim()) return fromTechnicalData.trim();
  return customer.direcciones?.find((address) => address.direccionCompleta?.trim())?.direccionCompleta.trim() ?? 'No registrada';
}

function serviceAddress(service: CustomerService | null, customer: Customer) {
  return service?.direccion?.direccionCompleta?.trim() || customerAddress(customer);
}

function companyName(contract: CustomerContract, customer: Customer) {
  return contract.plan?.empresa?.nombre ?? customer.empresa?.nombre ?? customer.empresas?.[0] ?? '-';
}

export function CustomerContractWorkflow({
  customer,
  services,
  plans,
  paymentZones,
  permissions,
  onRefresh,
  onOpenObservations,
}: {
  customer: Customer;
  services: CustomerService[];
  plans: Plan[];
  paymentZones: PaymentZone[];
  permissions: DashboardPermissions;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
  onOpenObservations: (target: { tipoEntidad: string; idEntidad: number; label: string; idCliente?: number; idEmpresa?: number | null }) => void;
}) {
  const [contracts, setContracts] = useState<CustomerContract[]>(customer.contratos ?? []);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [newContractObservation, setNewContractObservation] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>(1);
  const [tab, setTab] = useState<OperationTab>('summary');
  const [message, setMessage] = useState('');
  const [signatureObservation, setSignatureObservation] = useState('');
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [changePlan, setChangePlan] = useState({ newPlanId: '', fechaEfectiva: dateInputValue(new Date()), motivo: '', observaciones: '' });
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm());
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [technicalForm, setTechnicalForm] = useState(emptyTechnicalForm());
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipmentForm());
  const [installOpen, setInstallOpen] = useState(false);
  const [installForm, setInstallForm] = useState(emptyInstallForm());
  const [availability, setAvailability] = useState<InstallAvailability | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [history, setHistory] = useState<Array<{ idLog: string; accion: string; fechaHora: string | null }>>([]);

  useEffect(() => setContracts(customer.contratos ?? []), [customer.contratos]);

  const selectedContract = contracts.find((contract) => contract.idContrato === selectedContractId) ?? null;
  const contractServices = selectedContract ? services.filter((service) => service.idContrato === selectedContract.idContrato) : [];
  const selectedService = contractServices.find((service) => service.idServicio === selectedServiceId) ?? contractServices[0] ?? null;
  const pendingOrder = useMemo(() => (selectedService?.ordenes ?? []).find(openInstallOrder) ?? null, [selectedService?.ordenes]);
  const contractSigned = signed(selectedContract);
  const activePlans = plans.filter((plan) => plan.activo !== false);
  const today = dateInputValue(new Date());
  const latestDate = addYearsToInputDate(today, 1);

  useEffect(() => {
    if (!selectedContract) return;
    const service = contractServices.find((item) => item.idServicio === selectedServiceId) ?? contractServices[0] ?? null;
    setSelectedServiceId(service?.idServicio ?? null);
    setServiceForm({
      ...emptyServiceForm(),
      tipoServicio: service?.tipoServicio ?? 'Internet',
      idZonaPago: selectedContract.idZonaPago ? String(selectedContract.idZonaPago) : '',
    });
  }, [selectedContract?.idContrato, contractServices.length]);

  useEffect(() => {
    if (!selectedService) return;
    const data = selectedService.datosTecnicos ?? {};
    setTechnicalForm({
      tipoServicio: selectedService.tipoServicio,
      estadoOperativo: selectedService.estadoOperativo,
      idZonaPago: selectedService.idZonaPago ? String(selectedService.idZonaPago) : '',
      observaciones: selectedService.observaciones ?? '',
      tecnologia: String(data.tecnologia ?? ''), velocidad: String(data.velocidad ?? data.velocidadMbps ?? ''),
      macAddress: String(data.macAddress ?? ''), puertoOlt: String(data.puertoOlt ?? ''), ipAsignada: String(data.ipAsignada ?? ''),
      cajaNap: String(data.cajaNap ?? ''), numeroPoste: String(data.numeroPoste ?? ''), caracteristicasComerciales: String(data.caracteristicasComerciales ?? ''),
    });
  }, [selectedService?.idServicio]);

  function updateContract(next: CustomerContract) {
    setContracts((current) => current.map((contract) => contract.idContrato === next.idContrato ? { ...contract, ...next } : contract));
  }

  function openContract(contract: CustomerContract) {
    const service = services.find((item) => item.idContrato === contract.idContrato) ?? null;
    setSelectedContractId(contract.idContrato);
    setSelectedServiceId(service?.idServicio ?? null);
    setStage(1);
    setTab('summary');
    setMessage('');
    setChangePlanOpen(false);
    setCreateServiceOpen(false);
    setTechnicalOpen(false);
    setEquipmentOpen(false);
    setInstallOpen(false);
  }

  function selectStage(next: Stage) {
    if (next === 2 && !contractSigned) return setMessage('Debes confirmar la firma del contrato antes de continuar.');
    if (next === 3 && !selectedService) return setMessage('Debes crear un servicio antes de continuar a operación técnica.');
    setStage(next);
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    if (!newPlanId) return setMessage('Selecciona el plan para la nueva contratación.');
    try {
      const { data } = await api.post<CustomerContract>('/contracts', { idCliente: customer.idCliente, idPlan: Number(newPlanId), observacion: newContractObservation.trim() || undefined });
      setContracts((current) => [data, ...current]);
      setAddPlanOpen(false);
      setNewPlanId('');
      setNewContractObservation('');
      openContract(data);
      setMessage('Nueva contratación creada. No tiene servicio ni OT hasta confirmar la firma.');
      await onRefresh();
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function confirmSignature() {
    if (!selectedContract) return;
    try {
      const { data } = await api.patch<CustomerContract>(`/contracts/${selectedContract.idContrato}/confirm-signature`, { observacion: signatureObservation.trim() || undefined });
      updateContract(data);
      setSignatureObservation('');
      setStage(2);
      setMessage('Firma confirmada manualmente. Ya puedes preparar el servicio.');
      await onRefresh();
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function savePlanChange(event: FormEvent) {
    event.preventDefault();
    if (!selectedContract || !changePlan.newPlanId || !changePlan.motivo.trim()) return setMessage('Completa plan, fecha y motivo.');
    try {
      const { data } = await api.post<CustomerContract>(`/contracts/${selectedContract.idContrato}/change-plan`, { newPlanId: Number(changePlan.newPlanId), fechaEfectiva: changePlan.fechaEfectiva, motivo: changePlan.motivo.trim(), observaciones: changePlan.observaciones.trim() || undefined });
      updateContract(data);
      setChangePlan({ newPlanId: '', fechaEfectiva: dateInputValue(new Date()), motivo: '', observaciones: '' });
      setChangePlanOpen(false);
      setMessage('Cambio de plan registrado.');
      await onRefresh(selectedService?.idServicio);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function createService(event: FormEvent) {
    event.preventDefault();
    if (!selectedContract) return;
    try {
      const { data } = await api.post<CustomerService>('/services', { idCliente: customer.idCliente, idContrato: selectedContract.idContrato, idZonaPago: serviceForm.idZonaPago ? Number(serviceForm.idZonaPago) : undefined, tipoServicio: serviceForm.tipoServicio, estadoOperativo: 'Pendiente Instalacion', observaciones: serviceForm.observaciones.trim() || undefined, caracteristicasComerciales: serviceForm.caracteristicasComerciales.trim() || undefined });
      setSelectedServiceId(data.idServicio);
      setCreateServiceOpen(false);
      setMessage('Servicio creado en estado Pendiente Instalación.');
      await onRefresh(data.idServicio);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function saveTechnicalProfile(event: FormEvent) {
    event.preventDefault();
    if (!selectedService) return;
    try {
      await api.patch(`/services/${selectedService.idServicio}`, { ...technicalForm, idZonaPago: technicalForm.idZonaPago ? Number(technicalForm.idZonaPago) : undefined });
      setTechnicalOpen(false);
      setMessage('Perfil técnico actualizado.');
      await onRefresh(selectedService.idServicio);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function attachEquipment(event: FormEvent) {
    event.preventDefault();
    if (!selectedService || !equipmentForm.numeroSerie.trim()) return setMessage('Ingresa el número de serie del equipo.');
    try {
      await api.post(`/services/${selectedService.idServicio}/equipment`, { ...equipmentForm, numeroSerie: equipmentForm.numeroSerie.trim(), valorArriendoMensual: equipmentForm.valorArriendoMensual ? Number(equipmentForm.valorArriendoMensual) : undefined, fechaInicioAsignacion: equipmentForm.fechaInicioAsignacion || undefined });
      setEquipmentForm(emptyEquipmentForm());
      setEquipmentOpen(false);
      setMessage('Equipo asociado al servicio.');
      await onRefresh(selectedService.idServicio);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function checkAvailability() {
    if (!selectedService || !installForm.tipoConexion || !installForm.fechaProgramada || !installForm.horaVisita) return setMessage('Completa tipo de conexión, fecha y hora.');
    try {
      const { data } = await api.get<InstallAvailability>(`/services/${selectedService.idServicio}/install-availability`, { params: { fechaProgramada: installForm.fechaProgramada, horaVisita: installForm.horaVisita } });
      setAvailability(data);
      setTechnicianId(data.tecnicosDisponibles[0] ? String(data.tecnicosDisponibles[0].idTecnico) : '');
      setMessage(data.mensaje);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function createInstallOrder() {
    if (!selectedService || !technicianId) return setMessage('Verifica la disponibilidad y selecciona un técnico.');
    try {
      const { data } = await api.post<{ orden: { codigoSeguimiento: string | null; tecnico: { nombreCompleto: string } } }>(`/services/${selectedService.idServicio}/install-order`, { ...installForm, idTecnico: Number(technicianId) });
      setInstallOpen(false);
      setInstallForm(emptyInstallForm());
      setMessage(`Orden ${data.orden.codigoSeguimiento ?? 'de instalación'} creada y asignada a ${data.orden.tecnico.nombreCompleto}.`);
      await onRefresh(selectedService.idServicio);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  async function loadHistory() {
    if (!selectedService) return;
    try {
      const { data } = await api.get<CustomerService & { auditoria?: Array<{ idLog: string; accion: string; fechaHora: string | null }> }>(`/services/${selectedService.idServicio}`);
      setHistory(data.auditoria ?? []);
    } catch (err) { setMessage(apiErrorMessage(err)); }
  }

  return <>
    <section className="workflow-panel customer-contracts-section">
      <header className="section-heading compact-heading">
        <div><h3>Contratos y servicios</h3><p>Gestiona cada contratación por etapa. Un contrato puede existir sin servicio.</p></div>
        {permissions.manageContracts && <button type="button" className="secondary compact" onClick={() => setAddPlanOpen(true)}><Plus size={15} /> Añadir plan</button>}
      </header>
      <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Empresa</th><th>Contrato</th><th>Servicio</th><th>Dirección</th><th>Acción</th></tr></thead><tbody>
        {contracts.map((contract) => {
          const service = services.find((item) => item.idContrato === contract.idContrato) ?? null;
          return <tr key={contract.idContrato}><td>{contract.plan?.nombreComercial ?? 'Sin plan asociado'}</td><td>{companyName(contract, customer)}</td><td><StatusBadge value={contract.estado ?? 'Pendiente firma contrato'} /></td><td>{service ? `${service.tipoServicio} - ${formatWorkOrderValue(service.estadoOperativo)}` : 'Sin servicio creado'}</td><td>{serviceAddress(service, customer)}</td><td><button type="button" className="secondary compact" onClick={() => openContract(contract)}>Gestionar <ChevronRight size={14} /></button></td></tr>;
        })}
      </tbody></table></div>
      {!contracts.length && <p className="empty-state">Este cliente aún no tiene contrataciones registradas.</p>}
    </section>

    <Modal title="Añadir plan" open={addPlanOpen} onClose={() => setAddPlanOpen(false)}>
      <form className="workflow-panel" onSubmit={addPlan}>
        <p>Se creará una contratación pendiente de firma. No se modifica ningún servicio ni se genera una OT.</p>
        <label>Nuevo plan<select required value={newPlanId} onChange={(event) => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
        <label>Observación<textarea value={newContractObservation} onChange={(event) => setNewContractObservation(event.target.value)} placeholder="Opcional" /></label>
        <div className="button-row"><button type="button" className="secondary" onClick={() => setAddPlanOpen(false)}>Cancelar</button><button type="submit">Crear contratación</button></div>
      </form>
    </Modal>

    <Modal title="Gestionar contratación" open={Boolean(selectedContract)} onClose={() => setSelectedContractId(null)}>
      {selectedContract && <div className="customer-contract-workflow">
        <div className="customer-workflow-steps">
          {([1, 2, 3] as Stage[]).map((item) => {
            const locked = (item === 2 && !contractSigned) || (item === 3 && !selectedService);
            const label = item === 1 ? 'Contrato y plan' : item === 2 ? 'Servicio e instalación' : 'Operación técnica';
            return <button type="button" key={item} className={`customer-workflow-step ${stage === item ? 'active' : ''} ${locked ? 'blocked' : ''}`} onClick={() => selectStage(item)}><span>{item === 1 && contractSigned ? <CircleCheckBig size={16} /> : item}</span>{label}</button>;
          })}
        </div>
        {message && <p className="inline-status">{message}</p>}
        {stage === 1 && <section className="workflow-panel"><header className="section-heading compact-heading"><div><h3>1. Contrato y plan</h3><p>La firma se confirma manualmente; no se integra Facturación.cl en esta etapa.</p></div><StatusBadge value={selectedContract.estado ?? 'Pendiente firma contrato'} /></header><div className="history-grid"><HistoryBox title="Plan" value={selectedContract.plan?.nombreComercial ?? '-'} /><HistoryBox title="Empresa" value={companyName(selectedContract, customer)} /><HistoryBox title="Velocidad" value={selectedContract.plan?.velocidadMbps ? `${selectedContract.plan.velocidadMbps} Mbps` : '-'} /><HistoryBox title="Precio" value={selectedContract.plan?.precioMensual ? `$${Number(selectedContract.plan.precioMensual).toLocaleString('es-CL')}` : '-'} /><HistoryBox title="Fecha contratación" value={selectedContract.fechaInicio ? formatDateOnly(selectedContract.fechaInicio) : '-'} /><HistoryBox title="Dirección" value={serviceAddress(selectedService, customer)} /></div>
          {!contractSigned ? <div className="customer-stage-action"><strong>Contrato pendiente de firma</strong><p>Confirma la firma antes de crear el servicio.</p><label>Observación de firma<textarea value={signatureObservation} onChange={(event) => setSignatureObservation(event.target.value)} /></label>{permissions.manageContracts && <button type="button" onClick={() => void confirmSignature()}>Confirmar firma de contrato</button>}</div> : <p className="inline-status">Contrato firmado. La siguiente etapa está disponible.</p>}
          {permissions.changeCustomerPlan && <><button type="button" className="secondary compact" onClick={() => setChangePlanOpen((open) => !open)}>Cambiar plan</button>{changePlanOpen && <form className="workflow-grid" onSubmit={savePlanChange}><label>Nuevo plan<select required value={changePlan.newPlanId} onChange={(event) => setChangePlan({ ...changePlan, newPlanId: event.target.value })}><option value="">Seleccionar plan</option>{activePlans.filter((plan) => !selectedContract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === selectedContract.idEmpresa).map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial}</option>)}</select></label><label>Fecha efectiva<input type="date" required value={changePlan.fechaEfectiva} onChange={(event) => setChangePlan({ ...changePlan, fechaEfectiva: event.target.value })} /></label><label>Motivo<input required value={changePlan.motivo} onChange={(event) => setChangePlan({ ...changePlan, motivo: event.target.value })} /></label><label>Observación<textarea value={changePlan.observaciones} onChange={(event) => setChangePlan({ ...changePlan, observaciones: event.target.value })} /></label><button type="submit">Guardar cambio</button></form>}</>}</section>}
        {stage === 2 && <section className="workflow-panel"><h3>2. Servicio e instalación</h3>{!contractSigned ? <p className="empty-state">Debes confirmar la firma del contrato antes de continuar.</p> : !selectedService ? <><p>Este contrato firmado aún no tiene servicio. El nuevo servicio iniciará como Pendiente Instalación.</p>{permissions.manageServices && <button type="button" onClick={() => setCreateServiceOpen((open) => !open)}>{createServiceOpen ? 'Cancelar' : 'Crear servicio'}</button>}{createServiceOpen && <form className="workflow-grid" onSubmit={createService}><label>Tipo de servicio<select value={serviceForm.tipoServicio} onChange={(event) => setServiceForm({ ...serviceForm, tipoServicio: event.target.value })}>{serviceTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Zona de pago<select value={serviceForm.idZonaPago} onChange={(event) => setServiceForm({ ...serviceForm, idZonaPago: event.target.value })}><option value="">Sin zona</option>{paymentZones.filter((zone) => !zone.idEmpresa || zone.idEmpresa === selectedContract.idEmpresa).map((zone) => <option key={zone.idZonaPago} value={zone.idZonaPago}>{zone.nombreZona}</option>)}</select></label><label>Características comerciales<textarea value={serviceForm.caracteristicasComerciales} onChange={(event) => setServiceForm({ ...serviceForm, caracteristicasComerciales: event.target.value })} /></label><label>Observaciones<textarea value={serviceForm.observaciones} onChange={(event) => setServiceForm({ ...serviceForm, observaciones: event.target.value })} /></label><button type="submit">Registrar servicio pendiente</button></form>}</> : <><div className="history-grid"><HistoryBox title="Servicio" value={selectedService.tipoServicio} /><HistoryBox title="Estado" value={formatWorkOrderValue(selectedService.estadoOperativo)} /><HistoryBox title="Dirección" value={serviceAddress(selectedService, customer)} /><HistoryBox title="Zona" value={selectedService.zonaPago?.nombreZona ?? 'Sin zona'} /></div>{pendingOrder ? <p className="inline-status">OT pendiente: {orderCode(pendingOrder)}. El cierre técnico se realiza desde Órdenes de Trabajo.</p> : pendingInstall(selectedService) ? <>{permissions.createInstallOrders && <button type="button" onClick={() => setInstallOpen((open) => !open)}>{installOpen ? 'Ocultar agenda' : 'Generar orden de instalación'}</button>}{installOpen && <div className="workflow-grid"><label>Tipo de conexión<input value={installForm.tipoConexion} onChange={(event) => setInstallForm({ ...installForm, tipoConexion: event.target.value })} /></label><label>Fecha<input type="date" min={today} max={latestDate} value={installForm.fechaProgramada} onChange={(event) => setInstallForm({ ...installForm, fechaProgramada: event.target.value })} /></label><label>Hora<input type="time" value={installForm.horaVisita} onChange={(event) => setInstallForm({ ...installForm, horaVisita: event.target.value })} /></label><label>Prioridad<select value={installForm.prioridad} onChange={(event) => setInstallForm({ ...installForm, prioridad: event.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></select></label><label>Observaciones<textarea value={installForm.observaciones} onChange={(event) => setInstallForm({ ...installForm, observaciones: event.target.value })} /></label><button type="button" className="secondary" onClick={() => void checkAvailability()}>Ver disponibilidad</button>{availability?.tecnicosDisponibles.length ? <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>{availability.tecnicosDisponibles.map((technician) => <option key={technician.idTecnico} value={technician.idTecnico}>{technician.nombreCompleto}</option>)}</select> : null}<button type="button" disabled={!technicianId} onClick={() => void createInstallOrder()}>Crear OT</button></div>}</> : <p className="inline-status">La instalación ya está en proceso o finalizada. Revisa la operación del servicio.</p>}</>}</section>}
        {stage === 3 && <section className="workflow-panel"><h3>3. Operación técnica</h3>{!selectedService ? <p className="empty-state">Debes crear un servicio antes de continuar.</p> : <><div className="customer-operation-tabs">{([{ id: 'summary', label: 'Resumen', icon: ClipboardList }, { id: 'technical', label: 'Datos técnicos', icon: Wrench }, { id: 'equipment', label: 'Equipos', icon: Boxes }, { id: 'tickets', label: 'Tickets / OT', icon: TicketIcon }, { id: 'history', label: 'Historial', icon: ClipboardList }] as const).map((item) => <button type="button" className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => { setTab(item.id); if (item.id === 'history') void loadHistory(); }}><item.icon size={15} />{item.label}</button>)}</div>{tab === 'summary' && <div className="history-grid"><HistoryBox title="Plan" value={selectedContract.plan?.nombreComercial ?? '-'} /><HistoryBox title="Tipo" value={selectedService.tipoServicio} /><HistoryBox title="Estado" value={formatWorkOrderValue(selectedService.estadoOperativo)} /><HistoryBox title="Equipos" value={selectedService.equipos?.length ?? 0} /><HistoryBox title="Tickets" value={selectedService.tickets?.length ?? 0} /><HistoryBox title="Órdenes" value={selectedService.ordenes?.length ?? 0} /></div>}{tab === 'technical' && <><div className="history-list"><div className="section-heading compact-heading"><h3>Datos técnicos</h3>{permissions.manageServices && <button type="button" className="secondary compact" onClick={() => setTechnicalOpen((open) => !open)}>{technicalOpen ? 'Cancelar' : 'Editar'}</button>}</div><ul>{technicalEntries(selectedService.datosTecnicos).map((entry) => <li key={entry}>{entry}</li>)}{!technicalEntries(selectedService.datosTecnicos).length && <li>Sin datos técnicos registrados.</li>}</ul></div>{technicalOpen && <form className="workflow-grid" onSubmit={saveTechnicalProfile}><label>Tipo<select value={technicalForm.tipoServicio} onChange={(event) => setTechnicalForm({ ...technicalForm, tipoServicio: event.target.value })}>{serviceTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Estado<select value={technicalForm.estadoOperativo} onChange={(event) => setTechnicalForm({ ...technicalForm, estadoOperativo: event.target.value })}>{serviceStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Tecnología<input value={technicalForm.tecnologia} onChange={(event) => setTechnicalForm({ ...technicalForm, tecnologia: event.target.value })} /></label><label>Velocidad<input value={technicalForm.velocidad} onChange={(event) => setTechnicalForm({ ...technicalForm, velocidad: event.target.value })} /></label><label>MAC<input value={technicalForm.macAddress} onChange={(event) => setTechnicalForm({ ...technicalForm, macAddress: event.target.value })} /></label><label>Puerto OLT<input value={technicalForm.puertoOlt} onChange={(event) => setTechnicalForm({ ...technicalForm, puertoOlt: event.target.value })} /></label><label>IP<input value={technicalForm.ipAsignada} onChange={(event) => setTechnicalForm({ ...technicalForm, ipAsignada: event.target.value })} /></label><label>NAP<input value={technicalForm.cajaNap} onChange={(event) => setTechnicalForm({ ...technicalForm, cajaNap: event.target.value })} /></label><label>Poste<input value={technicalForm.numeroPoste} onChange={(event) => setTechnicalForm({ ...technicalForm, numeroPoste: event.target.value })} /></label><label>Observaciones<textarea value={technicalForm.observaciones} onChange={(event) => setTechnicalForm({ ...technicalForm, observaciones: event.target.value })} /></label><button type="submit">Guardar perfil técnico</button></form>}</>}{tab === 'equipment' && <><div className="history-list"><div className="section-heading compact-heading"><h3>Equipos instalados</h3>{permissions.installEquipment && <button type="button" className="secondary compact" onClick={() => setEquipmentOpen((open) => !open)}>{equipmentOpen ? 'Cancelar' : '+ Asociar equipo'}</button>}</div><ul>{(selectedService.equipos ?? []).map((unit) => <li key={unit.idUnidad}>{unit.numeroSerie} · {unit.modelo ?? 'Sin modelo'} · {unit.modalidadAsignacion ?? 'Sin modalidad'} · {unit.estado}</li>)}{!selectedService.equipos?.length && <li>Sin equipos asociados.</li>}</ul></div>{equipmentOpen && <form className="workflow-grid" onSubmit={attachEquipment}><label>Serie<input required value={equipmentForm.numeroSerie} onChange={(event) => setEquipmentForm({ ...equipmentForm, numeroSerie: event.target.value })} /></label><label>Modelo<input value={equipmentForm.modelo} onChange={(event) => setEquipmentForm({ ...equipmentForm, modelo: event.target.value })} /></label><label>MAC<input value={equipmentForm.macAddress} onChange={(event) => setEquipmentForm({ ...equipmentForm, macAddress: event.target.value })} /></label><label>Puerto OLT<input value={equipmentForm.puertoOlt} onChange={(event) => setEquipmentForm({ ...equipmentForm, puertoOlt: event.target.value })} /></label><label>Modalidad<select value={equipmentForm.modalidadAsignacion} onChange={(event) => setEquipmentForm({ ...equipmentForm, modalidadAsignacion: event.target.value })}>{equipmentModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label><label>Valor arriendo<input type="number" min="0" value={equipmentForm.valorArriendoMensual} onChange={(event) => setEquipmentForm({ ...equipmentForm, valorArriendoMensual: event.target.value })} /></label><label>Observaciones<textarea value={equipmentForm.observaciones} onChange={(event) => setEquipmentForm({ ...equipmentForm, observaciones: event.target.value })} /></label><button type="submit">Asociar equipo</button></form>}</>}{tab === 'tickets' && <div className="customer-operation-columns"><div className="history-list"><h3>Tickets</h3><ul>{(selectedService.tickets ?? []).map((ticket) => <li key={ticket.idTicket}>{ticket.codigoSeguimiento ?? `Ticket #${ticket.idTicket}`} · {formatWorkOrderValue(ticket.estado)}</li>)}{!selectedService.tickets?.length && <li>Sin tickets asociados.</li>}</ul></div><div className="history-list"><h3>Órdenes de trabajo</h3><ul>{(selectedService.ordenes ?? []).map((order) => <li key={order.idOt}>{order.codigoSeguimiento ?? `OT #${order.idOt}`} · {formatWorkOrderValue(order.estado)}</li>)}{!selectedService.ordenes?.length && <li>Sin órdenes asociadas.</li>}</ul></div></div>}{tab === 'history' && <div className="history-list"><div className="section-heading compact-heading"><h3>Historial del servicio</h3><div className="button-row"><button type="button" className="secondary compact" onClick={() => void loadHistory()}>Actualizar</button>{permissions.manageObservations && <button type="button" className="secondary compact" onClick={() => onOpenObservations({ tipoEntidad: 'Servicio', idEntidad: selectedService.idServicio, idCliente: customer.idCliente, idEmpresa: selectedService.idEmpresa, label: `Servicio ${selectedService.idServicio}` })}>Observaciones</button>}</div></div><ul>{history.map((entry) => <li key={entry.idLog}>{entry.accion} {entry.fechaHora ? `· ${new Date(entry.fechaHora).toLocaleString('es-CL')}` : ''}</li>)}{!history.length && <li>Sin movimientos específicos registrados.</li>}</ul></div>}</>}</section>}
      </div>}
    </Modal>
  </>;
}
