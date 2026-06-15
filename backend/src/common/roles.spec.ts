import { CANONICAL_ROLES, isRoleName, normalizeRoles } from './roles';

describe('role normalization', () => {
  it.each(CANONICAL_ROLES)('accepts canonical role %s', (role) => {
    expect(isRoleName(role)).toBe(true);
  });

  it('drops unknown non-canonical roles', () => {
    expect(normalizeRoles(['Rol antiguo', 'Administrador', 'Tecnico en terreno', 'Comercial'])).toEqual([
      'Administrador',
      'Comercial',
    ]);
  });
});
