import { FormEvent, useEffect, useState } from 'react';
import { api, apiErrorMessage, type Company, type Plan } from '../../api';
import { StatusBadge } from '../../shared/components';

export function PlansPanel({
  plans,
  companies,
  writeCompanyId,
  onChanged,
}: {
  plans: Plan[];
  companies: Company[];
  writeCompanyId: number;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState('');
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    idEmpresa: String(writeCompanyId),
    nombreComercial: '',
    tipoPlan: 'Internet',
    tipoCliente: 'Residencial',
    velocidadMbps: '',
    precioMensual: '',
    descripcion: '',
    activo: true,
  });

  useEffect(() => {
    if (!editingPlan) {
      setForm((current) => ({ ...current, idEmpresa: String(writeCompanyId) }));
    }
  }, [writeCompanyId, editingPlan?.idPlan]);

  function editPlan(plan: Plan) {
    setEditingPlan(plan);
    setForm({
      idEmpresa: String(plan.idEmpresa ?? writeCompanyId),
      nombreComercial: plan.nombreComercial,
      tipoPlan: plan.tipoPlan,
      tipoCliente: plan.tipoCliente,
      velocidadMbps: plan.velocidadMbps === null ? '' : String(plan.velocidadMbps),
      precioMensual: String(plan.precioMensual),
      descripcion: plan.descripcion ?? '',
      activo: plan.activo !== false,
    });
  }

  function resetForm() {
    setEditingPlan(null);
    setForm({
      idEmpresa: String(writeCompanyId),
      nombreComercial: '',
      tipoPlan: 'Internet',
      tipoCliente: 'Residencial',
      velocidadMbps: '',
      precioMensual: '',
      descripcion: '',
      activo: true,
    });
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    const payload = {
      idEmpresa: Number(form.idEmpresa),
      nombreComercial: form.nombreComercial.trim(),
      tipoPlan: form.tipoPlan.trim(),
      tipoCliente: form.tipoCliente.trim(),
      velocidadMbps: form.velocidadMbps ? Number(form.velocidadMbps) : undefined,
      precioMensual: Number(form.precioMensual),
      descripcion: form.descripcion.trim() || undefined,
      activo: form.activo,
    };

    try {
      if (editingPlan) {
        await api.patch(`/plans/${editingPlan.idPlan}`, payload);
        setStatus('Plan actualizado');
      } else {
        await api.post('/plans', payload);
        setStatus('Plan creado');
      }

      resetForm();
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  async function togglePlan(plan: Plan) {
    try {
      await api.patch(`/plans/${plan.idPlan}/${plan.activo === false ? 'activate' : 'deactivate'}`);
      setStatus(plan.activo === false ? 'Plan activado' : 'Plan desactivado');
      onChanged();
    } catch (err) {
      setStatus(apiErrorMessage(err));
    }
  }

  return (
    <section className="plans-module stack">
      <div className="page-heading">
        <h1>Planes comerciales</h1>
        <p>Administración de planes con valores manuales por empresa.</p>
      </div>

      {status && <p className="inline-status">{status}</p>}

      <section className="panel stack">
        <form className="workflow-grid" onSubmit={savePlan}>
          <label>
            Empresa
            <select value={form.idEmpresa} onChange={(event) => setForm({ ...form, idEmpresa: event.target.value })}>
              {companies.map((company) => (
                <option key={company.idEmpresa} value={company.idEmpresa}>{company.nombre}</option>
              ))}
            </select>
          </label>
          <input placeholder="Nombre comercial" value={form.nombreComercial} onChange={(event) => setForm({ ...form, nombreComercial: event.target.value })} required />
          <input placeholder="Tipo de plan" value={form.tipoPlan} onChange={(event) => setForm({ ...form, tipoPlan: event.target.value })} required />
          <input placeholder="Tipo de cliente" value={form.tipoCliente} onChange={(event) => setForm({ ...form, tipoCliente: event.target.value })} required />
          <input type="number" min="0" placeholder="Velocidad Mbps" value={form.velocidadMbps} onChange={(event) => setForm({ ...form, velocidadMbps: event.target.value })} />
          <input type="number" min="0" placeholder="Precio mensual" value={form.precioMensual} onChange={(event) => setForm({ ...form, precioMensual: event.target.value })} required />
          <textarea placeholder="Descripción" value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} />
          <label className="checkbox-row">
            <input type="checkbox" checked={form.activo} onChange={(event) => setForm({ ...form, activo: event.target.checked })} />
            Plan activo
          </label>
          <button type="submit">{editingPlan ? 'Guardar cambios' : 'Crear plan'}</button>
          {editingPlan && <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>}
        </form>
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <h2>Listado de planes</h2>
          <p>Los planes inactivos no aparecen en flujos comerciales nuevos.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Velocidad</th>
                <th>Precio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.idPlan}>
                  <td>{plan.nombreComercial}</td>
                  <td>{plan.empresa?.nombre ?? plan.idEmpresa ?? '-'}</td>
                  <td>{plan.tipoPlan}</td>
                  <td>{plan.tipoCliente}</td>
                  <td>{plan.velocidadMbps ?? '-'}</td>
                  <td>${Number(plan.precioMensual).toLocaleString('es-CL')}</td>
                  <td><StatusBadge value={plan.activo === false ? 'Inactivo' : 'Activo'} /></td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="secondary compact" onClick={() => editPlan(plan)}>Editar</button>
                      <button type="button" className="secondary compact" onClick={() => void togglePlan(plan)}>
                        {plan.activo === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
