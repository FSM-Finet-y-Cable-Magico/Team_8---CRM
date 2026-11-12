import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
describe('Revocación de acceso', () => {
  const payload = { idUsuario: 1, versionSesion: 0, roles: ['Administrador'] };
  function setup(activo = true, versionSesion: number | null = 0, fechaEliminacion: Date | null = null) {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue(payload) };
    const db = { usuario: { findUnique: jest.fn().mockResolvedValue({ idUsuario: 1, activo, versionSesion, fechaEliminacion, usuarioRoles: [{ rol: { nombreRol: 'Comercial' } }] }) } };
    const guard = new JwtAuthGuard(jwt as never, db as never);
    const request: any = { headers: { authorization: 'Bearer test' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    return { guard, context, request, jwt, db };
  }
  it('rechaza tokens de una cuenta desactivada', async () => { const { guard, context } = setup(false); await expect(guard.canActivate(context)).rejects.toThrow(); });
  it('rechaza una cuenta eliminada incluso si se alteró su indicador activo', async () => {
    const { guard, context } = setup(true, 0, new Date());
    await expect(guard.canActivate(context)).rejects.toThrow();
  });
  it('rechaza tokens anteriores al restablecimiento de acceso', async () => { const { guard, context } = setup(true, 1); await expect(guard.canActivate(context)).rejects.toThrow(); });
  it('lee version nula como sesion inicial sin romper login', async () => {
    const {guard,context,request}=setup(true,null);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.versionSesion).toBe(0);
  });
  it('usa los roles actuales de la base de datos', async () => { const { guard, context, request } = setup(); await expect(guard.canActivate(context)).resolves.toBe(true); expect(request.user.roles).toEqual(['Comercial']); });
  it('un fallo temporal de base de datos responde 503 y permite reintentar la misma sesión', async () => {
    const { guard, context, request, db } = setup();
    db.usuario.findUnique.mockRejectedValueOnce(new Error('internal database connection detail'));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request.user).toBeUndefined();
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
  it('un JWT vencido sigue respondiendo 401 sin consultar la base de datos', async () => {
    const { guard, context, jwt, db } = setup();
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.usuario.findUnique).not.toHaveBeenCalled();
  });
});
