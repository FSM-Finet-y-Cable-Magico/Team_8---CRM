import { normalizeRoleName, normalizeRoles } from './roles';

describe('role normalization', () => {
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
});
