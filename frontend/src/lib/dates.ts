export function dateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addYearsToInputDate(value: string, years: number) {
  const [year, month, day] = value.split('-').map(Number);
  return dateInputValue(new Date(year + years, month - 1, day));
}

export function parseDateValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnly(value?: string | null) {
  const dateOnly = value?.slice(0, 10);

  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-CL');
  }

  const date = parseDateValue(value);
  return date ? date.toLocaleDateString('es-CL') : 'Sin dato';
}

export function formatDateTime(value?: string | null) {
  const date = parseDateValue(value);
  return date ? date.toLocaleString('es-CL') : 'Sin dato';
}
