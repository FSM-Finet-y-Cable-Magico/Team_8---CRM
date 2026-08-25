import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, apiErrorMessage, type Company, type Plan } from '../../api';
import { Modal, TablePagination } from '../../shared/components';

const initialForm = (companyId: number) => ({ idEmpresa: String(companyId), nombreComercial: '', tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: '', precioMensual: '', descripcion: '', activo: true });

export function PlansPanel({ plans, companies, writeCompanyId, onChanged }: { plans: Plan[]; companies: Company[]; writeCompanyId: number; onChanged: () => void }) {
  const [status, setStatus] = useState('');
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(initialForm(writeCompanyId));

  useEffect(() => { if (!editingPlan) setForm(initialForm(writeCompanyId)); }, [writeCompanyId, editingPlan?.idPlan]);
  function resetForm() { setEditingPlan(null); setForm(initialForm(writeCompanyId)); }
  function closeModal() { setModalOpen(false); resetForm(); }
  function openCreatePlan() { resetForm(); setModalOpen(true); }
  function editPlan(plan: Plan) {
    setEditingPlan(plan); setModalOpen(true);
    setForm({ idEmpresa: String(plan.idEmpresa ?? writeCompanyId), nombreComercial: plan.nombreComercial, tipoPlan: plan.tipoPlan, tipoCliente: plan.tipoCliente, velocidadMbps: plan.velocidadMbps === null ? '' : String(plan.velocidadMbps), precioMensual: String(plan.precioMensual), descripcion: plan.descripcion ?? '', activo: plan.activo !== false });
  }
  async function savePlan(event: FormEvent) {
    event.preventDefault();
    const payload = { idEmpresa: Number(form.idEmpresa), nombreComercial: form.nombreComercial.trim(), tipoPlan: form.tipoPlan.trim(), tipoCliente: form.tipoCliente.trim(), velocidadMbps: form.velocidadMbps ? Number(form.velocidadMbps) : undefined, precioMensual: Number(form.precioMensual), descripcion: form.descripcion.trim() || undefined, activo: form.activo };
    try { if (editingPlan) { await api.patch(`/plans/${editingPlan.idPlan}`, payload); setStatus('Plan actualizado'); } else { await api.post('/plans', payload); setStatus('Plan creado'); } closeModal(); onChanged(); } catch (err) { setStatus(apiErrorMessage(err)); }
  }
  async function togglePlan(plan: Plan) { try { await api.patch(`/plans/${plan.idPlan}/${plan.activo === false ? 'activate' : 'deactivate'}`); setStatus(''); onChanged(); } catch (err) { setStatus(apiErrorMessage(err)); } }

  return <section className="plans-module plans-catalog stack">
    <div className="page-heading plans-catalog-heading"><h1>Planes comerciales</h1><button type="button" onClick={openCreatePlan}><Plus size={17} />Crear plan</button></div>
    {status && <p className="inline-status">{status}</p>}
    <section className="plans-catalog-list"><div className="table-wrap"><table className="operational-table"><thead><tr><th>Plan</th><th>Empresa</th><th>Tipo</th><th>Cliente</th><th>Velocidad</th><th>Precio</th><th></th></tr></thead><tbody>
      {plans.slice((page - 1) * 20, page * 20).map((plan) => <tr key={plan.idPlan} className={plan.activo === false ? 'plan-row-inactive' : undefined}><td>{plan.nombreComercial}</td><td>{plan.empresa?.nombre ?? plan.idEmpresa ?? '-'}</td><td>{plan.tipoPlan}</td><td>{plan.tipoCliente}</td><td>{plan.velocidadMbps ?? '-'}</td><td>${Number(plan.precioMensual).toLocaleString('es-CL')}</td><td><div className="table-actions"><button type="button" className={plan.activo === false ? 'plan-toggle' : 'plan-toggle active'} role="switch" aria-checked={plan.activo !== false} aria-label={`Cambiar estado de ${plan.nombreComercial}`} onClick={() => void togglePlan(plan)}><span /></button><button type="button" className="secondary compact plan-edit-action" aria-label={`Editar ${plan.nombreComercial}`} onClick={() => editPlan(plan)}><Pencil size={15} /></button></div></td></tr>)}
    </tbody></table></div><TablePagination currentPage={page} totalItems={plans.length} onPageChange={setPage} /></section>
    <Modal title={editingPlan ? 'Editar plan comercial' : 'Crear plan comercial'} open={modalOpen} onClose={closeModal}><form className="plan-modal-form" onSubmit={savePlan}><div className="plan-form-grid">
      <label>Empresa<select value={form.idEmpresa} onChange={(e) => setForm({ ...form, idEmpresa: e.target.value })}>{companies.map((company) => <option key={company.idEmpresa} value={company.idEmpresa}>{company.nombre}</option>)}</select></label><label>Nombre comercial<input value={form.nombreComercial} onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })} required /></label><label>Tipo de plan<input value={form.tipoPlan} onChange={(e) => setForm({ ...form, tipoPlan: e.target.value })} required /></label><label>Tipo de cliente<input value={form.tipoCliente} onChange={(e) => setForm({ ...form, tipoCliente: e.target.value })} required /></label><label>Velocidad (Mbps)<input type="number" min="0" value={form.velocidadMbps} onChange={(e) => setForm({ ...form, velocidadMbps: e.target.value })} /></label><label>Precio mensual<input type="number" min="0" value={form.precioMensual} onChange={(e) => setForm({ ...form, precioMensual: e.target.value })} required /></label><label className="plan-description-field">Descripción<textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></label>
    </div><div className="plan-modal-actions"><button type="button" className="secondary" onClick={closeModal}>Cancelar</button><button type="submit">{editingPlan ? 'Guardar cambios' : 'Crear plan'}</button></div></form></Modal>
  </section>;
}
