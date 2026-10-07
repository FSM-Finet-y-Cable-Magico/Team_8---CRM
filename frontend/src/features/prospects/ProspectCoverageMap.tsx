import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { CommercialCoverage, ProspectLocation } from './prospect-coverage';

export function ProspectCoverageMap({ address, location, coverage, loading, error }: {
  address: string;
  location: ProspectLocation | null;
  coverage: CommercialCoverage | null;
  loading: boolean;
  error: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const lat = location?.latitud;
  const lng = location?.longitud;

  useEffect(() => {
    if (!container.current || lat === undefined || lng === undefined) return;
    const map = L.map(container.current, { scrollWheelZoom: true }).setView([lat, lng], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    for (const [index, zone] of [coverage?.zona, coverage?.microzona].entries()) {
      if (!zone) continue;
      L.geoJSON(zone.poligonoGeojson, { interactive: false, style: {
        color: '#247c68', weight: index ? 2 : 1.5, fillOpacity: .05, dashArray: index ? '5 5' : undefined,
      } }).addTo(map);
    }
    const marker = L.circleMarker([lat, lng], {
      radius: 9, color: '#fff', weight: 3, fillColor: coverage?.coberturaComercial === false ? '#a4483c' : '#247c68', fillOpacity: 1,
    }).addTo(map);
    marker.bindTooltip(() => { const text = document.createElement('span'); text.textContent = address; return text; });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); };
  }, [address, coverage, lat, lng]);

  const state = coverage ? coverage.coberturaComercial ? 'covered' : 'outside' : 'pending';
  const label = loading ? 'Consultando…' : state === 'covered' ? 'Factible' : state === 'outside' ? 'No factible' : 'Sin confirmar';

  return <section className="prospect-coverage-section" aria-busy={loading}>
    <header><div><h4>Cobertura comercial</h4><p>{address || 'Sin dirección registrada'}</p></div>
      <span className={`prospect-coverage-badge ${state}`} role="status">{label}</span>
    </header>
    {location ? <div className="prospect-location-map" ref={container} role="region" aria-label={`Ubicación de ${address}`} />
      : <div className="prospect-location-empty"><MapPin size={26} aria-hidden="true" /><p role={error ? 'alert' : undefined}>{loading ? 'Ubicando dirección…' : error || 'Completa la dirección y la comuna para identificar la ubicación.'}</p></div>}
    {error && location && <p className="alert" role="alert">{error}</p>}
  </section>;
}
