import { useEffect, useRef, useState } from 'react';
import { FileClock, HandCoins, MapPin, Pencil, UserRoundPlus, Wifi } from 'lucide-react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { Modal, StatusBadge } from '../../shared/components';
import { CoveragePicker, CoverageLocation, CoverageResult } from '../coverage';
import { ContractDateCalendar, localDateValue } from './ContractDateCalendar';
import './prospect-workflow.css';

const FACTIBLE_STATUSES = ['Factible', 'Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const QUOTED_STATUSES = ['Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const FINAL_PROSPECT_STATUSES = ['Perdido'];
const LOSS_REASONS = ['Precio', 'Sin cobertura', 'Competencia', 'Falta de respuesta', 'Otro'];
const FEASIBILITY_STAGES = ['Prospecto Nuevo', 'Contactado', 'En Factibilidad', 'Factible', 'No Factible'];

export function ProspectWorkflowPanel({
  prospect,
  plans,
  permissions,
  onChanged,
  onClose,
  onNotify,
}: {
  prospect: Prospect;
  plans: Plan[];
  permissions: DashboardPermissions;
  onChanged: () => void;
  onClose?: () => void;
  onNotify?: (message: string) => void;
}) {
  const [quotePlanId, setQuotePlanId] = useState('');
  const [contractPlanId, setContractPlanId] = useState('');
  const [contractConfirmationDate, setContractConfirmationDate] = useState(localDateValue);


  const [contractObservation, setContractObservation] = useState('');
  const [contractComuna, setContractComuna] = useState(prospect.comuna ?? '');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('Precio');
  const [lossObservation, setLossObservation] = useState('');

  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [location, setLocation] = useState<CoverageLocation | null>(null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [synchronized, setSynchronized] = useState<{ source: Prospect; updated: Prospect } | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [coverageSyncError, setCoverageSyncError] = useState(false);
  const [originConfirmed, setOriginConfirmed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reviewPending = useRef(false);
  const [editingProspect, setEditingProspect] = useState(false);
  const [savingProspect, setSavingProspect] = useState(false);
  const [prospectForm, setProspectForm] = useState({ nombreCompleto: '', telefono: '', email: '', origenContacto: '', direccion: '', comuna: '', region: '' });
  const changedListener = useRef(onChanged);
  changedListener.current = onChanged;
  const currentProspect = synchronized?.source === prospect ? synchronized.updated : prospect;
  const availablePlanIds = coverage?.planes.map(plan => plan.idPlan) ?? null;

  useEffect(() => {
    setLocation(prospect.latitud !== null && prospect.latitud !== undefined && prospect.longitud !== null && prospect.longitud !== undefined
      ? { latitud: prospect.latitud, longitud: prospect.longitud }
      : null);
    setQuotePlanId('');
    setContractPlanId('');
    setCoverage(null);
    setSynchronized(null);
    setCoverageSyncError(false);
    setOriginConfirmed(false);
    setEditingProspect(false);
    setContractConfirmationDate(localDateValue());
    setContractObservation('');
    setContractComuna(prospect.comuna ?? '');
    setLossOpen(false);
    setLossReason('Precio');
    setLossObservation('');

    setStatus('');
    setStatusIsError(false);
  }, [prospect.idProspecto]);

  useEffect(() => {
    if (availablePlanIds === null) return;
    setQuotePlanId((current) => current && !availablePlanIds.includes(Number(current)) ? '' : current);
    setContractPlanId((current) => current && !availablePlanIds.includes(Number(current)) ? '' : current);
  }, [coverage]);

  const currentStatus = currentProspect.estadoPipeline ?? 'Prospecto Nuevo';
  const requiresReview = currentProspect.requiereRevisionComercial === true;
  const isFactible = !requiresReview && FACTIBLE_STATUSES.includes(currentStatus);
  const isQuoted = !requiresReview && QUOTED_STATUSES.includes(currentStatus);
  const isFinal = requiresReview || FINAL_PROSPECT_STATUSES.includes(currentStatus);
  const pendingContract = prospect.contratos?.find((contract) => contract.estado === 'Pendiente firma contrato') ?? null;
  const isWorkflowLocked = isFinal || Boolean(currentProspect.contratos?.length) || currentProspect.idCliente != null;
  const canVerify = permissions.verifyFeasibility || permissions.createProspects;
  const canEditProspect = permissions.createProspects && !isWorkflowLocked && !isQuoted && FEASIBILITY_STAGES.includes(currentStatus);
  const hasSavedLocation = location !== null && currentProspect.latitud === location.latitud && currentProspect.longitud === location.longitud;
  const commercialReady = Boolean(coverage?.coberturaComercial && isFactible && hasSavedLocation && !checkingCoverage && !coverageSyncError && !isWorkflowLocked && !editingProspect && !savingProspect);
  const planOptions = plans.filter((plan) =>
    plan.activo !== false && plan.idEmpresa === prospect.empresa?.idEmpresa && availablePlanIds?.includes(plan.idPlan),
  );
  const quotedPlanIds = new Set((prospect.cotizaciones ?? []).filter(quote => quote.fechaEnvio).map(quote => quote.idPlan));
  const contractPlanOptions = planOptions.filter(plan => quotedPlanIds.has(plan.idPlan));

  function planOptionLabel(plan: Plan) {
    return `${plan.nombreComercial} - ${plan.empresa?.nombre ?? 'Sin empresa'}`;
  }
  function planSummary(planId: string, options: Plan[]) {
    const plan = options.find(item => item.idPlan === Number(planId));
    if (!plan) return null;
    const price = coverage?.planes.find(item => item.idPlan === plan.idPlan)?.precioAplicable ?? Number(plan.precioMensual);
    return <div className="prospect-selected-plan">
      <span className="prospect-selected-plan-icon"><Wifi size={22} aria-hidden="true" /></span>
      <div><strong>{plan.nombreComercial}</strong><span>{plan.velocidadMbps ? `${plan.velocidadMbps} Mbps` : plan.tipoPlan}</span></div>
      {Number.isFinite(price) && <div className="prospect-selected-plan-price"><strong>{price.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</strong><span>al mes</span></div>}
    </div>;
  }
  const isContractConfirmationReady = Boolean(contractPlanOptions.some(plan => plan.idPlan === Number(contractPlanId)) && isQuoted && !isWorkflowLocked);

  useEffect(() => {
    setCoverageSyncError(false);
    if (!canVerify || !coverage || !location || isWorkflowLocked || isQuoted || editingProspect) { setCheckingCoverage(false); return; }
    if (!hasSavedLocation && !canEditProspect) { setCheckingCoverage(false); setCoverageSyncError(true); return; }
    const nextStatus = coverage.coberturaComercial ? 'Factible' : 'No Factible';
    const zoneId = coverage.microzona?.idZonaPago ?? coverage.zona?.idZonaPago ?? null;
    if (hasSavedLocation && currentStatus === nextStatus && (currentProspect.idZonaPago ?? null) === zoneId) {
      setCheckingCoverage(false); return;
    }
    const controller = new AbortController();
    setCheckingCoverage(true);
    // Persist only changed feasibility/location; opening or polling a modal must not create repeated checks in the history.
    const timer = window.setTimeout(() => {
      const persistLocation = hasSavedLocation ? Promise.resolve() : api.patch(`/prospects/${prospect.idProspecto}/location`, { ubicacion: location }, { signal: controller.signal });
      void persistLocation.then(() => {
        if (controller.signal.aborted) return null;
        return api.post(`/prospects/${prospect.idProspecto}/feasibility/tomodat`, location, { signal: controller.signal });
      })
        .then(result => {
          if (controller.signal.aborted || !result) return;
          const { data } = result;
          setSynchronized({ source: prospect, updated: { ...prospect, ...data } });
          changedListener.current();
        })
        .catch(err => {
          if (!controller.signal.aborted) { setCoverageSyncError(true); setStatus(apiErrorMessage(err)); setStatusIsError(true); }
        })
        .finally(() => { if (!controller.signal.aborted) setCheckingCoverage(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [prospect, coverage, location?.latitud, location?.longitud, canVerify, canEditProspect, isWorkflowLocked, isQuoted, editingProspect, hasSavedLocation, currentStatus, currentProspect.idZonaPago]);

  async function approveG2Review() {
    if (reviewPending.current || !permissions.createProspects || !currentProspect.revisionOrigenG2Disponible || !originConfirmed) return;
    reviewPending.current = true;
    setReviewing(true);
    setStatus(''); setStatusIsError(false);
    try {
      const { data } = await api.post<Prospect>(`/prospects/${prospect.idProspecto}/g2-review`, {
        confirmarOrigenG2: true,
      });
      setSynchronized({ source: prospect, updated: { ...currentProspect, ...data } });
      setStatus('Revisión aprobada. Completa la ubicación y verifica cobertura antes de cotizar.');
      changedListener.current();
    } catch (error) { setStatus(apiErrorMessage(error)); setStatusIsError(true); }
    finally { reviewPending.current = false; setReviewing(false); }
  }

  function openProspectEditor() {
    setProspectForm({ nombreCompleto: currentProspect.nombreCompleto ?? '', telefono: currentProspect.telefono ?? '',
      email: currentProspect.email ?? '', origenContacto: currentProspect.origenContacto ?? '',
      direccion: currentProspect.direccion ?? '', comuna: currentProspect.comuna ?? '', region: currentProspect.region ?? '' });
    setEditingProspect(true);
    setStatus('');
  }

  function cancelEditing() {
    setLocation(currentProspect.latitud != null && currentProspect.longitud != null
      ? { latitud: currentProspect.latitud, longitud: currentProspect.longitud } : null);
    setCoverage(null);
    setEditingProspect(false);
    setStatus('');
  }

  async function saveProspect() {
    if (!canEditProspect || savingProspect) return;
    const addressChanged = prospectForm.direccion.trim() !== (currentProspect.direccion ?? '')
      || prospectForm.comuna.trim() !== (currentProspect.comuna ?? '') || prospectForm.region.trim() !== (currentProspect.region ?? '');
    if ((addressChanged && !location) || (location && (!Number.isFinite(location.latitud) || !Number.isFinite(location.longitud)
      || Math.abs(location.latitud) > 90 || Math.abs(location.longitud) > 180))) {
      setStatus('Selecciona en el mapa la ubicación de la dirección.');
      setStatusIsError(true); return;
    }
    setSavingProspect(true); setStatusIsError(false);
    try {
      const { data } = await api.patch<Prospect & { cobertura?: CoverageResult }>(`/prospects/${prospect.idProspecto}`, {
        nombreCompleto: prospectForm.nombreCompleto.trim(), telefono: prospectForm.telefono.trim(), email: prospectForm.email.trim(),
        origenContacto: prospectForm.origenContacto.trim(),
        ...(location || addressChanged ? { direccion: prospectForm.direccion.trim(), comuna: prospectForm.comuna.trim(), region: prospectForm.region.trim() } : {}),
        ...(location ? { ubicacion: location } : {}),
      });
      setSynchronized({ source: prospect, updated: { ...currentProspect, ...data } });
      setCoverage(data.cobertura ?? null); setCoverageSyncError(false);
      setEditingProspect(false); setStatus('Datos del prospecto guardados.');
      changedListener.current();
    } catch (error) { setStatus(apiErrorMessage(error)); setStatusIsError(true); }
    finally { setSavingProspect(false); }
  }

  async function runAction(action: () => Promise<unknown>, success: string, closeAfterSuccess = false) {
    setStatus('');
    setStatusIsError(false);

    try {
      await action();
      if (onNotify) onNotify(success);
      else setStatus(success);
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
    if (!commercialReady || !planOptions.some(plan => plan.idPlan === Number(quotePlanId))) return;
    setStatus('');
    setStatusIsError(false);

    try {
      const { data } = await api.post(`/prospects/${prospect.idProspecto}/quotes`, { planId: Number(quotePlanId) });
      const pdf = await api.get(data.pdfUrl, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(pdf.data);
      window.open(objectUrl, '_blank');
      if (data.envioEmail === 'failed') {
        setStatusIsError(true);
        setStatus('No se pudo enviar la cotización.');
      } else {
        const message = data.envioEmail === 'sent' ? 'Cotización enviada' : 'Cotización generada';
        if (onNotify) onNotify(message);
        else setStatus(message);
      }
      onChanged();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    }
  }

  async function registerExternalContract() {
    if (!commercialReady || !isContractConfirmationReady) return;
    await runAction(
      () =>
        api.post(`/prospects/${prospect.idProspecto}/contracts`, {
          planId: Number(contractPlanId),
          fechaInicio: contractConfirmationDate || undefined,
          observacionContrato: contractObservation.trim() || undefined,
          comuna: contractComuna.trim() || undefined,
        }),
      'Contratación confirmada',
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
          <div className="prospect-identity">
            <div className="prospect-name-row"><h3>{currentProspect.nombreCompleto}</h3>
              {canEditProspect && !editingProspect && <button type="button" className="prospect-edit-button" aria-label="Editar prospecto" title="Editar prospecto" onClick={openProspectEditor}><Pencil size={16} aria-hidden="true" /></button>}
            </div>
            <p>{prospect.rut ?? 'RUT no registrado'}</p>
          </div>
          <StatusBadge value={requiresReview ? 'Revisión comercial requerida' : currentStatus} />
        </header>
        {requiresReview && (
          <p role="alert">El estado histórico «{currentStatus}» no demuestra una activación. Revise las relaciones comerciales antes de continuar; no se han modificado los datos.</p>
        )}
        {!editingProspect && <dl className="prospect-overview-data">
          <div>
            <dt>Teléfono</dt>
            <dd>{currentProspect.telefono ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{currentProspect.email ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>{currentProspect.origenContacto ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Empresa</dt>
            <dd>{prospect.empresa?.nombre ?? 'No registrada'}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>{[currentProspect.direccion, currentProspect.comuna, currentProspect.region].filter(Boolean).join(', ') || 'Sin dirección registrada'}</dd>
          </div>
        </dl>}
        {editingProspect && <form className="prospect-edit-form" onSubmit={event => { event.preventDefault(); void saveProspect(); }}>
          <fieldset disabled={savingProspect}>
            <label className="prospect-field-wide">Nombre completo<input required minLength={5} maxLength={120} value={prospectForm.nombreCompleto} onChange={event => setProspectForm({ ...prospectForm, nombreCompleto: event.target.value })} /></label>
            <label>Teléfono<input required type="tel" pattern="\+569[0-9]{8}" placeholder="+56912345678" value={prospectForm.telefono} onChange={event => setProspectForm({ ...prospectForm, telefono: event.target.value })} /></label>
            <label>Correo<input type="email" maxLength={120} value={prospectForm.email} onChange={event => setProspectForm({ ...prospectForm, email: event.target.value })} /></label>
            <label>Origen de contacto<input maxLength={40} value={prospectForm.origenContacto} onChange={event => setProspectForm({ ...prospectForm, origenContacto: event.target.value })} /></label>
            <label className="prospect-field-wide">Dirección<input required minLength={8} maxLength={200} value={prospectForm.direccion} onChange={event => setProspectForm({ ...prospectForm, direccion: event.target.value })} /></label>
            <label>Comuna<input maxLength={80} value={prospectForm.comuna} onChange={event => setProspectForm({ ...prospectForm, comuna: event.target.value })} /></label>
            <label>Región<input maxLength={80} value={prospectForm.region} onChange={event => setProspectForm({ ...prospectForm, region: event.target.value })} /></label>
          </fieldset>
          <div className="prospect-edit-actions"><button type="button" className="secondary" disabled={savingProspect} onClick={cancelEditing}>Cancelar</button><button type="submit" disabled={savingProspect}>{savingProspect ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </form>}
      </section>

      {requiresReview && <section className="prospect-action-card" aria-label="Revisión comercial">
        <p>Este registro requiere revisión comercial y no se habilita automáticamente por su estado histórico.</p>
        {permissions.createProspects && currentProspect.revisionOrigenG2Disponible && <div className="stack">
          <p>Existen auditorías originales de solicitud y privacidad de G2. Comprueba la empresa antes de aprobar. Esta acción no acredita factibilidad ni crea contratos o clientes.</p>
          <label><input type="checkbox" checked={originConfirmed} onChange={event => setOriginConfirmed(event.target.checked)} disabled={reviewing} />Confirmo que verifiqué el origen G2 y la empresa de esta solicitud</label>
          <button type="button" disabled={reviewing || !originConfirmed} onClick={() => void approveG2Review()}>Aprobar revisión G2</button>
        </div>}
      </section>}

      <div className="workflow-grid prospect-action-grid">
        {(canVerify || permissions.generateQuotes || permissions.contractPlans) && prospect.empresa && (
          <section className="prospect-coverage-card">
            <CoveragePicker
              key={prospect.idProspecto}
              presentation={canEditProspect ? 'editor' : 'summary'}
              minimal
              idEmpresa={prospect.empresa.idEmpresa}
              direccion={[editingProspect ? prospectForm.direccion : currentProspect.direccion, editingProspect ? prospectForm.comuna : currentProspect.comuna, editingProspect ? prospectForm.region : currentProspect.region, 'Chile'].filter(Boolean).join(', ')}
              value={location}
              onChange={setLocation}
              onResult={setCoverage}
              autoGeocode={Boolean(canEditProspect && !editingProspect && currentProspect.direccion && currentProspect.comuna && currentProspect.region)}
              disabled={!canEditProspect || savingProspect}
            />
            {checkingCoverage && <p className="muted" role="status">Actualizando estado del prospecto…</p>}
          </section>
        )}

        {permissions.generateQuotes && commercialReady && planOptions.length > 0 && (
          <section className="prospect-commercial-section prospect-quote-section">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <FileClock size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Generar cotización</h4>
              </div>
            </header>
            <div className="prospect-quote-fields"><label>
              Plan a cotizar
              <select aria-label="Plan a cotizar" value={quotePlanId} disabled={!isFactible || isWorkflowLocked} onChange={(event) => setQuotePlanId(event.target.value)}>
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
            </div>
            {planSummary(quotePlanId, planOptions)}
          </section>
        )}

        {permissions.contractPlans && commercialReady && isQuoted && contractPlanOptions.length > 0 && (
          <section className="prospect-commercial-section prospect-contract-section">
            <header className="prospect-action-header">
              <span className="prospect-action-icon" aria-hidden="true">
                <HandCoins size={19} strokeWidth={1.8} />
              </span>
              <div>
                <h4>Confirmar contratación</h4>
              </div>
            </header>
            <div className="prospect-contract-layout"><div className="prospect-contract-details">
              <label>
                Plan aceptado
                <select aria-label="Plan aceptado" value={contractPlanId} disabled={!isQuoted || isWorkflowLocked} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {contractPlanOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {planOptionLabel(plan)}
                    </option>
                  ))}
                </select>
              </label>
              {planSummary(contractPlanId, contractPlanOptions)}
              <div className="prospect-contract-address"><MapPin size={18} aria-hidden="true" /><span>{prospect.direccion || 'Sin dirección registrada'}</span></div>
              <label>Comuna de instalación<input maxLength={80} value={contractComuna} disabled={!isQuoted || isWorkflowLocked} onChange={event => setContractComuna(event.target.value)} /></label>
              <label>
                Observación
                <textarea
                  value={contractObservation}
                  placeholder="Añadir una observación"
                  maxLength={500}
                  disabled={!isQuoted || isWorkflowLocked}
                  onChange={(event) => setContractObservation(event.target.value)}
                />
              </label>
            </div>
            <ContractDateCalendar value={contractConfirmationDate} onChange={setContractConfirmationDate} disabled={!isQuoted || isWorkflowLocked} />
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

        {pendingContract && permissions.manageContracts && !requiresReview && (
          <section className="prospect-action-card prospect-action-card-contract">
            <header className="prospect-action-header"><div><h4>Confirmar firma de contrato</h4><p>Al confirmar, la persona pasa a Pendiente de activacion. No se crea cliente ni servicio todavia.</p></div></header>
            <button type="button" onClick={() => void runAction(() => api.patch('/contracts/' + pendingContract.idContrato + '/confirm-signature', {}), 'Firma confirmada. La persona queda pendiente de activacion.', true)}>Confirmar firma</button>
          </section>
        )}
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
