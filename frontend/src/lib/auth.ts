import type { AuthUser } from '../api';
import { normalizeUserRoles } from '../permissions';

export function normalizeAuthUser(user: AuthUser) {
  return {
    ...user,
    roles: normalizeUserRoles(user.roles),
  };
}
