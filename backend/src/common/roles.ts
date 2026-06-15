const ROLE_ALIASES: Record<string, string> = {
  ADMIN: 'Administrador',
  ADMINISTRADOR: 'Administrador',
  SUPERUSUARIO: 'Administrador',
  COMERCIAL: 'Comercial',
  SOPORTE: 'Soporte',
  TERRENO: 'Terreno',
  TECNICO_TERRENO: 'Terreno',
};

export function normalizeRoleName(role: string) {
  const trimmedRole = role.trim();
  return ROLE_ALIASES[trimmedRole.toUpperCase()] ?? trimmedRole;
}

export function normalizeRoles(roles: string[]) {
  return [...new Set(roles.map(normalizeRoleName))];
}
