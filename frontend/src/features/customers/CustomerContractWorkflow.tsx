import { useSignatureStatus } from '../contracts/useSignatureStatus';
import { Fragment, FormEvent, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage, Customer, CustomerService, PaymentZone, Plan } from '../../api';
import { formatDateOnly, formatWorkOrderValue } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { StatusBadge } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { G3InstallationStatus } from '../installations/G3InstallationStatus';
import { CustomerServiceActions } from './CustomerServiceActions';
import { ContractDocuments } from './ContractDocuments';
import {
  contractManagementTarget,
  serviceForContract,
  type CustomerServicesLoadState,
} from './customer-services-state';
import './customer-contract-workflow.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];

function normalize(value?: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function signed(contract?: CustomerContract | null) {
  return ['firmado', 'activo', 'suspendido', 'moroso'].includes(normalize(contract?.estado));
}

function customerAddress(customer: Customer) {
  const technicalAddress = customer.datosTecnicos?.direccion;
  if (typeof technicalAddress === 'string' && technicalAddress.trim()) return technicalAddress.trim();
  const primaryAddress = customer.direcciones?.find((address) => address.esPrincipal && address.direccionCompleta?.trim())
    ?? customer.direcciones?.find((address) => address.direccionCompleta?.trim());
  return primaryAddress?.direccionCompleta.trim() ?? 'No registrada';
}

function serviceAddress(service: CustomerService | null, contract: CustomerContract, customer: Customer) {
  return service?.direccion?.direccionCompleta?.trim() || contract.direccionInstalacion?.trim() || customerAddress(customer);
}

function companyName(contract: CustomerContract, customer: Customer) {
  return contract.plan?.empresa?.nombre ?? customer.empresa?.nombre ?? customer.empresas?.[0] ?? '-';
}

function formatCurrency(value?: string | number | null) {
  if (value == null || value === '') return 'No registrado';
  const amount = Number(value);
  return Number.isFinite(amount) ? '$' + amount.toLocaleString('es-CL') : '-';
}

export function CustomerContractWorkflow({
  customer,
  services,
  servicesLoad,
  plans,
  permissions,
  onRefresh,
}: {
  customer: Customer;
  services: CustomerService[];
  servicesLoad: CustomerServicesLoadState;
  plans: Plan[];
  permissions: DashboardPermissions;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
}) {
  const [contracts, setContracts] = useState<CustomerContract[]>(customer.contratos ?? []);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [zones, setZones] = useState<PaymentZone[]>([]);
  const [newZoneId, setNewZoneId] = useState('');
  const [creatingContract, setCreatingContract] = useState(false);
  const [newContractObservation, setNewContractObservation] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const detailsId = useId();
  const [confirmingSignature, setConfirmingSignature] = useState(false);
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
  const signaturePolicy = useSignatureStatus(selectedContract?.idContrato);
  useEffect(() => {
    setSignatureOpen(false); setSignatureObservation('');
  }, [selectedContract?.idContrato, selectedContract?.idEmpresa, signaturePolicy.status?.policy.mode, signaturePolicy.status?.policy.manualAllowed]);
  const target = selectedContract ? contractManagementTarget(selectedContract.idContrato, services, servicesLoad.status) : null;
  const selectedService = target && "serviceId" in target ? services.find(service => service.idServicio === target.serviceId) : undefined;
  const contractSigned = signed(selectedContract);
  const activePlans = plans.filter((plan) => plan.activo !== false);

  function updateContract(next: CustomerContract) {
    setContracts((current) => current.map((contract) =>
      contract.idContrato === next.idContrato ? { ...contract, ...next } : contract,
    ));
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
      setSelectedContractId(data.idContrato);
      showMessage('Contratación creada.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    } finally {
      setCreatingContract(false);
    }
  }

  async function confirmSignature(event: FormEvent) {
    event.preventDefault();
    if (!selectedContract || confirmingSignature) return;
    setConfirmingSignature(true);
    try {
      if (!(await signaturePolicy.refresh())?.policy.manualAllowed) {
        setSignatureOpen(false);
        setSignatureObservation("");
        return;
      }
      const { data } = await api.patch<CustomerContract>(
        '/contracts/' + selectedContract.idContrato + '/confirm-signature',
        { observacion: signatureObservation.trim() || undefined },
      );
      updateContract(data);
      setSignatureOpen(false);
      setSignatureObservation('');
      showMessage('Firma confirmada. Ya puedes solicitar la instalación técnica.');
    } catch (error) {
      showMessage(apiErrorMessage(error));
    } finally {
      setConfirmingSignature(false);
    }
  }

  return <section className="workflow-panel customer-contracts-section">
    <header className="section-heading compact-heading">
      <h3>Contratos y servicios</h3>
      {permissions.manageContracts && <button type="button" className="secondary compact" aria-expanded={addPlanOpen} onClick={() => setAddPlanOpen(open => !open)}><Plus size={15} aria-hidden="true" /> Añadir plan</button>}
    </header>
    {message && <p role="status" className="inline-status customer-transient-status">{message}</p>}
    {servicesLoad.status === "loading" && <p role="status" className="inline-status">Cargando servicios del cliente…</p>}
    {servicesLoad.status === "error" && <div className="inline-status"><span>{servicesLoad.error || "No fue posible cargar los servicios."}</span> <button type="button" className="secondary compact" onClick={() => void onRefresh()}>Reintentar</button></div>}
    {addPlanOpen && permissions.manageContracts && (
        <form id="customer-add-plan" className="workflow-grid customer-inline-form customer-add-plan" onSubmit={addPlan}>
          <label>Nuevo plan<select required value={newPlanId} onChange={(event) => { setNewPlanId(event.target.value); setNewZoneId(''); }}><option value="">Seleccionar plan</option>{activePlans.map((plan) => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
          <label>Zona de pago<select value={newZoneId} disabled={!newPlanId} onChange={e => setNewZoneId(e.target.value)}><option value="">Sin zona (precio base, vence el día 1)</option>{zones.filter(z => z.activo !== false && (!z.idEmpresa || z.idEmpresa === activePlans.find(p => p.idPlan === Number(newPlanId))?.idEmpresa)).map(z => <option key={z.idZonaPago} value={z.idZonaPago}>{z.nombreZona} · vence el día {z.diaVencimientoSugerido ?? 1}</option>)}</select></label>
          <label className="customer-inline-form-wide">Observaciones<textarea value={newContractObservation} onChange={(event) => setNewContractObservation(event.target.value)} /></label>
          <div className="button-row customer-inline-form-wide"><button type="button" className="secondary" disabled={creatingContract} onClick={() => setAddPlanOpen(false)}>Cancelar</button><button type="submit" disabled={creatingContract}>{creatingContract ? 'Guardando…' : 'Crear contratación'}</button></div>
        </form>
    )}
    {contracts.length ? <div className="table-wrap customer-contract-table">
      <table>
        <thead><tr><th scope="col">Plan</th><th scope="col">Empresa</th><th scope="col">Contrato</th><th scope="col">Servicio</th><th scope="col">Dirección</th><th scope="col" className="customer-contract-status-heading">Estado</th></tr></thead>
        <tbody>
          {contracts.map(contract => {
            const service = serviceForContract(contract.idContrato, services);
            const expanded = selectedContract?.idContrato === contract.idContrato;
            const panelId = detailsId + "-" + contract.idContrato;
            const contractNumber = contract.numeroContratoExterno || "#" + contract.idContrato;
            return <Fragment key={contract.idContrato}>
              <tr className={expanded ? "customer-contract-selected customer-contract-row" : "customer-contract-row"} onClick={() => {
                  setSelectedContractId(expanded ? null : contract.idContrato);
                  setSignatureOpen(false);
                  setSignatureObservation("");
                  clearMessage();
                }}>
                <td><button type="button" className="customer-contract-row-toggle" aria-label={(expanded ? 'Ocultar' : 'Ver') + ' detalle de ' + (contract.plan?.nombreComercial ?? 'plan')} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}>{contract.plan?.nombreComercial ?? "Sin plan asociado"}</button></td>
                <td>{companyName(contract, customer)}</td>
                <td><div className="customer-contract-number"><span>{contractNumber}</span></div></td>
                <td>{servicesLoad.status === "loading" ? "Cargando…" : servicesLoad.status === "error" ? "No disponible"
                  : service ? service.tipoServicio + " · " + formatWorkOrderValue(service.estadoOperativo)
                  : signed(contract) ? "Sin servicio activo" : "Pendiente de firma"}</td>
                <td>{serviceAddress(service, contract, customer)}</td>
                <td className="customer-contract-status"><StatusBadge value={contract.estado ?? "Pendiente firma contrato"} /></td>
              </tr>
              {expanded && <tr className="customer-contract-detail-row">
                <td colSpan={6}>
                  <div id={panelId} className="customer-contract-expansion">
                    <div>
                      <section className="customer-contract-detail" aria-label={"Detalle del contrato " + contractNumber}>
                        <dl className="customer-contract-facts">
                          <div><dt>Precio mensual del plan</dt><dd>{formatCurrency(contract.plan?.precioMensual)}</dd></div>
                          <div><dt>Fecha de contratación</dt><dd>{contract.fechaInicio ? formatDateOnly(contract.fechaInicio) : "—"}</dd></div>
                        </dl>
                        {permissions.manageContracts && <ContractDocuments idContrato={contract.idContrato} compact canGenerate={permissions.generateDigitalContract} onChanged={() => void onRefresh()} />}
                        {!contractSigned && permissions.manageContracts && signaturePolicy.status?.policy.manualAllowed && (signatureOpen ? <form className="workflow-grid customer-inline-form" onSubmit={confirmSignature}>
                          <label className="customer-inline-form-wide">Observaciones<textarea value={signatureObservation} onChange={(event) => setSignatureObservation(event.target.value)} /></label>
                          <div className="button-row"><button type="button" className="secondary" onClick={() => setSignatureOpen(false)}>Cancelar</button><button type="submit" disabled={confirmingSignature}>Registrar firma manual</button></div>
                        </form> : <button type="button" className="secondary compact crm-table-action" onClick={() => setSignatureOpen(true)}>Registrar firma manual</button>)}
                        {(contractSigned || target?.kind === 'service') && target?.kind !== 'loading' && <G3InstallationStatus key={contract.idContrato} contractId={contract.idContrato} compact installationSummary
                          service={selectedService} canRequest={contractSigned && permissions.createInstallOrders && target?.kind === 'contract'}
                          onChanged={() => void onRefresh(selectedService?.idServicio)} />}
                        {target?.kind === "service" && selectedService && <CustomerServiceActions key={selectedService.idServicio}
                          contract={contract} service={selectedService} plans={plans} permissions={permissions} onRefresh={onRefresh} />}
                      </section>
                    </div>
                  </div>
                </td>
              </tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
    </div> : <p className="empty-state">Este cliente aún no tiene contrataciones registradas.</p>}
  </section>;
}
