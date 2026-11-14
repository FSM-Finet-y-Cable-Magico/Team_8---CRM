import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

type Period = { from: string; to: string };
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const parse = (key: string) => new Date(`${key}T12:00:00Z`);
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const monthAfter = (key: string, offset: number) => {
  const date = parse(monthStart(key));
  date.setUTCMonth(date.getUTCMonth() + offset);
  return dateKey(date);
};
const label = (key: string) => new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parse(key));

export function ReportPeriodPicker({ value, onChange, min, max }: { value: Period; onChange: (period: Period) => void; min: string; max: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(monthStart(value.from || max));
  const [hover, setHover] = useState('');
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  function choose(key: string) {
    setHover('');
    if (!draft.from || draft.to) setDraft({ from: key, to: '' });
    else setDraft({ from: key < draft.from ? key : draft.from, to: key < draft.from ? draft.from : key });
  }
  const previewEnd = draft.to || (hover && hover >= min && hover <= max ? hover : draft.from);
  const start = draft.from && previewEnd < draft.from ? previewEnd : draft.from;
  const end = draft.from && previewEnd < draft.from ? draft.from : previewEnd;
  const minYear = Number(min.slice(0, 4)), maxYear = Number(max.slice(0, 4));

  function calendar(key: string) {
    const date = parse(key), year = date.getUTCFullYear(), monthIndex = date.getUTCMonth();
    const leading = (date.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return <section className="report-calendar-month" key={key} aria-label={new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)}>
      <div className="report-calendar-weekdays" aria-hidden="true">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => <span key={i}>{day}</span>)}</div>
      <div className="report-calendar-days" onMouseLeave={() => setHover('')}>
        {Array.from({ length: leading }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1, dayKey = `${key.slice(0, 7)}-${String(day).padStart(2, '0')}`;
          const endpoint = dayKey === draft.from || dayKey === draft.to;
          const inside = Boolean(start && end && dayKey >= start && dayKey <= end);
          return <button type="button" key={dayKey} disabled={dayKey < min || dayKey > max}
            className={`report-calendar-day${inside ? ' in-range' : ''}${endpoint ? ' endpoint' : ''}`}
            aria-label={label(dayKey)} aria-pressed={endpoint} aria-current={dayKey === max ? 'date' : undefined}
            onMouseEnter={() => { if (draft.from && !draft.to) setHover(dayKey); }} onFocus={() => { if (draft.from && !draft.to) setHover(dayKey); }}
            onClick={() => choose(dayKey)}>{day}</button>;
        })}
      </div>
    </section>;
  }
  return <div className="report-period" ref={root}>
    <span className="report-field-label" id="report-period-label">Período</span>
    <div className="report-period-control"><button type="button" ref={trigger} className="report-period-trigger" aria-labelledby="report-period-label report-period-value" aria-expanded={open} aria-haspopup="dialog"
      onClick={() => { if (!open) { setDraft(value); setHover(''); setView('days'); setMonth(monthStart(value.from || max)); } setOpen(!open); }}>
      <span id="report-period-value">{value.from && value.to ? `${label(value.from)} — ${label(value.to)}` : 'Seleccionar período'}</span><CalendarDays size={18} />
    </button>{value.from && <button type="button" className="report-period-reset" aria-label="Borrar período" onClick={() => { onChange({ from: '', to: '' }); setDraft({ from: '', to: '' }); }}><X size={15} /></button>}</div>
    {open && <div className="report-period-popover" role="dialog" aria-label="Seleccionar período del reporte">
      <header className="report-calendar-toolbar">
        <button type="button" aria-label="Año anterior" disabled={Number(month.slice(0, 4)) <= minYear} onClick={() => setMonth(monthAfter(month, -12) < monthStart(min) ? monthStart(min) : monthAfter(month, -12))}><ChevronsLeft size={19} /></button>
        <button type="button" aria-label="Mes anterior" disabled={month <= monthStart(min)} onClick={() => setMonth(monthAfter(month, -1))}><ChevronLeft size={19} /></button>
        <button type="button" className="report-calendar-title" aria-label={view === 'days' ? 'Seleccionar mes y año' : 'Seleccionar año'} onClick={() => setView(view === 'months' ? 'years' : 'months')}>
          {view === 'days' ? new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parse(month)) : month.slice(0, 4)}
        </button>
        <button type="button" aria-label="Mes siguiente" disabled={month >= monthStart(max)} onClick={() => setMonth(monthAfter(month, 1))}><ChevronRight size={19} /></button>
        <button type="button" aria-label="Año siguiente" disabled={Number(month.slice(0, 4)) >= maxYear} onClick={() => setMonth(monthAfter(month, 12) > monthStart(max) ? monthStart(max) : monthAfter(month, 12))}><ChevronsRight size={19} /></button>
      </header>
      {view === 'days' && <div className="report-calendar-months">{calendar(month)}</div>}
      {view === 'months' && <div className="report-calendar-options" aria-label="Seleccionar mes">{Array.from({ length: 12 }, (_, i) => {
        const key = `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`;
        return <button type="button" key={key} disabled={key < monthStart(min) || key > monthStart(max)} onClick={() => { setMonth(key); setView('days'); }}>
          {new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' }).format(parse(key))}</button>;
      })}</div>}
      {view === 'years' && <div className="report-calendar-options report-calendar-years" aria-label="Seleccionar año">{Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map(year => <button type="button" key={year} onClick={() => {
        const next = `${year}-${month.slice(5, 7)}-01`;
        setMonth(next < monthStart(min) ? monthStart(min) : next > monthStart(max) ? monthStart(max) : next); setView('months');
      }}>{year}</button>)}</div>}
      <footer>
        <button type="button" disabled={!draft.from || !draft.to} onClick={() => { onChange(draft); setOpen(false); trigger.current?.focus(); }}>Aplicar</button>
      </footer>
    </div>}
  </div>;
}
