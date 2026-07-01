export const CANONICAL_ROLES = ['Administrador', 'Comercial', 'Soporte', 'Terreno', 'Inventario'] as const;

export type RoleName = (typeof CANONICAL_ROLES)[number];

const ROLE_ALIASES: Record<string, RoleName> = {
  ADMIN: 'Administrador',
  ADMINISTRADOR: 'Administrador',
  SUPERUSUARIO: 'Administrador',
  COMERCIAL: 'Comercial',
  SOPORTE: 'Soporte',
  TERRENO: 'Terreno',
  INVENTARIO: 'Inventario',
  ADMIN_BODEGA: 'Inventario',
  TECNICO_TERRENO: 'Terreno',
};

export function normalizeRoleName(role: string) {
  const trimmedRole = role.trim();
  return ROLE_ALIASES[trimmedRole.toUpperCase()] ?? trimmedRole;
}

export function isRoleName(role: string): role is RoleName {
  return CANONICAL_ROLES.includes(role as RoleName);
}

export function normalizeRoles(roles: string[]) {
  return [...new Set(roles.map(normalizeRoleName).filter(isRoleName))];
}

export function hasRole(roles: string[], role: RoleName) {
  return normalizeRoles(roles).includes(role);
}

export function isAdministrator(roles: string[]) {
  return hasRole(roles, 'Administrador');
}
