import { useEffect, useState } from 'react';
import { CalendarPlus, ClipboardList, FileClock, HandCoins, TrendingDown, UserRoundPlus, Wrench } from 'lucide-react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { StatusBadge } from '../../shared/components';

export function ProspectWorkflowPanel({
  prospect,
  plans,
  permissions,
  onOpenInstallation,
  onChanged,
}: {
  prospect: Prospect;
  plans: Plan[];
  permissions: DashboardPermissions;
  onOpenInstallation: () => void;
  onChanged: () => void;
}) {
  const [pipelineStatus, setPipelineStatus] = useState(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  const [feasibilityResult, setFeasibilityResult] = useState<'Factible' | 'No Factible'>('Factible');
  const [quotePlanId, setQuotePlanId] = useState('');
  const [lossReason, setLossReason] = useState('Sin cobertura');
  const [contractPlanId, setContractPlanId] = useState('');
  const [dueDay, setDueDay] = useState(5);
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    setPipelineStatus(prospect.estadoPipeline ?? 'Prospecto Nuevo');
  }, [prospect.idProspecto, prospect.estadoPipeline]);

  const planOptions = plans.filter((plan) => !plan.idEmpresa || !prospect.empresa || plan.idEmpresa === prospect.empresa.idEmpresa);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setStatus('');
    setStatusIsError(false);

    try {
      await action();
      setStatus(success);
      onChanged();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    }
  }

  async function generateQuote() {
    setStatus('');
    setStatusIsError(false);

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/quotes`, { planId: Number(quotePlanId) });
      const pdf = await api.get(data.pdfUrl, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(pdf.data);
      window.open(objectUrl, '_blank');
      setStatus(
        data.envioEmail === 'sent'
          ? `Cotización generada y enviada automáticamente a ${prospect.email}`
          : data.envioEmail === 'failed'
            ? 'Cotización generada, pero el servidor de correo rechazó el envío.'
            : 'Cotización generada. Configura SMTP para enviarla automáticamente por correo.',
      );
      onChanged();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <div className="workflow-panel modal-workflow prospect-workflow">
      <section className="prospect-overview">
        <header className="prospect-overview-header">
          <span className="prospect-avatar" aria-hidden="true">
            <UserRoundPlus size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h3>{prospect.nombreCompleto}</h3>
            <p>{prospect.rut ?? 'RUT no registrado'}</p>
          </div>
          <StatusBadge value={prospect.estadoPipeline} />
        </header>
        <dl className="prospect-overview-data">
          <div>
            <dt>Teléfono</dt>
            <dd>{prospect.telefono ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{prospect.email ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>{prospect.origenContacto ?? 'No registrado'}</dd>
          </div>
        </dl>
      </section>

      <div className="workflow-grid prospect-action-grid">
        {permissions.manageProspectPipeline && (
          <section className="prospect-action-card prospect-action-card-mint">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <ClipboardList size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Estado del prospecto</h4>
                <p>Actualiza su avance dentro del pipeline.</p>
              </div>
            </header>
            <label>
              Estado
              <select value={pipelineStatus} onChange={(event) => setPipelineStatus(event.target.value)}>
                {prospect.estadoPipeline === 'Perdido' && (
                  <option value="Perdido" disabled>
                    Perdido - selecciona un estado para reactivar
                  </option>
                )}
                {[
                  'Prospecto Nuevo',
                  'Contactado',
                  'En Factibilidad',
                  'Cotizacion Enviada',
                  'Aceptado',
                  'Instalacion Programada',
                  'Servicio Activo',
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () => api.patch(`/prospects/${prospect.idProspecto}/pipeline`, { estadoPipeline: pipelineStatus }),
                  prospect.estadoPipeline === 'Perdido' ? 'Prospecto reactivado y pipeline actualizado' : 'Pipeline actualizado',
                )
              }
            >
              Actualizar estado
            </button>
          </section>
        )}

        {permissions.verifyFeasibility && (
          <section className="prospect-action-card prospect-action-card-blue">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <Wrench size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Factibilidad técnica</h4>
                <p>Registra el resultado de la evaluación.</p>
              </div>
            </header>
            <label>
              Resultado
              <select value={feasibilityResult} onChange={(event) => setFeasibilityResult(event.target.value as 'Factible' | 'No Factible')}>
                <option value="Factible">Factible</option>
                <option value="No Factible">No Factible</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () => api.post(`/prospects/${prospect.idProspecto}/feasibility`, { resultado: feasibilityResult }),
                  'Factibilidad registrada',
                )
              }
            >
              Registrar factibilidad
            </button>
          </section>
        )}

        {permissions.generateQuotes && (
          <section className="prospect-action-card prospect-action-card-violet">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <FileClock size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Generar cotización</h4>
                <p>Crea el documento PDF para el cliente.</p>
              </div>
            </header>
            <label>
              Plan a cotizar
              <select value={quotePlanId} onChange={(event) => setQuotePlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {planOptions.map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>
                    {plan.nombreComercial}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!quotePlanId} onClick={() => void generateQuote()}>
              Generar cotización
            </button>
          </section>
        )}

        {permissions.recordProspectLoss && (
          <section className="prospect-action-card prospect-action-card-loss">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <TrendingDown size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Marcar como perdido</h4>
                <p>Indica por qué no continuará la oportunidad.</p>
              </div>
            </header>
            <label>
              Motivo
              <select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
                {['Sin cobertura', 'Precio', 'No responde', 'Competencia', 'Otro'].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void runAction(
                  () => api.post(`/prospects/${prospect.idProspecto}/loss`, { motivo: lossReason }),
                  'Motivo de perdida registrado',
                )
              }
            >
              Marcar como perdido
            </button>
          </section>
        )}

        {permissions.contractPlans && (
          <section className="prospect-action-card prospect-action-card-contract prospect-action-card-orange">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <HandCoins size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Registrar contratación</h4>
                <p>Asocia el plan contratado y su día de vencimiento.</p>
              </div>
            </header>
            <div className="prospect-contract-fields">
              <label>
                Plan contratado
                <select value={contractPlanId} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {planOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {plan.nombreComercial}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Día de vencimiento
                <input
                  min="1"
                  max="28"
                  type="number"
                  value={dueDay}
                  onChange={(event) => setDueDay(Number(event.target.value))}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!contractPlanId}
              onClick={() =>
                void runAction(
                  () =>
                    api.post(`/prospects/${prospect.idProspecto}/contracts`, {
                      planId: Number(contractPlanId),
                      diaVencimiento: dueDay,
                    }),
                  'Plan contratado registrado',
                )
              }
            >
              Registrar plan contratado
            </button>
          </section>
        )}

        {permissions.createInstallOrders && prospect.estadoPipeline === 'Aceptado' && Boolean(prospect.idCliente) && (
          <section className="prospect-action-card prospect-action-card-installation prospect-action-card-green">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <CalendarPlus size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Agendar instalación</h4>
                <p>Continúa el proceso coordinando la visita técnica.</p>
              </div>
            </header>
            <button type="button" onClick={onOpenInstallation}>
              Generar instalación
            </button>
          </section>
        )}
      </div>

      {status && <p className={statusIsError ? 'alert' : 'inline-status'}>{status}</p>}
    </div>
  );
}
