export function normalizeRutInput(value: string) {
  return value.trim().replace(/\./g, '').toUpperCase();
}
