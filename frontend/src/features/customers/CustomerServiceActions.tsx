import { FormEvent, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api, apiErrorMessage, type Customer, type CustomerService, type Plan } from '../../api';
import { dateInputValue } from '../../lib';
import type { DashboardPermissions } from '../../permissions';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { Modal } from '../../shared/components';
import { PlanChangeHistory } from './PlanChangeHistory';
import './service-management.css';

type CustomerContract = NonNullable<Customer['contratos']>[number];

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

export function CustomerServiceActions({ contract, service, plans, permissions, onRefresh }: {
  contract: CustomerContract;
  service: CustomerService;
  plans: Plan[];
  permissions: DashboardPermissions;
  onRefresh: (preferredServiceId?: number) => Promise<void>;
}) {
  const { message, showMessage } = useTransientMessage();
  const [action, setAction] = useState<'plan' | 'deactivate' | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');
  const [deactivateObservation, setDeactivateObservation] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const withdrawalBusy = useRef(false);
  const [withdrawalDate, setWithdrawalDate] = useState(dateInputValue(new Date()));

  const activePlans = plans.filter(plan => plan.activo !== false && plan.idPlan !== contract.plan?.idPlan && (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa));
  const changePlanOpen = action === 'plan';
  const deactivateOpen = action === 'deactivate';
  const withdrawalRequired = service.estadoOperativo === 'Suspendido';
  const nextPlan = activePlans.find(plan => plan.idPlan === Number(newPlanId));

  async function savePlanChange(event: FormEvent) {
    event.preventDefault();
    if (savingPlan || !newPlanId) { if (!newPlanId) showMessage('Selecciona el nuevo plan.'); return; }
    setSavingPlan(true);
    try {
      const { data } = await api.post('/contracts/' + contract.idContrato + '/change-plan', { newPlanId: Number(newPlanId), fechaEfectiva, observaciones: planObservation.trim() || undefined });
      setAction(null); setNewPlanId(''); setPlanObservation('');
      await onRefresh(service.idServicio); setPlanRevision((value) => value + 1);
      showMessage(data.cambioPlan?.estadoCambio === 'Pendiente' ? 'Cambio programado.' : 'Cambio de plan aplicado.');
    } catch (error) { showMessage(serviceErrorMessage(error)); } finally { setSavingPlan(false); }
  }

  async function deactivateService(event: FormEvent) {
    event.preventDefault();
    if (withdrawalBusy.current) return;
    if (withdrawalRequired && (!permissions.manageCustomerRequests || !deactivateObservation.trim() || !withdrawalDate)) {
      showMessage('Indica fecha y observaciones. El retiro por morosidad requiere aviso previo en Libro de Control.'); return;
    }
    withdrawalBusy.current = true;
    setDeactivating(true);
    try {
      if (withdrawalRequired) {
        await api.post('/service-withdrawals', { idServicio: service.idServicio, idContrato: contract.idContrato,
          motivo: 'MOROSIDAD', fechaSolicitada: withdrawalDate, observaciones: deactivateObservation.trim() });
      } else {
        await api.patch('/services/' + service.idServicio + '/deactivate', { observacion: deactivateObservation.trim() || undefined });
      }
      setAction(null); setDeactivateObservation(''); await onRefresh(service.idServicio);
      showMessage(withdrawalRequired ? 'Solicitud de retiro registrada. El servicio sigue suspendido; no se ha confirmado retiro tecnico.' : 'Servicio dado de baja.');
    } catch (error) { showMessage(serviceErrorMessage(error)); } finally { withdrawalBusy.current = false; setDeactivating(false); }
  }

  if (!permissions.changeCustomerPlan && !permissions.manageServices && !permissions.manageCustomerRequests) return null;

  return <div className="customer-service-options">
    {message && !action && <p role="status" className="inline-status">{message}</p>}
    {changePlanOpen && createPortal(<Modal title="Cambiar plan" open onClose={() => { if (!savingPlan) setAction(null); }}>
    <form id={"service-change-plan-" + service.idServicio} className="workflow-grid service-inline-form service-action-modal" onSubmit={savePlanChange}>
      <label>Nuevo plan<select required disabled={savingPlan} value={newPlanId} onChange={event => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
      <label>Fecha efectiva<input type="date" required disabled={savingPlan} min={dateInputValue(new Date())} value={fechaEfectiva} onChange={event => setFechaEfectiva(event.target.value)} /></label>
      {!activePlans.length && <p className="service-form-wide service-muted">No hay otros planes disponibles para esta empresa.</p>}
      {nextPlan && <p className="service-form-wide service-new-plan">{nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)} al mes</p>}
      <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea disabled={savingPlan} value={planObservation} onChange={event => setPlanObservation(event.target.value)} /></label>
      {message && <p role="status" className="inline-status service-form-wide">{message}</p>}
      <div className="service-form-actions"><button type="button" className="secondary" disabled={savingPlan} onClick={() => setAction(null)}>Cancelar</button><button type="submit" disabled={savingPlan || !newPlanId}>{savingPlan ? 'Guardando…' : 'Guardar cambio'}</button></div>
    </form></Modal>, document.body)}

      {deactivateOpen && createPortal(<Modal title={withdrawalRequired ? 'Solicitar retiro por morosidad' : 'Dar de baja el servicio'} open onClose={() => { if (!deactivating) setAction(null); }}>
      <form id={"service-deactivate-" + service.idServicio} className="workflow-grid service-inline-form service-action-modal" onSubmit={deactivateService}>
        {withdrawalRequired && <label>Fecha solicitada<input type="date" required disabled={deactivating} value={withdrawalDate} onChange={event => setWithdrawalDate(event.target.value)} /></label>}
        <label className="service-form-wide">Observaciones {!withdrawalRequired && <span className="service-optional">Opcional</span>}<textarea required={withdrawalRequired} maxLength={1000} disabled={deactivating} value={deactivateObservation} onChange={event => setDeactivateObservation(event.target.value)} /></label>
        {message && <p role="status" className="inline-status service-form-wide">{message}</p>}
        <div className="service-form-actions"><button type="button" className="secondary" disabled={deactivating} onClick={() => setAction(null)}>Cancelar</button><button type="submit" className="danger" disabled={deactivating}>{withdrawalRequired ? 'Registrar solicitud de retiro' : 'Confirmar baja'}</button></div>
      </form></Modal>, document.body)}

    {permissions.changeCustomerPlan && <PlanChangeHistory idContrato={contract.idContrato} revision={planRevision} />}
    <div className="customer-service-actions" aria-label="Acciones del servicio">
      {permissions.changeCustomerPlan && service.estadoOperativo !== 'Baja' && <button type="button" className="compact service-change-trigger" aria-expanded={changePlanOpen} aria-controls={changePlanOpen ? "service-change-plan-" + service.idServicio : undefined} onClick={() => { setAction(changePlanOpen ? null : 'plan'); }}><Pencil size={15} aria-hidden="true" /> Cambiar plan</button>}
      {(withdrawalRequired ? permissions.manageCustomerRequests : permissions.manageServices) && service.estadoOperativo !== 'Baja' && <button type="button" className="compact service-deactivate-trigger" aria-expanded={deactivateOpen} aria-controls={deactivateOpen ? "service-deactivate-" + service.idServicio : undefined} onClick={() => { setAction(deactivateOpen ? null : 'deactivate'); }}>{withdrawalRequired ? 'Solicitar retiro por morosidad' : 'Dar de baja'}</button>}
    </div>
  </div>;
}
