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
  const [dueDay, setDueDay] = useState(5);
  const [contractNumber, setContractNumber] = useState('');
  const [contractFolio, setContractFolio] = useState('');
  const [contractUrl, setContractUrl] = useState('');
  const [contractGeneratedAt, setContractGeneratedAt] = useState('');
  const [contractSentAt, setContractSentAt] = useState('');
  const [contractObservation, setContractObservation] = useState('');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('Precio');
  const [lossObservation, setLossObservation] = useState('');
  const [lossDetail, setLossDetail] = useState('');
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    setFeasibilityResult('Factible');
    setQuotePlanId('');
    setContractPlanId('');
    setContractNumber('');
    setContractFolio('');
    setContractUrl('');
    setContractGeneratedAt('');
    setContractSentAt('');
    setContractObservation('');
    setLossOpen(false);
    setLossReason('Precio');
    setLossObservation('');
    setLossDetail('');
    setStatus('');
    setStatusIsError(false);
  }, [prospect.idProspecto]);

  const currentStatus = prospect.estadoPipeline ?? 'Prospecto Nuevo';
  const isFactible = FACTIBLE_STATUSES.includes(currentStatus);
  const isNoFactible = currentStatus === 'No Factible';
  const isQuoted = QUOTED_STATUSES.includes(currentStatus);
  const isFinal = FINAL_PROSPECT_STATUSES.includes(currentStatus);
  const planOptions = plans.filter((plan) => !plan.idEmpresa || !prospect.empresa || plan.idEmpresa === prospect.empresa.idEmpresa);
  const hasContractReference = Boolean(
    contractNumber.trim() || contractFolio.trim() || contractUrl.trim() || contractObservation.trim(),
  );

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
    if (!hasContractReference) {
      setStatusIsError(true);
      setStatus('Informa número, folio, URL u observación del contrato externo.');
      return;
    }

    await runAction(
      () =>
        api.post(`/prospects/${prospect.idProspecto}/contracts`, {
          planId: Number(contractPlanId),
          diaVencimiento: dueDay,
          proveedorContrato: 'FACTURACION_CL',
          numeroContratoExterno: contractNumber.trim() || undefined,
          folioContratoExterno: contractFolio.trim() || undefined,
          urlContratoPdf: contractUrl.trim() || undefined,
          fechaGeneracionContrato: contractGeneratedAt || undefined,
          fechaEnvioCliente: contractSentAt || undefined,
          observacionContrato: contractObservation.trim() || undefined,
        }),
      'Contrato externo registrado. El prospecto queda como cliente pendiente de firma.',
      true,
    );
  }

  async function recordLoss() {
    if (!lossObservation.trim()) {
      setStatusIsError(true);
      setStatus('Registra una observación para justificar la pérdida del prospecto.');
      return;
    }

    await runAction(
      () =>
        api.post(`/prospects/${prospect.idProspecto}/loss`, {
          motivo: lossReason,
          observaciones: lossObservation.trim(),
          detalleMotivoPerdida: lossDetail.trim() || undefined,
        }),
      'Prospecto marcado como perdido.',
      true,
    );
    setLossOpen(false);
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
                <h4>Registrar contrato externo</h4>
                <p>Guarda la referencia del contrato gestionado en Facturación.cl.</p>
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
                Día de vencimiento
                <input
                  min="1"
                  max="28"
                  type="number"
                  value={dueDay}
                  disabled={!isQuoted || isFinal}
                  onChange={(event) => setDueDay(Number(event.target.value))}
                />
              </label>
              <label>
                Número contrato externo
                <input value={contractNumber} disabled={!isQuoted || isFinal} onChange={(event) => setContractNumber(event.target.value)} />
              </label>
              <label>
                Folio externo
                <input value={contractFolio} disabled={!isQuoted || isFinal} onChange={(event) => setContractFolio(event.target.value)} />
              </label>
              <label>
                URL PDF externo
                <input value={contractUrl} disabled={!isQuoted || isFinal} onChange={(event) => setContractUrl(event.target.value)} />
              </label>
              <label>
                Fecha generación
                <input type="date" value={contractGeneratedAt} disabled={!isQuoted || isFinal} onChange={(event) => setContractGeneratedAt(event.target.value)} />
              </label>
              <label>
                Fecha envío cliente
                <input type="date" value={contractSentAt} disabled={!isQuoted || isFinal} onChange={(event) => setContractSentAt(event.target.value)} />
              </label>
              <label>
                Observación contrato
                <input value={contractObservation} disabled={!isQuoted || isFinal} onChange={(event) => setContractObservation(event.target.value)} />
              </label>
            </div>
            <button
              type="button"
              disabled={!contractPlanId || !isQuoted || isFinal || !hasContractReference}
              onClick={() => void registerExternalContract()}
            >
              Registrar contrato externo
            </button>
          </section>
        )}
      </div>

      {permissions.recordProspectLoss && !isFinal && (
        <div className="button-row">
          <button type="button" className="secondary compact" onClick={() => setLossOpen(true)}>
            Marcar como perdido
          </button>
        </div>
      )}

      {status && <p className={statusIsError ? 'alert' : 'inline-status'}>{status}</p>}

      <Modal title="Marcar prospecto como perdido" open={lossOpen} onClose={() => setLossOpen(false)}>
        <div className="stack">
          <p>Esta acción saca al prospecto del flujo activo y no lo convierte en cliente.</p>
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
          <label>
            Detalle adicional
            <textarea value={lossDetail} onChange={(event) => setLossDetail(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" className="secondary" onClick={() => setLossOpen(false)}>
              Cancelar
            </button>
            <button type="button" onClick={() => void recordLoss()}>
              Confirmar pérdida
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}