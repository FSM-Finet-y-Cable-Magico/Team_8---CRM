const normalized = (value?: string | null) => (value ?? '')
  .trim()
  .toLocaleLowerCase('es-CL')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const SERVICE_TYPES = ['Internet', 'Television', 'Internet + Television'] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

/**
 * Plan.tipoPlan is the commercial source of truth. Historical values such as
 * "Internet+TV" remain compatible while new plans use the canonical labels.
 */
export function serviceTypeFromPlan(tipoPlan?: string | null): ServiceType | null {
  const value = normalized(tipoPlan);
  const includesInternet = value.includes('internet');
  const includesTelevision = value.includes('television') || /(^|\W)tv(\W|$)/.test(value);

  if (includesInternet && includesTelevision) {
    return 'Internet + Television';
  }

  if (includesInternet) {
    return 'Internet';
  }

  if (includesTelevision) {
    return 'Television';
  }

  return null;
}
