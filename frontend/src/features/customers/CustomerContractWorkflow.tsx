import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleCheckBig, Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerService, InstallDayAvailability, InstallTimeSlot, PaymentZone, Plan } from '../../api';
import { addYearsToInputDate, dateInputValue, formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { InstallSchedulePicker } from '../installations/InstallSchedulePicker';
import { CustomerServiceManagementModal } from './CustomerServiceManagementModal';
import { ContractDocuments } from './ContractDocuments';
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
  const [zones, setZones] = useState<PaymentZone[]>([]);
  const [newZoneId, setNewZoneId] = useState('');
  const [creatingContract, setCreatingContract] = useState(false);
  const [newContractObservation, setNewContractObservation] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>(1);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureObservation, setSignatureObservation] = useState('');
  const [installForm, setInstallForm] = useState(emptyInstallForm());
  const [dayAvailability, setDayAvailability] = useState<InstallDayAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [preparingInstallation, setPreparingInstallation] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [technicianId, setTechnicianId] = useState('');
  const { message, showMessage, clearMessage } = useTransientMessage();

  useEffect(() => setContracts(customer.contratos ?? []), [customer.contratos]);
  useEffect(() => {
    if (!addPlanOpen) return;
    let active = true;
    api.get<PaymentZone[]>('/billing/zones').then(({ data }) => { if (active) setZones(data); }).catch(e => { if (active) showMessage(apiErrorMessage(e)); });
    return () => { active = false; };
  }, [addPlanOpen, showMessage]);

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
    setDayAvailability(null);
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
    setInstallForm(emptyInstallForm());
    setDayAvailability(null);
    setTechnicianId('');
    clearMessage();
  }

  async function selectStage(nextStage: Stage) {
    if (nextStage === 2 && !contractSigned) return;
    setStage(nextStage);
    setSignatureOpen(false);

    if (nextStage === 2 && !selectedService && selectedContract && permissions.manageServices) {
      await prepareInstallation(selectedContract.idContrato);
    }
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    if (creatingContract) return;
    if (!newPlanId) {
      showMessage('Selecciona el plan para la nueva contratación.');
      return;
    }
    setCreatingContract(true);
    try {
      const { data } = await api.post<CustomerContract>('/contracts', {
        idCliente: customer.idCliente,
        idPlan: Number(newPlanId),
        idZonaPago: newZoneId ? Number(newZoneId) : undefined,
        observacion: newContractObservation.trim() || undefined,
      });
      setContracts((current) => [data, ...current]);
      setAddPlanOpen(false);
      setNewPlanId('');
      setNewZoneId('');
      setNewContractObservation('');
      await onRefresh();
      openContract(data);
      showMessage('Contratación creada.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    } finally {
      setCreatingContract(false);
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
      setStage(2);
      const service = await prepareInstallation(data.idContrato);
      if (service) showMessage('Firma confirmada. Selecciona la fecha y el horario de instalación.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    }
  }

  async function prepareInstallation(contractId = selectedContract?.idContrato) {
    if (!contractId || preparingInstallation) return null;
    setPreparingInstallation(true);
    try {
      const { data } = await api.post<CustomerService>(
        '/contracts/' + contractId + '/prepare-installation',
      );
      await onRefresh(data.idServicio);
      setSelectedServiceId(data.idServicio);
      setInstallForm(emptyInstallForm());
      setDayAvailability(null);
      return data;
    } catch (error) {
      showMessage(apiErrorMessage(error));
      return null;
    } finally {
      setPreparingInstallation(false);
    }
  }

  async function selectInstallDate(value: string) {
    setInstallForm((current) => ({ ...current, fechaProgramada: value, horaVisita: '' }));
    setDayAvailability(null);
    setTechnicianId('');
    if (!selectedService || !value) return;
    setAvailabilityLoading(true);
    try {
      const { data } = await api.get<InstallDayAvailability>(
        '/services/' + selectedService.idServicio + '/install-day-availability',
        { params: { fechaProgramada: value } },
      );
      setDayAvailability(data);
    } catch (error) {
      showMessage(apiErrorMessage(error));
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function selectInstallTime(slot: InstallTimeSlot) {
    if (!slot.disponible) return;
    setInstallForm((current) => ({ ...current, horaVisita: slot.horaVisita }));
    setTechnicianId(slot.tecnicosDisponibles[0] ? String(slot.tecnicosDisponibles[0].idTecnico) : '');
  }

  async function cancelInstallAgenda() {
    if (!pendingOrder || cancellingOrder) return;
    if (!window.confirm('¿Deseas cancelar esta agenda de instalación? Luego podrás programar una nueva fecha.')) return;
    setCancellingOrder(true);
    try {
      await api.patch('/work-orders/' + pendingOrder.idOt + '/cancel-installation');
      await onRefresh(selectedService?.idServicio);
      setInstallForm(emptyInstallForm());
      setDayAvailability(null);
      setTechnicianId('');
      showMessage('Agenda cancelada. Ya puedes seleccionar una nueva fecha.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    } finally {
      setCancellingOrder(false);
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
          <label>Nuevo plan<select required value={newPlanId} onChange={(event) => { setNewPlanId(event.target.value); setNewZoneId(''); }}><option value="">Seleccionar plan</option>{activePlans.map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
          <label>Zona de pago<select value={newZoneId} disabled={!newPlanId} onChange={e => setNewZoneId(e.target.value)}><option value="">Sin zona (precio base, vence el día 1)</option>{zones.filter(z => z.activo !== false && (!z.idEmpresa || z.idEmpresa === activePlans.find(p => p.idPlan === Number(newPlanId))?.idEmpresa)).map(z => <option key={z.idZonaPago} value={z.idZonaPago}>{z.nombreZona} · vence el día {z.diaVencimientoSugerido ?? 1}</option>)}</select></label>
          <p>Se utilizará el precio configurado para el plan y la zona. Si no existe una regla activa, se utiliza el precio base del plan.</p>
          {message && <p role="status" className="inline-status">{message}</p>}
          <label>Observaciones<textarea value={newContractObservation} onChange={(event) => setNewContractObservation(event.target.value)} /></label>
          <div className="button-row"><button type="button" className="secondary" disabled={creatingContract} onClick={() => setAddPlanOpen(false)}>Cancelar</button><button type="submit" disabled={creatingContract}>{creatingContract ? 'Guardando…' : 'Crear contratación'}</button></div>
        </form>
      </Modal>

      <Modal title="Gestionar contratación" open={Boolean(selectedContract)} onClose={closeContractManagement}>
        {selectedContract && <div className="customer-contract-workflow">
          <div className="customer-workflow-steps">
            {([1, 2] as Stage[]).map((item) => {
              const locked = item === 2 && !contractSigned;
              const label = item === 1 ? 'Contrato y plan' : 'Instalación';
              return <button type="button" key={item} disabled={locked} className={'customer-workflow-step ' + (stage === item ? 'active' : '') + (locked ? ' blocked' : '')} onClick={() => void selectStage(item)}><span>{item === 1 && contractSigned ? <CircleCheckBig size={16} /> : item}</span>{label}</button>;
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
            {permissions.manageContracts && <ContractDocuments idContrato={selectedContract.idContrato} canGenerate={permissions.generateDigitalContract} />}
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
              {pendingOrder ? <>
                <dl className="customer-readonly-details customer-installation-order">
                  <div><dt>Orden de trabajo</dt><dd>{orderCode(pendingOrder)}</dd></div>
                  <div><dt>Estado</dt><dd>{formatWorkOrderValue(pendingOrder.estado)}</dd></div>
                  <div><dt>Visita</dt><dd>{pendingOrder.fechaProgramada ? formatDateOnly(pendingOrder.fechaProgramada) : 'Sin fecha'} {pendingOrder.horaVisita ?? ''}</dd></div>
                  <div><dt>Técnico</dt><dd>{pendingOrder.tecnico?.nombreCompleto ?? 'Sin asignar'}</dd></div>
                </dl>
                {permissions.createInstallOrders && <button type="button" className="secondary customer-cancel-agenda" disabled={cancellingOrder} onClick={() => void cancelInstallAgenda()}>{cancellingOrder ? 'Cancelando…' : 'Cancelar agenda'}</button>}
              </> : pendingInstall(selectedService) && permissions.createInstallOrders ? <div className="customer-install-schedule">
                <InstallSchedulePicker
                  date={installForm.fechaProgramada}
                  time={installForm.horaVisita}
                  min={today}
                  max={latestDate}
                  slots={dayAvailability?.horarios}
                  loading={availabilityLoading}
                  onDateChange={(value) => void selectInstallDate(value)}
                  onTimeChange={selectInstallTime}
                />
                <div className="workflow-grid customer-install-details">
                  <label>Prioridad<select value={installForm.prioridad} onChange={(event) => setInstallForm({ ...installForm, prioridad: event.target.value })}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
                  {installForm.horaVisita && <label>Técnico asignado<select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>{dayAvailability?.horarios.find((slot) => slot.horaVisita === installForm.horaVisita)?.tecnicosDisponibles.map((technician) => <option key={technician.idTecnico} value={technician.idTecnico}>{technician.nombreCompleto}</option>)}</select></label>}
                  <label className="customer-inline-form-wide">Observaciones<textarea value={installForm.observaciones} onChange={(event) => setInstallForm({ ...installForm, observaciones: event.target.value })} /></label>
                  <div className="button-row customer-inline-form-wide"><button type="button" disabled={!technicianId || !installForm.horaVisita} onClick={() => void createInstallOrder()}>Generar orden de trabajo</button></div>
                </div>
              </div> : null}
            </> : preparingInstallation
              ? <p className="inline-status">Preparando la instalación…</p>
              : permissions.manageServices && <button type="button" className="secondary" onClick={() => void prepareInstallation()}>Reintentar preparación de instalación</button>}
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
