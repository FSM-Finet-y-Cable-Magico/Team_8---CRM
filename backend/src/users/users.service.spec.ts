import { UsersService } from './users.service';
import * as bcrypt from 'bcryptjs';
const admin = { idUsuario: 1, idEmpresa: null, email: 'admin@test.local', nombreCompleto: 'Admin', roles: ['Administrador'] };
const dto = { nombreCompleto: 'Usuario', email: 'USER@test.local', roleId: 2, idEmpresa: 1, activo: true };
function setup() {
  const target = { idUsuario: 2, activo: true, usuarioRoles: [{ rol: { nombreRol: 'Administrador' } }] };
  const db = { $queryRaw: jest.fn(), $transaction: jest.fn(), rol: { findUnique: jest.fn().mockResolvedValue({ idRol: 2, nombreRol: 'Comercial' }) }, empresa: { findUnique: jest.fn().mockResolvedValue({ idEmpresa: 1 }) },
    usuario: { findUnique: jest.fn().mockResolvedValue(target), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ idUsuario: 3 }), update: jest.fn().mockResolvedValue({ idUsuario: 2 }) }, usuarioRol: { create: jest.fn(), deleteMany: jest.fn() }, logAuditoria: { create: jest.fn() } };
  db.$transaction.mockImplementation(fn => fn(db));
  return { db, target, service: new UsersService(db as never, { record: jest.fn() } as never) };
}
describe('Usuarios internos', () => {
  it('impide desactivar la propia cuenta', async () => { const { service } = setup(); await expect(service.save(1, { ...dto, activo: false }, admin)).rejects.toThrow('propia'); });
  it('protege al último administrador activo', async () => { const { service, db } = setup(); await expect(service.save(2, { ...dto, activo: false }, admin)).rejects.toThrow('administrador activo'); expect(db.usuario.update).not.toHaveBeenCalled(); });
  it('exige empresa para un perfil comercial', async () => { const { service } = setup(); await expect(service.save(2, { ...dto, idEmpresa: undefined }, admin)).rejects.toThrow('empresa'); });
  it('crea contraseña cifrada sin devolverla ni auditarla', async () => { const { service, db } = setup(); const password = 'Prueba-local-12345'; const result = await service.save(null, { ...dto, password }, admin);
    const saved = db.usuario.create.mock.calls[0][0].data; expect(await bcrypt.compare(password, saved.passwordHash)).toBe(true); expect(saved.email).toBe('user@test.local'); expect(result).not.toHaveProperty('passwordHash'); expect(JSON.stringify(db.logAuditoria.create.mock.calls)).not.toContain(password); });
  it('restablece el acceso y revoca las sesiones', async () => { const { service, db } = setup(); await service.resetPassword(2, 'Prueba-local-12345', admin); expect(db.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versionSesion: { increment: 1 } }) })); });
  it('rechaza claves que bcrypt truncaría por longitud en bytes', async () => { const { service } = setup(); await expect(service.resetPassword(2, 'á'.repeat(40), admin)).rejects.toThrow('72 bytes'); });
});
