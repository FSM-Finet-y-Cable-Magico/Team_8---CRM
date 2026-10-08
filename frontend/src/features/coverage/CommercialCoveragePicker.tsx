import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiErrorMessage } from '../../api';
import './coverage.css';

export type CoverageLocation = { latitud: number; longitud: number };
export type CoverageZone = {
  idZonaPago: number;
  nombreZona: string;
  tipoZona: string | null;
  poligonoGeojson: { type: 'Polygon'; coordinates: number[][][] };
};
export type CoverageResult = {
  estado: 'FACTIBLE' | 'NO_FACTIBLE' | 'PENDIENTE_VALIDACION_TECNICA';
  motivo: string;
  consultadoEn: string;
  coberturaComercial: boolean;
  zona: CoverageZone | null;
  microzona: CoverageZone | null;
  planes: Array<{
    idPlan: number;
    nombre: string;
    tipo: string;
    velocidad: number | null;
    precioBase: number;
    precioAplicable: number;
    origenPrecio: 'MICROZONA' | 'ZONA_PADRE' | 'PLAN_BASE';
  }>;
  tecnica: { estado: string; proveedor: string; traceId: string };
  cajas: Array<{ id: number; nombre: string; latitud: number; longitud: number; puertosLibres: number }>;
};

export function CoveragePicker({ idEmpresa, direccion, value, onChange, onResult, disabled = false, autoGeocode = false }: {
  idEmpresa: number;
  direccion: string;
  value: CoverageLocation | null;
  onChange: (location: CoverageLocation | null) => void;
  onResult?: (result: CoverageResult | null) => void;
  disabled?: boolean;
  // Only enabled after the parent confirms a complete, finished address edit.
  autoGeocode?: boolean;
}) {
  const [connection, setConnection] = useState<{ configurado: boolean; mensaje: string } | null>(null);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [coordinates, setCoordinates] = useState({ latitud: '', longitud: '' });
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const version = JSON.stringify([idEmpresa, direccion.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL')]);
  const current = useRef({ version, onChange, value, disabled });
  current.current = { version, onChange, value, disabled };
  const geocodeController = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());
  const rememberAttempt = useCallback((key: string) => {
    attempted.current.add(key);
    if (attempted.current.size > 50) attempted.current.delete(attempted.current.values().next().value!);
  }, []);
  const selectLocation = useCallback((location: CoverageLocation | null) => {
    // A manual selection (including removing the pin) wins over a late response.
    rememberAttempt(current.current.version);
    geocodeController.current?.abort();
    setGeocoding(false);
    setGeocodeMessage('');
    current.current.onChange(location);
  }, [rememberAttempt]);
  const selection = useRef({ onChange: selectLocation, disabled });
  const resultListener = useRef(onResult);
  selection.current = { onChange: selectLocation, disabled };
  resultListener.current = onResult;

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([-33.57, -70.61], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    map.current = instance;
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (!selection.current.disabled) {
        selection.current.onChange({ latitud: Number(event.latlng.lat.toFixed(6)), longitud: Number(event.latlng.lng.toFixed(6)) });
      }
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; layers.current = null; };
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
    resultListener.current?.(null);
    setError('');
    setBusy(false);
    if (!value || !connection || disabled) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void api.post<CoverageResult>('/coverage/check', { idEmpresa, ...value }, { signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted) {
            setResult(data);
            resultListener.current?.(data);
          }
        })
        .catch(err => { if (!controller.signal.aborted) setError(apiErrorMessage(err)); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [idEmpresa, value?.latitud, value?.longitud, connection, disabled]);

  useEffect(() => {
    setCoordinates({ latitud: value ? String(value.latitud) : '', longitud: value ? String(value.longitud) : '' });
  }, [value?.latitud, value?.longitud]);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const drawZone = (zone: CoverageZone, options: L.PolylineOptions, label: string) => {
      const positions = zone.poligonoGeojson.coordinates[0].map(position => [position[1], position[0]] as L.LatLngTuple);
      L.polygon(positions, options).bindTooltip(`${label}: ${zone.nombreZona}`).addTo(group);
    };
    if (result?.zona) drawZone(result.zona, { color: '#315ea8', weight: 3, fillOpacity: 0.08 }, 'Cobertura general');
    if (result?.microzona) drawZone(result.microzona, { color: '#9a5b13', weight: 3, dashArray: '8 5', fillOpacity: 0.14 }, 'Microzona comercial');
    if (value) {
      L.circleMarker([value.latitud, value.longitud], { radius: 9, color: '#2454b8', fillOpacity: 0.9 })
        .bindTooltip('Domicilio seleccionado').addTo(group);
      const instance = map.current;
      instance?.setView([value.latitud, value.longitud], Math.max(instance.getZoom(), 15));
    }
    for (const box of result?.cajas ?? []) {
      const label = document.createElement('span');
      label.textContent = `${box.nombre} - ${box.puertosLibres} puertos libres`;
      L.circleMarker([box.latitud, box.longitud], { radius: 7, color: '#137a4c', fillOpacity: 0.8 }).bindTooltip(label).addTo(group);
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
    selectLocation({ latitud, longitud });
  }

  const geocodeAddress = useCallback(async () => {
    if (!direccion.trim()) {
      setGeocodeMessage('Ingresa una dirección antes de intentar ubicarla.');
      return;
    }
    if (current.current.disabled) return;
    rememberAttempt(version);
    geocodeController.current?.abort();
    const controller = new AbortController();
    geocodeController.current = controller;
    setGeocoding(true);
    setGeocodeMessage('');
    try {
      const { data } = await api.post<{ candidatos: Array<CoverageLocation & { etiqueta: string }>; mensaje: string | null }>('/coverage/geocode', { direccion }, { signal: controller.signal });
      if (controller.signal.aborted || current.current.version !== version || current.current.disabled) return;
      const first = data.candidatos[0];
      if (first) current.current.onChange({ latitud: first.latitud, longitud: first.longitud });
      else setGeocodeMessage(data.mensaje ?? 'No fue posible ubicar automáticamente la dirección. Selecciona el punto manualmente.');
    } catch {
      if (!controller.signal.aborted && current.current.version === version) {
        setGeocodeMessage('No fue posible ubicar automáticamente la dirección. Selecciona el punto manualmente.');
      }
    } finally {
      if (!controller.signal.aborted && current.current.version === version) setGeocoding(false);
    }
  }, [direccion, version, rememberAttempt]);

  useEffect(() => {
    setGeocoding(false);
    setGeocodeMessage('');
    return () => { geocodeController.current?.abort(); };
  }, [version, disabled]);

  useEffect(() => {
    if (!autoGeocode || disabled || value || attempted.current.has(version)) return;
    // Defer past mount/cleanup so React StrictMode does not issue duplicate requests.
    const timer = window.setTimeout(() => {
      if (current.current.version === version && !current.current.value && !attempted.current.has(version)) void geocodeAddress();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoGeocode, disabled, value, version, geocodeAddress]);

  return <section className="coverage-picker" aria-label="Consulta de cobertura comercial">
    <div className="coverage-heading">
      <strong>Cobertura comercial</strong>
      <button type="button" className="secondary compact" disabled={disabled || geocoding} onClick={() => void geocodeAddress()}>{geocoding ? 'Ubicando dirección...' : 'Ubicar dirección'}</button>
    </div>
    <p>Marca o corrige en el mapa el domicilio exacto de {direccion.trim() || 'la direccion ingresada'}.</p>
    <p className="coverage-note">Pin azul: domicilio. Borde continuo: cobertura general. Borde segmentado: microzona. La seleccion manual siempre permanece disponible.</p>
    <div ref={container} className="coverage-map" aria-label="Mapa de ubicacion del domicilio" />
    <small>Geocodificación: <a href="https://nominatim.org/" target="_blank" rel="noreferrer">Nominatim</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</small>
    {geocodeMessage && <p role="status">{geocodeMessage}</p>}
    <details><summary>Ingresar coordenadas</summary>
      <div className="coverage-coordinates">
        <label>Latitud<input type="text" inputMode="decimal" value={coordinates.latitud} disabled={disabled} placeholder="-33.57" onChange={event => setCoordinates({ ...coordinates, latitud: event.target.value })} /></label>
        <label>Longitud<input type="text" inputMode="decimal" value={coordinates.longitud} disabled={disabled} placeholder="-70.61" onChange={event => setCoordinates({ ...coordinates, longitud: event.target.value })} /></label>
      </div>
      <button type="button" className="secondary compact" disabled={disabled} onClick={applyCoordinates}>Ubicar punto</button>
    </details>
    <div className="coverage-result" aria-live="polite">
      {busy ? <p>Consultando cobertura...</p> : result ? <>
        <strong>{result.estado.replace(/_/g, ' ')}</strong><p>{result.motivo}</p>
        {result.zona && <p><b>Cobertura:</b> {result.zona.nombreZona}{result.microzona ? ` - Microzona: ${result.microzona.nombreZona}` : ''}</p>}
        {result.planes.length > 0 && <><b>Planes disponibles</b><ul>{result.planes.map(plan => <li key={plan.idPlan}>{plan.nombre}: ${plan.precioAplicable.toLocaleString('es-CL')} ({plan.origenPrecio})</li>)}</ul></>}
        {result.coberturaComercial && result.planes.length === 0 && <p>No hay planes activos configurados para esta ubicacion.</p>}
        {result.cajas.length > 0 && <ul>{result.cajas.map(box => <li key={box.id}>{box.nombre}: {box.puertosLibres} puertos libres</li>)}</ul>}
        <small>Consulta de cobertura comercial: {new Date(result.consultadoEn).toLocaleString('es-CL')}</small>
      </> : <p>{connection?.mensaje ?? 'Comprobando configuracion de cobertura...'}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="coverage-actions">
      <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => setRetry(retry + 1)}>Volver a consultar</button>
      {value && <button type="button" className="secondary compact" disabled={disabled} onClick={() => selectLocation(null)}>Quitar ubicacion</button>}
    </div>
  </section>;
}
