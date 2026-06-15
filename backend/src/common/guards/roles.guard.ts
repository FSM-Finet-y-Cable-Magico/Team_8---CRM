import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthRequest } from '../auth.types';
import { isRoleName, normalizeRoles } from '../roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userRoles = normalizeRoles(request.user?.roles ?? []);

    if (request.user) {
      request.user.roles = userRoles;
    }
    const allowed = requiredRoles.some((role) => isRoleName(role) && userRoles.includes(role));

    if (!allowed) {
      throw new ForbiddenException('No tienes permisos para ejecutar esta accion');
    }

    return true;
  }
}
