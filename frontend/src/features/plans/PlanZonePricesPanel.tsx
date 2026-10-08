import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage, type PaymentZone, type Plan, type ZonePriceRule } from '../../api';
import { DashboardPermissions } from '../../permissions';
import { TablePagination } from '../../shared/components';
import { formatDateOnly } from '../../lib';

const money = (value: string | null) => value === null ? '—' : Number(value).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const emptyRule = { idPlan: '', idZonaPago: '', precioMensual: '', valorInstalacion: '', fechaInicio: '', fechaFin: '' };
export function PlanZonePricesPanel({ plans, scope, writeCompanyId, permissions, revision, onChanged }: {
  plans: Plan[]; scope: string; writeCompanyId: number; permissions: DashboardPermissions; revision: number; onChanged: () => void;
}) {
  const [zones, setZones] = useState<PaymentZone[]>([]), [rules, setRules] = useState<ZonePriceRule[]>([]);
  const [rule, setRule] = useState(emptyRule), [zone, setZone] = useState({ nombreZona: '', comuna: '', descripcion: '', diaVencimientoSugerido: '5' });
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const pending = useRef(false);
  useEffect(() => { setRule(emptyRule); setZone({ nombreZona: '', comuna: '', descripcion: '', diaVencimientoSugerido: '5' }); setZones([]); setRules([]); setPage(1); setStatus(''); }, [scope, writeCompanyId]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([api.get<PaymentZone[]>('/billing/zones', { params: { scope }, signal: controller.signal }), api.get<ZonePriceRule[]>('/billing/zone-rules', { params: { scope }, signal: controller.signal })])
      .then(([z, r]) => { if (!controller.signal.aborted) { setZones(z.data); setRules(r.data); } })
      .catch(err => { if (!controller.signal.aborted) { setStatus(apiErrorMessage(err)); setZones([]); setRules([]); } });
    return () => controller.abort();
  }, [scope, revision, reload]);
  async function submit(event: FormEvent, kind: 'zone' | 'rule') {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setStatus('');
    try {
      if (kind === 'zone') {
        await api.post('/billing/zones', { idEmpresa: writeCompanyId, nombreZona: zone.nombreZona.trim(), comuna: zone.comuna.trim() || undefined, descripcion: zone.descripcion.trim() || undefined, diaVencimientoSugerido: Number(zone.diaVencimientoSugerido) });
        setZone({ nombreZona: '', comuna: '', descripcion: '', diaVencimientoSugerido: '5' });
      } else {
        await api.post('/billing/zone-rules', { idPlan: Number(rule.idPlan), idZonaPago: Number(rule.idZonaPago), precioMensual: Number(rule.precioMensual), valorInstalacion: rule.valorInstalacion ? Number(rule.valorInstalacion) : undefined, fechaInicio: rule.fechaInicio || undefined, fechaFin: rule.fechaFin || undefined });
        setRule(emptyRule);
      }
      setStatus(kind === 'zone' ? 'Zona de precio creada.' : 'Precio por zona guardado.'); setReload(value => value + 1); onChanged();
    } catch (err) { setStatus(apiErrorMessage(err)); } finally { pending.current = false; setBusy(false); }
  }
  const plan = plans.find(p => String(p.idPlan) === rule.idPlan);
  return <details className="billing-workspace-section"><summary><span>Zonas y precios de planes</span><strong>{rules.length}</strong></summary>
    {status && <p role="status" className="inline-status">{status}</p>}
    {permissions.managePaymentZones && <div className="workflow-grid">
      <form className="stack" onSubmit={event => void submit(event, 'rule')}><h3>Precio de un plan por zona</h3>
        <label>Plan<select required value={rule.idPlan} onChange={event => { const selected = plans.find(p => String(p.idPlan) === event.target.value); setRule({ ...emptyRule, idPlan: event.target.value, precioMensual: selected?.precioMensual ?? '' }); }}><option value="">Seleccionar plan</option>{plans.filter(p => p.activo !== false).map(p => <option value={p.idPlan} key={p.idPlan}>{p.nombreComercial}</option>)}</select></label>
        <label>Zona de precio<select required value={rule.idZonaPago} onChange={event => setRule({ ...rule, idZonaPago: event.target.value })}><option value="">Seleccionar zona</option>{zones.filter(z => z.activo !== false && z.idEmpresa === plan?.idEmpresa).map(z => <option key={z.idZonaPago} value={z.idZonaPago}>{z.nombreZona}</option>)}</select></label>
        <label>Precio mensual<input required type="number" min="0" step="0.01" value={rule.precioMensual} onChange={event => setRule({ ...rule, precioMensual: event.target.value })}/></label>
        <label>Valor de instalación<input type="number" min="0" step="0.01" value={rule.valorInstalacion} onChange={event => setRule({ ...rule, valorInstalacion: event.target.value })}/></label>
        <label>Inicio de vigencia<input type="date" value={rule.fechaInicio} onChange={event => setRule({ ...rule, fechaInicio: event.target.value })}/></label><label>Fin de vigencia<input type="date" min={rule.fechaInicio || undefined} value={rule.fechaFin} onChange={event => setRule({ ...rule, fechaFin: event.target.value })}/></label>
        <button disabled={busy} type="submit">Guardar precio por zona</button>
      </form>
      <details><summary>Crear zona de precio</summary><form className="stack" onSubmit={event => void submit(event, 'zone')}>
        <label>Nombre de la zona<input required maxLength={80} value={zone.nombreZona} onChange={event => setZone({ ...zone, nombreZona: event.target.value })}/></label><label>Comuna<input maxLength={80} value={zone.comuna} onChange={event => setZone({ ...zone, comuna: event.target.value })}/></label><label>Día de pago sugerido<input type="number" min={1} max={28} required value={zone.diaVencimientoSugerido} onChange={event => setZone({ ...zone, diaVencimientoSugerido: event.target.value })}/></label><label>Descripción<textarea maxLength={1000} value={zone.descripcion} onChange={event => setZone({ ...zone, descripcion: event.target.value })}/></label><button disabled={busy} type="submit">Crear zona</button>
      </form></details>
    </div>}
    <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Zona</th><th>Mensualidad</th><th>Instalación</th><th>Vigencia</th><th>Estado</th></tr></thead><tbody>{rules.slice((page - 1) * 20, page * 20).map(r => <tr key={r.idPlanZonaPrecio}><td>{r.plan?.nombreComercial}</td><td>{r.zonaPago?.nombreZona}</td><td>{money(r.precioMensual)}</td><td>{money(r.valorInstalacion)}</td><td>{formatDateOnly(r.fechaInicio)} → {formatDateOnly(r.fechaFin)}</td><td>{r.activo === false ? 'Inactiva' : 'Activa'}</td></tr>)}</tbody></table></div>
    <TablePagination currentPage={page} totalItems={rules.length} pageSize={20} onPageChange={setPage}/>
    <details><summary>Zonas disponibles ({zones.length})</summary><div className="table-wrap"><table><thead><tr><th>Zona</th><th>Comuna</th><th>Día sugerido</th><th>Estado</th></tr></thead><tbody>{zones.map(z => <tr key={z.idZonaPago}><td>{z.nombreZona}</td><td>{z.comuna}</td><td>{z.diaVencimientoSugerido}</td><td>{z.activo === false ? 'Inactiva' : 'Activa'}</td></tr>)}</tbody></table></div></details>
  </details>;
}
