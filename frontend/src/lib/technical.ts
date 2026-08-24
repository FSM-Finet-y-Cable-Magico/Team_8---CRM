export function technicalEntries(data?: Record<string, unknown> | null) {
  return Object.entries(data ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
}
