import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiErrorMessage } from '../../api';
import './coverage.css';

export type CoverageLocation = { latitud: number; longitud: number };
export type CoverageResult = {
  estado: 'Factible' | 'No Factible' | 'Pendiente';
  motivo: string;
  consultadoEn: string;
  cajas: Array<{ id: number; nombre: string; latitud: number; longitud: number; puertosLibres: number }>;
};

export function CoveragePicker({ idEmpresa, direccion, value, onChange, disabled = false }: {
  idEmpresa: number;
  direccion: string;
  value: CoverageLocation | null;
  onChange: (location: CoverageLocation | null) => void;
  disabled?: boolean;
}) {
  const [connection, setConnection] = useState<{ configurado: boolean; mensaje: string } | null>(null);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [coordinates, setCoordinates] = useState({ latitud: '', longitud: '' });
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const selection = useRef({ onChange, disabled });
  selection.current = { onChange, disabled };

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([-33.57, -70.61], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!selection.current.disabled) {
        selection.current.onChange({ latitud: Number(event.latlng.lat.toFixed(6)), longitud: Number(event.latlng.lng.toFixed(6)) });
      }
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setConnection(null);
    setError('');
    if (!idEmpresa) return;
    void api.get('/coverage/status', { params: { idEmpresa }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setConnection(data); })
      .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); });
    return () => controller.abort();
  }, [idEmpresa, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    setBusy(false);
    if (!value || !connection?.configurado || disabled || !direccion.trim()) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void api.post<CoverageResult>('/coverage/check', { idEmpresa, ...value }, { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted) setResult(data); })
        .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [idEmpresa, value?.latitud, value?.longitud, direccion, connection, disabled]);

  useEffect(() => {
    setCoordinates({ latitud: value ? String(value.latitud) : '', longitud: value ? String(value.longitud) : '' });
  }, [value?.latitud, value?.longitud]);

  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    if (value) {
      L.circleMarker([value.latitud, value.longitud], { radius: 9, color: '#2454b8', fillOpacity: 0.9 }).bindTooltip('Dirección seleccionada').addTo(layer);
      const instance = map.current;
      instance?.setView([value.latitud, value.longitud], Math.max(instance.getZoom(), 16));
    }
    for (const box of result?.cajas ?? []) {
      const label = document.createElement('span');
      label.textContent = `${box.nombre} · ${box.puertosLibres} puertos libres`;
      L.circleMarker([box.latitud, box.longitud], { radius: 7, color: '#137a4c', fillOpacity: 0.8 }).bindTooltip(label).addTo(layer);
    }
  }, [value?.latitud, value?.longitud, result]);

  function applyCoordinates() {
    const latitud = Number(coordinates.latitud);
    const longitud = Number(coordinates.longitud);
    if (!coordinates.latitud.trim() || !coordinates.longitud.trim() || !Number.isFinite(latitud)
      || !Number.isFinite(longitud) || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
      setError('Ingresa una latitud entre -90 y 90 y una longitud entre -180 y 180.');
      return;
    }
    onChange({ latitud, longitud });
  }

  return <section className="coverage-picker" aria-label="Consulta de cobertura TomoDAT">
    <div className="coverage-heading"><strong>Cobertura TomoDAT</strong><a href="https://cl2.tomodat.com/tomodat/maps" target="_blank" rel="noreferrer">Abrir TomoDAT ↗</a></div>
    <p>Marca en el mapa el domicilio exacto de {direccion.trim() || 'la dirección ingresada'}. La consulta se realiza al seleccionar el punto.</p>
    <p className="coverage-note">La dirección escrita no posiciona el mapa automáticamente. Azul: domicilio seleccionado. Verde: cajas viables consultadas.</p>
    <div ref={container} className="coverage-map" aria-label="Mapa de ubicación del domicilio" />
    <details><summary>Ingresar coordenadas</summary>
      <div className="coverage-coordinates">
        <label>Latitud<input type="text" inputMode="decimal" value={coordinates.latitud} disabled={disabled} placeholder="-33.57" onChange={e => setCoordinates({ ...coordinates, latitud: e.target.value })} /></label>
        <label>Longitud<input type="text" inputMode="decimal" value={coordinates.longitud} disabled={disabled} placeholder="-70.61" onChange={e => setCoordinates({ ...coordinates, longitud: e.target.value })} /></label>
      </div>
      <button type="button" className="secondary compact" disabled={disabled} onClick={applyCoordinates}>Ubicar punto</button>
    </details>
    <div className="coverage-result" aria-live="polite">
      {busy ? <p>Consultando cobertura y puertos…</p> : result ? <><strong>{result.estado}</strong><p>{result.motivo}</p>
        {result.cajas.length > 0 && <ul>{result.cajas.map(box => <li key={box.id}>{box.nombre}: {box.puertosLibres} puertos libres</li>)}</ul>}
        <small>Consulta: {new Date(result.consultadoEn).toLocaleString('es-CL')}</small></>
        : <p>{connection?.mensaje ?? 'Comprobando conexión de cobertura…'}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="coverage-actions">
      <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => setRetry(retry + 1)}>Volver a consultar</button>
      {value && <button type="button" className="secondary compact" disabled={disabled} onClick={() => onChange(null)}>Quitar ubicación</button>}
    </div>
  </section>;
}
