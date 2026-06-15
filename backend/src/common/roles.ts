export const CANONICAL_ROLES = ['Administrador', 'Comercial', 'Soporte', 'Terreno'] as const;

export type RoleName = (typeof CANONICAL_ROLES)[number];

export function isRoleName(role: string): role is RoleName {
  return CANONICAL_ROLES.includes(role as RoleName);
}

export function normalizeRoles(roles: string[]) {
  return [...new Set(roles.map((role) => role.trim()).filter(isRoleName))];
}

export function hasRole(roles: string[], role: RoleName) {
  return normalizeRoles(roles).includes(role);
}

export function isAdministrator(roles: string[]) {
  return hasRole(roles, 'Administrador');
}
