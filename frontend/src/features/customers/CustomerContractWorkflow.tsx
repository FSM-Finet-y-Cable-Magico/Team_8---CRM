import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleCheckBig, Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerService, InstallAvailability, Plan } from '../../api';
import { addYearsToInputDate, dateInputValue, formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { CustomerServiceManagementModal } from './CustomerServiceManagementModal';
import './customer-contract-workflow.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];
type Stage = 1 | 2;
type WorkOrder = NonNullable<CustomerService['ordenes']>[number];

const CLOSED_INSTALL_ORDER_STATES = ['completada', 'cancelada'];

function emptyInstallForm() {
  return { fechaProgramada: '', horaVisita: '', prioridad: 'Media', observaciones: '' };
}

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

function isManagedService(service?: CustomerService | null) {
  return ['activo', 'suspendido', 'baja'].includes(normalize(service?.estadoOperativo));
}

function openInstallOrder(order: WorkOrder) {
  return normalize(order.tipoOt) === 'instalacion' && !CLOSED_INSTALL_ORDER_STATES.includes(normalize(order.estado));
}

function orderCode(order?: WorkOrder | null) {
  return order?.codigoSeguimiento?.trim() || (order ? 'OT-INS-' + String(order.idOt).padStart(6, '0') : '-');
}

function customerAddress(customer: Customer) {
  const technicalAddress = customer.datosTecnicos?.direccion;
  if (typeof technicalAddress === 'string' && technicalAddress.trim()) return technicalAddress.trim();
  const primaryAddress = customer.direcciones?.find((address) => address.esPrincipal && address.direccionCompleta?.trim())
    ?? customer.direcciones?.find((address) => address.direccionCompleta?.trim());
  return primaryAddress?.direccionCompleta.trim() ?? 'No registrada';
}

function serviceAddress(service: CustomerService | null, customer: Customer) {
  return service?.direccion?.direccionCompleta?.trim() || customerAddress(customer);
}

function companyName(contract: CustomerContract, customer: Customer) {
  return contract.plan?.empresa?.nombre ?? customer.empresa?.nombre ?? customer.empresas?.[0] ?? '-';
}

function formatCurrency(value?: string | number | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? '$' + amount.toLocaleString('es-CL') : '-';
}

function connectionTypeForService(service: CustomerService) {
  return normalize(service.tipoServicio).includes('television') && !normalize(service.tipoServicio).includes('internet')
    ? 'Television'
    : 'Fibra Optica';
}

export function CustomerContractWorkflow({
  customer,
  services,
  plans,
  permissions,
  onRefresh,
  onOpenObservations,
}: {
  customer: Customer;
  services: CustomerService[];
  plans: Plan[];
  permissions: DashboardPermissions;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
  onOpenObservations: (target: {
    tipoEntidad: string;
    idEntidad: number;
    label: string;
    idCliente?: number;
    idEmpresa?: number | null;
  }) => void;
}) {
  const [contracts, setContracts] = useState<CustomerContract[]>(customer.contratos ?? []);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [newContractObservation, setNewContractObservation] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>(1);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureObservation, setSignatureObservation] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [installForm, setInstallForm] = useState(emptyInstallForm());
  const [availability, setAvailability] = useState<InstallAvailability | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const { message, showMessage, clearMessage } = useTransientMessage();

  useEffect(() => setContracts(customer.contratos ?? []), [customer.contratos]);

  const selectedContract = contracts.find((contract) => contract.idContrato === selectedContractId) ?? null;
  const contractServices = selectedContract ? services.filter((service) => service.idContrato === selectedContract.idContrato) : [];
  const selectedService = contractServices.find((service) => service.idServicio === selectedServiceId) ?? contractServices[0] ?? null;
  const activeService = services.find((service) => service.idServicio === activeServiceId) ?? null;
  const activeServiceContract = activeService
    ? contracts.find((contract) => contract.idContrato === activeService.idContrato) ?? null
    : null;
  const pendingOrder = useMemo(
    () => (selectedService?.ordenes ?? []).find(openInstallOrder) ?? null,
    [selectedService?.ordenes],
  );
  const contractSigned = signed(selectedContract);
  const activePlans = plans.filter((plan) => plan.activo !== false);
  const today = dateInputValue(new Date());
  const latestDate = addYearsToInputDate(today, 1);

  useEffect(() => {
    if (!selectedContract) return;
    const nextService = contractServices.find((service) => service.idServicio === selectedServiceId) ?? contractServices[0] ?? null;
    setSelectedServiceId(nextService?.idServicio ?? null);
  }, [selectedContract?.idContrato, contractServices.length, selectedServiceId]);

  function updateContract(next: CustomerContract) {
    setContracts((current) => current.map((contract) =>
      contract.idContrato === next.idContrato ? { ...contract, ...next } : contract,
    ));
  }

  function closeContractManagement() {
    setSelectedContractId(null);
    setSelectedServiceId(null);
    setSignatureOpen(false);
    setInstallOpen(false);
    setAvailability(null);
    setTechnicianId('');
  }

  function openContract(contract: CustomerContract) {
    const service = services.find((item) => item.idContrato === contract.idContrato) ?? null;
    if (isManagedService(service)) {
      setActiveServiceId(service?.idServicio ?? null);
      return;
    }
    setSelectedContractId(contract.idContrato);
    setSelectedServiceId(service?.idServicio ?? null);
    setStage(1);
    setSignatureOpen(false);
    setSignatureObservation('');
    setInstallOpen(false);
    setInstallForm(emptyInstallForm());
    setAvailability(null);
    setTechnicianId('');
    clearMessage();
  }

  function selectStage(nextStage: Stage) {
    if (nextStage === 2 && !contractSigned) return;
    setStage(nextStage);
    setSignatureOpen(false);
    setInstallOpen(false);
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    if (!newPlanId) {
      showMessage('Selecciona el plan para la nueva contratación.');
      return;
    }
    try {
      const { data } = await api.post<CustomerContract>('/contracts', {
        idCliente: customer.idCliente,
        idPlan: Number(newPlanId),
        observacion: newContractObservation.trim() || undefined,
      });
      setContracts((current) => [data, ...current]);
      setAddPlanOpen(false);
      setNewPlanId('');
      setNewContractObservation('');
      await onRefresh();
      openContract(data);
      showMessage('Contratación creada.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  async function confirmSignature(event: FormEvent) {
    event.preventDefault();
    if (!selectedContract) return;
    try {
      const { data } = await api.patch<CustomerContract>(
        '/contracts/' + selectedContract.idContrato + '/confirm-signature',
        { observacion: signatureObservation.trim() || undefined },
      );
      updateContract(data);
      setSignatureOpen(false);
      setSignatureObservation('');
      await onRefresh();
      setStage(2);
      showMessage('Firma confirmada.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  async function prepareInstallation() {
    if (!selectedContract) return;
    try {
      const { data } = await api.post<CustomerService>(
        '/contracts/' + selectedContract.idContrato + '/prepare-installation',
      );
      await onRefresh(data.idServicio);
      setSelectedServiceId(data.idServicio);
      showMessage('Servicio pendiente de instalación preparado.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  function updateInstallSchedule(field: 'fechaProgramada' | 'horaVisita', value: string) {
    setInstallForm((current) => ({ ...current, [field]: value }));
    setAvailability(null);
    setTechnicianId('');
  }

  async function checkAvailability() {
    if (!selectedService || !installForm.fechaProgramada || !installForm.horaVisita) {
      showMessage('Completa fecha y hora para consultar disponibilidad.');
      return;
    }
    try {
      const { data } = await api.get<InstallAvailability>(
        '/services/' + selectedService.idServicio + '/install-availability',
        { params: { fechaProgramada: installForm.fechaProgramada, horaVisita: installForm.horaVisita } },
      );
      setAvailability(data);
      setTechnicianId(data.tecnicosDisponibles[0] ? String(data.tecnicosDisponibles[0].idTecnico) : '');
      showMessage(data.mensaje);
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  async function createInstallOrder() {
    if (!selectedService || !technicianId) {
      showMessage('Verifica la disponibilidad y selecciona un técnico.');
      return;
    }
    try {
      const { data } = await api.post<{ orden: { codigoSeguimiento: string | null; tecnico: { nombreCompleto: string } } }>(
        '/services/' + selectedService.idServicio + '/install-order',
        {
          ...installForm,
          tipoConexion: connectionTypeForService(selectedService),
          idTecnico: Number(technicianId),
        },
      );
      await onRefresh(selectedService.idServicio);
      showMessage(
        'Orden ' + (data.orden.codigoSeguimiento ?? 'de instalación') +
        ' creada y asignada a ' + data.orden.tecnico.nombreCompleto + '.',
      );
      closeContractManagement();
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  return (
    <>
      <section className="workflow-panel customer-contracts-section">
        <header className="section-heading compact-heading">
          <div><h3>Contratos y servicios</h3><p>Consulta el estado de cada contratación y servicio.</p></div>
          {permissions.manageContracts && <button type="button" className="secondary compact" onClick={() => setAddPlanOpen(true)}><Plus size={15} /> Añadir plan</button>}
        </header>
        {message && <p className="inline-status customer-transient-status">{message}</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Empresa</th><th>Contrato</th><th>Servicio</th><th>Dirección</th><th>Acción</th></tr></thead>
            <tbody>
              {contracts.map((contract) => {
                const service = services.find((item) => item.idContrato === contract.idContrato) ?? null;
                return <tr key={contract.idContrato}>
                  <td>{contract.plan?.nombreComercial ?? 'Sin plan asociado'}</td>
                  <td>{companyName(contract, customer)}</td>
                  <td><StatusBadge value={contract.estado ?? 'Pendiente firma contrato'} /></td>
                  <td>{service ? service.tipoServicio + ' - ' + formatWorkOrderValue(service.estadoOperativo) : 'Pendiente de firma'}</td>
                  <td>{serviceAddress(service, customer)}</td>
                  <td><button type="button" className="secondary compact" onClick={() => openContract(contract)}>Gestionar <ChevronRight size={14} /></button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!contracts.length && <p className="empty-state">Este cliente aún no tiene contrataciones registradas.</p>}
      </section>

      <Modal title="Añadir plan" open={addPlanOpen} onClose={() => setAddPlanOpen(false)}>
        <form className="workflow-panel" onSubmit={addPlan}>
          <label>Nuevo plan<select required value={newPlanId} onChange={(event) => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
          <label>Observaciones<textarea value={newContractObservation} onChange={(event) => setNewContractObservation(event.target.value)} /></label>
          <div className="button-row"><button type="button" className="secondary" onClick={() => setAddPlanOpen(false)}>Cancelar</button><button type="submit">Crear contratación</button></div>
        </form>
      </Modal>

      <Modal title="Gestionar contratación" open={Boolean(selectedContract)} onClose={closeContractManagement}>
        {selectedContract && <div className="customer-contract-workflow">
          <div className="customer-workflow-steps">
            {([1, 2] as Stage[]).map((item) => {
              const locked = item === 2 && !contractSigned;
              const label = item === 1 ? 'Contrato y plan' : 'Instalación';
              return <button type="button" key={item} disabled={locked} className={'customer-workflow-step ' + (stage === item ? 'active' : '') + (locked ? ' blocked' : '')} onClick={() => selectStage(item)}><span>{item === 1 && contractSigned ? <CircleCheckBig size={16} /> : item}</span>{label}</button>;
            })}
          </div>

          {stage === 1 && <section className="workflow-panel customer-contract-stage">
            <header className="section-heading compact-heading"><h3>Contrato y plan</h3><StatusBadge value={selectedContract.estado ?? 'Pendiente firma contrato'} /></header>
            <dl className="customer-readonly-details">
              <div><dt>Plan</dt><dd>{selectedContract.plan?.nombreComercial ?? '-'}</dd></div>
              <div><dt>Empresa</dt><dd>{companyName(selectedContract, customer)}</dd></div>
              <div><dt>Velocidad</dt><dd>{selectedContract.plan?.velocidadMbps ? selectedContract.plan.velocidadMbps + ' Mbps' : '-'}</dd></div>
              <div><dt>Precio mensual</dt><dd>{formatCurrency(selectedContract.plan?.precioMensual)}</dd></div>
              <div><dt>Fecha contratación</dt><dd>{selectedContract.fechaInicio ? formatDateOnly(selectedContract.fechaInicio) : '-'}</dd></div>
              <div><dt>Dirección</dt><dd>{serviceAddress(selectedService, customer)}</dd></div>
            </dl>
            {!contractSigned && permissions.manageContracts && (signatureOpen ? <form className="workflow-grid customer-inline-form" onSubmit={confirmSignature}>
              <label className="customer-inline-form-wide">Observaciones<textarea value={signatureObservation} onChange={(event) => setSignatureObservation(event.target.value)} /></label>
              <div className="button-row"><button type="button" className="secondary" onClick={() => setSignatureOpen(false)}>Cancelar</button><button type="submit">Confirmar firma de contrato</button></div>
            </form> : <button type="button" onClick={() => setSignatureOpen(true)}>Confirmar firma de contrato</button>)}
          </section>}

          {stage === 2 && <section className="workflow-panel customer-contract-stage">
            <header className="section-heading compact-heading"><h3>Instalación</h3>{selectedService && <StatusBadge value={formatWorkOrderValue(selectedService.estadoOperativo)} />}</header>
            {selectedService ? <>
              <dl className="customer-readonly-details">
                <div><dt>Plan</dt><dd>{selectedContract.plan?.nombreComercial ?? '-'}</dd></div>
                <div><dt>Servicio</dt><dd>{selectedService.tipoServicio}</dd></div>
                <div><dt>Dirección</dt><dd>{serviceAddress(selectedService, customer)}</dd></div>
                <div><dt>Zona</dt><dd>{selectedService.zonaPago?.nombreZona ?? 'Sin zona'}</dd></div>
              </dl>
              {pendingOrder ? <dl className="customer-readonly-details customer-installation-order">
                <div><dt>Orden de trabajo</dt><dd>{orderCode(pendingOrder)}</dd></div>
                <div><dt>Estado</dt><dd>{formatWorkOrderValue(pendingOrder.estado)}</dd></div>
                <div><dt>Visita</dt><dd>{pendingOrder.fechaProgramada ? formatDateOnly(pendingOrder.fechaProgramada) : 'Sin fecha'} {pendingOrder.horaVisita ?? ''}</dd></div>
                <div><dt>Técnico</dt><dd>{pendingOrder.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd></div>
              </dl> : pendingInstall(selectedService) && permissions.createInstallOrders ? <>
                <button type="button" onClick={() => setInstallOpen((current) => !current)}>{installOpen ? 'Cancelar agenda' : 'Generar orden de instalación'}</button>
                {installOpen && <div className="workflow-grid customer-install-schedule">
                  <label>Fecha instalación<input type="date" min={today} max={latestDate} value={installForm.fechaProgramada} onChange={(event) => updateInstallSchedule('fechaProgramada', event.target.value)} /></label>
                  <label>Hora visita<input type="time" value={installForm.horaVisita} onChange={(event) => updateInstallSchedule('horaVisita', event.target.value)} /></label>
                  <button type="button" className="availability-button" onClick={() => void checkAvailability()}>Ver disponibilidad</button>
                  <label>Prioridad<select value={installForm.prioridad} onChange={(event) => setInstallForm({ ...installForm, prioridad: event.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
                  <label className="customer-inline-form-wide">Observaciones<textarea value={installForm.observaciones} onChange={(event) => setInstallForm({ ...installForm, observaciones: event.target.value })} /></label>
                  {availability?.tecnicosDisponibles.length ? <label>Técnico asignado<select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>{availability.tecnicosDisponibles.map((technician) => <option key={technician.idTecnico} value={technician.idTecnico}>{technician.nombreCompleto}</option>)}</select></label> : null}
                  <div className="button-row"><button type="button" disabled={!technicianId} onClick={() => void createInstallOrder()}>Crear OT de instalación</button></div>
                </div>}
              </> : null}
            </> : permissions.manageServices && <button type="button" onClick={() => void prepareInstallation()}>Preparar instalación</button>}
          </section>}
        </div>}
      </Modal>

      {activeService && activeServiceContract && <CustomerServiceManagementModal
        open={Boolean(activeService)}
        customer={customer}
        contract={activeServiceContract}
        service={activeService}
        plans={plans}
        permissions={permissions}
        onClose={() => setActiveServiceId(null)}
        onRefresh={onRefresh}
        onOpenObservations={onOpenObservations}
      />}
    </>
  );
}
