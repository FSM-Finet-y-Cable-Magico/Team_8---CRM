import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download, FileClock, MapPin, Wifi, X } from 'lucide-react';
import { api, apiErrorMessage, type Company, type Customer, type CustomerService, type Plan } from '../../api';
import { CoveragePicker, type CoverageLocation, type CoverageResult } from '../coverage';
import { chileRegions, findChileRegion, normalizeTerritory } from '../../shared/data/chile-territories';
import { formatDateTime } from '../../lib';
import { ToastNotice } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import type { CustomerProfileFields } from './CustomerProfileForm';
import '../prospects/prospect-workflow.css';

type Contract = NonNullable<Customer['contratos']>[number];
type QuoteResponse = { idCotizacion: number; idProspecto: number; idPlan: number; codigo: string | null; envioEmail: string; fechaEnvio?: string | null };
export type CustomerPlanQuote = {
  idCotizacion: number; idProspecto: number; idPlan: number; idEmpresa: number; codigo: string | null;
  fechaEnvio: string | null; planNombre: string; vigente: boolean;
  direccion: string; comuna: string; region: string; latitud: number | null; longitud: number | null;
  contrato: { idContrato: number; estado: string } | null;
};
type Address = { direccion: string; comuna: string; region: string; location?: CoverageLocation | null };
const normalizedAddress = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
const addressKey = (address: Pick<Address, 'direccion' | 'comuna'>) => [address.direccion, address.comuna]
  .map(value => value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL')).join('|');
function knownPoint(row?: { latitud: number | null; longitud: number | null } | null): CoverageLocation | null {
  return row?.latitud != null && row.longitud != null && Number.isFinite(Number(row.latitud)) && Number.isFinite(Number(row.longitud))
    && Math.abs(Number(row.latitud)) <= 90 && Math.abs(Number(row.longitud)) <= 180
    ? { latitud: Number(row.latitud), longitud: Number(row.longitud) } : null;
}
function locateCommune(address: Address): Address {
  const region = chileRegions.find(item => item.comunas.some(commune => normalizeTerritory(commune) === normalizeTerritory(address.comuna)));
  return region ? { ...address, region: region.nombre, comuna: region.comunas.find(commune => normalizeTerritory(commune) === normalizeTerritory(address.comuna))! } : address;
}
function mergeQuotes(newRows: CustomerPlanQuote[], previous: CustomerPlanQuote[]) {
  return [...new Map([...newRows, ...previous].map(row => [row.idCotizacion, row])).values()].sort((a, b) => b.idCotizacion - a.idCotizacion);
}

export function CustomerPlanForm({ customer, services, plans, onCancel, onCreated, onAddressesChanged, initialCompanyId, companies: availableCompanies = [] }: {
  customer: Customer; services: CustomerService[]; plans: Plan[]; onCancel: () => void;
  onCreated: (contract: Contract) => Promise<void>; initialCompanyId?: number; companies?: Company[];
  onAddressesChanged?: (profile: CustomerProfileFields) => Promise<void>;
}) {
  const addressRecords: Address[] = [...(customer.direccionActual ? [{ ...customer.direccionActual, region: '' }] : []),
    ...(customer.direcciones ?? []).map(item => ({ direccion: item.direccionCompleta, comuna: item.comuna ?? '', region: '' })),
    ...services.flatMap(service => service.direccion ? [{ direccion: service.direccion.direccionCompleta, comuna: service.direccion.comuna ?? '', region: '' }] : []),
    ...(customer.contratos ?? []).flatMap(contract => contract.direccionInstalacion ? [{ direccion: contract.direccionInstalacion, comuna: contract.comunaInstalacion ?? '', region: contract.prospecto?.region ?? '',
      location: contract.prospecto && contract.prospecto.idEmpresa === contract.idEmpresa && addressKey({ direccion: contract.direccionInstalacion, comuna: contract.comunaInstalacion ?? '' }) === addressKey({ direccion: contract.prospecto.direccion ?? '', comuna: contract.prospecto.comuna ?? '' })
        ? knownPoint(contract.prospecto) : null }] : [])].map(locateCommune);
  const [omittedAddresses, setOmittedAddresses] = useState(customer.direccionesOmitidas ?? []);
  const omittedVersion = JSON.stringify(customer.direccionesOmitidas ?? []);
  useEffect(() => { setOmittedAddresses(JSON.parse(omittedVersion) as string[]); }, [omittedVersion]);
  const initialAddress = addressRecords.find(item => !omittedAddresses.includes(addressKey(item)));
  const activePlans = plans.filter(plan => plan.activo !== false && plan.idEmpresa != null);
  const companies = [...new Map([
    ...activePlans.map(plan => [plan.idEmpresa!, { id: plan.idEmpresa!, nombre: plan.empresa?.nombre ?? 'Empresa #' + plan.idEmpresa }] as const),
    ...availableCompanies.map(item => [item.idEmpresa, { id: item.idEmpresa, nombre: item.nombre }] as const),
  ]).values()];
  const [company, setCompany] = useState(String(companies.find(item => item.id === initialCompanyId)?.id
    ?? companies.find(item => item.id === customer.idEmpresa)?.id ?? companies[0]?.id ?? ''));
  const companyName = companies.find(item => String(item.id) === company)?.nombre;
  const [addressMode, setAddressMode] = useState(initialAddress ? addressKey(initialAddress) : 'new');
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const addressPicker = useRef<HTMLDivElement>(null);
  const addressTrigger = useRef<HTMLButtonElement>(null);
  const addressOptionsId = useId();
  useEffect(() => {
    if (!addressPickerOpen) return;
    const outside = (event: PointerEvent) => { if (!addressPicker.current?.contains(event.target as Node)) setAddressPickerOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [addressPickerOpen]);
  const [address, setAddress] = useState<Address>(initialAddress ?? { direccion: '', comuna: '', region: '' });
  const [location, setLocation] = useState<CoverageLocation | null>(initialAddress?.location ?? null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [quotePlanId, setQuotePlanId] = useState('');
  const [contractPlanId, setContractPlanId] = useState('');
  const [acceptedQuoteId, setAcceptedQuoteId] = useState<number | null>(null);
  const [history, setHistory] = useState<{ company: string; rows: CustomerPlanQuote[] }>({ company, rows: [] });
  const [historyError, setHistoryError] = useState('');
  const [observation, setObservation] = useState('');
  const [busy, setBusy] = useState(false);
  const { message, showMessage, clearMessage } = useTransientMessage(3000);
  const [tone, setTone] = useState<'success' | 'error'>('success');
  const notify = (text: string, error = false) => { setTone(error ? 'error' : 'success'); showMessage(text); };
  const inFlight = useRef(false);
  const context = JSON.stringify([customer.idCliente, company, address, location]);
  const currentContext = useRef(context); currentContext.current = context;
  const region = findChileRegion(address.region);
  const completeAddress = address.direccion.trim().length >= 8 && Boolean(region?.comunas.includes(address.comuna));
  const fullAddress = completeAddress ? [address.direccion.trim(), address.comuna.trim(), address.region, 'Chile'].filter(Boolean).join(', ') : '';
  const availablePlans = coverage?.coberturaComercial && !checking ? coverage.planes : [];
  const quotePlan = availablePlans.find(plan => String(plan.idPlan) === quotePlanId);
  const quotes = history.company === company ? history.rows : [];
  const allAddresses = [...addressRecords, ...quotes.map(quote => locateCommune({ direccion: quote.direccion, comuna: quote.comuna,
    region: quote.region, location: knownPoint(quote) }))];
  const addresses = allAddresses.filter((item, index, rows) => item.direccion && !omittedAddresses.includes(addressKey(item))
    && rows.findIndex(other => addressKey(item) === addressKey(other)) === index).map(item => ({ ...item,
      location: allAddresses.find(other => addressKey(item) === addressKey(other) && other.location)?.location ?? null }));
  const savedAddress = addresses.find(item => addressKey(item) === addressMode);
  const primaryAddressKey = addressRecords[0] ? addressKey(addressRecords[0]) : null;
  const savedLatitude = savedAddress?.location?.latitud;
  const savedLongitude = savedAddress?.location?.longitud;
  useEffect(() => {
    if (savedLatitude != null && savedLongitude != null && !location && addressKey(address) === addressMode) {
      setLocation({ latitud: savedLatitude, longitud: savedLongitude });
    }
  }, [savedLatitude, savedLongitude, addressMode, address, location]);
  const eligibleQuotes = quotes.filter(quote => quote.vigente && !quote.contrato && quote.idEmpresa === Number(company)
    && normalizedAddress(quote.direccion) === normalizedAddress(address.direccion)
    && normalizeTerritory(quote.comuna) === normalizeTerritory(address.comuna)
    && location && quote.latitud != null && quote.longitud != null
    && Math.abs(quote.latitud - location.latitud) < 0.000001 && Math.abs(quote.longitud - location.longitud) < 0.000001
    && availablePlans.some(plan => plan.idPlan === quote.idPlan));
  const quotedPlans = [...new Map(eligibleQuotes.map(quote => [quote.idPlan, availablePlans.find(plan => plan.idPlan === quote.idPlan)!])).values()];
  const acceptedQuote = eligibleQuotes.find(quote => String(quote.idPlan) === contractPlanId && (acceptedQuoteId == null || quote.idCotizacion === acceptedQuoteId));
  const acceptedPlan = availablePlans.find(plan => String(plan.idPlan) === contractPlanId);
  const canContract = Boolean(acceptedQuote && acceptedPlan && !busy && !checking && completeAddress);
  const canQuote = Boolean(quotePlan && completeAddress && location && !checking && !busy);

  useEffect(() => {
    if (!company) return;
    const controller = new AbortController();
    setHistoryError('');
    void api.get<CustomerPlanQuote[]>('/prospects/customer-quotes', { params: { idCliente: customer.idCliente, idEmpresa: Number(company) }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setHistory(current => ({ company, rows: mergeQuotes(data, current.company === company ? current.rows : []) }));
      }).catch(() => { if (!controller.signal.aborted) setHistoryError('No se pudieron cargar las cotizaciones del cliente.'); });
    return () => controller.abort();
  }, [customer.idCliente, company]);

  function changeAddress(next: Address) {
    setAddress(next); setLocation(next.location ?? null); setCoverage(null); setContractPlanId(''); setAcceptedQuoteId(null);
  }
  function editAddress(next: Address) {
    setAddressMode('new'); changeAddress({ ...next, location: null });
  }
  function selectAddress(next?: Address) {
    setAddressMode(next ? addressKey(next) : 'new'); changeAddress(next ?? { direccion: '', comuna: '', region: '' });
    setAddressPickerOpen(false);
  }
  async function removeAddress(item: Address) {
    if (inFlight.current) return;
    const removedKey = addressKey(item);
    if (removedKey === primaryAddressKey) return;
    inFlight.current = true; setBusy(true);
    try {
      const { data } = await api.patch<CustomerProfileFields>(`/customers/${customer.idCliente}/profile`, {
        ocultarDireccion: { direccion: item.direccion, comuna: item.comuna },
      });
      const hidden = data.direccionesOmitidas ?? [...omittedAddresses, removedKey];
      setOmittedAddresses(hidden);
      if (addressMode === removedKey) {
        const first = addresses.find(candidate => !hidden.includes(addressKey(candidate)));
        selectAddress(first);
      }
      notify('Dirección quitada de la lista');
      await onAddressesChanged?.(data);
    } catch (error) { notify(apiErrorMessage(error), true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function openQuotePdf(quote: Pick<CustomerPlanQuote, 'idProspecto' | 'idCotizacion' | 'codigo'>, preview = false) {
    const { data } = await api.get(`/prospects/${quote.idProspecto}/quotes/${quote.idCotizacion}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    if (preview) window.open(url, '_blank', 'noopener,noreferrer');
    else {
      const link = document.createElement('a'); link.href = url; link.download = (quote.codigo ?? 'cotizacion') + '.pdf'; link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function generateQuote() {
    if (inFlight.current || !canQuote || !location || !quotePlan) return;
    inFlight.current = true; setBusy(true);
    const key = context;
    try {
      const { data } = await api.post<QuoteResponse>('/prospects/customer-quotes', { idCliente: customer.idCliente,
        planId: Number(quotePlanId), direccion: address.direccion, comuna: address.comuna, region: address.region, ...location });
      if (currentContext.current !== key) return;
      const row: CustomerPlanQuote = { ...data, idEmpresa: Number(company), planNombre: quotePlan.nombre,
        ...address, ...location, fechaEnvio: data.fechaEnvio ?? new Date().toISOString(), vigente: true, contrato: null };
      setHistory(current => ({ company, rows: mergeQuotes([row], current.company === company ? current.rows : []) }));
      notify(data.envioEmail === 'sent' ? 'Cotización enviada' : data.envioEmail === 'failed' ? 'No se pudo enviar la cotización.' : 'Cotización generada', data.envioEmail === 'failed');
      try { await openQuotePdf(row, true); }
      catch { notify('La cotización quedó guardada. No se pudo abrir su PDF.', true); }
    } catch (error) { if (currentContext.current === key) notify(apiErrorMessage(error), true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function downloadQuote(quote: CustomerPlanQuote) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await openQuotePdf(quote); } catch (error) { notify(apiErrorMessage(error), true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function createContract() {
    if (inFlight.current || !canContract || !acceptedQuote) return;
    inFlight.current = true; setBusy(true);
    try {
      const { data } = await api.post<Contract>('/contracts', { idCliente: customer.idCliente, idPlan: acceptedQuote.idPlan,
        idCotizacion: acceptedQuote.idCotizacion, observacion: observation.trim() || undefined });
      await onCreated(data);
    } catch (error) { notify(apiErrorMessage(error), true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function useQuote(quote: CustomerPlanQuote) {
    if (busy || !quote.vigente || quote.contrato || quote.latitud == null || quote.longitud == null) return;
    changeAddress(locateCommune({ direccion: quote.direccion, comuna: quote.comuna, region: quote.region }));
    setAddressMode(addressKey(quote));
    setLocation({ latitud: quote.latitud, longitud: quote.longitud });
    setContractPlanId(String(quote.idPlan));
    setAcceptedQuoteId(quote.idCotizacion);
  }
  function planSummary(plan?: CoverageResult['planes'][number]) {
    return plan && <div className="prospect-selected-plan"><span className="prospect-selected-plan-icon"><Wifi size={20} aria-hidden="true" /></span>
      <div><strong>{plan.nombre}</strong>{plan.velocidad && <span>{plan.velocidad} Mbps</span>}</div>
      <div className="prospect-selected-plan-price"><strong>${plan.precioAplicable.toLocaleString('es-CL')}</strong><span>Mensual</span></div></div>;
  }

  return <form id="customer-add-plan" className="customer-plan-acquisition" onSubmit={event => { event.preventDefault(); void createContract(); }}>
    <h4 className="customer-plan-title">Nueva contratación</h4>
    <fieldset disabled={busy} className="customer-plan-fields" aria-label="Dirección de la nueva contratación">
      {companies.length > 0 && <label>Empresa<select value={company} onChange={event => {
        setCompany(event.target.value); setLocation(savedAddress?.location ?? null); setCoverage(null); setQuotePlanId(''); setContractPlanId(''); setAcceptedQuoteId(null);
      }}>{companies.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>}
      <div ref={addressPicker} className="customer-plan-address-choice" onKeyDown={event => { if (addressPickerOpen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setAddressPickerOpen(false); addressTrigger.current?.focus(); } }}>
        <span id={addressOptionsId + '-label'}>Dirección de instalación</span>
        <button ref={addressTrigger} type="button" className="customer-address-trigger" aria-label="Dirección de instalación" aria-expanded={addressPickerOpen} aria-controls={addressOptionsId} disabled={busy} onClick={() => setAddressPickerOpen(open => !open)}>
          <span>{addressMode === 'new' ? 'Agregar nueva dirección' : address.direccion}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
        {addressPickerOpen && <ul id={addressOptionsId} className="customer-address-options" aria-labelledby={addressOptionsId + '-label'}>
          {addresses.map(item => <li key={addressKey(item)}>
            <button type="button" className="customer-address-option" aria-current={addressKey(item) === addressMode ? 'true' : undefined} disabled={busy} onClick={() => selectAddress(item)}>{item.direccion}</button>
            {addressKey(item) !== primaryAddressKey && <button type="button" className="customer-address-remove" aria-label={'Quitar dirección ' + item.direccion} title="Quitar dirección" disabled={busy} onClick={() => void removeAddress(item)}><X size={15} aria-hidden="true" /></button>}
          </li>)}
          <li><button type="button" className="customer-address-option customer-address-add" disabled={busy} onClick={() => selectAddress()}>Agregar nueva dirección</button></li>
        </ul>}
      </div>
      <label>Dirección<input required minLength={8} maxLength={200} value={address.direccion} onChange={event => editAddress({ ...address, direccion: event.target.value })} /></label>
      <div className="customer-plan-address-fields"><label>Región<select required value={address.region} onChange={event => editAddress({ ...address, region: event.target.value, comuna: '' })}>
        <option value="">Seleccionar región</option>{chileRegions.map(item => <option key={item.codigo} value={item.nombre}>{item.nombre}</option>)}
      </select></label><label>Comuna<select required disabled={!region} value={region ? address.comuna : ''} onChange={event => editAddress({ ...address, comuna: event.target.value })}>
        <option value="">{region ? 'Seleccionar comuna' : 'Selecciona primero una región'}</option>{region?.comunas.map(item => <option key={item} value={item}>{item}</option>)}
      </select></label></div>
    </fieldset>
    <aside className="customer-plan-map" aria-label="Factibilidad de la nueva contratación">{company ? <CoveragePicker key={company}
      presentation="summary" simpleSummary companyName={companyName} allowManualLocation autoGeocode={Boolean(fullAddress)} idEmpresa={Number(company)} direccion={fullAddress}
      value={location} onChange={point => { setLocation(point); setCoverage(null); setContractPlanId(''); setAcceptedQuoteId(null); }}
      onResult={setCoverage} onBusyChange={setChecking} disabled={busy} /> : <p className="empty-state">No hay empresas con planes disponibles.</p>}</aside>
    {availablePlans.length > 0 && <section className="prospect-commercial-section prospect-quote-section customer-plan-commercial">
      <header className="prospect-action-header"><span className="prospect-action-icon" aria-hidden="true"><FileClock size={19} /></span><div><h4>Generar cotización</h4></div></header>
      <div className="prospect-quote-fields"><label>Plan a cotizar<select aria-label="Plan a cotizar" disabled={busy} value={quotePlanId} onChange={event => setQuotePlanId(event.target.value)}>
        <option value="">Seleccionar plan</option>{availablePlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombre} · ${plan.precioAplicable.toLocaleString('es-CL')}</option>)}
      </select></label>
        <button type="button" className="customer-plan-primary" disabled={!canQuote} onClick={() => void generateQuote()}>{busy ? 'Procesando…' : 'Generar cotización'}</button></div>
      {planSummary(quotePlan)}
    </section>}
    {quotedPlans.length > 0 && <section className="prospect-commercial-section prospect-contract-section customer-plan-commercial">
      <h4>Datos de contratación</h4><div className="prospect-contract-layout"><label>Plan aceptado<select aria-label="Plan aceptado" value={contractPlanId} disabled={busy} onChange={event => { setContractPlanId(event.target.value); setAcceptedQuoteId(null); }}>
        <option value="">Seleccionar plan</option>{quotedPlans.map(plan => <option key={plan.idPlan} value={plan.idPlan}>{plan.nombre} · ${plan.precioAplicable.toLocaleString('es-CL')}</option>)}
      </select></label>
      <p className="prospect-contract-address"><MapPin size={15} aria-hidden="true" />{address.direccion}, {address.comuna}</p>
      <label>Observación opcional<textarea rows={4} maxLength={1000} disabled={busy} value={observation} onChange={event => setObservation(event.target.value)} /></label>
        <button type="submit" className="customer-plan-primary" disabled={!canContract}>{busy ? 'Guardando…' : 'Confirmar contratación'}</button></div>
      {planSummary(acceptedPlan)}
    </section>}
    {(quotes.length > 0 || historyError) && <section className="prospect-documents customer-plan-documents"><h4>Documentos</h4>
      {historyError && <p role="status">{historyError}</p>}<ul className="prospect-document-list">
        {quotes.map(quote => <li key={quote.idCotizacion}><div>{quote.vigente && !quote.contrato
          ? <button type="button" className="customer-quote-choice" disabled={busy} title="Usar la dirección y el plan de esta cotización" onClick={() => useQuote(quote)}><strong>{quote.codigo ?? 'COT-' + quote.idCotizacion}</strong></button>
          : <strong>{quote.codigo ?? 'COT-' + quote.idCotizacion}</strong>}
          <small>{quote.planNombre} · {quote.fechaEnvio ? formatDateTime(quote.fechaEnvio) : 'Fecha no registrada'}{quote.contrato ? ' · Contratada' : quote.vigente ? '' : ' · No vigente'}</small>
          <small>{quote.direccion}, {quote.comuna}</small></div>
          <button type="button" className="prospect-document-download" aria-label={`Descargar cotización ${quote.codigo ?? quote.idCotizacion}`} title="Descargar cotización" disabled={busy} onClick={() => void downloadQuote(quote)}><Download size={17} aria-hidden="true" /></button>
        </li>)}
      </ul></section>}
    <div className="button-row customer-plan-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    <ToastNotice message={message} tone={tone} onDismiss={clearMessage} />
  </form>;
}
