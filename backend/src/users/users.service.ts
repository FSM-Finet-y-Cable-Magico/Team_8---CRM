import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { isAdministrator } from '../common/roles';
import { SaveUserDto } from './dto/save-user.dto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const users = await this.prisma.usuario.findMany({
      orderBy: { idUsuario: 'asc' },
      include: {
        empresa: true,
        usuarioRoles: {
          include: { rol: true },
        },
      },
    });

    return users.map((user) => ({
      idUsuario: user.idUsuario,
      idEmpresa: user.idEmpresa,
      nombreCompleto: user.nombreCompleto,
      nombreUsuario: user.nombreUsuario,
      email: user.email,
      activo: user.activo,
      esPasswordTemporal: user.esPasswordTemporal,
      intentosFallidos: user.intentosFallidos,
      empresa: user.empresa?.nombre ?? null,
      roles: user.usuarioRoles.map((usuarioRol) => usuarioRol.rol),
    }));
  }

  roles() {
    return this.prisma.rol.findMany({
      orderBy: { idRol: 'asc' },
    });
  }

  private async passwordHash(password?: string) {
    if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('La contraseña debe tener al menos 12 caracteres y máximo 72 bytes');
    }
    return bcrypt.hash(password, 12);
  }

  async save(id: number | null, dto: SaveUserDto, currentUser: AuthUser) {
    if (!dto.nombreCompleto.trim()) throw new BadRequestException('Indica el nombre del usuario');
    const passwordHash = id === null ? await this.passwordHash(dto.password) : undefined;
    if (id !== null && dto.password !== undefined) throw new BadRequestException('Usa la acción Restablecer acceso para cambiar la contraseña');
    try {
      return await this.prisma.$transaction(async tx => {
        // Serializa cambios de acceso para impedir que dos administradores se den de baja simultáneamente.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(8044)`;
        const role = await tx.rol.findUnique({ where: { idRol: dto.roleId } });
        if (!role) throw new BadRequestException('Perfil inexistente');
        const company = dto.idEmpresa ? await tx.empresa.findUnique({ where: { idEmpresa: dto.idEmpresa } }) : null;
        if (dto.idEmpresa && !company) throw new BadRequestException('Empresa inexistente');
        if (!isAdministrator([role.nombreRol]) && !company) throw new BadRequestException('Asigna una empresa a este perfil');
        const before = id === null ? null : await tx.usuario.findUnique({ where: { idUsuario: id }, include: { usuarioRoles: { include: { rol: true } } } });
        if (id !== null && !before) throw new NotFoundException('Usuario no encontrado');
        const losesAdmin = !dto.activo || !isAdministrator([role.nombreRol]);
        if (id === currentUser.idUsuario && losesAdmin) throw new BadRequestException('No puedes desactivar tu propia cuenta ni quitarte el perfil administrador');
        if (before && before.activo !== false && isAdministrator(before.usuarioRoles.map(r => r.rol.nombreRol)) && losesAdmin) {
          const others = await tx.usuario.findMany({ where: { idUsuario: { not: id! }, activo: { not: false } }, include: { usuarioRoles: { include: { rol: true } } } });
          if (!others.some(u => isAdministrator(u.usuarioRoles.map(r => r.rol.nombreRol)))) throw new BadRequestException('Debe quedar al menos un administrador activo');
        }
        const data = { nombreCompleto: dto.nombreCompleto.trim(), email: dto.email.trim().toLowerCase(), idEmpresa: dto.idEmpresa ?? null, activo: dto.activo };
        const saved = before ? await tx.usuario.update({ where: { idUsuario: before.idUsuario }, data: { ...data, versionSesion: { increment: 1 } } })
          : await tx.usuario.create({ data: { ...data, passwordHash: passwordHash!, esPasswordTemporal: false } });
        await tx.usuarioRol.deleteMany({ where: { idUsuario: saved.idUsuario } });
        await tx.usuarioRol.create({ data: { idUsuario: saved.idUsuario, idRol: dto.roleId } });
        await tx.logAuditoria.create({ data: { idUsuario: currentUser.idUsuario, accion: before ? 'ACTUALIZAR_USUARIO' : 'CREAR_USUARIO', entidadAfectada: 'usuario', idEntidadAfectada: saved.idUsuario,
          valorAnterior: before ? { nombreCompleto: before.nombreCompleto, email: before.email, activo: before.activo, idEmpresa: before.idEmpresa, roles: before.usuarioRoles.map(r => r.rol.nombreRol) } : Prisma.JsonNull,
          valorNuevo: { ...data, role: role.nombreRol } } });
        return { idUsuario: saved.idUsuario, ...data, role: role.nombreRol };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ese correo ya está registrado');
      throw error;
    }
  }

  async resetPassword(id: number, password: string, currentUser: AuthUser) {
    const hash = await this.passwordHash(password);
    await this.prisma.$transaction(async tx => {
      const target = await tx.usuario.findUnique({ where: { idUsuario: id } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      await tx.usuario.update({ where: { idUsuario: id }, data: { passwordHash: hash, versionSesion: { increment: 1 }, intentosFallidos: 0, esPasswordTemporal: false } });
      await tx.logAuditoria.create({ data: { idUsuario: currentUser.idUsuario, accion: 'RESTABLECER_ACCESO', entidadAfectada: 'usuario', idEntidadAfectada: id, valorNuevo: { sesionesRevocadas: true } } });
    });
    return { idUsuario: id, sesionesRevocadas: true };
  }

  async assignRole(userId: number, roleId: number, currentUser: AuthUser) {
    const [targetUser, role] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { idUsuario: userId },
        include: { usuarioRoles: { include: { rol: true } } },
      }),
      this.prisma.rol.findUnique({ where: { idRol: roleId } }),
    ]);

    if (!targetUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!role) {
      throw new BadRequestException('Perfil inexistente');
    }

    return this.save(userId, { nombreCompleto: targetUser.nombreCompleto, email: targetUser.email ?? '', idEmpresa: targetUser.idEmpresa ?? undefined, activo: targetUser.activo !== false, roleId }, currentUser);
  }
}
