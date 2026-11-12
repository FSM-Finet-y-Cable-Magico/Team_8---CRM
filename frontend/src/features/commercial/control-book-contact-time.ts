const zone = 'America/Santiago';
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function contactDateTimeInput(date = new Date()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert the Chilean wall-clock value to an instant, including the seasonal UTC offset. */
export function contactDateTimeISO(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = Date.parse(value + ':00Z');
  if (!Number.isFinite(wallTime)) return null;
  let instant = wallTime;
  for (let index = 0; index < 3; index += 1) {
    instant += wallTime - Date.parse(contactDateTimeInput(new Date(instant)) + ':00Z');
  }
  return contactDateTimeInput(new Date(instant)) === value ? new Date(instant).toISOString() : null;
}

export function contactDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-CL', { timeZone: zone });
}

export function contactTimeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-CL', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
