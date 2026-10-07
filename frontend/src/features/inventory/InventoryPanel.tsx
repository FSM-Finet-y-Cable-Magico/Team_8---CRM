import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Boxes, PackageSearch, RefreshCw, Search, SearchX } from 'lucide-react';
import { api, type G1EquipmentResponse, type G1EquipmentType, type G1Unit } from '../../api';
import { formatDateOnly, formatWorkOrderValue } from '../../lib';
import { TablePagination } from '../../shared/components';
import './inventory-consultation.css';

type ConsultationMessage = { title: string; description: string };
type CatalogState = {
  companyId: number;
  phase: 'loading' | 'ready' | 'error';
  items: G1EquipmentType[];
  message: ConsultationMessage | null;
};
type UnitState = {
  companyId: number;
  loading: boolean;
  item: G1Unit | null;
  message: ConsultationMessage | null;
};

function consultationError(error: unknown, serialSearch = false): ConsultationMessage {
  if (isAxiosError(error)) {
    const code = error.response?.data?.upstreamCode ?? error.response?.data?.code;
    if (code === 'INTEGRACION_G1_NO_CONFIGURADA' || code === 'G1_INVALID_URL' || code === 'G1_INVALID_API_KEY_FORMAT') {
      return {
        title: 'Inventario todavía no conectado',
        description: 'La conexión con Inventario y Bodega debe estar habilitada para consultar sus equipos en este entorno.',
      };
    }
    if (error.response?.status === 404 && serialSearch) {
      return { title: 'No encontramos ese equipo', description: 'Revisa el número de serie y la empresa seleccionada.' };
    }
    if (error.response?.status === 403) {
      return { title: 'Consulta no disponible', description: 'Tu cuenta no tiene acceso al inventario de esta empresa.' };
    }
  }
  return {
    title: serialSearch ? 'No pudimos consultar el equipo' : 'No pudimos cargar el catálogo',
    description: 'Intenta nuevamente en unos momentos. Si continúa, consulta con el administrador.',
  };
}

function equipmentTypeLabel(unit: G1Unit) {
  if (!unit.tipo_equipo) return 'Tipo de equipo sin información';
  return typeof unit.tipo_equipo === 'string'
    ? unit.tipo_equipo
    : [unit.tipo_equipo.nombre, unit.tipo_equipo.marca, unit.tipo_equipo.modelo].filter(Boolean).join(' · ');
}

function categoryLabel(value: string) {
  return /^[A-Z]{2,3}$/.test(value) ? value : formatWorkOrderValue(value);
}

export function InventoryPanel({ companyId, companyName }: { companyId: number; companyName: string }) {
  const [catalog, setCatalog] = useState<CatalogState>({ companyId, phase: 'loading', items: [], message: null });
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [serial, setSerial] = useState('');
  const [unit, setUnit] = useState<UnitState>({ companyId, loading: false, item: null, message: null });
  const unitRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalog({ companyId, phase: 'loading', items: [], message: null });
    api.get<G1EquipmentResponse<G1EquipmentType[]>>('/integrations/g1/equipment-types', {
      params: { idEmpresa: companyId, activo: true },
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.data)) throw new Error('INVALID_CATALOG');
      setCatalog({ companyId, phase: 'ready', items: data.data, message: null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setCatalog({ companyId, phase: 'error', items: [], message: consultationError(error) });
    });
    return () => controller.abort();
  }, [companyId, reload]);

  useEffect(() => {
    setQuery('');
    setCategory('');
    setPage(1);
    setSerial('');
    setUnit({ companyId, loading: false, item: null, message: null });
    return () => unitRequest.current?.abort();
  }, [companyId]);

  const catalogCurrent = catalog.companyId === companyId;
  const loading = !catalogCurrent || catalog.phase === 'loading';
  const ready = catalogCurrent && catalog.phase === 'ready';
  const items = useMemo(() => catalogCurrent ? catalog.items : [], [catalogCurrent, catalog.items]);
  const categories = useMemo(() => [...new Set(items.map(item => item.categoria).filter((value): value is string => Boolean(value)))].sort(), [items]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return items.filter(item => (!category || item.categoria === category)
      && [item.nombre, item.categoria, item.marca, item.modelo].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(needle));
  }, [items, query, category]);
  const pageSize = 20;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentUnit = unit.companyId === companyId ? unit : null;

  async function searchUnit(event: FormEvent) {
    event.preventDefault();
    const value = serial.trim();
    if (!value) {
      setUnit({ companyId, loading: false, item: null, message: { title: 'Ingresa un número de serie', description: 'Lo encontrarás en la etiqueta del equipo.' } });
      return;
    }
    unitRequest.current?.abort();
    const controller = new AbortController();
    unitRequest.current = controller;
    setUnit({ companyId, loading: true, item: null, message: null });
    try {
      const { data } = await api.get<G1EquipmentResponse<G1Unit>>('/integrations/g1/units/' + encodeURIComponent(value), {
        params: { idEmpresa: companyId },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!data.data?.numero_serie) throw new Error('INVALID_UNIT');
      setUnit({ companyId, loading: false, item: data.data, message: null });
    } catch (error) {
      if (!controller.signal.aborted) setUnit({ companyId, loading: false, item: null, message: consultationError(error, true) });
    }
  }

  return (
    <section className="inventory-consultation" aria-label="Consulta de inventario">
      <header className="inventory-consultation-heading">
        <h1>Inventario</h1>
      </header>

      <div className="inventory-catalog-toolbar">
        <label className="inventory-search"><Search size={17} aria-hidden="true" /><input aria-label="Buscar en el catálogo" placeholder="Buscar equipo, marca o modelo" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} disabled={!ready} /></label>
        <select aria-label="Filtrar por categoría" value={category} disabled={!ready} onChange={event => { setCategory(event.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}
        </select>
      </div>

      <div className="inventory-consultation-grid">
        <section className="inventory-catalog" aria-label="Catálogo de equipos" aria-busy={loading}>
          <div className="inventory-catalog-table-shell">
            <table className="inventory-catalog-table">
              <caption className="inventory-sr-only">Tipos de equipo de {companyName}</caption>
              <thead><tr><th>Equipo</th><th>Categoría</th><th>Marca / modelo</th><th>Identificación</th><th>Garantía</th></tr></thead>
              <tbody>{ready && rows.map(item => <tr key={item.id_tipo_equipo}>
                <td data-label="Equipo"><strong>{item.nombre}</strong>{item.unidad_medida && <small>{item.unidad_medida}</small>}</td>
                <td data-label="Categoría">{item.categoria ? categoryLabel(item.categoria) : 'Sin información'}</td>
                <td data-label="Marca / modelo">{[item.marca, item.modelo].filter(Boolean).join(' · ') || 'Sin información'}</td>
                <td data-label="Identificación">{item.requiere_serie_individual === true ? 'Por serie' : item.requiere_serie_individual === false ? 'Por cantidad' : 'Sin información'}</td>
                <td data-label="Garantía">{item.garantia_dias != null ? item.garantia_dias > 0 ? `${item.garantia_dias} días` : 'Sin garantía' : 'Sin información'}</td>
              </tr>)}</tbody>
            </table>
            {loading && <div className="inventory-state" role="status"><RefreshCw size={26} className="inventory-spinning" aria-hidden="true" /><strong>Cargando catálogo</strong><p>Consultando los equipos de la empresa.</p></div>}
            {catalogCurrent && catalog.phase === 'error' && catalog.message && <div className="inventory-state" role="status"><PackageSearch size={32} aria-hidden="true" /><strong>{catalog.message.title}</strong><p>{catalog.message.description}</p><button type="button" className="inventory-text-button" onClick={() => setReload(value => value + 1)}>Volver a consultar</button></div>}
            {ready && !filtered.length && <div className="inventory-state" role="status">{items.length ? <SearchX size={30} aria-hidden="true" /> : <Boxes size={32} aria-hidden="true" />}<strong>{items.length ? 'No hay coincidencias' : 'Todavía no hay equipos en el catálogo'}</strong><p>{items.length ? 'Prueba con otro nombre o cambia la categoría.' : 'Los tipos de equipo se mostrarán cuando Inventario y Bodega los registre.'}</p>{(query || category) && <button type="button" className="inventory-text-button" onClick={() => { setQuery(''); setCategory(''); setPage(1); }}>Limpiar búsqueda</button>}</div>}
          </div>
          {ready && filtered.length > 0 && <div className="inventory-catalog-footer"><span>{filtered.length} {filtered.length === 1 ? 'tipo de equipo' : 'tipos de equipo'}{filtered.length !== items.length ? ` de ${items.length}` : ''}</span><TablePagination currentPage={currentPage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} /></div>}
        </section>

        <aside className="inventory-serial-panel" aria-labelledby="inventory-serial-title">
          <header className="inventory-serial-heading"><PackageSearch size={22} aria-hidden="true" /><h2 id="inventory-serial-title">Consultar equipo</h2></header>
          <p>Busca una unidad para conocer su estado y garantía.</p>
          <form onSubmit={searchUnit}>
            <label htmlFor="inventory-serial">Número de serie</label>
            <input id="inventory-serial" placeholder="Ej. ONT-000123" value={serial} onChange={event => setSerial(event.target.value)} maxLength={80} required autoComplete="off" aria-describedby="inventory-serial-help" />
            <small id="inventory-serial-help">Usa la serie que aparece en la etiqueta.</small>
            <button type="submit" disabled={currentUnit?.loading}><Search size={16} aria-hidden="true" />{currentUnit?.loading ? 'Consultando…' : 'Consultar equipo'}</button>
          </form>
          {currentUnit?.message && <div className="inventory-serial-notice" role="status"><strong>{currentUnit.message.title}</strong><p>{currentUnit.message.description}</p></div>}
        </aside>
      </div>

      {currentUnit?.item && <section className="inventory-unit-result" aria-labelledby="inventory-unit-title" role="region" aria-live="polite">
        <header className="inventory-unit-heading"><div><span>Equipo consultado</span><h2 id="inventory-unit-title">{currentUnit.item.numero_serie}</h2><p>{equipmentTypeLabel(currentUnit.item)}</p></div><span className="inventory-unit-status">{currentUnit.item.estadoFisicoOficial === false ? 'Estado por confirmar' : formatWorkOrderValue(currentUnit.item.estado)}</span></header>
        <dl className="inventory-unit-fields">
          <div><dt>MAC</dt><dd>{currentUnit.item.mac_address || 'Sin información'}</dd></div>
          <div><dt>Bodega actual</dt><dd>{currentUnit.item.id_bodega_actual != null ? `Bodega ${currentUnit.item.id_bodega_actual}` : 'Sin información'}</dd></div>
          <div><dt>Adquisición</dt><dd>{currentUnit.item.fecha_adquisicion ? formatDateOnly(currentUnit.item.fecha_adquisicion) : 'Sin información'}</dd></div>
          <div><dt>Instalación</dt><dd>{currentUnit.item.fecha_instalacion ? formatDateOnly(currentUnit.item.fecha_instalacion) : 'Sin información'}</dd></div>
          <div><dt>Garantía</dt><dd>{currentUnit.item.garantia?.vigente === true ? 'Vigente' : currentUnit.item.garantia?.vigente === false ? 'Vencida' : 'Sin información'}</dd></div>
          <div><dt>Vencimiento de garantía</dt><dd>{currentUnit.item.garantia?.fecha_vencimiento ? formatDateOnly(currentUnit.item.garantia.fecha_vencimiento) : 'Sin información'}</dd></div>
        </dl>
      </section>}
    </section>
  );
}
