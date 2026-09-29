import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { InstallTimeSlot } from '../../api';
import { dateInputValue } from '../../lib';
import './install-schedule-picker.css';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function parseInputDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function inputDateFromCalendar(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function InstallSchedulePicker({
  date,
  time,
  min,
  max,
  slots,
  loading = false,
  disabled = false,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  min: string;
  max: string;
  slots?: InstallTimeSlot[];
  loading?: boolean;
  disabled?: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (slot: InstallTimeSlot) => void;
}) {
  const initialDate = parseInputDate(date) ?? parseInputDate(min) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cellCount }, (_, index) => new Date(year, month, index - firstWeekday + 1));
  const monthKey = inputDateFromCalendar(visibleMonth).slice(0, 7);
  const today = dateInputValue(new Date());
  const title = visibleMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  function moveMonth(offset: number) {
    setVisibleMonth(new Date(year, month + offset, 1));
  }

  return <div className="install-schedule-picker">
    <div className="install-calendar-field">
      <span>Fecha de instalación</span>
      <div className="install-inline-calendar" aria-label="Calendario de instalación">
        <div className="install-calendar-header">
          <strong>{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
          <div>
            <button type="button" aria-label="Mes anterior" disabled={disabled || monthKey <= min.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="Mes siguiente" disabled={disabled || monthKey >= max.slice(0, 7)} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="install-calendar-grid install-calendar-weekdays">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="install-calendar-grid">
          {days.map((calendarDate) => {
            const dateValue = inputDateFromCalendar(calendarDate);
            const outsideMonth = calendarDate.getMonth() !== month;
            const unavailable = disabled || dateValue < min || dateValue > max;
            return <button
              type="button"
              key={dateValue}
              disabled={unavailable}
              aria-label={calendarDate.toLocaleDateString('es-CL')}
              aria-pressed={dateValue === date}
              className={[outsideMonth ? 'outside' : '', dateValue === date ? 'selected' : '', dateValue === today ? 'today' : ''].filter(Boolean).join(' ')}
              onClick={() => {
                if (outsideMonth) setVisibleMonth(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1));
                onDateChange(dateValue);
              }}
            >{calendarDate.getDate()}</button>;
          })}
        </div>
        <button type="button" className="install-calendar-today" disabled={disabled || today < min || today > max} onClick={() => {
          const todayDate = parseInputDate(today);
          if (todayDate) setVisibleMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
          onDateChange(today);
        }}>Hoy</button>
      </div>
    </div>
    <fieldset className="install-time-slots" disabled={disabled}>
      <legend>Horarios disponibles</legend>
      {!date && <p>Selecciona una fecha para ver sus horarios.</p>}
      {loading && <p>Consultando disponibilidad…</p>}
      {!loading && slots?.map((slot) => <button
        type="button"
        key={slot.horaVisita}
        disabled={!slot.disponible || disabled}
        className={time === slot.horaVisita ? 'selected' : ''}
        title={slot.motivo}
        onClick={() => onTimeChange(slot)}
      ><strong>{slot.horaVisita}</strong><span>{slot.motivo}</span></button>)}
    </fieldset>
  </div>;
}
