import { useState } from 'react';
import { X } from 'lucide-react';
import { ControlResponse, EMPTY_FILTERS, Filters, dateLabel, readable } from './control-book-model';

export const FILTER_LABELS: Partial<Record<keyof Filters, string>> = {
  estadoComercial: 'Estado comercial', estadoServicio: 'Estado del servicio', idPlan: 'Plan', idZona: 'Zona',
  conDeuda: 'Con deuda', vencido: 'Vencidas', conConvenio: 'Con convenio', conProrroga: 'Con prórroga',
  conUltimoAviso: 'Con último aviso', retiroPendiente: 'Retiro pendiente', diasAtrasoMin: 'Atraso desde',
  diasAtrasoMax: 'Atraso hasta', fechaVencimientoDesde: 'Vencimiento desde', fechaVencimientoHasta: 'Vencimiento hasta',
};
export function filterDescription(key: keyof Filters, value: string, options?: ControlResponse['filterOptions']) {
  if (key === 'idPlan') return `Plan: ${options?.plans.find((item) => String(item.id) === value)?.label ?? value}`;
  if (key === 'idZona') return `Zona: ${options?.zones.find((item) => String(item.id) === value)?.label ?? value}`;
  if (value === 'true' || value === 'false') return `${FILTER_LABELS[key]}: ${value === 'true' ? 'sí' : 'no'}`;
  if (key.startsWith('fecha')) return `${FILTER_LABELS[key]}: ${dateLabel(value)}`;
  if (key.startsWith('dias')) return `${FILTER_LABELS[key]}: ${value} días`;
  return `${FILTER_LABELS[key]}: ${readable(value)}`;
}

export function ControlBookFilters({ filters, options, onApply, onClose }: {
  filters: Filters; options?: ControlResponse['filterOptions']; onApply: (filters: Filters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  const change = (key: keyof Filters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  function select(key: keyof Filters, choices: Array<{ value: string; label: string }>) {
    const values = draft[key] && !choices.some((item) => item.value === draft[key])
      ? [...choices, { value: draft[key], label: readable(draft[key]) }] : choices;
    return <label key={key}>{FILTER_LABELS[key]}<select value={draft[key]} onChange={(event) => change(key, event.target.value)}>
      <option value="">Todos</option>{values.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>;
  }
  return <form id="control-filters" className="control-options-panel" aria-label="Filtros del libro de control" onSubmit={(event) => {
    event.preventDefault();
    if (draft.diasAtrasoMin && draft.diasAtrasoMax && Number(draft.diasAtrasoMin) > Number(draft.diasAtrasoMax)) { setError('El atraso mínimo no puede superar al máximo.'); return; }
    if (draft.fechaVencimientoDesde && draft.fechaVencimientoHasta && draft.fechaVencimientoDesde > draft.fechaVencimientoHasta) { setError('La fecha inicial no puede ser posterior a la final.'); return; }
    onApply({ ...draft, search: filters.search, sort: filters.sort, order: filters.order });
  }}>
    <header><h2>Filtrar libro de control</h2><button type="button" className="control-icon" aria-label="Cerrar filtros" onClick={onClose}><X size={18}/></button></header>
    <div className="control-filter-grid">
      {select('estadoComercial', (options?.commercialStatuses ?? []).map((value) => ({ value, label: readable(value) })))}
      {select('estadoServicio', (options?.serviceStatuses ?? []).map((value) => ({ value, label: readable(value) })))}
      {select('idPlan', (options?.plans ?? []).map((item) => ({ value: String(item.id), label: item.label })))}
      {select('idZona', (options?.zones ?? []).map((item) => ({ value: String(item.id), label: item.label })))}
      <fieldset><legend>Días de atraso</legend><div className="control-range">
        <label>Desde<input type="number" min="0" value={draft.diasAtrasoMin} onChange={(event) => change('diasAtrasoMin', event.target.value)}/></label>
        <label>Hasta<input type="number" min="0" value={draft.diasAtrasoMax} onChange={(event) => change('diasAtrasoMax', event.target.value)}/></label>
      </div></fieldset>
      <fieldset><legend>Vencimiento</legend><div className="control-range">
        <label>Desde<input type="date" value={draft.fechaVencimientoDesde} onChange={(event) => change('fechaVencimientoDesde', event.target.value)}/></label>
        <label>Hasta<input type="date" value={draft.fechaVencimientoHasta} onChange={(event) => change('fechaVencimientoHasta', event.target.value)}/></label>
      </div></fieldset>
      {(['conDeuda', 'vencido', 'conConvenio', 'conProrroga', 'conUltimoAviso', 'retiroPendiente'] as const).map((key) => select(key, [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]))}
    </div>
    {error && <p role="alert" className="control-feedback error">{error}</p>}
    <footer><button type="button" className="control-text-button" onClick={() => { setDraft(EMPTY_FILTERS); setError(''); }}>Restablecer</button><button type="submit">Aplicar filtros</button></footer>
  </form>;
}
