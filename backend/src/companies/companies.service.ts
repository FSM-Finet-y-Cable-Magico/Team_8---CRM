import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.empresa.findMany({
      orderBy: { idEmpresa: 'asc' },
    });
  }

  async summary(scope = 'consolidado') {
    const customerFilter = this.buildCustomerCompanyFilter(scope);
    const companyFilter = this.buildCompanyFilter(scope);

    const [clientes, prospectos, empresas] = await Promise.all([
      this.prisma.cliente.count({ where: customerFilter }),
      this.prisma.prospecto.count({ where: companyFilter }),
      this.prisma.empresa.findMany({ orderBy: { idEmpresa: 'asc' } }),
    ]);

    return {
      scope,
      empresas,
      metricas: {
        clientes,
        prospectos,
      },
    };
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
