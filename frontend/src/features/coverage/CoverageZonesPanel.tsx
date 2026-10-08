import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Crosshair, Layers, MapPin, Pencil, Plus, RotateCcw, Save, Undo2, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiErrorMessage } from '../../api';
import { useTransientMessage } from '../../shared/hooks/useTransientMessage';
import './coverage.css';

type LatLng = [number, number];
type ZoneType = 'COBERTURA_GENERAL' | 'MICROZONA_COMERCIAL';
type Zone = {
  idZonaPago: number; idEmpresa: number | null; nombreZona: string; descripcion: string | null;
  tipoZona: ZoneType | null; idZonaPadre: number | null;
  poligonoGeojson: { type: 'Polygon'; coordinates: number[][][] } | null;
  activo: boolean | null; fechaInicio: string | null; fechaFin: string | null;
  zonaPadre?: { nombreZona: string } | null;
  precios?: Array<{ idPlanZonaPrecio: number; precioMensual: string; activo: boolean | null; plan: { nombreComercial: string } }>;
};
const emptyEditor = {
  id: null as number | null, nombre: '', tipoZona: 'COBERTURA_GENERAL' as ZoneType, idZonaPadre: '',
  fechaInicio: '', fechaFin: '', activo: true, points: [] as LatLng[],
};
const zoneName = (type: ZoneType | null) => type === 'MICROZONA_COMERCIAL' ? 'Microzona' : 'Cobertura general';
const zoneColor = (zone: Zone) => zone.tipoZona === 'MICROZONA_COMERCIAL' ? '#b88035' : '#247c68';

export function CoverageZonesPanel(props: { idEmpresa: number; canManage?: boolean }) {
  return <CoverageWorkspace key={props.idEmpresa} {...props}/>;
}

function CoverageWorkspace({ idEmpresa, canManage = true }: { idEmpresa: number; canManage?: boolean }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [editor, setEditor] = useState(emptyEditor);
  const [editing, setEditing] = useState(false);
  const [addingPoints, setAddingPoints] = useState(true);
  const { message, showMessage: setMessage, clearMessage } = useTransientMessage(5000);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<'all' | 'general' | 'micro'>('all');
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const zoneLayers = useRef<L.LayerGroup | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const createMenu = useRef<HTMLDetailsElement>(null);
  const mounted = useRef(true);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const drawing = useRef({ enabled: false, setEditor });
  drawing.current = { enabled: editing && addingPoints && canManage && !saving, setEditor };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadZones = useCallback(async (signal?: AbortSignal) => {
    if (!idEmpresa) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.get<Zone[]>('/coverage/zones', { params: { idEmpresa }, signal });
      if (mounted.current && !signal?.aborted) setZones(data);
    } catch (err) {
      if (mounted.current && !signal?.aborted) setError(apiErrorMessage(err));
    } finally {
      if (mounted.current && !signal?.aborted) setLoading(false);
    }
  }, [idEmpresa]);
  useEffect(() => { const controller = new AbortController(); void loadZones(controller.signal); return () => controller.abort(); }, [loadZones]);

  useEffect(() => {
    if (!mapElement.current) return;
    const instance = L.map(mapElement.current, { scrollWheelZoom: true }).setView([-33.57, -70.61], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    map.current = instance;
    zoneLayers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!drawing.current.enabled) return;
      const point: LatLng = [Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))];
      drawing.current.setEditor(current => ({ ...current, points: [...current.points, point] }));
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(mapElement.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; zoneLayers.current = null; };
  }, []);

  useEffect(() => {
    const group = zoneLayers.current;
    if (!group) return;
    group.clearLayers();
    for (const zone of zones) {
      const ring = zone.poligonoGeojson?.coordinates[0];
      if (!ring?.length) continue;
      const micro = zone.tipoZona === 'MICROZONA_COMERCIAL';
      const label = document.createElement('span');
      label.textContent = zone.nombreZona;
      const polygon = L.polygon(ring.map(position => [position[1], position[0]] as L.LatLngTuple), {
        color: zoneColor(zone), weight: selected === zone.idZonaPago ? 4 : micro ? 2 : 3,
        dashArray: micro ? '8 5' : undefined, opacity: zone.activo === false ? 0.35 : 1,
        fillOpacity: zone.activo === false ? 0.025 : selected === zone.idZonaPago ? 0.2 : micro ? 0.12 : 0.06,
      }).bindTooltip(label, { permanent: showLabels, direction: 'center', className: 'coverage-map-label', opacity: zone.activo === false ? 0.48 : 1 }).addTo(group);
      polygon.on('click', (event: L.LeafletMouseEvent) => {
        if (editingRef.current) return;
        L.DomEvent.stopPropagation(event.originalEvent);
        setSelected(zone.idZonaPago);
      });
    }
    if (editing && editor.points.length) {
      if (editor.points.length >= 2) L.polygon(editor.points, { color: '#247c68', weight: 3, dashArray: '4 5', fillOpacity: 0.13, interactive: false }).addTo(group);
      editor.points.forEach((point, index) => {
        const marker = L.marker(point, {
          draggable: canManage && !saving, title: 'Punto ' + (index + 1),
          icon: L.divIcon({ className: 'coverage-vertex', html: String(index + 1), iconSize: [26, 26], iconAnchor: [13, 13] }),
        }).addTo(group);
        marker.on('dragend', () => {
          const next = marker.getLatLng();
          setEditor(current => ({ ...current, points: current.points.map((candidate, pointIndex) => pointIndex === index ? [Number(next.lat.toFixed(6)), Number(next.lng.toFixed(6))] : candidate) }));
        });
      });
    }
  }, [zones, editor.points, editing, selected, showLabels, saving, canManage]);

  const fitMap = useCallback(() => {
    const points = zones.flatMap(zone => zone.poligonoGeojson?.coordinates[0]?.map(position => [position[1], position[0]] as LatLng) ?? []);
    if (points.length) map.current?.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15 });
  }, [zones]);
  useEffect(() => { fitMap(); }, [fitMap]);
  useEffect(() => { if (editing) editorHeading.current?.focus(); }, [editing, editor.id, editor.tipoZona]);

  function locateZone(zone: Zone) {
    if (saving) return;
    setSelected(zone.idZonaPago);
    const positions = zone.poligonoGeojson?.coordinates[0]?.map(position => [position[1], position[0]] as LatLng);
    if (positions?.length) map.current?.fitBounds(L.latLngBounds(positions), { padding: [45, 45], maxZoom: 16 });
  }
  function beginNew(type: ZoneType) {
    if (!canManage || saving || changingStatus !== null) return;
    if (createMenu.current) createMenu.current.open = false;
    setEditor({ ...emptyEditor, tipoZona: type }); setSelected(null);
    setAddingPoints(true); setEditing(true); setError(''); clearMessage();
  }
  function beginEdit(zone: Zone) {
    if (!canManage || saving || changingStatus !== null) return;
    const points = (zone.poligonoGeojson?.coordinates[0] ?? []).slice(0, -1).map(position => [position[1], position[0]] as LatLng);
    setEditor({
      id: zone.idZonaPago, nombre: zone.nombreZona, tipoZona: zone.tipoZona === 'MICROZONA_COMERCIAL' ? 'MICROZONA_COMERCIAL' : 'COBERTURA_GENERAL',
      idZonaPadre: zone.idZonaPadre ? String(zone.idZonaPadre) : '', fechaInicio: zone.fechaInicio?.slice(0, 10) ?? '', fechaFin: zone.fechaFin?.slice(0, 10) ?? '',
      activo: zone.activo !== false, points,
    });
    setAddingPoints(false); setEditing(true); setError(''); clearMessage(); locateZone(zone);
  }
  function cancelEdit() {
    if (saving) return;
    setEditing(false); setEditor(emptyEditor); setError(''); clearMessage();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || saving) return;
    if (!editor.nombre.trim() || editor.points.length < 3) { setError('Escribe un nombre y marca al menos tres puntos en el mapa.'); return; }
    if (editor.tipoZona === 'MICROZONA_COMERCIAL' && !editor.idZonaPadre) { setError('Selecciona la cobertura que contiene esta microzona.'); return; }
    if (editor.fechaInicio && editor.fechaFin && editor.fechaInicio > editor.fechaFin) { setError('La fecha de inicio no puede ser posterior al fin de la vigencia.'); return; }
    const ring = [...editor.points.map(point => [point[1], point[0]]), [editor.points[0][1], editor.points[0][0]]];
    const payload = {
      ...(editor.id ? {} : { idEmpresa }), nombre: editor.nombre.trim(), tipoZona: editor.tipoZona,
      ...(editor.tipoZona === 'MICROZONA_COMERCIAL' ? { idZonaPadre: Number(editor.idZonaPadre) } : {}),
      poligonoGeojson: { type: 'Polygon', coordinates: [ring] },
      fechaInicio: editor.fechaInicio || (editor.id ? null : undefined), fechaFin: editor.fechaFin || (editor.id ? null : undefined), activo: editor.activo,
    };
    setSaving(true); setError('');
    try {
      if (editor.id) await api.patch('/coverage/zones/' + editor.id, payload);
      else await api.post('/coverage/zones', payload);
      if (!mounted.current) return;
      setEditing(false); setEditor(emptyEditor); setMessage('Zona guardada correctamente.');
      await loadZones();
    } catch (err) { if (mounted.current) setError(apiErrorMessage(err)); }
    finally { if (mounted.current) setSaving(false); }
  }
  async function changeStatus(zone: Zone) {
    if (!canManage || changingStatus !== null || saving || editing) return;
    setChangingStatus(zone.idZonaPago); setError(''); clearMessage();
    try {
      if (zone.activo === false) await api.patch('/coverage/zones/' + zone.idZonaPago, { activo: true });
      else await api.post('/coverage/zones/' + zone.idZonaPago + '/deactivate');
      if (!mounted.current) return;
      setMessage(zone.nombreZona + (zone.activo === false ? ' fue activada.' : ' fue desactivada.'));
      await loadZones();
    } catch (err) { if (mounted.current) setError(apiErrorMessage(err)); }
    finally { if (mounted.current) setChangingStatus(null); }
  }

  const parents = zones.filter(zone => zone.tipoZona === 'COBERTURA_GENERAL' && zone.activo !== false && zone.poligonoGeojson);
  const availableParents = editor.idZonaPadre && !parents.some(zone => String(zone.idZonaPago) === editor.idZonaPadre)
    ? [...parents, ...zones.filter(zone => String(zone.idZonaPago) === editor.idZonaPadre)] : parents;
  const filteredZones = zones.filter(zone => zone.nombreZona.toLocaleLowerCase('es-CL').includes(search.toLocaleLowerCase('es-CL'))
    && (zoneFilter === 'all' || zoneFilter === 'general' && zone.tipoZona !== 'MICROZONA_COMERCIAL' || zoneFilter === 'micro' && zone.tipoZona === 'MICROZONA_COMERCIAL'));
  return <section className="coverage-admin">
    <header className="coverage-admin-header"><h2>Cobertura y microzonas</h2>
      {canManage && !editing && <details className="coverage-create-menu" ref={createMenu}><summary><Plus size={17}/>Crear zona<ChevronDown size={15}/></summary><div>
        <button type="button" onClick={() => beginNew('COBERTURA_GENERAL')}><Layers size={17}/><span>Nueva cobertura<small>Define el área de servicio.</small></span></button>
        <button type="button" disabled={!parents.length} onClick={() => beginNew('MICROZONA_COMERCIAL')}><MapPin size={17}/><span>Nueva microzona<small>{parents.length ? 'Delimita un sector de una cobertura.' : 'Crea primero una cobertura general.'}</small></span></button>
      </div></details>}
    </header>
    {message && <div className="coverage-feedback" role="status">{message}<button type="button" className="coverage-icon" aria-label="Cerrar mensaje" onClick={clearMessage}><X size={16}/></button></div>}
    {error && <p className="coverage-feedback error" role="alert">{error}</p>}
    <div className="coverage-admin-layout">
      <div className="coverage-map-workspace">
        <header className="coverage-map-heading"><div><h3>{editing ? 'Límite de la zona' : 'Mapa de cobertura'}</h3>{editing && <p>{addingPoints ? 'Marca los puntos del límite en el mapa.' : 'Arrastra los puntos para ajustar el límite.'}</p>}</div><div className="coverage-actions">
          <button type="button" className="coverage-text-button" aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}><Layers size={15}/>Nombres</button>
          <button type="button" className="coverage-icon" aria-label="Ver todas las zonas en el mapa" onClick={fitMap}><Crosshair size={18}/></button>
        </div></header>
        {editing && <div className="coverage-drawing-toolbar" role="group" aria-label="Herramientas para dibujar la zona">
          <button type="button" className={addingPoints ? 'active' : ''} disabled={saving} aria-pressed={addingPoints} onClick={() => setAddingPoints(true)}><Plus size={15}/>Añadir puntos</button>
          <button type="button" className={!addingPoints ? 'active' : ''} disabled={saving || !editor.points.length} aria-pressed={!addingPoints} onClick={() => setAddingPoints(false)}><Pencil size={15}/>Ajustar límite</button>
          <span>{editor.points.length < 3 ? 'Faltan ' + (3 - editor.points.length) + ' puntos' : 'Límite listo'}</span>
          <button type="button" className="coverage-icon" aria-label="Deshacer último punto" disabled={saving || !editor.points.length} onClick={() => setEditor(current => ({ ...current, points: current.points.slice(0, -1) }))}><Undo2 size={17}/></button>
          <button type="button" className="coverage-icon" aria-label="Reiniciar el dibujo" disabled={saving || !editor.points.length} onClick={() => setEditor(current => ({ ...current, points: [] }))}><RotateCcw size={17}/></button>
        </div>}
        <div className={'coverage-map-stage ' + (editing && addingPoints ? 'is-drawing' : '')}>
          <div ref={mapElement} className="coverage-admin-map" aria-label="Mapa administrativo de cobertura"/>
          <div className="coverage-legend" aria-label="Leyenda del mapa"><strong>Zonas</strong><span><i className="general"/>Cobertura</span><span><i className="micro"/>Microzona</span>{editing && <span><i className="draft"/>En edición</span>}</div>
        </div>
      </div>
      {editing && canManage ? <form className="coverage-zone-editor" onSubmit={save}>
        <header><div><span className="coverage-editor-kind">{zoneName(editor.tipoZona)}</span><h3 ref={editorHeading} tabIndex={-1}>{editor.id ? editor.nombre || 'Editar zona' : 'Crear zona'}</h3></div><button type="button" className="coverage-icon" aria-label="Cancelar edición de zona" disabled={saving} onClick={cancelEdit}><X size={18}/></button></header>
        <fieldset disabled={saving}>
          <label>Nombre de la zona<input value={editor.nombre} maxLength={80} placeholder="Por ejemplo, Zona Centro" onChange={event => setEditor(current => ({ ...current, nombre: event.target.value }))} required/></label>
          <label>Tipo de zona<select value={editor.tipoZona} onChange={event => setEditor(current => ({ ...current, tipoZona: event.target.value as ZoneType, idZonaPadre: '' }))}><option value="COBERTURA_GENERAL">Cobertura general</option><option value="MICROZONA_COMERCIAL">Microzona comercial</option></select></label>
          {editor.tipoZona === 'MICROZONA_COMERCIAL' && <label>Cobertura asociada<select value={editor.idZonaPadre} onChange={event => setEditor(current => ({ ...current, idZonaPadre: event.target.value }))} required><option value="">Selecciona una cobertura</option>{availableParents.map(parent => <option key={parent.idZonaPago} value={parent.idZonaPago}>{parent.nombreZona}</option>)}</select></label>}
          <div className="coverage-editor-section"><h4>Fechas de disponibilidad <small>Opcionales</small></h4><div className="coverage-coordinates"><label>Disponible desde<input type="date" value={editor.fechaInicio} onChange={event => setEditor(current => ({ ...current, fechaInicio: event.target.value }))}/></label><label>Disponible hasta<input type="date" value={editor.fechaFin} onChange={event => setEditor(current => ({ ...current, fechaFin: event.target.value }))}/></label></div></div>
        </fieldset>
        <footer className="coverage-editor-footer"><button type="button" className="coverage-text-button" disabled={saving} onClick={cancelEdit}>Cancelar</button><button disabled={saving || editor.points.length < 3}><Save size={16}/>{saving ? 'Guardando…' : 'Guardar zona'}</button></footer>
      </form> : <section className="coverage-zone-list" aria-label="Zonas configuradas">
        <header><h3>Zonas configuradas</h3><span>{zones.length}</span></header>
        <input aria-label="Buscar zona" placeholder="Buscar por nombre" value={search} onChange={event => setSearch(event.target.value)}/>
        <div className="coverage-zone-filters" role="group" aria-label="Filtrar zonas">{([['all', 'Todas'], ['general', 'Coberturas'], ['micro', 'Microzonas']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={zoneFilter === value} className={zoneFilter === value ? 'active' : ''} onClick={() => setZoneFilter(value)}>{label}</button>)}</div>
        {loading ? <p className="coverage-empty" role="status">Cargando zonas…</p> : filteredZones.length === 0 && <p className="coverage-empty">{zones.length ? 'No hay zonas para esta búsqueda.' : 'Crea una cobertura para comenzar.'}</p>}
        {!loading && filteredZones.map(zone => <article key={zone.idZonaPago} className={'coverage-zone-card ' + (selected === zone.idZonaPago ? 'is-selected ' : '') + (zone.activo === false ? 'is-inactive' : '')}>
          <button type="button" className="coverage-zone-name" onClick={() => locateZone(zone)}>{zone.nombreZona}</button>
          <span>{zoneName(zone.tipoZona)}{zone.zonaPadre ? ' · ' + zone.zonaPadre.nombreZona : ''}</span>
          {canManage && <div className="coverage-zone-actions">
            <button type="button" className={'coverage-zone-toggle ' + (zone.activo !== false ? 'active' : '')} role="switch" aria-checked={zone.activo !== false} aria-label={`Cambiar estado de ${zone.nombreZona}`} aria-busy={changingStatus === zone.idZonaPago} disabled={changingStatus !== null || saving} onClick={() => void changeStatus(zone)}><span/></button>
            <button type="button" className="coverage-icon" aria-label={`Editar ${zone.nombreZona}`} title="Editar zona" disabled={changingStatus !== null || saving} onClick={() => beginEdit(zone)}><Pencil size={15}/></button>
          </div>}
          {!!zone.precios?.filter(price => price.activo !== false).length && <details className="coverage-zone-prices"><summary>Planes y precios<ChevronDown size={13}/></summary>{zone.precios.filter(price => price.activo !== false).map(price => <small key={price.idPlanZonaPrecio}>{price.plan.nombreComercial}<strong>{Number(price.precioMensual).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</strong></small>)}</details>}
        </article>)}
        {error && <button type="button" className="coverage-outline" onClick={() => void loadZones()}>Reintentar carga</button>}
      </section>}
    </div>
  </section>;
}
