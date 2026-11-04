export function normalizeRutInput(value: string) {
  return value.trim().replace(/\./g, '').toUpperCase();
}

export function formatRutInput(value: string) {
  const compact = value.replace(/[.\s-]/g, '').toUpperCase();
  if (compact.length < 8) return compact;
  return `${compact.slice(0, -1)}-${compact.slice(-1)}`;
}
