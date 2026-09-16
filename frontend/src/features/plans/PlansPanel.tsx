import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, apiErrorMessage, type Company, type Plan } from '../../api';
import { planCustomerTypeOptions, serviceTypeOptions } from '../../constants';
import { Modal, TablePagination } from '../../shared/components';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';

const initialForm = (companyId: number) => ({ idEmpresa: String(companyId), nombreComercial: '', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: '', precioMensual: '', descripcion: '', activo: true });

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

function currencyInputValue(value: string) {
  return value ? clpFormatter.format(Number(value)) : '';
}

function currencyDigits(value: string) {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

function canonicalPlanType(value: string) {
  const normalized = value.trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasInternet = normalized.includes('internet');
  const hasTelevision = normalized.includes('television') || /(^|\W)tv(\W|$)/.test(normalized);

  if (hasInternet && hasTelevision) return 'Internet + Television';
  if (hasTelevision) return 'Television';
  return 'Internet';
}

function canonicalCustomerType(value: string) {
  const normalized = value.trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized === 'empresarial' || normalized === 'empresa' ? 'Empresarial' : 'Residencial';
}

export function PlansPanel({ plans, companies, writeCompanyId, onChanged }: { plans: Plan[]; companies: Company[]; writeCompanyId: number; onChanged: () => void }) {
  const { message: status, showMessage: setStatus, clearMessage: clearStatus } = useTransientMessage();
  const [pageError, setPageError] = useState('');
  const [modalError, setModalError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(initialForm(writeCompanyId));

  useEffect(() => { if (!editingPlan) setForm(initialForm(writeCompanyId)); }, [writeCompanyId, editingPlan?.idPlan]);

  function resetForm() {
    setEditingPlan(null);
    setForm(initialForm(writeCompanyId));
    setModalError('');
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    resetForm();
  }

  function openCreatePlan() {
    clearStatus();
    setPageError('');
    resetForm();
    setModalOpen(true);
  }

  function editPlan(plan: Plan) {
    clearStatus();
    setPageError('');
    setModalError('');
    setEditingPlan(plan);
    setModalOpen(true);
    setForm({
      idEmpresa: String(plan.idEmpresa ?? writeCompanyId),
      nombreComercial: plan.nombreComercial,
      tipoPlan: canonicalPlanType(plan.tipoPlan),
      tipoCliente: canonicalCustomerType(plan.tipoCliente),
      velocidadMbps: plan.velocidadMbps === null ? '' : String(plan.velocidadMbps),
      precioMensual: String(Math.round(Number(plan.precioMensual))),
      descripcion: plan.descripcion ?? '',
      activo: plan.activo !== false,
    });
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setModalError('');
    const price = Number(form.precioMensual);
    const speed = Number(form.velocidadMbps);

    if (!form.idEmpresa || !form.nombreComercial.trim() || !form.tipoPlan || !form.tipoCliente) {
      setModalError('Completa todos los campos obligatorios del plan.');
      return;
    }

    if (!serviceTypeOptions.includes(form.tipoPlan)) {
      setModalError('El tipo de plan no pertenece al catálogo permitido.');
      return;
    }

    if (!planCustomerTypeOptions.includes(form.tipoCliente)) {
      setModalError('El tipo de cliente no pertenece al catálogo permitido.');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setModalError('El precio mensual debe ser mayor que cero.');
      return;
    }

    if (form.tipoPlan.includes('Internet') && (!Number.isInteger(speed) || speed <= 0)) {
      setModalError('La velocidad es obligatoria y debe ser mayor que cero para planes de Internet.');
      return;
    }

    setBusy(true);
    const payload = {
      idEmpresa: Number(form.idEmpresa),
      nombreComercial: form.nombreComercial.trim(),
      tipoPlan: form.tipoPlan.trim(),
      tipoCliente: form.tipoCliente.trim(),
      velocidadMbps: form.velocidadMbps ? Number(form.velocidadMbps) : undefined,
      precioMensual: price,
      descripcion: form.descripcion.trim() || undefined,
      activo: form.activo,
    };

    try {
      if (editingPlan) {
        await api.patch(`/plans/${editingPlan.idPlan}`, payload);
        setStatus('Plan actualizado.');
      } else {
        await api.post('/plans', payload);
        setStatus('Plan creado.');
      }
      setModalOpen(false);
      resetForm();
      onChanged();
    } catch (error) {
      setModalError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePlan(plan: Plan) {
    try {
      await api.patch(`/plans/${plan.idPlan}/${plan.activo === false ? 'activate' : 'deactivate'}`);
      clearStatus();
      setPageError('');
      onChanged();
    } catch (error) {
      setPageError(apiErrorMessage(error));
    }
  }

  async function deletePlan() {
    if (!deletingPlan || busy) return;
    setBusy(true);
    clearStatus();
    setDeleteError('');
    try {
      await api.delete(`/plans/${deletingPlan.idPlan}`);
      setDeletingPlan(null);
      setStatus('Plan eliminado.');
      setPageError('');
      onChanged();
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateDeletingPlan() {
    if (!deletingPlan || busy) return;
    setBusy(true);
    setDeleteError('');

    try {
      await api.patch(`/plans/${deletingPlan.idPlan}/deactivate`);
      setDeletingPlan(null);
      setStatus('Plan desactivado. Se conserva su historial.');
      setPageError('');
      onChanged();
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plans-module plans-catalog stack">
      <div className="page-heading plans-catalog-heading">
        <h1>Planes comerciales</h1>
        <button type="button" onClick={openCreatePlan}><Plus size={17} />Crear plan</button>
      </div>
      {status && <p className="inline-status">{status}</p>}
      {pageError && <p role="alert" className="alert">{pageError}</p>}

      <section className="plans-catalog-list">
        <div className="table-wrap">
          <table className="operational-table">
            <thead>
              <tr><th>Plan</th><th>Empresa</th><th>Tipo</th><th>Cliente</th><th>Velocidad</th><th>Precio</th><th className="plans-actions-heading">Acciones</th></tr>
            </thead>
            <tbody>
              {plans.slice((page - 1) * 20, page * 20).map((plan) => (
                <tr key={plan.idPlan} className={plan.activo === false ? 'plan-row-inactive' : undefined}>
                  <td>{plan.nombreComercial}</td>
                  <td>{plan.empresa?.nombre ?? plan.idEmpresa ?? '-'}</td>
                  <td>{plan.tipoPlan}</td>
                  <td>{plan.tipoCliente}</td>
                  <td>{plan.velocidadMbps ?? '-'}</td>
                  <td>{clpFormatter.format(Number(plan.precioMensual))}</td>
                  <td>
                    <div className="table-actions plan-table-actions">
                      <button type="button" className={plan.activo === false ? 'plan-toggle' : 'plan-toggle active'} role="switch" aria-checked={plan.activo !== false} aria-label={`Cambiar estado de ${plan.nombreComercial}`} onClick={() => void togglePlan(plan)}><span /></button>
                      <button type="button" className="secondary compact plan-edit-action" aria-label={`Editar ${plan.nombreComercial}`} onClick={() => editPlan(plan)}><Pencil size={15} /></button>
                      <button type="button" className="secondary compact plan-delete-action" aria-label={`Eliminar ${plan.nombreComercial}`} onClick={() => { clearStatus(); setPageError(''); setDeleteError(''); setDeletingPlan(plan); }}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={page} totalItems={plans.length} onPageChange={setPage} />
      </section>

      <Modal title={editingPlan ? 'Editar plan comercial' : 'Crear plan comercial'} open={modalOpen} onClose={closeModal}>
        <form className="plan-modal-form" noValidate onSubmit={savePlan}>
          <div className="plan-form-grid">
            <label>Empresa<select value={form.idEmpresa} onChange={(event) => setForm({ ...form, idEmpresa: event.target.value })}>{companies.map((company) => <option key={company.idEmpresa} value={company.idEmpresa}>{company.nombre}</option>)}</select></label>
            <label>Nombre comercial<input value={form.nombreComercial} onChange={(event) => setForm({ ...form, nombreComercial: event.target.value })} /></label>
            <label>Tipo de plan<select value={form.tipoPlan} onChange={(event) => setForm({ ...form, tipoPlan: event.target.value })}>{serviceTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>Tipo de cliente<select value={form.tipoCliente} onChange={(event) => setForm({ ...form, tipoCliente: event.target.value })}>{planCustomerTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>Velocidad (Mbps)<input type="number" min="0" value={form.velocidadMbps} onChange={(event) => setForm({ ...form, velocidadMbps: event.target.value })} /></label>
            <label>Precio mensual<input type="text" inputMode="numeric" placeholder="$ 0" value={currencyInputValue(form.precioMensual)} onChange={(event) => setForm({ ...form, precioMensual: currencyDigits(event.target.value) })} /></label>
            <label className="plan-description-field">Descripción<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></label>
          </div>
          {modalError && <p role="alert" className="alert">{modalError}</p>}
          <div className="plan-modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancelar</button>
            <button type="submit" disabled={busy}>{busy ? 'Guardando…' : editingPlan ? 'Guardar cambios' : 'Crear plan'}</button>
          </div>
        </form>
      </Modal>

      <Modal title="Eliminar plan" open={Boolean(deletingPlan)} onClose={() => { if (!busy) { setDeletingPlan(null); setDeleteError(''); } }}>
        <section className="plan-delete-dialog stack">
          <p>Se eliminará permanentemente el plan <strong>{deletingPlan?.nombreComercial}</strong>. Si ya tiene contratos, cotizaciones o historial, deberás desactivarlo en su lugar.</p>
          {deleteError && <p role="alert" className="alert">{deleteError}</p>}
          <div className="plan-modal-actions">
            <button type="button" className="secondary" onClick={() => { setDeletingPlan(null); setDeleteError(''); }}>Cancelar</button>
            {deletingPlan?.activo !== false && <button type="button" className="secondary" disabled={busy} onClick={() => void deactivateDeletingPlan()}>Desactivar plan</button>}
            <button type="button" className="plan-delete-confirm" disabled={busy} onClick={() => void deletePlan()}>{busy ? 'Eliminando…' : 'Eliminar plan'}</button>
          </div>
        </section>
      </Modal>
    </section>
  );
}
