import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiErrorMessage } from '../../api';
import { userFacingMessage } from '../../lib/user-facing-messages';
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

export function CoveragePicker({ idEmpresa, direccion, value, onChange, onResult, onBusyChange, disabled = false, autoGeocode = false, presentation = 'editor', minimal = false }: {
  idEmpresa: number;
  direccion: string;
  value: CoverageLocation | null;
  onChange: (location: CoverageLocation | null) => void;
  onResult?: (result: CoverageResult | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  // Only enabled after the parent confirms a complete, finished address edit.
  autoGeocode?: boolean;
  presentation?: 'editor' | 'status' | 'summary';
  minimal?: boolean;
}) {
  const [connection, setConnection] = useState<{ configurado: boolean; mensaje: string } | null>(null);
  const [coverage, setResult] = useState<(CoverageResult & { queryKey: string }) | null>(null);
  const [zones, setZones] = useState<Array<CoverageZone & { idEmpresa: number; activo: boolean; fechaInicio?: string | null; fechaFin?: string | null }>>([]);
  const [zonesError, setZonesError] = useState('');
  const [mapWarning, setMapWarning] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const visibleZones = useMemo(() => zones.filter(zone => zone.idEmpresa === idEmpresa && zone.activo === true && zone.poligonoGeojson
    && (!zone.fechaInicio || zone.fechaInicio.slice(0, 10) <= today) && (!zone.fechaFin || zone.fechaFin.slice(0, 10) >= today)), [zones, idEmpresa, today]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [backgroundRetry, setBackgroundRetry] = useState(0);
  const [coordinates, setCoordinates] = useState({ latitud: '', longitud: '' });
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const version = JSON.stringify([idEmpresa, direccion.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL')]);
  const queryKey = JSON.stringify([version, value?.latitud, value?.longitud, retry]);
  const result = coverage?.queryKey === queryKey ? coverage : null;
  const latestQuery = useRef(queryKey);
  latestQuery.current = queryKey;
  const lastCoverage = useRef(coverage);
  lastCoverage.current = coverage;
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
  const busyListener = useRef(onBusyChange);
  selection.current = { onChange: selectLocation, disabled };
  resultListener.current = onResult;
  busyListener.current = onBusyChange;
  const waitingForAddress = autoGeocode && !disabled && !value && !attempted.current.has(version);
  const checking = busy || geocoding || waitingForAddress;

  useEffect(() => { busyListener.current?.(checking); }, [checking]);

  useEffect(() => {
    if (presentation === 'editor') return;
    const refresh = () => { setBackgroundRetry(current => current + 1); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ idEmpresa: number }>).detail?.idEmpresa === idEmpresa) refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('finet:coverage-updated', onChanged);
    // Only the internal coverage API is polled. Geocoding is never repeated by this timer.
    const timer = window.setInterval(onVisible, 30_000);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('finet:coverage-updated', onChanged);
      window.clearInterval(timer);
    };
  }, [idEmpresa, presentation]);

  useEffect(() => {
    if (presentation === 'status' || !container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([-33.57, -70.61], 12);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance);
    const tileTimer = window.setTimeout(() => setMapWarning('La cartografía base no responde. Revisa conectividad o permisos CSP; puedes usar las zonas y coordenadas manuales.'), 8000);
    tiles.on('tileerror', () => setMapWarning('No se pudo cargar la cartografía OpenStreetMap. Revisa conectividad, bloqueos del navegador o CSP. Las coordenadas manuales siguen disponibles.'));
    tiles.on('tileload', () => { window.clearTimeout(tileTimer); setMapWarning(''); });
    map.current = instance;
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (presentation === 'editor' && !selection.current.disabled) {
        selection.current.onChange({ latitud: Number(event.latlng.lat.toFixed(6)), longitud: Number(event.latlng.lng.toFixed(6)) });
      }
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { window.clearTimeout(tileTimer); tiles.off(); resize.disconnect(); instance.remove(); map.current = null; layers.current = null; };
  }, [presentation]);

  useEffect(() => {
    const controller = new AbortController();
    setZonesError('');
    if (!idEmpresa) return;
    void api.get('/coverage/zones', { params: { idEmpresa }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setZones(data); })
      .catch(() => { if (!controller.signal.aborted) setZonesError('No se pudieron consultar las zonas comerciales de esta empresa.'); });
    return () => controller.abort();
  }, [idEmpresa, retry, backgroundRetry]);

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
    // Keep an unchanged address visible during background refresh so the form does not lose focus.
    const background = lastCoverage.current?.queryKey === queryKey;
    if (!background) {
      setResult(null);
      resultListener.current?.(null);
    }
    setError('');
    setBusy(false);
    // Reading availability remains valid even when moving the pin is forbidden.
    if (!value || !connection) return;
    setBusy(!background);
    const timer = window.setTimeout(() => {
      void api.post<CoverageResult>('/coverage/check', { idEmpresa, ...value }, { signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted && latestQuery.current === queryKey) {
            setResult({ ...data, queryKey });
            resultListener.current?.(data);
          }
        })
        .catch(err => {
          if (!controller.signal.aborted) {
            setResult(null); resultListener.current?.(null); setError(apiErrorMessage(err));
          }
        })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [queryKey, connection, backgroundRetry]);

  useEffect(() => {
    setCoordinates({ latitud: value ? String(value.latitud) : '', longitud: value ? String(value.longitud) : '' });
  }, [value?.latitud, value?.longitud]);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const drawZone = (zone: CoverageZone, options: L.PolylineOptions, label: string) => {
      const positions = zone.poligonoGeojson.coordinates[0].map(position => [position[1], position[0]] as L.LatLngTuple);
      const tooltip = document.createElement('span');
      tooltip.textContent = `${label}: ${zone.nombreZona}`;
      L.polygon(positions, options).bindTooltip(tooltip).addTo(group);
    };
    for (const zone of visibleZones) drawZone(zone, { color: '#567873', weight: 2, fillOpacity: 0.05,
      dashArray: zone.tipoZona === 'MICROZONA_COMERCIAL' ? '8 5' : undefined }, 'Zona disponible');
    if (result?.zona) drawZone(result.zona, { color: '#315ea8', weight: 3, fillOpacity: 0.08 }, 'Cobertura general');
    if (result?.microzona) drawZone(result.microzona, { color: '#9a5b13', weight: 3, dashArray: '8 5', fillOpacity: 0.14 }, 'Microzona comercial');
    if (value) {
      L.circleMarker([value.latitud, value.longitud], { radius: 9, color: '#2454b8', fillOpacity: 0.9 })
        .bindTooltip('Domicilio seleccionado').addTo(group);
    }
    for (const box of presentation === 'editor' ? result?.cajas ?? [] : []) {
      const label = document.createElement('span');
      label.textContent = `${box.nombre} - ${box.puertosLibres} puertos libres`;
      L.circleMarker([box.latitud, box.longitud], { radius: 7, color: '#137a4c', fillOpacity: 0.8 }).bindTooltip(label).addTo(group);
    }
  }, [value?.latitud, value?.longitud, result, visibleZones, presentation]);

  useEffect(() => {
    if (value) map.current?.setView([value.latitud, value.longitud], Math.max(map.current.getZoom(), 15));
  }, [value?.latitud, value?.longitud]);

  function showZones() {
    const points = visibleZones.flatMap(zone => zone.poligonoGeojson.coordinates[0].map(position => [position[1], position[0]] as L.LatLngTuple));
    if (points.length) map.current?.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
  }

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
      else setGeocodeMessage(presentation === 'editor'
        ? userFacingMessage(data.mensaje, 'No fue posible ubicar automáticamente la dirección. Selecciona el punto manualmente.')
        : 'No pudimos ubicar esta dirección. Revisa la calle, el número y la comuna.');
    } catch {
      if (!controller.signal.aborted && current.current.version === version) {
        setGeocodeMessage(presentation === 'editor'
          ? 'No fue posible ubicar automáticamente la dirección. Selecciona el punto manualmente.'
          : 'No pudimos ubicar esta dirección. Puedes reintentar o registrar el prospecto para revisarlo después.');
      }
    } finally {
      if (!controller.signal.aborted && current.current.version === version) setGeocoding(false);
    }
  }, [direccion, version, rememberAttempt, presentation]);

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
    }, presentation === 'editor' ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [autoGeocode, disabled, value, version, geocodeAddress, presentation]);

  if (minimal) return <section className="coverage-minimal" aria-label="Consulta de cobertura comercial" aria-busy={checking}>
    <div className="coverage-heading"><strong>Cobertura comercial</strong>
      {!disabled && <button type="button" className="secondary compact" disabled={geocoding} onClick={() => void geocodeAddress()}>{geocoding ? 'Ubicando…' : 'Ubicar dirección'}</button>}
    </div>
    <div ref={container} className="coverage-map" aria-label="Mapa de ubicación del prospecto" />
    {mapWarning && <p className="coverage-map-warning" role="status">No se pudo cargar el mapa base.</p>}
    {(error || zonesError) && <p role="alert">{error || zonesError}</p>}
    {geocodeMessage && <p role="status">{geocodeMessage}</p>}
    {!disabled && <details className="coverage-manual-coordinates"><summary>Ingresar coordenadas</summary>
      <div className="coverage-coordinates">
        <label>Latitud<input type="text" inputMode="decimal" value={coordinates.latitud} placeholder="-33.57" onChange={event => setCoordinates({ ...coordinates, latitud: event.target.value })} /></label>
        <label>Longitud<input type="text" inputMode="decimal" value={coordinates.longitud} placeholder="-70.61" onChange={event => setCoordinates({ ...coordinates, longitud: event.target.value })} /></label>
      </div>
      <button type="button" className="secondary compact" onClick={applyCoordinates}>Ubicar punto</button>
    </details>}
  </section>;

  if (presentation !== 'editor') {
    const showStatus = Boolean(value || autoGeocode);
    if (presentation === 'status' && !showStatus) return null;
    const tone = checking ? 'pending' : result?.coberturaComercial ? 'success'
      : result?.estado === 'NO_FACTIBLE' ? 'negative' : 'pending';
    const Icon = tone === 'success' ? CheckCircle2 : tone === 'negative' ? XCircle : CircleHelp;
    const title = checking ? (geocoding || waitingForAddress ? 'Ubicando dirección…' : 'Consultando cobertura…')
      : error ? 'Cobertura sin verificar'
      : geocodeMessage ? 'No se pudo ubicar la dirección'
      : result?.coberturaComercial ? 'Cobertura factible'
      : result?.estado === 'NO_FACTIBLE' ? 'Sin cobertura comercial'
      : value ? 'Cobertura pendiente' : 'Ubicación pendiente';
    return <section className={`coverage-simple coverage-simple-${presentation}`} aria-label="Consulta de cobertura comercial">
      {showStatus && <div className={`coverage-summary coverage-summary-${tone}`} role="status" aria-live="polite" aria-busy={checking}>
        <Icon size={presentation === 'summary' ? 24 : 19} aria-hidden="true" />
        <div><strong>{title}</strong></div>
      </div>}
      {presentation === 'summary' && <>
        <div ref={container} className="coverage-map" aria-label="Mapa de ubicación del prospecto" />
        {mapWarning && <p className="coverage-map-warning" role="status">No se pudo cargar el mapa base. La consulta de cobertura sigue disponible.</p>}
      </>}
    </section>;
  }

  return <section className="coverage-picker" aria-label="Consulta de cobertura comercial">
    <div className="coverage-heading">
      <strong>Cobertura comercial</strong>
      <button type="button" className="secondary compact" disabled={disabled || geocoding} onClick={() => void geocodeAddress()}>{geocoding ? 'Ubicando dirección...' : 'Ubicar dirección'}</button>
    </div>
    <p>Marca o corrige en el mapa el domicilio exacto de {direccion.trim() || 'la direccion ingresada'}.</p>
    <p className="coverage-note">Pin azul: domicilio. Borde continuo: cobertura general. Borde segmentado: microzona. La seleccion manual siempre permanece disponible.</p>
    <div ref={container} className="coverage-map" aria-label="Mapa de ubicacion del domicilio" />
    {mapWarning && <p className="coverage-map-warning" role="status">{mapWarning}</p>}
    <button type="button" className="secondary compact" disabled={!visibleZones.length} onClick={showZones}>Ver zonas disponibles</button>
    {zonesError && <p role="alert">{zonesError}</p>}
    {visibleZones.length > 0 && <p className="coverage-note">Zonas de esta empresa: {visibleZones.map(zone => zone.nombreZona).join(', ')}. Centrar el mapa no cambia el domicilio.</p>}
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
      </> : <p>{userFacingMessage(connection?.mensaje, connection ? 'La consulta de cobertura no está disponible en este momento.' : 'Comprobando la conexión de cobertura…')}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="coverage-actions">
      <button type="button" className="secondary compact" disabled={busy} onClick={() => setRetry(retry + 1)}>Volver a consultar</button>
      {value && <button type="button" className="secondary compact" disabled={disabled} onClick={() => selectLocation(null)}>Quitar ubicacion</button>}
    </div>
  </section>;
}
