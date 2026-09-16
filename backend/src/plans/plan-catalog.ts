export const PLAN_TYPES = ['Internet', 'Television', 'Internet + Television'] as const;
export const PLAN_CUSTOMER_TYPES = ['Residencial', 'Empresarial'] as const;

export function planTypeRequiresSpeed(type: string) {
  return type === 'Internet' || type === 'Internet + Television';
}
