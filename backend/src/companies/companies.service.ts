import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.empresa.findMany({
      orderBy: { idEmpresa: 'asc' },
    });
  }

  async summary(currentUser: AuthUser, scope = 'consolidado') {
    const effectiveScope = this.resolveScope(currentUser, scope);
    const customerFilter = this.buildCustomerCompanyFilter(effectiveScope);
    const companyFilter = this.buildCompanyFilter(effectiveScope);
    const companiesFilter = 'idEmpresa' in companyFilter ? companyFilter : {};

    const [clientes, prospectos, empresas] = await Promise.all([
      this.prisma.cliente.count({ where: customerFilter }),
      this.prisma.prospecto.count({ where: companyFilter }),
      this.prisma.empresa.findMany({ where: companiesFilter, orderBy: { idEmpresa: 'asc' } }),
    ]);

    return {
      scope: effectiveScope,
      empresas,
      metricas: {
        clientes,
        prospectos,
      },
    };
  }

  private resolveScope(currentUser: AuthUser, requestedScope: string) {
    if (isAdministrator(currentUser.roles)) {
      return requestedScope;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return String(currentUser.idEmpresa);
  }

  private buildCompanyFilter(scope: string) {
    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return { idEmpresa };
  }

  private buildCustomerCompanyFilter(scope: string) {
    const companyFilter = this.buildCompanyFilter(scope);

    if (!('idEmpresa' in companyFilter)) {
      return {};
    }

    return {
      OR: [
        { idEmpresa: companyFilter.idEmpresa },
        { contratos: { some: { idEmpresa: companyFilter.idEmpresa } } },
      ],
    };
  }
}
