import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
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

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token);
      const user = await this.prisma.usuario.findUnique({ where: { idUsuario: payload.idUsuario }, include: { usuarioRoles: { include: { rol: true } } } });
      if (!user || user.activo === false || user.versionSesion !== (payload.versionSesion ?? 0)) throw new UnauthorizedException();
      request.user = { idUsuario: user.idUsuario, idEmpresa: user.idEmpresa, email: user.email, nombreCompleto: user.nombreCompleto,
        roles: normalizeRoles(user.usuarioRoles.map(r => r.rol.nombreRol)), versionSesion: user.versionSesion };
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido o expirado');
    }
  }
}
