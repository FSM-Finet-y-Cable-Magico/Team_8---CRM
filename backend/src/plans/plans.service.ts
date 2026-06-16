import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  list(currentUser: AuthUser, scope = 'consolidado') {
    const where = this.companyScope(currentUser, scope);

    return this.prisma.plan.findMany({
      where: {
        ...where,
        activo: true,
      },
      orderBy: { idPlan: 'asc' },
      include: {
        empresa: true,
      },
    });
  }

  private companyScope(currentUser: AuthUser, requestedScope: string) {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

    const scope = requestedScope;

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }
}
