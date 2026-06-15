import { RoleName } from './roles';

export const ACCESS_ROLES = {
  ADMIN_ONLY: ['Administrador'],
  VIEW_CORE_DATA: ['Administrador', 'Comercial', 'Soporte', 'Terreno'],
  MANAGE_PROSPECTS: ['Administrador', 'Comercial'],
  VERIFY_FEASIBILITY: ['Administrador', 'Soporte'],
  MANAGE_CUSTOMERS: ['Administrador', 'Comercial', 'Soporte'],
  CREATE_INSTALL_ORDER: ['Administrador', 'Comercial', 'Terreno'],
  VIEW_INVENTORY: ['Administrador', 'Soporte', 'Terreno'],
  MANAGE_INVENTORY: ['Administrador', 'Soporte'],
  INSTALL_EQUIPMENT: ['Administrador', 'Soporte', 'Terreno'],
  CREATE_TICKETS: ['Administrador', 'Comercial', 'Soporte'],
  MANAGE_TICKETS: ['Administrador', 'Soporte'],
  UPDATE_TICKET_STATUS: ['Administrador', 'Soporte', 'Terreno'],
  VIEW_WORK_ORDERS: ['Administrador', 'Soporte', 'Terreno'],
  COMPLETE_INSTALLATION: ['Administrador', 'Soporte', 'Terreno'],
} as const satisfies Record<string, readonly RoleName[]>;
