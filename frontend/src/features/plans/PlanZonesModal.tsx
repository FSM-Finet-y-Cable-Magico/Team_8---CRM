import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, MapPin, Search } from 'lucide-react';
import { api, apiErrorMessage, type Plan } from '../../api';
import { Modal } from '../../shared/components';

type PlanZone = {
  idZonaPago: number; nombreZona: string; tipoZona: string | null; comuna: string | null;
  zonaPadre: { nombreZona: string } | null; assigned: boolean;
};

export function PlanZonesModal({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
  const [zones, setZones] = useState<PlanZone[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoaded(false); setError('');
    void api.get<{ zones: PlanZone[] }>(`/plans/${plan.idPlan}/zones`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setZones(data.zones); setSelected(data.zones.filter(zone => zone.assigned).map(zone => zone.idZonaPago)); setLoaded(true);
      })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [plan.idPlan, revision]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!loaded || pending.current) return;
    pending.current = true; setSaving(true); setError('');
    try {
      await api.put(`/plans/${plan.idPlan}/zones`, { zoneIds: selected });
      if (mounted.current) onSaved();
    } catch (err) { if (mounted.current) setError(apiErrorMessage(err)); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  }

  const filtered = zones.filter(zone => `${zone.nombreZona} ${zone.comuna ?? ''} ${zone.zonaPadre?.nombreZona ?? ''}`.toLocaleLowerCase('es-CL').includes(search.toLocaleLowerCase('es-CL')));
  return <Modal title="Asignar zonas" open onClose={() => { if (!pending.current) onClose(); }}>
    <form className="plan-zones-form" onSubmit={save}>
      <div className="plan-zones-intro"><strong>{plan.nombreComercial}</strong><p>Elige una o varias zonas activas para este plan.</p></div>
      {loading ? <p role="status">Cargando zonas…</p> : loaded && <>
        <div className="plan-zones-search"><Search size={17}/><input aria-label="Buscar zona para asignar" placeholder="Buscar zona" value={search} onChange={event => setSearch(event.target.value)} disabled={saving}/></div>
        <div className="plan-zones-counter"><span>{zones.length} zonas disponibles</span><strong>{selected.length} seleccionadas</strong></div>
        <fieldset className="plan-zone-options" aria-label="Zonas activas de la empresa del plan" disabled={saving}>
          {filtered.map(zone => <label className={'plan-zone-option' + (selected.includes(zone.idZonaPago) ? ' is-selected' : '')} key={zone.idZonaPago}>
            <input type="checkbox" checked={selected.includes(zone.idZonaPago)} onChange={event => setSelected(current => event.target.checked ? [...current, zone.idZonaPago] : current.filter(id => id !== zone.idZonaPago))}/>
            <MapPin size={18} aria-hidden="true"/><span><strong>{zone.nombreZona}</strong><small>{zone.tipoZona === 'MICROZONA_COMERCIAL' ? 'Microzona' : 'Cobertura general'}{zone.zonaPadre ? ` · ${zone.zonaPadre.nombreZona}` : ''}{zone.comuna ? ` · ${zone.comuna}` : ''}</small></span>
            {selected.includes(zone.idZonaPago) && <Check className="plan-zone-check" size={17} aria-hidden="true"/>}
          </label>)}
          {!filtered.length && <p className="plan-zone-empty">{zones.length ? 'No hay zonas para esta búsqueda.' : 'No hay zonas activas. Crea una zona en Cobertura para poder asignarla.'}</p>}
        </fieldset>
        {selected.length === 0 && zones.length > 0 && <p className="plan-zone-empty">Este plan quedará sin zonas asignadas.</p>}
      </>}
      {error && <p role="alert" className="alert">{error}</p>}
      {!loading && !loaded && <button type="button" className="secondary" onClick={() => setRevision(value => value + 1)}>Volver a cargar zonas</button>}
      <div className="plan-modal-actions"><button type="button" className="secondary" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" disabled={!loaded || loading || saving}>{saving ? 'Guardando…' : 'Guardar asignación'}</button></div>
    </form>
  </Modal>;
}
