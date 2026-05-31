import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  list(scope = 'consolidado') {
    const where = this.companyScope(scope);

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

  private companyScope(scope: string) {
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
