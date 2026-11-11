import { FormEvent, useState } from 'react';
import { api, apiErrorMessage, type Customer, type CustomerService, type Plan } from '../../api';
import { dateInputValue } from '../../lib';
import type { DashboardPermissions } from '../../permissions';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { ObservationsPanel } from '../observations/ObservationsModal';
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
  const [action, setAction] = useState<'plan' | 'notes' | 'deactivate' | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');
  const [deactivateObservation, setDeactivateObservation] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activePlans = plans.filter(plan => plan.activo !== false && plan.idPlan !== contract.plan?.idPlan && (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa));
  const changePlanOpen = action === 'plan';
  const observationsOpen = action === 'notes';
  const deactivateOpen = action === 'deactivate';
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
    if (deactivating) return;
    setDeactivating(true);
    try {
      await api.patch('/services/' + service.idServicio + '/deactivate', { observacion: deactivateObservation.trim() || undefined });
      setAction(null); setDeactivateObservation(''); await onRefresh(service.idServicio); showMessage('Servicio dado de baja.');
    } catch (error) { showMessage(serviceErrorMessage(error)); } finally { setDeactivating(false); }
  }

  if (!permissions.changeCustomerPlan && !permissions.manageObservations && !permissions.manageServices) return null;

  return <details className="customer-service-options">
    <summary>Acciones del servicio</summary>
    {message && <p role="status" className="inline-status">{message}</p>}
    <div className="customer-service-actions" aria-label="Acciones del servicio">
      {permissions.changeCustomerPlan && service.estadoOperativo !== 'Baja' && <button type="button" className="secondary compact" aria-expanded={changePlanOpen} aria-controls={changePlanOpen ? "service-change-plan-" + service.idServicio : undefined} onClick={() => { setAction(changePlanOpen ? null : 'plan'); }}>Modificar plan</button>}
      {permissions.manageObservations && <button type="button" className="secondary compact" aria-expanded={observationsOpen} onClick={() => { setAction(observationsOpen ? null : 'notes'); }}>Observaciones</button>}
      {permissions.manageServices && service.estadoOperativo !== 'Baja' && <button type="button" className="compact service-deactivate-trigger" aria-expanded={deactivateOpen} aria-controls={deactivateOpen ? "service-deactivate-" + service.idServicio : undefined} onClick={() => { setAction(deactivateOpen ? null : 'deactivate'); }}>Dar de baja</button>}
    </div>

    {changePlanOpen && <form id={"service-change-plan-" + service.idServicio} className="workflow-grid service-inline-form" onSubmit={savePlanChange}>
      <header className="service-form-heading"><h3>Modificar plan</h3><p>Selecciona el nuevo plan y la fecha en que debe aplicarse.</p></header>
      <label>Nuevo plan<select required disabled={savingPlan} value={newPlanId} onChange={event => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
      <label>Fecha efectiva<input type="date" required disabled={savingPlan} min={dateInputValue(new Date())} value={fechaEfectiva} onChange={event => setFechaEfectiva(event.target.value)} /></label>
      {!activePlans.length && <p className="service-form-wide service-muted">No hay otros planes disponibles para esta empresa.</p>}
      {nextPlan && <p className="service-form-wide service-new-plan">{nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)} al mes</p>}
      <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea disabled={savingPlan} value={planObservation} onChange={event => setPlanObservation(event.target.value)} /></label>
      <div className="service-form-actions"><button type="button" className="secondary" disabled={savingPlan} onClick={() => setAction(null)}>Cancelar</button><button type="submit" disabled={savingPlan || !newPlanId}>{savingPlan ? 'Guardando…' : 'Guardar cambio'}</button></div>
    </form>}

      {deactivateOpen && <form id={"service-deactivate-" + service.idServicio} className="workflow-grid service-inline-form" onSubmit={deactivateService}>
        <header className="service-form-heading"><h3>Dar de baja el servicio</h3><p>Confirma la baja de este servicio. Puedes dejar una observación para el registro.</p></header>
        <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea disabled={deactivating} value={deactivateObservation} onChange={event => setDeactivateObservation(event.target.value)} /></label>
        <div className="service-form-actions"><button type="button" className="secondary" disabled={deactivating} onClick={() => setAction(null)}>Cancelar</button><button type="submit" className="danger" disabled={deactivating}>Confirmar baja</button></div>
      </form>}

    {observationsOpen && permissions.manageObservations && <ObservationsPanel target={{ tipoEntidad: "Servicio", idEntidad: service.idServicio, idCliente: service.idCliente, idEmpresa: service.idEmpresa }} />}
    {permissions.changeCustomerPlan && <details onToggle={event => setHistoryOpen(event.currentTarget.open)}>
      <summary>Historial de cambios de plan</summary>
      {historyOpen && <PlanChangeHistory idContrato={contract.idContrato} revision={planRevision} />}
    </details>}
  </details>;
}
