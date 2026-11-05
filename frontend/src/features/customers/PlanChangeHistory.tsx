import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api';
import { formatDateOnly } from '../../lib';
import { StatusBadge } from '../../shared/components';

type Change = { idCambioPlan: number; estadoCambio: string; fechaEfectiva: string; precioAnterior: string | null; precioNuevo: string; observaciones: string | null; planAnterior?: { nombreComercial: string } | null; planNuevo: { nombreComercial: string } };
export function PlanChangeHistory({ idContrato, revision }: { idContrato: number; revision: number }) {
  const [rows, setRows] = useState<Change[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const load = useCallback(async () => { const { data } = await api.get<Change[]>(`/contracts/${idContrato}/plan-changes`); setRows(data); }, [idContrato]);
  useEffect(() => { let active = true; setRows([]); setMessage(''); setCancelId(null);
    api.get<Change[]>(`/contracts/${idContrato}/plan-changes`).then(({ data }) => { if (active) setRows(data); }).catch(e => { if (active) setMessage(apiErrorMessage(e)); });
    return () => { active = false; };
  }, [idContrato, revision]);
  async function cancel() { if (!cancelId || busy) return; setBusy(true); setMessage('');
    try { await api.patch(`/contracts/${idContrato}/plan-changes/${cancelId}/cancel`); setCancelId(null); await load(); setMessage('Cambio pendiente cancelado.'); }
    catch (e) { setMessage(apiErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="workflow-panel"><h3>Historial de cambios de plan</h3><p>Los cambios futuros se aplican automáticamente desde su fecha efectiva, según la hora de Chile.</p>
    {message && <p role="status" className="inline-status">{message}</p>}
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Plan anterior</th><th>Nuevo plan</th><th>Precio mensual</th><th>Fecha efectiva</th><th>Estado</th><th>Observación</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={row.idCambioPlan}><td>{row.planAnterior?.nombreComercial ?? '—'}</td><td>{row.planNuevo.nombreComercial}</td><td>${Number(row.precioNuevo).toLocaleString('es-CL')}</td><td>{formatDateOnly(row.fechaEfectiva)}</td><td><StatusBadge value={row.estadoCambio} /></td><td>{row.observaciones || '—'}</td><td>{row.estadoCambio === 'Pendiente' && <button className="secondary compact" disabled={busy} onClick={() => setCancelId(row.idCambioPlan)}>Cancelar cambio</button>}</td></tr>)}</tbody></table></div> : <p>Sin cambios registrados.</p>}
    {cancelId && <div className="button-row"><span>¿Cancelar el cambio pendiente? El plan vigente se conservará.</span><button className="secondary" disabled={busy} onClick={() => setCancelId(null)}>Volver</button><button disabled={busy} onClick={() => void cancel()}>Confirmar cancelación</button></div>}
  </section>;
}
