import { ContractDocuments } from '../customers/ContractDocuments';
import { useSignatureStatus } from '../contracts/useSignatureStatus';
import { useEffect, useRef, useState } from 'react';
import { Download, FileClock, MapPin, Pencil, UserRoundPlus, Wifi } from 'lucide-react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { formatDateTime, formatRutForDisplay } from '../../lib';
import { chileRegions, findChileRegion, normalizeTerritory } from '../../shared/data/chile-territories';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { Modal, StatusBadge } from '../../shared/components';
import { CoveragePicker, CoverageLocation, CoverageResult } from '../coverage';
import './prospect-workflow.css';

const FACTIBLE_STATUSES = ['Factible', 'Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const QUOTED_STATUSES = ['Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma', 'Aceptado', 'Instalacion Programada', 'Servicio Activo'];
const FINAL_PROSPECT_STATUSES = ['Perdido'];
const LOSS_REASONS = ['Precio', 'Sin cobertura', 'Competencia', 'Falta de respuesta', 'Otro'];
const FEASIBILITY_STAGES = ['Prospecto Nuevo', 'Contactado', 'En Factibilidad', 'Factible', 'No Factible'];

function fullAddress({ direccion, comuna, region }: Pick<Prospect, 'direccion' | 'comuna' | 'region'>) {
  const parts = [direccion, comuna, region].map(part => part?.trim().replace(/\s+/g, ' ') ?? '');
  return parts.every(Boolean) ? [...parts, 'Chile'].join(', ') : '';
}

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
  const [contractObservation, setContractObservation] = useState('');
  const [confirmingContract, setConfirmingContract] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('Precio');
  const [lossObservation, setLossObservation] = useState('');

  const { message: status, showMessage: setStatus } = useTransientMessage();
  const [savingLoss, setSavingLoss] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [confirmedAddress, setConfirmedAddress] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [located, setLocated] = useState<{ address: string; point: CoverageLocation } | null>(null);
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
  const originalAddress = fullAddress(currentProspect);
  const address = editingProspect ? fullAddress(prospectForm) : originalAddress;
  const addressKey = address.toLocaleLowerCase('es-CL');
  const originalKey = originalAddress.toLocaleLowerCase('es-CL');
  const location = located && located.address === addressKey ? located.point
    : addressKey === originalKey && currentProspect.latitud != null && currentProspect.longitud != null
      ? { latitud: currentProspect.latitud, longitud: currentProspect.longitud } : null;
  const region = findChileRegion(prospectForm.region);
  const commune = region?.comunas.find(name => normalizeTerritory(name) === normalizeTerritory(prospectForm.comuna));
  const availablePlanIds = coverage?.planes.map(plan => plan.idPlan) ?? null;

  useEffect(() => {
    setLocated(null);
    setConfirmedAddress('');
    setQuotePlanId('');
    setContractPlanId('');
    setCoverage(null);
    setSynchronized(null);
    setCoverageSyncError(false);
    setOriginConfirmed(false);
    setEditingProspect(false);
    setContractObservation('');
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
  const pendingContract = currentProspect.contratos?.find((contract) => contract.estado === 'Pendiente firma contrato') ?? null;
  const lossReasons = pendingContract ? LOSS_REASONS.filter(reason => reason !== 'Sin cobertura') : LOSS_REASONS;
  const signaturePolicy = useSignatureStatus(pendingContract?.idContrato);
  const isWorkflowLocked = isFinal || Boolean(currentProspect.contratos?.length) || currentProspect.idCliente != null;
  const canVerify = permissions.verifyFeasibility || permissions.createProspects;
  const canEditProspect = permissions.createProspects && !isWorkflowLocked
    && (FEASIBILITY_STAGES.includes(currentStatus) || currentStatus === 'Cotizacion Enviada');
  const hasSavedLocation = location !== null && currentProspect.latitud === location.latitud && currentProspect.longitud === location.longitud;
  // A stored status (even 'Factible') without coordinates is not a confirmed location: the user must be able to mark it
  // manually, since automatic geocoding may be disabled or unavailable. A saved point is only changed through "Editar".
  const manualLocation = canEditProspect && (editingProspect || (!isQuoted && (currentProspect.latitud == null || currentProspect.longitud == null)));
  const commercialReady = Boolean(coverage?.coberturaComercial && isFactible && hasSavedLocation && !checkingCoverage
    && !locatingAddress && !coverageSyncError && !isWorkflowLocked && !editingProspect && !savingProspect);
  const planOptions = plans.filter((plan) =>
    plan.activo !== false && plan.idEmpresa === prospect.empresa?.idEmpresa && availablePlanIds?.includes(plan.idPlan),
  );
  const quotes = currentProspect.cotizaciones ?? [];
  const quotedPlanIds = new Set(quotes.filter(quote => quote.fechaEnvio && quote.vigente !== false).map(quote => quote.idPlan));
  const canRecordLoss = permissions.recordProspectLoss && !isFinal && currentProspect.idCliente == null
    && (Boolean(pendingContract) || !isWorkflowLocked);
  const isLost = currentStatus === 'Perdido' && !requiresReview;
  const canReactivate = isLost && permissions.createProspects && currentProspect.idCliente == null
    && !(currentProspect.contratos ?? []).some(contract => !['Baja', 'Anulado'].includes(contract.estado ?? ''));
  const contractPlanOptions = planOptions.filter(plan => quotedPlanIds.has(plan.idPlan));
  const acceptedPlan = contractPlanOptions.find(plan => plan.idPlan === Number(contractPlanId));

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
  const isContractConfirmationReady = Boolean(acceptedPlan && isQuoted && !isWorkflowLocked && !confirmingContract);

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
      const persistCoverage = hasSavedLocation
        ? api.post(`/prospects/${prospect.idProspecto}/feasibility/tomodat`, location, { signal: controller.signal })
        : api.patch(`/prospects/${prospect.idProspecto}/location`, { ubicacion: location }, { signal: controller.signal });
      void persistCoverage
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
    setConfirmedAddress('');
    setEditingProspect(true);
    setStatus('');
  }

  function cancelEditing() {
    setLocated(null);
    setConfirmedAddress('');
    setEditingProspect(false);
    setStatus('');
  }

  async function saveProspect() {
    if (!canEditProspect || savingProspect || locatingAddress) return;
    const addressChanged = prospectForm.direccion.trim() !== (currentProspect.direccion ?? '')
      || prospectForm.comuna.trim() !== (currentProspect.comuna ?? '') || prospectForm.region.trim() !== (currentProspect.region ?? '');
    if ((addressChanged && !address) || ((addressChanged || isQuoted) && !location)) {
      setConfirmedAddress(addressKey);
      setStatus(address ? 'Espera a que se ubique la dirección o revisa los datos ingresados.' : 'Completa la dirección, la comuna y la región.');
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
      const invalidatedQuotes = isQuoted && data.estadoPipeline !== 'Cotizacion Enviada';
      setSynchronized({ source: prospect, updated: { ...currentProspect, ...data,
        ...(invalidatedQuotes ? { cotizaciones: quotes.map(quote => ({ ...quote, vigente: false })) } : {}) } });
      setLocated(null);
      if (data.cobertura) setCoverage(data.cobertura);
      setCoverageSyncError(false);
      setQuotePlanId(''); setContractPlanId('');
      setEditingProspect(false);
      setStatus(currentStatus === 'Cotizacion Enviada'
        ? data.estadoPipeline === 'Cotizacion Enviada'
          ? 'No hubo cambios; la cotización sigue vigente.'
          : data.estadoPipeline === 'Factible'
          ? 'Datos guardados. La cotización anterior quedó invalidada; puedes generar una nueva.'
          : 'Datos guardados. La nueva ubicación no tiene cobertura comercial factible.'
        : 'Datos del prospecto guardados.');
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
    setConfirmingContract(true);
    try {
      await runAction(
        () => api.post(`/prospects/${prospect.idProspecto}/contracts`, {
          planId: Number(contractPlanId),
          observacionContrato: contractObservation.trim() || undefined,
        }),
        'Contratación confirmada',
        true,
      );
    } finally {
      setConfirmingContract(false);
    }
  }

  async function recordLoss() {
    if (savingLoss) return;
    if (!lossObservation.trim()) {
      setStatusIsError(true);
      setStatus('Registra una observación para justificar la pérdida del prospecto.');
      return;
    }

    setStatus('');
    setStatusIsError(false);

    try {
      setSavingLoss(true);
      await api.post('/prospects/' + prospect.idProspecto + '/loss', {
        motivo: lossReason,
        observaciones: lossObservation.trim(),
      });
      if (onNotify) onNotify('Prospecto marcado como perdido.');
      else setStatus('Prospecto marcado como perdido.');
      onChanged();
      setLossOpen(false);
      onClose?.();
    } catch (err) {
      setStatusIsError(true);
      setStatus(apiErrorMessage(err));
    } finally { setSavingLoss(false); }
  }

  async function downloadQuote({ idCotizacion, codigo }: NonNullable<Prospect['cotizaciones']>[number]) {
    try {
      const { data } = await api.get('/prospects/' + prospect.idProspecto + '/quotes/' + idCotizacion + '/pdf', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = (codigo ?? 'cotizacion-' + idCotizacion) + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setStatusIsError(true); setStatus(apiErrorMessage(err)); }
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
            <p>{formatRutForDisplay(prospect.rut) ?? 'RUT no registrado'}</p>
          </div>
          <StatusBadge value={currentProspect.excliente?.etiqueta ?? (requiresReview ? 'Revisión comercial requerida' : currentStatus)} />
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
            {/* Same layout as the customer profile editor; validation and save logic stay prospect-specific. */}
            <label className="prospect-field-name">Nombre completo<input autoFocus required minLength={5} maxLength={120} value={prospectForm.nombreCompleto} onChange={event => setProspectForm({ ...prospectForm, nombreCompleto: event.target.value })} /></label>
            <label>Origen de contacto<input maxLength={40} value={prospectForm.origenContacto} onChange={event => setProspectForm({ ...prospectForm, origenContacto: event.target.value })} /></label>
            <label>Teléfono<input required type="tel" pattern="\+569[0-9]{8}" placeholder="+56912345678" value={prospectForm.telefono} onChange={event => setProspectForm({ ...prospectForm, telefono: event.target.value })} /></label>
            <label>Correo<input type="email" maxLength={120} value={prospectForm.email} onChange={event => setProspectForm({ ...prospectForm, email: event.target.value })} /></label>
            <div className="prospect-edit-readonly"><span>Empresa</span><strong>{prospect.empresa?.nombre ?? 'No registrada'}</strong></div>
            <label className="prospect-field-wide">Dirección<input required minLength={8} maxLength={200} value={prospectForm.direccion} onChange={event => { setConfirmedAddress(''); setLocated(null); setProspectForm({ ...prospectForm, direccion: event.target.value }); }} onBlur={() => setConfirmedAddress(addressKey)} /></label>
            <label>Región<select value={region?.nombre ?? prospectForm.region} onChange={event => {
              const nextRegion = findChileRegion(event.target.value);
              const next = { ...prospectForm, region: event.target.value,
                comuna: nextRegion?.comunas.find(name => normalizeTerritory(name) === normalizeTerritory(prospectForm.comuna)) ?? '' };
              setLocated(null);
              setProspectForm(next);
              setConfirmedAddress(fullAddress(next).toLocaleLowerCase('es-CL'));
            }}>
              <option value="">Seleccionar región</option>
              {prospectForm.region && !region && <option value={prospectForm.region}>{prospectForm.region}</option>}
              {chileRegions.map(item => <option key={item.codigo} value={item.nombre}>{item.nombre}</option>)}
            </select></label>
            <label>Comuna<select value={commune ?? prospectForm.comuna} disabled={!region} onChange={event => {
              const next = { ...prospectForm, comuna: event.target.value };
              setLocated(null);
              setProspectForm(next);
              setConfirmedAddress(fullAddress(next).toLocaleLowerCase('es-CL'));
            }}>
              <option value="">{region ? 'Seleccionar comuna' : 'Selecciona primero una región'}</option>
              {prospectForm.comuna && !commune && <option value={prospectForm.comuna}>{prospectForm.comuna}</option>}
              {region?.comunas.map(item => <option key={item} value={item}>{item}</option>)}
            </select></label>
          </fieldset>
          <div className="prospect-edit-actions"><button type="button" className="secondary compact" disabled={savingProspect} onClick={cancelEditing}>Cancelar</button><button type="submit" className="compact" disabled={savingProspect || locatingAddress}>{savingProspect ? 'Guardando…' : locatingAddress ? 'Verificando dirección…' : 'Guardar datos'}</button></div>
        </form>}
      </section>

      {requiresReview && <section className="prospect-action-card" aria-label="Revisión comercial">
        <p>Este registro requiere revisión comercial y no se habilita automáticamente por su estado histórico.</p>
        {permissions.createProspects && currentProspect.revisionOrigenG2Disponible && <div className="stack">
          <p>Existen auditorías originales de solicitud y privacidad del portal de clientes. Comprueba la empresa antes de aprobar. Esta acción no acredita factibilidad ni crea contratos o clientes.</p>
          <label><input type="checkbox" checked={originConfirmed} onChange={event => setOriginConfirmed(event.target.checked)} disabled={reviewing} />Confirmo que verifiqué el origen en el portal de clientes y la empresa de esta solicitud</label>
          <button type="button" disabled={reviewing || !originConfirmed} onClick={() => void approveG2Review()}>Aprobar revisión del portal</button>
        </div>}
      </section>}

      {isLost && <section className="prospect-action-card" aria-label="Prospecto perdido">
        <p><strong>Prospecto perdido.</strong> Se conserva su historial comercial; no se puede cotizar ni contratar hasta reactivarlo.</p>
        <dl className="prospect-overview-data">
          <div><dt>Motivo</dt><dd>{currentProspect.motivoPerdida ?? 'No registrado'}</dd></div>
          <div><dt>Fecha</dt><dd>{currentProspect.fechaPerdida ? formatDateTime(currentProspect.fechaPerdida) : 'No registrada'}</dd></div>
          <div><dt>Observación</dt><dd>{currentProspect.observacionPerdida ?? 'Sin observación'}</dd></div>
        </dl>
        {canReactivate && <button type="button" onClick={() => void runAction(
          () => api.patch(`/prospects/${prospect.idProspecto}/pipeline`, { estadoPipeline: 'Prospecto Nuevo' }),
          'Prospecto reactivado como Prospecto Nuevo. Verifica la cobertura antes de cotizar.',
        )}>Reactivar prospecto</button>}
      </section>}

      <div className="workflow-grid prospect-action-grid">
        {(canVerify || permissions.generateQuotes || permissions.contractPlans) && prospect.empresa && (
          <section className="prospect-coverage-card">
            <CoveragePicker
              key={prospect.idProspecto}
              presentation="summary"
              showAddressRetry={canEditProspect}
              allowManualLocation={manualLocation}
              idEmpresa={prospect.empresa.idEmpresa}
              direccion={address}
              value={location}
              onChange={point => setLocated(point ? { address: addressKey, point } : null)}
              onBusyChange={setLocatingAddress}
              onResult={setCoverage}
              autoGeocode={Boolean(canEditProspect && address && (!editingProspect || confirmedAddress === addressKey))}
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
            <h4>Datos de contratación</h4>
            <div className="prospect-contract-layout">
              <label>
                Plan aceptado
                <select aria-label="Plan aceptado" value={contractPlanId} disabled={confirmingContract} onChange={(event) => setContractPlanId(event.target.value)}>
                  <option value="">Seleccionar plan</option>
                  {contractPlanOptions.map((plan) => (
                    <option key={plan.idPlan} value={plan.idPlan}>
                      {planOptionLabel(plan)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observación opcional
                <textarea
                  rows={1}
                  value={contractObservation}
                  maxLength={500}
                  disabled={confirmingContract}
                  onChange={(event) => setContractObservation(event.target.value)}
                />
              </label>
              <button type="button" disabled={!isContractConfirmationReady} onClick={() => void registerExternalContract()}>
                {confirmingContract ? 'Confirmando…' : 'Confirmar contratación'}
              </button>
            </div>
            <p className="prospect-contract-address"><MapPin size={15} aria-hidden="true" />{[currentProspect.direccion, currentProspect.comuna].filter(Boolean).join(', ')}</p>
          </section>
        )}
      </div>

        {(quotes.length > 0 || (pendingContract && permissions.manageContracts && !requiresReview)) && (
          <section className="prospect-documents">
            <h4>Documentos</h4>
            <ul className="prospect-document-list">
              {quotes.map(quote => <li key={quote.idCotizacion}>
                <div><strong>{quote.codigo || `COT-${quote.idCotizacion}`}</strong><small>{formatDateTime(quote.fechaEnvio)}{quote.vigente === false ? ' · No vigente' : ''}</small></div>
                {(permissions.generateQuotes || permissions.manageContracts) && <button type="button" className="prospect-document-download" aria-label={`Descargar cotización ${quote.codigo ?? quote.idCotizacion}`} title="Descargar cotización" onClick={() => void downloadQuote(quote)}><Download size={17} aria-hidden="true" /></button>}
              </li>)}
              {pendingContract && permissions.manageContracts && !requiresReview && <ContractDocuments idContrato={pendingContract.idContrato} fechaInicio={pendingContract.fechaInicio} fechaConfirmacion={pendingContract.fechaConfirmacion} canGenerate={permissions.generateDigitalContract} onChanged={onChanged} prospectList />}
            </ul>
            {pendingContract && permissions.manageContracts && !requiresReview && signaturePolicy.status?.policy.manualAllowed && <button type="button" onClick={() => void runAction(async () => { if (!(await signaturePolicy.refresh())?.policy.manualAllowed) throw new Error('Firma manual no autorizada'); return api.patch('/contracts/' + pendingContract.idContrato + '/confirm-signature', {}); }, 'Firma confirmada. La persona queda pendiente de activacion.', true)}>Registrar firma manual</button>}
          </section>
        )}
      {canRecordLoss && (
        <div className="button-row">
          <button type="button" className="prospect-loss-trigger" onClick={() => {
            setStatus('');
            setLossReason(pendingContract ? 'Falta de respuesta' : 'Precio');
            setLossOpen(true);
          }}>
            Marcar como perdido
          </button>
        </div>
      )}

      {status && !lossOpen && <p role={statusIsError ? 'alert' : 'status'} className={statusIsError ? 'alert' : 'inline-status'}>{status}</p>}

      <Modal title="Registrar pérdida" open={lossOpen} onClose={() => { if (!savingLoss) setLossOpen(false); }}>
        <div className="stack prospect-loss-dialog">
          <label>
            Motivo
            <select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
              {lossReasons.map((item) => (
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
          {status && <p role="alert" className="alert">{status}</p>}
          <div className="button-row prospect-loss-actions">
            <button type="button" className="secondary" disabled={savingLoss} onClick={() => setLossOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="prospect-loss-confirm" disabled={savingLoss} onClick={() => void recordLoss()}>
              Confirmar pérdida
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
