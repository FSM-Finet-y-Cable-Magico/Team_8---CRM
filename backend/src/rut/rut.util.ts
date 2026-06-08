export type RutValidationResult = {
  input: string;
  normalized: string | null;
  valid: boolean;
  reason?: string;
};

const RUT_FORMAT_CHARS = /[.-]/g;

export function validateRut(input: string): RutValidationResult {
  const original = input ?? '';
  const cleaned = original.replace(RUT_FORMAT_CHARS, '').trim().toUpperCase();

  if (!cleaned) {
    return { input: original, normalized: null, valid: false, reason: 'RUT vacio' };
  }

  if (!/^\d{7,8}[\dK]$/.test(cleaned)) {
    return { input: original, normalized: null, valid: false, reason: 'Formato invalido' };
  }

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);
  const expectedVerifier = calculateVerifier(body);
  const normalized = `${body}-${verifier}`;

  if (verifier !== expectedVerifier) {
    return {
      input: original,
      normalized,
      valid: false,
      reason: 'Digito verificador no coincide',
    };
  }

  return { input: original, normalized, valid: true };
}

function calculateVerifier(body: string) {
  let multiplier = 2;
  let sum = 0;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const result = 11 - (sum % 11);

  if (result === 11) {
    return '0';
  }

  if (result === 10) {
    return 'K';
  }

  return String(result);
}
