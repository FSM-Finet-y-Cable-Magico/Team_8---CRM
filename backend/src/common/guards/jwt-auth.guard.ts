import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRequest, AuthUser } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeRoles } from '../roles';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = request.headers?.authorization;
    const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : '';

    if (!token) {
      throw new UnauthorizedException('Token no informado');
    }

    let payload: AuthUser;
    try {
      payload = await this.jwtService.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Token invalido o expirado');
    }
    if (!Number.isSafeInteger(payload.idUsuario) || payload.idUsuario <= 0) throw new UnauthorizedException('Token invalido o expirado');
    const user = await this.prisma.usuario.findUnique({ where: { idUsuario: payload.idUsuario }, include: { usuarioRoles: { include: { rol: true } } } })
      .catch(() => { throw new ServiceUnavailableException('No se pudo verificar la sesión. Inténtalo nuevamente.'); });
    if (!user || user.activo === false || user.fechaEliminacion != null || (user.versionSesion ?? 0) !== (payload.versionSesion ?? 0)) {
      throw new UnauthorizedException('Token invalido o expirado');
    }
    request.user = { idUsuario: user.idUsuario, idEmpresa: user.idEmpresa, email: user.email, nombreCompleto: user.nombreCompleto,
      roles: normalizeRoles(user.usuarioRoles.map(r => r.rol.nombreRol)), versionSesion: user.versionSesion ?? 0 };
    return true;
  }
}
