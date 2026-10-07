import { useEffect, useState } from 'react';
import { FileClock, HandCoins, UserRoundPlus } from 'lucide-react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { CommercialCoverage, ProspectLocation, prospectNeedsReview, prospectStageLabel, validLocation } from './prospect-coverage';
import { locateProspectAddress, prospectAddressError } from './prospect-address';
import { ProspectCoverageMap } from './ProspectCoverageMap';
import './prospects.css';

const QUOTABLE_STATUSES = ['Prospecto Nuevo', 'Contactado', 'En Factibilidad', 'Factible', 'No Factible', 'Cotizacion Enviada', 'Contrato externo registrado'];
const QUOTED_STATUSES = ['Cotizacion Enviada', 'Contrato externo registrado'];
const FINAL_PROSPECT_STATUSES = ['Perdido', 'Servicio Activo', 'Pendiente activacion', 'Instalacion Programada', 'Instalacion en G3'];
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
  const [quotePlanId, setQuotePlanId] = useState('');
  const [contractPlanId, setContractPlanId] = useState('');
  const [contractConfirmationDate, setContractConfirmationDate] = useState(() => new Date().toISOString().slice(0, 10));


  const [contractObservation, setContractObservation] = useState('');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('Precio');
  const [lossObservation, setLossObservation] = useState('');

  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [location, setLocation] = useState<ProspectLocation | null>(null);
  const [coverage, setCoverage] = useState<CommercialCoverage | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(true);
  const [coverageError, setCoverageError] = useState('');
  const [busy, setBusy] = useState(false);
  const companyId = prospect.empresa?.idEmpresa;
  const address = [prospect.direccion, prospect.comuna, prospect.region].filter(Boolean).join(', ');
  const canConsultCoverage = permissions.verifyFeasibility || permissions.createProspects;

  useEffect(() => {
    const controller = new AbortController();
    setCoverage(null);
    setLocation(null);
    setCoverageError('');
    setCheckingCoverage(true);
    void (async () => {
      try {
        const point = validLocation(prospect) ?? (address && canConsultCoverage ? await locateProspectAddress({ direccion: prospect.direccion ?? '', comuna: prospect.comuna, region: prospect.region }, controller.signal) : null);
        if (controller.signal.aborted) return;
        setLocation(point);
        if (point && companyId && canConsultCoverage) {
          const { data } = await api.get<CommercialCoverage>('/coverage/plans-for-location', {
            params: { idEmpresa: companyId, ...point }, signal: controller.signal,
          });
          if (!controller.signal.aborted) setCoverage(data);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setCoverageError(prospectAddressError(cause));
      } finally {
        if (!controller.signal.aborted) setCheckingCoverage(false);
      }
    })();
    return () => controller.abort();
  }, [prospect.idProspecto, prospect.latitud, prospect.longitud, address, companyId, canConsultCoverage]);

  useEffect(() => {
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

  useEffect(() => {
    const ids = coverage?.planes.map((plan) => plan.idPlan) ?? [];
    setQuotePlanId((current) => current && !ids.includes(Number(current)) ? '' : current);
    setContractPlanId((current) => current && !ids.includes(Number(current)) ? '' : current);
  }, [coverage]);

  const currentStatus = prospect.estadoPipeline ?? 'Prospecto Nuevo';
  const isFactible = QUOTABLE_STATUSES.includes(currentStatus) && Boolean(location)
    && coverage?.coberturaComercial === true && !checkingCoverage;
  const isNoFactible = coverage ? !coverage.coberturaComercial : currentStatus === 'No Factible';
  const isQuoted = QUOTED_STATUSES.includes(currentStatus);
  const isFinal = FINAL_PROSPECT_STATUSES.includes(currentStatus);
  const pendingContract = prospect.contratos?.find((contract) => contract.estado === 'Pendiente firma contrato') ?? null;
  const needsReview = prospectNeedsReview(prospect);
  const isWorkflowLocked = isFinal || Boolean(prospect.idCliente) || Boolean(pendingContract) || busy;
  const planOptions = plans.filter((plan) =>
    plan.activo !== false && plan.idEmpresa === companyId && Boolean(coverage?.planes.some((available) => available.idPlan === plan.idPlan)),
  );

  function planOptionLabel(plan: Plan) {
    return `${plan.nombreComercial} - ${plan.empresa?.nombre ?? 'Sin empresa'}`;
  }
  const isContractConfirmationReady = Boolean(contractPlanId && isQuoted && isFactible && !isWorkflowLocked);

  async function runAction(action: () => Promise<unknown>, success: string, closeAfterSuccess = false) {
    if (busy) return;
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  async function generateQuote() {
    if (!isFactible || isWorkflowLocked || !quotePlanId) return;
    setBusy(true);
    setStatus('');
    setStatusIsError(false);

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/quotes`, { planId: Number(quotePlanId), validarDireccion: true });
      onChanged();
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
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function registerExternalContract() {
    if (!isContractConfirmationReady) return;
    await runAction(
      () =>
        api.post(`/prospects/${prospect.idProspecto}/contracts`, {
          planId: Number(contractPlanId),
          fechaInicio: contractConfirmationDate || undefined,
          observacionContrato: contractObservation.trim() || undefined,
        }),
      'Contratación confirmada. El prospecto queda pendiente de firma.',
      true,
    );
  }

  async function recordLoss() {
    if (busy || isFinal) return;
    if (!lossObservation.trim()) {
      setStatusIsError(true);
      setStatus('Registra una observación para justificar la pérdida del prospecto.');
      return;
    }

    setStatus('');
    setStatusIsError(false);
    setBusy(true);

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
    } finally {
      setBusy(false);
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
          <StatusBadge value={prospectStageLabel(prospect)} />
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

      {needsReview && <p className="prospect-history-note" role="note">Registro histórico: sus antecedentes de activación están pendientes de verificar.</p>}
      <ProspectCoverageMap address={address} location={location} coverage={coverage} loading={checkingCoverage} error={coverageError} />
      <div className="workflow-grid prospect-action-grid">
        {isNoFactible && <p className="alert">El prospecto fuera de cobertura no puede avanzar a cotización ni contrato externo.</p>}
        {!isNoFactible && !isFactible && !isWorkflowLocked && <p className="inline-status">La cotización y la contratación se habilitan cuando la ubicación registrada tiene cobertura confirmada.</p>}

        {permissions.generateQuotes && (
          <section className="prospect-action-card">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <FileClock size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Generar cotización</h4>
                <p>Crea el PDF cuando la ubicacion tiene cobertura comercial y el plan esta disponible.</p>
              </div>
            </header>
            <label>
              Plan a cotizar
              <select value={quotePlanId} disabled={!isFactible || isWorkflowLocked} onChange={(event) => setQuotePlanId(event.target.value)}>
                <option value="">Seleccionar plan</option>
                {planOptions.map((plan) => (
                  <option key={plan.idPlan} value={plan.idPlan}>
                    {planOptionLabel(plan)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!quotePlanId || !isFactible || isWorkflowLocked} onClick={() => void generateQuote()}>
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
                <p>Confirma el plan cotizado y luego registra la firma del contrato aquí.</p>
              </div>
            </header>
            <div className="prospect-contract-fields">
              <label>
                Plan aceptado
                <select value={contractPlanId} disabled={!isQuoted || !isFactible || isWorkflowLocked} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {planOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {planOptionLabel(plan)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha de confirmación
                <input
                  type="date"
                  value={contractConfirmationDate}
                  disabled={!isQuoted || !isFactible || isWorkflowLocked}
                  onChange={(event) => setContractConfirmationDate(event.target.value)}
                />
              </label>
              <label>
                Observación
                <textarea
                  value={contractObservation}
                  disabled={!isQuoted || !isFactible || isWorkflowLocked}
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

        {pendingContract && permissions.manageContracts && (
          <section className="prospect-action-card prospect-action-card-contract">
            <header className="prospect-action-header"><div><h4>Confirmar firma de contrato</h4><p>Al confirmar, la persona pasa a Pendiente de activacion. No se crea cliente ni servicio todavia.</p></div></header>
            <button type="button" disabled={busy || isFinal || isNoFactible || !validLocation(prospect) || !coverage?.coberturaComercial || checkingCoverage} onClick={() => void runAction(() => api.patch('/contracts/' + pendingContract.idContrato + '/confirm-signature', {}), 'Firma confirmada. La persona queda pendiente de activacion.', true)}>Confirmar firma</button>
          </section>
        )}
      {permissions.recordProspectLoss && !isFinal && (
        <div className="button-row">
          <button type="button" className="prospect-loss-trigger" disabled={busy} onClick={() => setLossOpen(true)}>
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
            <button type="button" className="prospect-loss-confirm" disabled={busy} onClick={() => void recordLoss()}>
              Confirmar pérdida
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
