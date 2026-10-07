import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, Plan, Prospect } from '../../api';
import { emptyProspectForm, normalizeRutInput, validateProspectForm, type ProspectFormState } from '../../lib';
import { DashboardPermissions } from '../../permissions';
import { Modal, TablePagination } from '../../shared/components';
import { ProspectWorkflowPanel } from './ProspectWorkflowPanel';
import { prospectStageLabel, registeredCoverage } from './prospect-coverage';
import { useProspectAddress } from './useProspectAddress';
import './prospects.css';

export function ProspectsPanel({
  prospects,
  loading,
  loadError,
  onReload,
  plans,
  writeCompanyId,
  permissions,
  onCreated,
}: {
  prospects: Prospect[];
  loading: boolean;
  loadError: string;
  onReload: () => void;
  plans: Plan[];
  writeCompanyId: number;
  permissions: DashboardPermissions;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ProspectFormState>(emptyProspectForm);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const addressCheck = useProspectAddress({ direccion: form.direccion, comuna: form.comuna, region: form.region }, writeCompanyId);
  const submission = useRef<AbortController | null>(null);
  useEffect(() => {
    setSelectedId(null);
    setStatus('');
    setSubmitting(false);
    return () => submission.current?.abort();
  }, [writeCompanyId]);

  const selectedProspect = prospects.find((prospect) => prospect.idProspecto === selectedId) ?? null;
  const pageSize = 20;
  const visibleProspects = prospects.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [prospects.length]);

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
    const controller = new AbortController();
    submission.current = controller;
    try {
      const checked = await addressCheck.validate(true);
      if (controller.signal.aborted || !checked) return;
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
        ubicacion: checked.location,
        validarDireccion: true,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setForm(emptyProspectForm);
      setStatus(`Prospecto registrado. ${data.cobertura?.coberturaComercial ? 'Factible' : 'No factible'}.`);
      onCreated();
    } catch (err) {
      if (!controller.signal.aborted) setStatus(apiErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  return (
    <section className="workspace-grid prospects-workspace">
      {permissions.createProspects && (
        <form className="stack prospect-create-form" onSubmit={submit}>
          <h2>Registro</h2>
          <fieldset disabled={submitting}>
          <label>
            RUT
            <input
              value={form.rut}
              onChange={(event) => setForm({ ...form, rut: event.target.value })}
              placeholder="12345678-5"
              required
            />
          </label>
          <label>
            Nombre completo
            <input
              value={form.nombreCompleto}
              onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })}
              placeholder="Nombre Apellido"
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
              maxLength={20}
              required
            />
          </label>
          <label>
            Origen de contacto
            <select
              value={form.origenContacto}
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
              onBlur={() => void addressCheck.validate()}
              placeholder="Av. Siempre Viva 123, Comuna"
              maxLength={200}
              required
            />
          </label>
          <label>
            Comuna
            <input value={form.comuna} onChange={(event) => setForm({ ...form, comuna: event.target.value })} onBlur={() => void addressCheck.validate()} placeholder="Comuna" maxLength={80} required />
          </label>
          <label>
            Region
            <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} onBlur={() => void addressCheck.validate()} placeholder="Region" maxLength={80} />
          </label>
          </fieldset>
          <div className="prospect-address-feedback" aria-live="polite">
            {addressCheck.checking && <p role="status">Ubicando dirección y comprobando cobertura…</p>}
            {addressCheck.error && <p className="alert" role="alert">{addressCheck.error}</p>}
            {addressCheck.result && <p className="prospect-address-confirmed"><span>Dirección ubicada</span>
              <span className={`prospect-coverage-badge ${addressCheck.result.coverage.coberturaComercial ? 'covered' : 'outside'}`}>{addressCheck.result.coverage.coberturaComercial ? 'Factible' : 'No factible'}</span>
            </p>}
          </div>
          {status && <p className="inline-status" role="status">{status}</p>}
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
          <table className="prospect-table">
            <thead>
              <tr>
                <th>Prospecto</th>
                <th>Estado</th>
                <th>Cobertura</th>
                <th>Origen</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} role="status">Cargando prospectos…</td></tr>}
              {!loading && !loadError && prospects.length === 0 && (
                <tr><td colSpan={5}>No hay prospectos pendientes de gestión para la empresa seleccionada.</td></tr>
              )}
              {!loading && !loadError && visibleProspects.map((prospect) => (
                <tr key={prospect.idProspecto}>
                  <td className="prospect-table-person"><strong>{prospect.nombreCompleto}</strong><span>{prospect.rut} · {prospect.empresa?.nombre ?? 'Sin empresa'}</span></td>
                  <td data-label="Estado">{prospectStageLabel(prospect)}</td>
                  <td data-label="Cobertura"><span className={`prospect-coverage-badge ${registeredCoverage(prospect)}`}>
                    {registeredCoverage(prospect) === 'covered' ? 'Factible' : registeredCoverage(prospect) === 'outside' ? 'No factible' : 'Pendiente'}
                  </span></td>
                  <td data-label="Origen">{prospect.origenContacto ?? '-'}</td>
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
              key={selectedProspect.idProspecto}
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
