import { FormEvent, useEffect, useState } from 'react';
import { ChevronRight, CircleCheckBig, Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerService, PaymentZone, Plan } from '../../api';
import { formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { G3InstallationStatus } from '../installations/G3InstallationStatus';
import { CustomerServiceManagementModal } from './CustomerServiceManagementModal';
import { ContractDocuments } from './ContractDocuments';
import './customer-contract-workflow.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];
type Stage = 1 | 2;

function normalize(value?: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function signed(contract?: CustomerContract | null) {
  return ['firmado', 'activo', 'suspendido', 'moroso'].includes(normalize(contract?.estado));
}

function isManagedService(service?: CustomerService | null) {
  return ['activo', 'suspendido', 'baja'].includes(normalize(service?.estadoOperativo));
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
  const contractSigned = signed(selectedContract);
  const activePlans = plans.filter((plan) => plan.activo !== false);

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
    clearMessage();
  }

  async function selectStage(nextStage: Stage) {
    if (nextStage === 2 && !contractSigned) return;
    setStage(nextStage);
    setSignatureOpen(false);

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
      showMessage('Firma confirmada. La instalación técnica ya puede solicitarse a G3.');
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
            <header className="section-heading compact-heading"><h3>Instalación técnica</h3><span className="source-badge">Fuente G3</span></header>
            <dl className="customer-readonly-details">
              <div><dt>Plan</dt><dd>{selectedContract.plan?.nombreComercial ?? '-'}</dd></div>
              <div><dt>Dirección solicitada</dt><dd>{serviceAddress(selectedService, customer)}</dd></div>
              <div><dt>Responsable técnico</dt><dd>G3 FSM</dd></div>
            </dl>
            <G3InstallationStatus
              contractId={selectedContract.idContrato}
              canRequest={contractSigned && permissions.createInstallOrders}
              onChanged={() => void onRefresh(selectedService?.idServicio)}
            />
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
