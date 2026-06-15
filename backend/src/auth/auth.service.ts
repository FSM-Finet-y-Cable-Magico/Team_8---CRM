import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { normalizeRoles } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ipOrigen?: string | null) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.usuario.findUnique({
      where: { email },
      include: {
        empresa: true,
        usuarioRoles: {
          include: {
            rol: true,
          },
        },
      },
    });

    if (!user || user.activo === false) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordOk) {
      await this.prisma.usuario.update({
        where: { idUsuario: user.idUsuario },
        data: { intentosFallidos: { increment: 1 } },
      });
      await this.auditService.record({
        idUsuario: user.idUsuario,
        accion: 'LOGIN_FALLIDO',
        entidadAfectada: 'usuario',
        idEntidadAfectada: user.idUsuario,
        valorNuevo: { email },
        ipOrigen,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload: AuthUser = {
      idUsuario: user.idUsuario,
      idEmpresa: user.idEmpresa ?? null,
      email: user.email ?? null,
      nombreCompleto: user.nombreCompleto,
      roles: normalizeRoles(user.usuarioRoles.map((usuarioRol) => usuarioRol.rol.nombreRol)),
    };

    await this.prisma.usuario.update({
      where: { idUsuario: user.idUsuario },
      data: { intentosFallidos: 0 },
    });
    await this.auditService.record({
      idUsuario: user.idUsuario,
      accion: 'LOGIN_EXITOSO',
      entidadAfectada: 'usuario',
      idEntidadAfectada: user.idUsuario,
      valorNuevo: { email, roles: payload.roles },
      ipOrigen,
    });

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: payload,
    };
  }
}
