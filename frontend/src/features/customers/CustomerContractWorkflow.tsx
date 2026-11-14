import { useSignatureStatus } from '../contracts/useSignatureStatus';
import { Fragment, FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage, Company, Customer, CustomerService, Plan } from '../../api';
import { CustomerPlanForm } from './CustomerPlanForm';
import type { CustomerProfileFields } from './CustomerProfileForm';
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

function customerAddress(customer: Customer, current = true) {
  if (current && customer.direccionActual?.direccion.trim()) return customer.direccionActual.direccion.trim();
  const technicalAddress = customer.datosTecnicos?.direccion;
  if (typeof technicalAddress === 'string' && technicalAddress.trim()) return technicalAddress.trim();
  const primaryAddress = customer.direcciones?.find((address) => address.esPrincipal && address.direccionCompleta?.trim())
    ?? customer.direcciones?.find((address) => address.direccionCompleta?.trim());
  return primaryAddress?.direccionCompleta.trim() ?? 'No registrada';
}

function serviceAddress(service: CustomerService | null, contract: CustomerContract, customer: Customer) {
  return service?.direccion?.direccionCompleta?.trim() || contract.direccionInstalacion?.trim() || customerAddress(customer, false);
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
  initialCompanyId,
  companies,
  onProfileUpdated,
}: {
  customer: Customer;
  initialCompanyId?: number;
  companies?: Company[];
  onProfileUpdated?: (profile: CustomerProfileFields) => void;
  services: CustomerService[];
  servicesLoad: CustomerServicesLoadState;
  plans: Plan[];
  permissions: DashboardPermissions;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
}) {
  const [contracts, setContracts] = useState<CustomerContract[]>(customer.contratos ?? []);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const detailsId = useId();
  const [confirmingSignature, setConfirmingSignature] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureObservation, setSignatureObservation] = useState('');
  const [cancellingContract, setCancellingContract] = useState<number | null>(null);
  const cancellationInFlight = useRef(false);
  const { message, showMessage, clearMessage } = useTransientMessage();

  useEffect(() => setContracts(customer.contratos ?? []), [customer.contratos]);

  const selectedContract = contracts.find((contract) => contract.idContrato === selectedContractId) ?? null;
  const signaturePolicy = useSignatureStatus(selectedContract?.idContrato);
  const signedRefresh = useRef<number | null>(null);
  useEffect(() => {
    if (selectedContract && !signed(selectedContract) && signaturePolicy.status?.solicitud?.estado === 'FIRMADA'
      && signedRefresh.current !== selectedContract.idContrato) {
      signedRefresh.current = selectedContract.idContrato;
      void onRefresh().catch(error => showMessage(apiErrorMessage(error)));
    }
  }, [selectedContract, signaturePolicy.status?.solicitud?.estado, onRefresh, showMessage]);
  useEffect(() => {
    setSignatureOpen(false); setSignatureObservation('');
  }, [selectedContract?.idContrato, selectedContract?.idEmpresa, signaturePolicy.status?.policy.mode, signaturePolicy.status?.policy.manualAllowed]);
  const target = selectedContract ? contractManagementTarget(selectedContract.idContrato, services, servicesLoad.status) : null;
  const selectedService = target && "serviceId" in target ? services.find(service => service.idServicio === target.serviceId) : undefined;
  const contractSigned = signed(selectedContract);

  function updateContract(next: CustomerContract) {
    setContracts((current) => current.map((contract) =>
      contract.idContrato === next.idContrato ? { ...contract, ...next } : contract,
    ));
  }

  async function planCreated(data: CustomerContract) {
      setContracts((current) => [data, ...current]);
      setAddPlanOpen(false);
      await onRefresh();
      setSelectedContractId(data.idContrato);
      showMessage('Contratación creada. El contrato está pendiente de firma.');
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

  async function cancelContract(idContrato: number) {
    if (cancellationInFlight.current) return;
    cancellationInFlight.current = true; setCancellingContract(idContrato); clearMessage();
    try {
      const { data } = await api.post<CustomerContract>('/contracts/' + idContrato + '/cancel', {});
      updateContract(data); setSignatureOpen(false); setSignatureObservation('');
      showMessage('Contrato cancelado. El enlace de firma dejó de ser válido.');
      await signaturePolicy.refresh();
      await onRefresh();
    } catch (error) { showMessage(apiErrorMessage(error)); }
    finally { cancellationInFlight.current = false; setCancellingContract(null); }
  }

  return <section className="workflow-panel customer-contracts-section">
    <header className="section-heading compact-heading">
      <h3>Contratos y servicios</h3>
      {permissions.manageContracts && <button type="button" className="secondary compact" aria-expanded={addPlanOpen} onClick={() => setAddPlanOpen(open => !open)}><Plus size={15} aria-hidden="true" /> Añadir plan</button>}
    </header>
    {message && <p role="status" className="inline-status customer-transient-status">{message}</p>}
    {servicesLoad.status === "loading" && <p role="status" className="inline-status">Cargando servicios del cliente…</p>}
    {servicesLoad.status === "error" && <div className="inline-status"><span>{servicesLoad.error || "No fue posible cargar los servicios."}</span> <button type="button" className="secondary compact" onClick={() => void onRefresh()}>Reintentar</button></div>}
    {addPlanOpen && permissions.manageContracts && <CustomerPlanForm key={`${customer.idCliente}:${initialCompanyId ?? ''}`} customer={customer} services={services} plans={plans}
      initialCompanyId={initialCompanyId} companies={companies}
      onCancel={() => setAddPlanOpen(false)} onCreated={planCreated} onAddressesChanged={async profile => { onProfileUpdated?.(profile); await onRefresh(); }} />}
    {contracts.length ? <div className="table-wrap customer-contract-table">
      <table>
        <thead><tr><th scope="col">Plan</th><th scope="col">Empresa</th><th scope="col">Contrato</th><th scope="col">Servicio</th><th scope="col">Dirección</th><th scope="col" className="customer-contract-status-heading">Estado</th></tr></thead>
        <tbody>
          {contracts.map(contract => {
            const service = serviceForContract(contract.idContrato, services);
            const pendingSignature = contract.estado === 'Pendiente firma contrato';
            const cancelled = contract.estado === 'Anulado';
            const pendingInstallation = contract.estado === 'Firmado' && (!service || ['Pendiente', 'Pendiente Instalacion', 'Instalacion Programada'].includes(service.estadoOperativo ?? ''));
            const displayStatus = pendingInstallation ? 'Pendiente de instalación'
              : cancelled ? 'Cancelado' : pendingSignature ? 'Pendiente de firma'
              : contract.estado ?? 'Pendiente de firma';
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
                  : pendingInstallation ? 'Pendiente de instalación'
                  : cancelled ? 'Sin servicio'
                  : service ? service.tipoServicio + " · " + formatWorkOrderValue(service.estadoOperativo)
                  : signed(contract) ? "Sin servicio activo" : "Pendiente de firma"}</td>
                <td>{serviceAddress(service, contract, customer)}</td>
                <td className="customer-contract-status"><StatusBadge value={displayStatus} /></td>
              </tr>
              {expanded && <tr className="customer-contract-detail-row">
                <td colSpan={6}>
                  <div id={panelId} className="customer-contract-expansion">
                    <div>
                      <section className="customer-contract-detail" aria-label={"Detalle del contrato " + contractNumber}>
                        <dl className="customer-contract-facts">
                          <div><dt>Precio mensual del plan</dt><dd>{formatCurrency(contract.precioMensualAplicable ?? contract.plan?.precioMensual)}</dd></div>
                          <div><dt>Fecha de contratación</dt><dd>{contract.fechaInicio ? formatDateOnly(contract.fechaInicio) : "—"}</dd></div>
                        </dl>
                        {permissions.manageContracts && <ContractDocuments idContrato={contract.idContrato} compact canGenerate={!cancelled && permissions.generateDigitalContract} onChanged={() => void onRefresh()} />}
                        {pendingSignature && permissions.manageContracts && signaturePolicy.status?.policy.manualAllowed && (signatureOpen ? <form className="workflow-grid customer-inline-form" onSubmit={confirmSignature}>
                          <label className="customer-inline-form-wide">Observaciones<textarea value={signatureObservation} onChange={(event) => setSignatureObservation(event.target.value)} /></label>
                          <div className="button-row"><button type="button" className="secondary" onClick={() => setSignatureOpen(false)}>Cancelar</button><button type="submit" disabled={confirmingSignature}>Registrar firma manual</button></div>
                        </form> : <button type="button" className="secondary compact crm-table-action" onClick={() => setSignatureOpen(true)}>Registrar firma manual</button>)}
                        {(contractSigned || target?.kind === 'service') && target?.kind !== 'loading' && <G3InstallationStatus key={contract.idContrato} contractId={contract.idContrato} compact installationSummary
                          service={selectedService} canRequest={contractSigned && permissions.createInstallOrders && target?.kind === 'contract'}
                          onChanged={() => void onRefresh(selectedService?.idServicio)} />}
                        {target?.kind === "service" && selectedService && <CustomerServiceActions key={selectedService.idServicio}
                          contract={contract} service={selectedService} plans={plans} permissions={permissions} onRefresh={onRefresh} />}
                        {pendingSignature && !service && permissions.manageContracts && <div className="customer-contract-cancel-actions"><button type="button" aria-label="Cancelar contrato" disabled={cancellingContract !== null || confirmingSignature} onClick={() => void cancelContract(contract.idContrato)}>{cancellingContract === contract.idContrato ? 'Cancelando…' : 'Cancelar'}</button></div>}
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
