import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ContractDateCalendar({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const selected = new Date(`${value || localDateValue()}T12:00:00`);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(() => {
    const date = new Date(`${value || localDateValue()}T12:00:00`);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [value]);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const today = localDateValue();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? new Date(year, monthIndex, day, 12) : null;
  });

  return <section className="contract-date-calendar" aria-label="Fecha de confirmación de la contratación">
    <header className="contract-date-heading"><CalendarDays size={19} aria-hidden="true" /><span>Fecha de confirmación</span></header>
    <time className="contract-selected-date" dateTime={value}>{selected.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
    <div className="contract-month-navigation">
      <button type="button" aria-label="Mes anterior" disabled={disabled} onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={17} /></button>
      <strong aria-live="polite">{month.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</strong>
      <button type="button" aria-label="Mes siguiente" disabled={disabled} onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={17} /></button>
    </div>
    <div className="contract-calendar-days">
      {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(day => <span className="contract-weekday" key={day} aria-hidden="true">{day}</span>)}
      {cells.map((date, index) => date ? <button key={index} type="button" disabled={disabled}
        className={localDateValue(date) === value ? 'selected' : ''}
        aria-label={date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        aria-pressed={localDateValue(date) === value} aria-current={localDateValue(date) === today ? 'date' : undefined}
        onClick={() => onChange(localDateValue(date))}>{date.getDate()}</button> : <span key={index} />)}
    </div>
    <button className="contract-calendar-today" type="button" disabled={disabled} onClick={() => onChange(today)}>Hoy</button>
  </section>;
}
