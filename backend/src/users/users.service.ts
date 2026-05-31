import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    const previousRoles = targetUser.usuarioRoles.map((usuarioRol) => usuarioRol.rol.nombreRol);

    await this.prisma.$transaction([
      this.prisma.usuarioRol.deleteMany({ where: { idUsuario: userId } }),
      this.prisma.usuarioRol.create({
        data: {
          idUsuario: userId,
          idRol: roleId,
        },
      }),
    ]);

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ASIGNAR_ROL',
      entidadAfectada: 'usuario_rol',
      idEntidadAfectada: userId,
      valorAnterior: { roles: previousRoles },
      valorNuevo: { role: role.nombreRol },
    });

    return {
      idUsuario: userId,
      role: role.nombreRol,
    };
  }
}
