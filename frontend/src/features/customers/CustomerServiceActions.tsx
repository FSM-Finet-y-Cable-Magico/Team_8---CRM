import { FormEvent, useState } from 'react';
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
  // FINET 13-11-2026: Clientes no longer offers «Dar de baja» nor the morosity withdrawal. A baja for non-payment starts
  // only from the Libro de Control (suspension, then guided withdrawal); the administrative baja is an Administrador-only
  // API exception (PATCH /services/:id/deactivate with a closed non-morosity reason).
  const [action, setAction] = useState<'plan' | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const [newPlanId, setNewPlanId] = useState('');
  const [fechaEfectiva, setFechaEfectiva] = useState(dateInputValue(new Date()));
  const [planObservation, setPlanObservation] = useState('');

  const activePlans = plans.filter(plan => plan.activo !== false && plan.idPlan !== contract.plan?.idPlan && (!contract.idEmpresa || !plan.idEmpresa || plan.idEmpresa === contract.idEmpresa));
  const changePlanOpen = action === 'plan';
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

  if (!permissions.changeCustomerPlan) return null;

  return <div className="customer-service-options">
    {message && !action && <p role="status" className="inline-status">{message}</p>}
    {changePlanOpen && createPortal(<Modal title="Cambiar plan" open onClose={() => { if (!savingPlan) setAction(null); }}>
    <form id={"service-change-plan-" + service.idServicio} className="workflow-grid service-inline-form service-action-modal" onSubmit={savePlanChange}>
      <label>Nuevo plan<select required disabled={savingPlan} value={newPlanId} onChange={event => setNewPlanId(event.target.value)}><option value="">Seleccionar plan</option>{activePlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombreComercial} - {plan.empresa?.nombre ?? 'Sin empresa'}</option>)}</select></label>
      <label>Fecha efectiva<input type="date" required disabled={savingPlan} min={dateInputValue(new Date())} value={fechaEfectiva} onChange={event => setFechaEfectiva(event.target.value)} /></label>
      {!activePlans.length && <p className="service-form-wide empty-state">No hay otros planes disponibles para esta empresa.</p>}
      {nextPlan && <p className="service-form-wide service-new-plan">{nextPlan.tipoPlan} · {nextPlan.velocidadMbps ? nextPlan.velocidadMbps + ' Mbps' : 'Sin velocidad'} · {formatCurrency(nextPlan.precioMensual)} al mes</p>}
      <label className="service-form-wide">Observaciones <span className="service-optional">Opcional</span><textarea disabled={savingPlan} value={planObservation} onChange={event => setPlanObservation(event.target.value)} /></label>
      {message && <p role="status" className="inline-status service-form-wide">{message}</p>}
      <div className="service-form-actions"><button type="button" className="secondary" disabled={savingPlan} onClick={() => setAction(null)}>Cancelar</button><button type="submit" disabled={savingPlan || !newPlanId}>{savingPlan ? 'Guardando…' : 'Guardar cambio'}</button></div>
    </form></Modal>, document.body)}

    {permissions.changeCustomerPlan && <PlanChangeHistory idContrato={contract.idContrato} revision={planRevision} />}
    <div className="customer-service-actions" aria-label="Acciones del servicio">
      {permissions.changeCustomerPlan && service.estadoOperativo !== 'Baja' && <button type="button" className="compact service-change-trigger" aria-expanded={changePlanOpen} aria-controls={changePlanOpen ? "service-change-plan-" + service.idServicio : undefined} onClick={() => { setAction(changePlanOpen ? null : 'plan'); }}><Pencil size={15} aria-hidden="true" /> Cambiar plan</button>}
    </div>
  </div>;
}
