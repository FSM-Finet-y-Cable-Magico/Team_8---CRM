import { CANONICAL_ROLES, isRoleName, normalizeRoleName, normalizeRoles } from './roles';

describe('role normalization', () => {
  it.each(CANONICAL_ROLES)('accepts canonical role %s', (role) => {
    expect(isRoleName(role)).toBe(true);
  });

  it.each([
    ['ADMIN', 'Administrador'],
    ['SUPERUSUARIO', 'Administrador'],
    ['COMERCIAL', 'Comercial'],
    ['TECNICO_TERRENO', 'Terreno'],
    ['Soporte', 'Soporte'],
  ])('normalizes %s as %s', (source, expected) => {
    expect(normalizeRoleName(source)).toBe(expected);
  });

  it('removes duplicate aliases', () => {
    expect(normalizeRoles(['ADMIN', 'Administrador', 'COMERCIAL'])).toEqual(['Administrador', 'Comercial']);
  });

  it('drops unknown roles', () => {
    expect(normalizeRoles(['Rol antiguo', 'Administrador', 'Tecnico en terreno'])).toEqual(['Administrador']);
  });
});
