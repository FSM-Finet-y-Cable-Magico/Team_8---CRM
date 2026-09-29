import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiErrorMessage } from '../../api';
import './coverage.css';

type LatLng = [number, number];
type Zone = {
  idZonaPago: number;
  idEmpresa: number | null;
  nombreZona: string;
  descripcion: string | null;
  tipoZona: 'COBERTURA_GENERAL' | 'MICROZONA_COMERCIAL' | null;
  idZonaPadre: number | null;
  poligonoGeojson: { type: 'Polygon'; coordinates: number[][][] } | null;
  activo: boolean | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  zonaPadre?: { nombreZona: string } | null;
  precios?: Array<{ idPlanZonaPrecio: number; precioMensual: string; activo: boolean | null; plan: { nombreComercial: string } }>;
};

const emptyEditor = {
  id: null as number | null,
  nombre: '',
  tipoZona: 'COBERTURA_GENERAL' as 'COBERTURA_GENERAL' | 'MICROZONA_COMERCIAL',
  idZonaPadre: '',
  fechaInicio: '',
  fechaFin: '',
  activo: true,
  points: [] as LatLng[],
};

export function CoverageZonesPanel({ idEmpresa, canManage = true }: { idEmpresa: number; canManage?: boolean }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [editor, setEditor] = useState(emptyEditor);
  const [editing, setEditing] = useState(false);
  const [manualCoordinates, setManualCoordinates] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const zoneLayers = useRef<L.LayerGroup | null>(null);
  const drawing = useRef({ editing, setEditor });
  drawing.current = { editing, setEditor };

  const loadZones = useCallback(async () => {
    if (!idEmpresa) return;
    try {
      const { data } = await api.get<Zone[]>('/coverage/zones', { params: { idEmpresa } });
      setZones(data);
      setMessage('');
    } catch (error) {
      setMessage(apiErrorMessage(error));
    }
  }, [idEmpresa]);

  useEffect(() => { void loadZones(); }, [loadZones]);

  useEffect(() => {
    if (!mapElement.current) return;
    const instance = L.map(mapElement.current).setView([-33.57, -70.61], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    map.current = instance;
    zoneLayers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!drawing.current.editing) return;
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
      if (!ring) continue;
      const positions = ring.map(position => [position[1], position[0]] as L.LatLngTuple);
      const micro = zone.tipoZona === 'MICROZONA_COMERCIAL';
      L.polygon(positions, {
        color: zone.activo === false ? '#667085' : micro ? '#9a5b13' : '#315ea8',
        weight: micro ? 3 : 4,
        dashArray: zone.activo === false ? '3 7' : micro ? '9 5' : undefined,
        fillOpacity: zone.activo === false ? 0.03 : micro ? 0.14 : 0.07,
      }).bindTooltip(`${micro ? 'Microzona' : 'Cobertura'}: ${zone.nombreZona} (${zone.activo === false ? 'inactiva' : 'activa'})`).addTo(group);
    }
    if (editing && editor.points.length) {
      if (editor.points.length >= 2) {
        L.polygon(editor.points, { color: '#b42318', weight: 3, dashArray: '5 5', fillOpacity: 0.08 }).bindTooltip('Borrador sin guardar').addTo(group);
      }
      editor.points.forEach((point, index) => {
        const marker = L.marker(point, {
          draggable: true,
          title: `Vertice ${index + 1}`,
          icon: L.divIcon({ className: 'coverage-vertex', html: String(index + 1), iconSize: [24, 24], iconAnchor: [12, 12] }),
        }).addTo(group);
        marker.on('dragend', () => {
          const next = marker.getLatLng();
          setEditor(current => ({
            ...current,
            points: current.points.map((candidate, pointIndex) => pointIndex === index
              ? [Number(next.lat.toFixed(6)), Number(next.lng.toFixed(6))]
              : candidate),
          }));
        });
      });
    }
  }, [zones, editor.points, editing]);

  function beginNew(type: 'COBERTURA_GENERAL' | 'MICROZONA_COMERCIAL') {
    setEditor({ ...emptyEditor, tipoZona: type });
    setManualCoordinates('');
    setEditing(true);
    setMessage('Haz clic en el mapa para agregar vertices. Arrastra los numeros para moverlos.');
  }

  function beginEdit(zone: Zone) {
    const points = (zone.poligonoGeojson?.coordinates[0] ?? []).slice(0, -1)
      .map(position => [position[1], position[0]] as LatLng);
    setEditor({
      id: zone.idZonaPago,
      nombre: zone.nombreZona,
      tipoZona: zone.tipoZona === 'MICROZONA_COMERCIAL' ? 'MICROZONA_COMERCIAL' : 'COBERTURA_GENERAL',
      idZonaPadre: zone.idZonaPadre ? String(zone.idZonaPadre) : '',
      fechaInicio: zone.fechaInicio?.slice(0, 10) ?? '',
      fechaFin: zone.fechaFin?.slice(0, 10) ?? '',
      activo: zone.activo !== false,
      points,
    });
    setManualCoordinates(points.map(point => `${point[0]}, ${point[1]}`).join('\n'));
    setEditing(true);
    setMessage('Edita el borrador y confirma Guardar cuando este listo.');
  }

  function cancelEdit() {
    setEditing(false);
    setEditor(emptyEditor);
    setManualCoordinates('');
    setMessage('Edicion cancelada; no se guardaron cambios.');
  }

  function applyManualCoordinates() {
    const lines = manualCoordinates.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const points = lines.map(line => line.split(',').map(value => Number(value.trim())) as LatLng);
    if (points.length < 3 || points.some(point => point.length !== 2 || !Number.isFinite(point[0]) || Math.abs(point[0]) > 90 || !Number.isFinite(point[1]) || Math.abs(point[1]) > 180)) {
      setMessage('Ingresa al menos tres lineas validas en formato latitud, longitud.');
      return;
    }
    setEditor(current => ({ ...current, points }));
    map.current?.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    setMessage('Coordenadas aplicadas al borrador. Aun debes guardar.');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor.nombre.trim() || editor.points.length < 3) {
      setMessage('El nombre y al menos tres vertices son obligatorios.');
      return;
    }
    if (editor.tipoZona === 'MICROZONA_COMERCIAL' && !editor.idZonaPadre) {
      setMessage('Selecciona la cobertura general padre.');
      return;
    }
    const ring = [...editor.points.map(point => [point[1], point[0]]), [editor.points[0][1], editor.points[0][0]]];
    const payload = {
      ...(editor.id ? {} : { idEmpresa }),
      nombre: editor.nombre.trim(),
      tipoZona: editor.tipoZona,
      ...(editor.tipoZona === 'MICROZONA_COMERCIAL' ? { idZonaPadre: Number(editor.idZonaPadre) } : {}),
      poligonoGeojson: { type: 'Polygon', coordinates: [ring] },
      fechaInicio: editor.fechaInicio || (editor.id ? null : undefined),
      fechaFin: editor.fechaFin || (editor.id ? null : undefined),
      activo: editor.activo,
    };
    setSaving(true);
    try {
      if (editor.id) await api.patch(`/coverage/zones/${editor.id}`, payload);
      else await api.post('/coverage/zones', payload);
      setEditing(false);
      setEditor(emptyEditor);
      setManualCoordinates('');
      setMessage('Zona guardada correctamente.');
      await loadZones();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(zone: Zone) {
    try {
      await api.post(`/coverage/zones/${zone.idZonaPago}/deactivate`);
      setMessage(`${zone.nombreZona} fue desactivada.`);
      await loadZones();
    } catch (error) {
      setMessage(apiErrorMessage(error));
    }
  }

  const parents = zones.filter(zone => zone.tipoZona === 'COBERTURA_GENERAL' && zone.activo !== false && zone.poligonoGeojson);

  return <section className="coverage-admin">
    <header className="coverage-admin-header">
      <div><h2>Cobertura y microzonas</h2><p>EPSG:4326. En el mapa, cobertura general usa borde continuo y microzona borde segmentado.</p></div>
      {canManage && <div className="coverage-actions">
        <button type="button" onClick={() => beginNew('COBERTURA_GENERAL')}>Nueva cobertura</button>
        <button type="button" className="secondary" disabled={!parents.length} onClick={() => beginNew('MICROZONA_COMERCIAL')}>Nueva microzona</button>
      </div>}
    </header>
    {message && <p className="inline-status" role="status">{message}</p>}
    <div className="coverage-admin-layout">
      <div>
        <div ref={mapElement} className="coverage-admin-map" aria-label="Mapa administrativo de cobertura" />
        <div className="coverage-legend" aria-label="Leyenda del mapa">
          <span><i className="general" /> Cobertura general</span><span><i className="micro" /> Microzona comercial</span><span><i className="inactive" /> Inactiva</span><span><i className="draft" /> Borrador</span>
        </div>
      </div>
      {editing ? <form className="coverage-zone-editor stack" onSubmit={save}>
        <h3>{editor.id ? 'Editar zona' : editor.tipoZona === 'MICROZONA_COMERCIAL' ? 'Nueva microzona' : 'Nueva cobertura'}</h3>
        <label>Nombre<input value={editor.nombre} maxLength={80} onChange={event => setEditor({ ...editor, nombre: event.target.value })} required /></label>
        <label>Tipo<select value={editor.tipoZona} onChange={event => setEditor({ ...editor, tipoZona: event.target.value as typeof editor.tipoZona, idZonaPadre: '' })}>
          <option value="COBERTURA_GENERAL">Cobertura general</option><option value="MICROZONA_COMERCIAL">Microzona comercial</option>
        </select></label>
        {editor.tipoZona === 'MICROZONA_COMERCIAL' && <label>Cobertura padre<select value={editor.idZonaPadre} onChange={event => setEditor({ ...editor, idZonaPadre: event.target.value })} required><option value="">Selecciona</option>{parents.map(parent => <option key={parent.idZonaPago} value={parent.idZonaPago}>{parent.nombreZona}</option>)}</select></label>}
        <div className="coverage-coordinates"><label>Inicio<input type="date" value={editor.fechaInicio} onChange={event => setEditor({ ...editor, fechaInicio: event.target.value })} /></label><label>Fin<input type="date" value={editor.fechaFin} onChange={event => setEditor({ ...editor, fechaFin: event.target.value })} /></label></div>
        <label className="checkbox-line"><input type="checkbox" checked={editor.activo} onChange={event => setEditor({ ...editor, activo: event.target.checked })} /> Zona activa</label>
        <p>{editor.points.length} vertices. Haz clic en el mapa para agregar; arrastra un numero para moverlo.</p>
        <div className="coverage-actions"><button type="button" className="secondary compact" disabled={!editor.points.length} onClick={() => setEditor({ ...editor, points: editor.points.slice(0, -1) })}>Eliminar ultimo</button><button type="button" className="secondary compact" disabled={!editor.points.length} onClick={() => setEditor({ ...editor, points: [] })}>Vaciar</button></div>
        <label>Coordenadas manuales <small>(latitud, longitud; una por linea)</small><textarea rows={5} value={manualCoordinates} onChange={event => setManualCoordinates(event.target.value)} /></label>
        <button type="button" className="secondary compact" onClick={applyManualCoordinates}>Aplicar coordenadas</button>
        <div className="coverage-actions"><button disabled={saving}>{saving ? 'Guardandoâ€¦' : 'Guardar'}</button><button type="button" className="secondary" disabled={saving} onClick={cancelEdit}>Cancelar</button></div>
      </form> : <aside className="coverage-zone-list">
        <h3>Zonas configuradas</h3>
        {zones.length === 0 && <p>No hay zonas geograficas configuradas.</p>}
        {zones.map(zone => <article key={zone.idZonaPago} className="coverage-zone-card">
          <strong>{zone.nombreZona}</strong><span>{zone.tipoZona === 'MICROZONA_COMERCIAL' ? 'Microzona comercial' : 'Cobertura general'} Â· {zone.activo === false ? 'Inactiva' : 'Activa'}</span>
          {zone.zonaPadre && <small>Padre: {zone.zonaPadre.nombreZona}</small>}
          <small>{zone.precios?.filter(price => price.activo !== false).length ?? 0} reglas de plan/precio</small>
          {zone.precios?.filter(price => price.activo !== false).map(price => <small key={price.idPlanZonaPrecio}>{price.plan.nombreComercial}: ${Number(price.precioMensual).toLocaleString('es-CL')}</small>)}
          {canManage && <div className="coverage-actions"><button type="button" className="secondary compact" onClick={() => beginEdit(zone)}>Editar</button>{zone.activo !== false && <button type="button" className="secondary compact" onClick={() => void deactivate(zone)}>Desactivar</button>}</div>}
        </article>)}
      </aside>}
    </div>
  </section>;
}
