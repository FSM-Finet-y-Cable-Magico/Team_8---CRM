import { useEffect, useState } from 'react';
import { FileClock, HandCoins, TrendingDown, UserRoundPlus, Wrench } from 'lucide-react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';

const FACTIBLE_STATUSES = ['Factible', 'Cotizacion Enviada', 'Contrato externo registrado', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const QUOTED_STATUSES = ['Cotizacion Enviada', 'Contrato externo registrado', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const FINAL_PROSPECT_STATUSES = ['Perdido', 'Contrato externo registrado'];
const LOSS_REASONS = ['Precio', 'Sin cobertura', 'Competencia', 'Falta de respuesta', 'Otro'];

export function ProspectWorkflowPanel({
  prospect,
  plans,
  permissions,
  onChanged,
  onClose,
}: {
  prospect: Prospect;
  plans: Plan[];
  permissions: DashboardPermissions;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [feasibilityResult, setFeasibilityResult] = useState<'Factible' | 'No Factible'>('Factible');
  const [quotePlanId, setQuotePlanId] = useState('');
  const [contractPlanId, setContractPlanId] = useState('');
  const [contractConfirmationDate, setContractConfirmationDate] = useState(() => new Date().toISOString().slice(0, 10));


  const [contractObservation, setContractObservation] = useState('');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('Precio');
  const [lossObservation, setLossObservation] = useState('');

  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    setFeasibilityResult('Factible');
    setQuotePlanId('');
    setContractPlanId('');
    setContractConfirmationDate(new Date().toISOString().slice(0, 10));
    setContractObservation('');
    setLossOpen(false);
    setLossReason('Precio');
    setLossObservation('');

    setStatus('');
    setStatusIsError(false);
  }, [prospect.idProspecto]);

  const currentStatus = prospect.estadoPipeline ?? 'Prospecto Nuevo';
  const isFactible = FACTIBLE_STATUSES.includes(currentStatus);
  const isNoFactible = currentStatus === 'No Factible';
  const isQuoted = QUOTED_STATUSES.includes(currentStatus);
  const isFinal = FINAL_PROSPECT_STATUSES.includes(currentStatus);
  const planOptions = plans.filter((plan) => !plan.idEmpresa || !prospect.empresa || plan.idEmpresa === prospect.empresa.idEmpresa);
  const isContractConfirmationReady = Boolean(contractPlanId && isQuoted && !isFinal);

  async function runAction(action: () => Promise<unknown>, success: string, closeAfterSuccess = false) {
    setStatus('');
    setStatusIsError(false);

    try {
      await action();
      setStatus(success);
      onChanged();

      if (closeAfterSuccess) {
        onClose?.();
      }
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

  async function registerExternalContract() {
    await runAction(
      () =>
        api.post(`/prospects/${prospect.idProspecto}/contracts`, {
          planId: Number(contractPlanId),
          fechaInicio: contractConfirmationDate || undefined,
          observacionContrato: contractObservation.trim() || undefined,
        }),
      'Contratación confirmada. El prospecto queda como cliente pendiente de firma.',
      true,
    );
  }

  async function recordLoss() {
    if (!lossObservation.trim()) {
      setStatusIsError(true);
      setStatus('Registra una observación para justificar la pérdida del prospecto.');
      return;
    }

    setStatus('');
    setStatusIsError(false);

    try {
      await api.post('/prospects/' + prospect.idProspecto + '/loss', {
        motivo: lossReason,
        observaciones: lossObservation.trim(),
      });
      setStatus('Prospecto marcado como perdido.');
      onChanged();
      setLossOpen(false);
      onClose?.();
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
          <div>
            <dt>Empresa</dt>
            <dd>{prospect.empresa?.nombre ?? 'No registrada'}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>{prospect.direccion?.trim() || 'Sin dirección registrada'}</dd>
          </div>
        </dl>
      </section>

      <div className="workflow-grid prospect-action-grid">
        {permissions.verifyFeasibility && (
          <section className="prospect-action-card prospect-action-card-blue">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <Wrench size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Factibilidad técnica</h4>
                <p>Define si el prospecto puede avanzar a cotización.</p>
              </div>
            </header>
            <label>
              Resultado
              <select
                value={feasibilityResult}
                disabled={isFinal}
                onChange={(event) => setFeasibilityResult(event.target.value as 'Factible' | 'No Factible')}
              >
                <option value="Factible">Factible</option>
                <option value="No Factible">No factible</option>
              </select>
            </label>
            <button
              type="button"
              disabled={isFinal}
              onClick={() =>
                void runAction(
                  () => api.post(`/prospects/${prospect.idProspecto}/feasibility`, { resultado: feasibilityResult }),
                  'Factibilidad registrada',
                )
              }
            >
              Registrar factibilidad
            </button>
            {isNoFactible && <p className="alert">El prospecto no factible no puede avanzar a cotización ni contrato externo.</p>}
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
                <p>Crea el PDF de cotización solo después de factibilidad positiva.</p>
              </div>
            </header>
            <label>
              Plan a cotizar
              <select value={quotePlanId} disabled={!isFactible || isFinal} onChange={(event) => setQuotePlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {planOptions.map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>
                    {plan.nombreComercial}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!quotePlanId || !isFactible || isFinal} onClick={() => void generateQuote()}>
              Generar cotización
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
                <h4>Confirmar contratación</h4>
                <p>Confirma manualmente el plan aceptado; la firma se gestionará en Clientes.</p>
              </div>
            </header>
            <div className="prospect-contract-fields">
              <label>
                Plan aceptado
                <select value={contractPlanId} disabled={!isQuoted || isFinal} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {planOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {plan.nombreComercial}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha de confirmación
                <input
                  type="date"
                  value={contractConfirmationDate}
                  disabled={!isQuoted || isFinal}
                  onChange={(event) => setContractConfirmationDate(event.target.value)}
                />
              </label>
              <label>
                Observación
                <textarea
                  value={contractObservation}
                  disabled={!isQuoted || isFinal}
                  onChange={(event) => setContractObservation(event.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!isContractConfirmationReady}
              onClick={() => void registerExternalContract()}
            >
              Confirmar contratación
            </button>
          </section>
        )}
      </div>

      {permissions.recordProspectLoss && !isFinal && (
        <div className="button-row">
          <button type="button" className="prospect-loss-trigger" onClick={() => setLossOpen(true)}>
            Marcar como perdido
          </button>
        </div>
      )}

      {status && <p className={statusIsError ? 'alert' : 'inline-status'}>{status}</p>}

      <Modal title="Marcar prospecto como perdido" open={lossOpen} onClose={() => setLossOpen(false)}>
        <div className="stack prospect-loss-dialog">
          <label>
            Motivo
            <select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
              {LOSS_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observación
            <textarea value={lossObservation} onChange={(event) => setLossObservation(event.target.value)} required />
          </label>
          <div className="button-row prospect-loss-actions">
            <button type="button" className="secondary" onClick={() => setLossOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="prospect-loss-confirm" onClick={() => void recordLoss()}>
              Confirmar pérdida
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}