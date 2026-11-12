import { type ChangeEvent, FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, Plan, Prospect, type ProspectSearchResult } from '../../api';
import { emptyProspectForm, formatChileanMobileInput, formatRutInput, normalizeRutInput, validateProspectForm, type ProspectFormState } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { ProspectWorkflowPanel } from './ProspectWorkflowPanel';
import { CoveragePicker, CoverageLocation } from '../coverage';
import type { CompanyDraft } from '../../shared/hooks/useCompanyDraft';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import { chileRegions, findChileRegion, normalizeTerritory } from '../../shared/data/chile-territories';

export type ProspectRegistrationDraft = {
  form: ProspectFormState;
  located: { version: string; location: CoverageLocation } | null;
  submitting: boolean;
};

export function createProspectRegistrationDraft(): ProspectRegistrationDraft {
  return { form: { ...emptyProspectForm }, located: null, submitting: false };
}

const PROSPECT_PAGE_SIZE = 20;
const emptyProspectFilters = { q: '', estado: '', origen: '', desde: '', hasta: '' };

export function ProspectsPanel({
  prospects: reloadedProspects,
  scope,
  loading,
  loadError,
  onReload,
  plans,
  writeCompanyId,
  permissions,
  onCreated,
  onNotify,
  registration,
}: {
  prospects: Prospect[];
  /** When provided, the list is searched and paginated by the backend (includes lost prospects). */
  scope?: string;
  loading: boolean;
  loadError: string;
  onReload: () => void;
  plans: Plan[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onCreated: () => void;
  onNotify?: (message: string) => void;
  registration?: CompanyDraft<ProspectRegistrationDraft>;
}) {
  const [localDraft, setLocalDraft] = useState(createProspectRegistrationDraft);
  const { form, located, submitting } = registration?.draft ?? localDraft;
  const changeDraft = registration?.onChange ?? setLocalDraft;
  const setForm = (next: ProspectFormState) => changeDraft(current => ({ ...current, form: next }));
  const setSubmitting = (next: boolean) => changeDraft(current => ({ ...current, submitting: next }));
  const rutInput = useRef<HTMLInputElement>(null);
  const rutCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = rutCaret.current;
    rutCaret.current = null;
    if (position !== null && rutInput.current && document.activeElement === rutInput.current) {
      rutInput.current.setSelectionRange(position, position);
    }
  });
  const { message: status, showMessage: setStatus } = useTransientMessage();
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const addressParts = [form.direccion, form.comuna, form.region].map(part => part.trim().replace(/\s+/g, ' '));
  const fullAddress = addressParts.some(Boolean) ? [...addressParts.filter(Boolean), 'Chile'].join(', ') : '';
  const addressVersion = JSON.stringify([writeCompanyId, ...addressParts.map(part => part.toLocaleLowerCase('es-CL'))]);
  const location = located?.version === addressVersion ? located.location : null;
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(() => addressParts.every(Boolean) ? addressVersion : null);
  const selectedRegion = findChileRegion(form.region);
  const selectedComuna = selectedRegion?.comunas.find(comuna => normalizeTerritory(comuna) === normalizeTerritory(form.comuna));
  useEffect(() => {
    changeDraft(current => current.located && current.located.version !== addressVersion ? { ...current, located: null } : current);
  }, [addressVersion, changeDraft]);

  function confirmAddress(nextForm = form) {
    const parts = [nextForm.direccion, nextForm.comuna, nextForm.region].map(part => part.trim().replace(/\s+/g, ' '));
    if (parts.every(Boolean)) setConfirmedAddress(JSON.stringify([writeCompanyId, ...parts.map(part => part.toLocaleLowerCase('es-CL'))]));
  }

  function setLocation(next: CoverageLocation | null) {
    changeDraft(current => ({ ...current, located: next ? { version: addressVersion, location: next } : null }));
  }

  const [filters, setFilters] = useState(emptyProspectFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [remote, setRemote] = useState<ProspectSearchResult | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const searchRequest = useRef(0);
  const serverSide = scope !== undefined;
  const pageSize = PROSPECT_PAGE_SIZE;

  // Debounce free-text search so each keystroke does not hit the backend.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(filters.q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);
  useEffect(() => { setPage(1); }, [appliedQuery, filters.estado, filters.origen, filters.desde, filters.hasta, scope]);

  useEffect(() => {
    if (!serverSide) return;
    const request = ++searchRequest.current;
    setRemoteLoading(true);
    setRemoteError('');
    const params: Record<string, string | number | boolean> = { paginated: true, scope: scope as string, page, pageSize };
    if (appliedQuery) params.q = appliedQuery;
    if (filters.estado) params.estado = filters.estado;
    if (filters.origen) params.origen = filters.origen;
    if (filters.desde) params.desde = filters.desde;
    if (filters.hasta) params.hasta = filters.hasta;
    api.get<ProspectSearchResult>('/prospects', { params, timeout: 15000 })
      .then(({ data }) => { if (request === searchRequest.current) setRemote(data); })
      .catch(err => { if (request === searchRequest.current) setRemoteError(apiErrorMessage(err)); })
      .finally(() => { if (request === searchRequest.current) setRemoteLoading(false); });
    // reloadedProspects changes identity whenever the parent reloads after a mutation.
  }, [serverSide, scope, page, appliedQuery, filters.estado, filters.origen, filters.desde, filters.hasta, reloadedProspects]);

  const localMatches = serverSide ? [] : reloadedProspects.filter(prospect => {
    const text = appliedQuery.toLocaleLowerCase('es-CL');
    const compact = appliedQuery.replace(/[.\s-]/g, '').toLocaleLowerCase('es-CL');
    return (!text || [prospect.nombreCompleto, prospect.email, prospect.telefono].some(value => value?.toLocaleLowerCase('es-CL').includes(text))
      || (compact && (prospect.rut ?? '').replace(/[.\s-]/g, '').toLocaleLowerCase('es-CL').includes(compact)))
      && (!filters.estado || (prospect.estadoPipeline ?? 'Prospecto Nuevo') === filters.estado)
      && (!filters.origen || prospect.origenContacto === filters.origen);
  });
  const prospects = serverSide ? remote?.items ?? [] : reloadedProspects;
  const visibleProspects = serverSide ? prospects : localMatches.slice((page - 1) * pageSize, page * pageSize);
  const totalProspects = serverSide ? remote?.total ?? 0 : localMatches.length;
  const listLoading = serverSide ? remoteLoading && !remote : loading;
  const listError = serverSide ? remoteError : loadError;
  const hasFilters = Object.values(filters).some(Boolean);
  const selectedProspect = prospects.find((prospect) => prospect.idProspecto === selectedId) ?? null;

  useEffect(() => { if (!serverSide) setPage(1); }, [reloadedProspects.length, serverSide]);

  function changeRut(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const compact = raw.replace(/[.\s-]/g, '');
    const previousLength = form.rut.replace(/[.\s-]/g, '').length;
    const tooLong = compact.length > 9;
    const value = tooLong ? form.rut : formatRutInput(raw);
    const caret = event.target.selectionStart;
    if (typeof caret === 'number') {
      const extraCharacters = tooLong ? Math.max(0, compact.length - previousLength) : 0;
      const charactersBeforeCaret = Math.max(0, raw.slice(0, caret).replace(/[.\s-]/g, '').length - extraCharacters);
      let characters = 0;
      let position = 0;
      while (position < value.length && characters < charactersBeforeCaret) {
        if (value[position] !== '-') characters++;
        position++;
      }
      rutCaret.current = position;
    }
    setForm({ ...form, rut: value });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || coverageBusy) return;
    setStatus('');
    const validationMessage = validateProspectForm(form);

    if (validationMessage) {
      setStatus(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/prospects', {
        rut: normalizeRutInput(form.rut),
        nombreCompleto: form.nombreCompleto.trim(),
        email: form.email.trim().toLowerCase() || undefined,
        telefono: form.telefono.trim().replace(/\s/g, ''),
        direccion: form.direccion.trim(),
        comuna: form.comuna.trim() || undefined,
        region: form.region.trim() || undefined,
        origenContacto: form.origenContacto.trim(),
        idEmpresa: writeCompanyId,
        ubicacion: location ?? undefined,
      });
      setForm(emptyProspectForm);
      setLocation(null);
      if (onNotify) onNotify('Prospecto creado');
      else setStatus('Prospecto creado');
      onCreated();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="prospects-workspace">
      <div className="prospects-workspace-heading">
        <h2>Gestión de prospectos</h2>
        <div className="prospect-search" role="search" aria-label="Buscar prospectos">
          <input type="search" className="prospect-search-input" aria-label="Buscar prospecto" placeholder="Buscar por nombre, RUT, correo o teléfono" maxLength={120}
            value={filters.q} onChange={event => setFilters({ ...filters, q: event.target.value })} />
        </div>
      </div>
      <div className="workspace-grid">
      {permissions.createProspects && (
        <form className="stack prospect-create-form" onSubmit={submit}>
          <label>
            RUT
            <input
              ref={rutInput}
              value={form.rut}
              onChange={changeRut}
              placeholder="12345678-5"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={submitting}
              required
            />
          </label>
          <label>
            Nombre completo
            <input
              value={form.nombreCompleto}
              onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })}
              placeholder="Nombre Apellido"
              disabled={submitting}
              maxLength={120}
              required
            />
          </label>
          <label>
            Email
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="correo@ejemplo.cl"
              disabled={submitting}
              type="email"
              maxLength={120}
            />
          </label>
          <label>
            Celular
            <input
              value={form.telefono}
              onChange={(event) => setForm({ ...form, telefono: formatChileanMobileInput(event.target.value) })}
              placeholder="+56912345678"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              disabled={submitting}
              maxLength={20}
              required
            />
          </label>
          <label>
            Origen de contacto
            <select
              aria-label="Origen de contacto"
              value={form.origenContacto}
              disabled={submitting}
              onChange={(event) => setForm({ ...form, origenContacto: event.target.value })}
            >
              {['Formulario web', 'Telefono', 'Sucursal', 'Referido', 'Redes sociales', 'Terreno'].map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direccion
            <input
              value={form.direccion}
              onChange={(event) => setForm({ ...form, direccion: event.target.value })}
              onBlur={() => confirmAddress()}
              placeholder="Av. Siempre Viva 123, Comuna"
              disabled={submitting}
              maxLength={200}
              required
            />
          </label>
          <label>
            Región
            <select aria-label="Región" value={selectedRegion?.nombre ?? form.region} disabled={submitting} onChange={event => {
              const region = findChileRegion(event.target.value);
              const comuna = region?.comunas.find(name => normalizeTerritory(name) === normalizeTerritory(form.comuna)) ?? '';
              const next = { ...form, region: event.target.value, comuna };
              setForm(next); confirmAddress(next);
            }}>
              <option value="">Seleccionar región</option>
              {form.region && !selectedRegion && <option value={form.region}>{form.region}</option>}
              {chileRegions.map(region => <option key={region.codigo} value={region.nombre}>{region.nombre}</option>)}
            </select>
          </label>
          <label>
            Comuna
            <select aria-label="Comuna" value={selectedComuna ?? form.comuna} disabled={submitting || !selectedRegion} onChange={event => {
              const next = { ...form, comuna: event.target.value };
              setForm(next); confirmAddress(next);
            }}>
              <option value="">{selectedRegion ? 'Seleccionar comuna' : 'Selecciona primero una región'}</option>
              {form.comuna && !selectedComuna && <option value={form.comuna}>{form.comuna}</option>}
              {selectedRegion?.comunas.map(comuna => <option key={comuna} value={comuna}>{comuna}</option>)}
            </select>
          </label>
          {status && <p className="inline-status">{status}</p>}
          <CoveragePicker presentation="status" idEmpresa={writeCompanyId} direccion={fullAddress} autoGeocode={confirmedAddress === addressVersion}
            value={location} onChange={setLocation} onBusyChange={setCoverageBusy} disabled={submitting} />
          <button disabled={submitting || coverageBusy}>{submitting ? 'Registrando…' : 'Registrar prospecto'}</button>
        </form>
      )}

      <section className="prospects-list-section">
        {listError && (
          <div role="alert" className="inline-status">
            <p>{listError}</p>
            <button type="button" className="secondary compact" onClick={onReload}>Reintentar</button>
          </div>
        )}
        <div className="table-wrap" aria-busy={listLoading}>
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Empresa</th>
                <th>Pérdida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listLoading && <tr><td colSpan={7} role="status">Cargando prospectos…</td></tr>}
              {!listLoading && !listError && visibleProspects.length === 0 && (
                <tr><td colSpan={7}>{hasFilters ? 'Ningún prospecto coincide con la búsqueda o los filtros.' : 'No hay prospectos pendientes de gestión para la empresa seleccionada.'}</td></tr>
              )}
              {!listLoading && !listError && visibleProspects.map((prospect) => (
                <tr key={prospect.idProspecto}>
                  <td>{prospect.rut}</td>
                  <td>{prospect.nombreCompleto}</td>
                  <td>{prospect.requiereRevisionComercial ? 'Revisión comercial requerida' : prospect.estadoPipeline ?? 'Prospecto Nuevo'}</td>
                  <td>{prospect.origenContacto ?? '-'}</td>
                  <td>{prospect.empresa?.nombre ?? '-'}</td>
                  <td>{prospect.estadoPipeline === 'Perdido'
                    ? [prospect.motivoPerdida, prospect.fechaPerdida ? new Date(prospect.fechaPerdida).toLocaleDateString('es-CL') : null].filter(Boolean).join(' · ') || '-'
                    : '-'}</td>
                  <td>
                    <button type="button" className="secondary compact crm-table-action" onClick={() => setSelectedId(prospect.idProspecto)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={page} totalItems={totalProspects} pageSize={pageSize} onPageChange={setPage} />
        <Modal
          title="Gestionar prospecto"
          open={Boolean(selectedProspect)}
          onClose={() => setSelectedId(null)}
        >
          {selectedProspect && (
            <ProspectWorkflowPanel
              key={selectedProspect.idProspecto}
              prospect={selectedProspect}
              plans={plans}
              permissions={permissions}
              onChanged={onCreated}
              onNotify={onNotify}
              onClose={() => setSelectedId(null)}
            />
          )}
        </Modal>
      </section>
      </div>
    </section>
  );
}
