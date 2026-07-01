export const CANONICAL_ROLES = ['Administrador', 'Comercial', 'Soporte', 'Terreno'] as const;

export type RoleName = (typeof CANONICAL_ROLES)[number];

export type DashboardPermissions = {
  viewProspects: boolean;
  viewInstallations: boolean;
  viewCustomers: boolean;
  viewInventory: boolean;
  viewTickets: boolean;
  viewWorkOrders: boolean;
  viewReports: boolean;
  viewImport: boolean;
  viewUsers: boolean;
  viewAudit: boolean;
  manageCompanyScope: boolean;
  createProspects: boolean;
  manageProspectPipeline: boolean;
  verifyFeasibility: boolean;
  generateQuotes: boolean;
  recordProspectLoss: boolean;
  contractPlans: boolean;
  createInstallOrders: boolean;
  manageServices: boolean;
  manageInventory: boolean;
  installEquipment: boolean;
  createTickets: boolean;
  classifyTickets: boolean;
  updateTicketStatus: boolean;
  diagnoseTickets: boolean;
};

const ROLE_ALIASES: Record<string, RoleName> = {
  ADMIN: 'Administrador',
  ADMINISTRADOR: 'Administrador',
  SUPERUSUARIO: 'Administrador',
  COMERCIAL: 'Comercial',
  SOPORTE: 'Soporte',
  TERRENO: 'Terreno',
  TECNICO_TERRENO: 'Terreno',
};

const PERMISSION_ROLES: Record<keyof DashboardPermissions, readonly RoleName[]> = {
  viewProspects: ['Administrador', 'Comercial', 'Soporte', 'Terreno'],
  viewInstallations: ['Administrador', 'Comercial', 'Soporte'],
  viewCustomers: ['Administrador', 'Comercial', 'Soporte'],
  viewInventory: ['Administrador', 'Soporte', 'Terreno'],
  viewTickets: ['Administrador', 'Comercial', 'Soporte', 'Terreno'],
  viewWorkOrders: ['Administrador', 'Soporte', 'Terreno'],
  viewReports: ['Administrador'],
  viewImport: ['Administrador'],
  viewUsers: ['Administrador'],
  viewAudit: ['Administrador'],
  manageCompanyScope: ['Administrador'],
  createProspects: ['Administrador', 'Comercial'],
  manageProspectPipeline: ['Administrador', 'Comercial'],
  verifyFeasibility: ['Administrador', 'Soporte'],
  generateQuotes: ['Administrador', 'Comercial'],
  recordProspectLoss: ['Administrador', 'Comercial'],
  contractPlans: ['Administrador', 'Comercial'],
  createInstallOrders: ['Administrador', 'Comercial', 'Soporte'],
  manageServices: ['Administrador', 'Comercial', 'Soporte'],
  manageInventory: ['Administrador', 'Soporte'],
  installEquipment: ['Administrador', 'Soporte', 'Terreno'],
  createTickets: ['Administrador', 'Comercial', 'Soporte'],
  classifyTickets: ['Administrador', 'Soporte'],
  updateTicketStatus: ['Administrador', 'Soporte', 'Terreno'],
  diagnoseTickets: ['Administrador', 'Soporte', 'Terreno'],
};

export function isRoleName(role: string): role is RoleName {
  return CANONICAL_ROLES.includes(role as RoleName);
}

export function normalizeUserRoles(roles: string[]) {
  return [
    ...new Set(
      roles
        .map((role) => ROLE_ALIASES[role.trim().toUpperCase()] ?? role.trim())
        .filter(isRoleName),
    ),
  ];
}

export function hasPermission(roles: string[], permission: keyof DashboardPermissions) {
  const normalizedRoles = normalizeUserRoles(roles);
  return PERMISSION_ROLES[permission].some((role) => normalizedRoles.includes(role));
}

export function getDashboardPermissions(roles: string[]): DashboardPermissions {
  return Object.fromEntries(
    Object.keys(PERMISSION_ROLES).map((permission) => [
      permission,
      hasPermission(roles, permission as keyof DashboardPermissions),
    ]),
  ) as DashboardPermissions;
}
