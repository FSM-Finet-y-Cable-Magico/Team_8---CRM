export function normalizeRutInput(value: string) {
  return value.trim().replace(/\./g, '').toUpperCase();
}

export function formatRutInput(value: string) {
  const compact = value.replace(/[.\s-]/g, '').toUpperCase();
  if (compact.length < 8) return compact;
  return `${compact.slice(0, -1)}-${compact.slice(-1)}`;
}

function rutVerifier(body: string) {
  let multiplier = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  return result === 11 ? '0' : result === 10 ? 'K' : String(result);
}

/** Canonical body-DV form (no dots, with dash) only when the stored value is a complete RUT with a valid DV. */
export function canonicalRut(value?: string | null) {
  const compact = (value ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(compact)) return null;
  const body = compact.slice(0, -1);
  const verifier = compact.slice(-1);
  return rutVerifier(body) === verifier ? `${body}-${verifier}` : null;
}

// Presentation only: records written by other systems (e.g. the G2 web form) may arrive without
// the dash. A valid RUT is shown canonically; anything else is shown exactly as stored, never with
// an inferred verifier digit, and the stored identity is not rewritten.
export function formatRutForDisplay(value?: string | null) {
  if (value == null) return value ?? null;
  return canonicalRut(value) ?? value;
}
