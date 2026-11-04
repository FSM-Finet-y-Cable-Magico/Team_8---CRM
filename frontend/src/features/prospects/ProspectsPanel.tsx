import { type ChangeEvent, FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { emptyProspectForm, formatRutInput, normalizeRutInput, validateProspectForm, type ProspectFormState } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { ProspectWorkflowPanel } from './ProspectWorkflowPanel';
import { CoveragePicker, CoverageLocation } from '../coverage';
import type { CompanyDraft } from '../../shared/hooks/useCompanyDraft';

export type ProspectRegistrationDraft = {
  form: ProspectFormState;
  located: { version: string; location: CoverageLocation } | null;
  submitting: boolean;
};

export function createProspectRegistrationDraft(): ProspectRegistrationDraft {
  return { form: { ...emptyProspectForm }, located: null, submitting: false };
}

export function ProspectsPanel({
  prospects,
  loading,
  loadError,
  onReload,
  plans,
  writeCompanyId,
  permissions,
  onCreated,
  registration,
}: {
  prospects: Prospect[];
  loading: boolean;
  loadError: string;
  onReload: () => void;
  plans: Plan[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onCreated: () => void;
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
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const addressParts = [form.direccion, form.comuna, form.region].map(part => part.trim().replace(/\s+/g, ' '));
  const fullAddress = addressParts.some(Boolean) ? [...addressParts.filter(Boolean), 'Chile'].join(', ') : '';
  const addressVersion = JSON.stringify([writeCompanyId, ...addressParts.map(part => part.toLocaleLowerCase('es-CL'))]);
  const location = located?.version === addressVersion ? located.location : null;
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  useEffect(() => {
    changeDraft(current => current.located && current.located.version !== addressVersion ? { ...current, located: null } : current);
    setConfirmedAddress(null);
  }, [addressVersion, changeDraft]);

  function confirmAddress() {
    if (addressParts.every(Boolean)) setConfirmedAddress(addressVersion);
  }

  function setLocation(next: CoverageLocation | null) {
    changeDraft(current => ({ ...current, located: next ? { version: addressVersion, location: next } : null }));
  }

  const selectedProspect = prospects.find((prospect) => prospect.idProspecto === selectedId) ?? null;
  const pageSize = 20;
  const visibleProspects = prospects.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [prospects.length]);

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
    if (submitting) return;
    setStatus('');
    const validationMessage = validateProspectForm(form);

    if (validationMessage) {
      setStatus(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/prospects', {
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
      setStatus(data.cobertura ? `Prospecto creado. Cobertura: ${data.cobertura.estado}. ${data.cobertura.motivo}` : 'Prospecto creado sin ubicacion. Estado: Prospecto Nuevo.');
      onCreated();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workspace-grid">
      {permissions.createProspects && (
        <form className="stack prospect-create-form" onSubmit={submit}>
          <h2>Registro</h2>
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
              onChange={(event) => setForm({ ...form, telefono: event.target.value })}
              placeholder="+56912345678"
              disabled={submitting}
              maxLength={20}
              required
            />
          </label>
          <label>
            Origen de contacto
            <select
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
              onBlur={confirmAddress}
              placeholder="Av. Siempre Viva 123, Comuna"
              disabled={submitting}
              maxLength={200}
              required
            />
          </label>
          <label>
            Comuna
            <input value={form.comuna} disabled={submitting} onChange={(event) => setForm({ ...form, comuna: event.target.value })} onBlur={confirmAddress} placeholder="Comuna" maxLength={80} />
          </label>
          <label>
            Region
            <input value={form.region} disabled={submitting} onChange={(event) => setForm({ ...form, region: event.target.value })} onBlur={confirmAddress} placeholder="Region" maxLength={80} />
          </label>
          {status && <p className="inline-status">{status}</p>}
          <details onToggle={event => { if (event.currentTarget.open) confirmAddress(); }}><summary>Confirmar ubicación y consultar cobertura</summary>
            <CoveragePicker idEmpresa={writeCompanyId} direccion={fullAddress} autoGeocode={confirmedAddress === addressVersion} value={location} onChange={setLocation} disabled={submitting} />
          </details>
          <button disabled={submitting}>{submitting ? 'Registrando…' : 'Registrar prospecto'}</button>
        </form>
      )}

      <section className="prospects-list-section">
        <h2>Gestión de Prospectos</h2>
        {loadError && (
          <div role="alert" className="inline-status">
            <p>{loadError}</p>
            <button type="button" className="secondary compact" onClick={onReload}>Reintentar</button>
          </div>
        )}
        <div className="table-wrap" aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>RUT</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Empresa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} role="status">Cargando prospectos…</td></tr>}
              {!loading && !loadError && prospects.length === 0 && (
                <tr><td colSpan={6}>No hay prospectos pendientes de gestión para la empresa seleccionada.</td></tr>
              )}
              {!loading && !loadError && visibleProspects.map((prospect) => (
                <tr key={prospect.idProspecto}>
                  <td>{prospect.rut}</td>
                  <td>{prospect.nombreCompleto}</td>
                  <td>{prospect.requiereRevisionComercial ? 'Revisión comercial requerida' : prospect.estadoPipeline}</td>
                  <td>{prospect.origenContacto ?? '-'}</td>
                  <td>{prospect.empresa?.nombre ?? '-'}</td>
                  <td>
                    <button type="button" className="secondary compact" onClick={() => setSelectedId(prospect.idProspecto)}>
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={page} totalItems={prospects.length} pageSize={pageSize} onPageChange={setPage} />
        <Modal
          title="Gestionar prospecto"
          open={Boolean(selectedProspect)}
          onClose={() => setSelectedId(null)}
        >
          {selectedProspect && (
            <ProspectWorkflowPanel
              prospect={selectedProspect}
              plans={plans}
              permissions={permissions}
              onChanged={onCreated}
              onClose={() => setSelectedId(null)}
            />
          )}
        </Modal>
      </section>
    </section>
  );
}
