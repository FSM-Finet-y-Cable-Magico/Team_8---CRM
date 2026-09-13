import { JwtAuthGuard } from './jwt-auth.guard';
describe('Revocación de acceso', () => {
  const payload = { idUsuario: 1, versionSesion: 0, roles: ['Administrador'] };
  function setup(activo = true, versionSesion = 0) {
    const guard = new JwtAuthGuard({ verifyAsync: jest.fn().mockResolvedValue(payload) } as never, { usuario: { findUnique: jest.fn().mockResolvedValue({ idUsuario: 1, activo, versionSesion, usuarioRoles: [{ rol: { nombreRol: 'Comercial' } }] }) } } as never);
    const request: any = { headers: { authorization: 'Bearer test' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    return { guard, context, request };
  }
  it('rechaza tokens de una cuenta desactivada', async () => { const { guard, context } = setup(false); await expect(guard.canActivate(context)).rejects.toThrow(); });
  it('rechaza tokens anteriores al restablecimiento de acceso', async () => { const { guard, context } = setup(true, 1); await expect(guard.canActivate(context)).rejects.toThrow(); });
  it('usa los roles actuales de la base de datos', async () => { const { guard, context, request } = setup(); await expect(guard.canActivate(context)).resolves.toBe(true); expect(request.user.roles).toEqual(['Comercial']); });
});
