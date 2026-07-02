import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado', query = '') {
    const normalizedQuery = query.trim();
    const filters: Prisma.ClienteWhereInput[] = [this.companyScope(currentUser, scope)];

    if (normalizedQuery) {
      filters.push(this.customerSearchFilter(normalizedQuery));
    }

    const customers = await this.prisma.cliente.findMany({
      where: { AND: filters },
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        contratos: {
          include: {
            plan: {
              include: { empresa: true },
            },
          },
          orderBy: { fechaInicio: 'desc' },
        },
      },
    });

    return customers.map((customer) => ({
      ...customer,
      empresas: [
        customer.empresa?.nombre,
        ...customer.contratos.map((contract) => contract.plan?.empresa?.nombre),
      ].filter((name, index, names): name is string => Boolean(name) && names.indexOf(name) === index),
    }));
  }

  async updateStatus(idCliente: number, dto: UpdateCustomerStatusDto, currentUser: AuthUser) {
    const cliente = await this.getCustomerOrThrow(idCliente, currentUser);

    const updated = await this.prisma.cliente.update({
      where: { idCliente },
      data: { estado: dto.estado },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_CLIENTE',
      entidadAfectada: 'cliente',
      idEntidadAfectada: idCliente,
      valorAnterior: { estado: cliente.estado },
      valorNuevo: { estado: dto.estado },
    });

    return updated;
  }

  async history(idCliente: number, currentUser: AuthUser) {
    const cliente = await this.getCustomerOrThrow(idCliente, currentUser);
    const companyFilter = isAdministrator(currentUser.roles) || !currentUser.idEmpresa
      ? {}
      : { idEmpresa: currentUser.idEmpresa };

    const [contratos, servicios, tickets, ordenes, equipos, auditoria] = await Promise.all([
      this.prisma.contrato.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaInicio: 'desc' },
        include: {
          plan: true,
          facturas: {
            include: { pagos: true },
            orderBy: [{ periodoAnio: 'desc' }, { periodoMes: 'desc' }],
          },
        },
      }),
      this.prisma.servicioContratado.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
        include: {
          contrato: { include: { plan: true } },
          direccion: true,
          equipos: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.ordenTrabajo.findMany({
        where: { idCliente, ...companyFilter },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.unidadEquipo.findMany({
        where: { idClienteInstalado: idCliente, ...companyFilter },
        orderBy: { idUnidad: 'desc' },
      }),
      this.prisma.logAuditoria.findMany({
        where: {
          OR: [
            { entidadAfectada: 'cliente', idEntidadAfectada: idCliente },
            { valorNuevo: { path: ['idCliente'], equals: idCliente } },
          ],
        },
        orderBy: { fechaHora: 'desc' },
        take: 50,
      }),
    ]);

    return {
      cliente,
      contratos,
      servicios,
      tickets,
      ordenes,
      equipos,
      auditoria: auditoria.map((row) => ({ ...row, idLog: row.idLog.toString() })),
    };
  }

  async findByRutOrContract(term: string, currentUser: AuthUser) {
    const normalizedTerm = term.trim();

    if (!normalizedTerm) {
      throw new BadRequestException('Debe informar un criterio de busqueda');
    }

    const contractId = /^\d+$/.test(normalizedTerm) ? Number(normalizedTerm) : null;
    const customerByContract = contractId && Number.isSafeInteger(contractId) && contractId <= 2147483647
      ? await this.prisma.contrato.findUnique({
          where: { idContrato: contractId },
        })
      : null;

    const cliente = customerByContract?.idCliente
      ? await this.prisma.cliente.findUnique({
          where: { idCliente: customerByContract.idCliente },
          include: { contratos: { select: { idEmpresa: true } } },
        })
      : await this.prisma.cliente.findFirst({
          where: {
            AND: [
              this.customerSearchFilter(normalizedTerm),
              this.companyScope(currentUser, 'consolidado'),
            ],
          },
          include: { contratos: { select: { idEmpresa: true } } },
        });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!this.canAccessCustomer(cliente, currentUser)) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return cliente;
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        empresa: true,
        contratos: { select: { idEmpresa: true } },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!this.canAccessCustomer(cliente, currentUser)) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return cliente;
  }

  private companyScope(currentUser: AuthUser, scope: string): Prisma.ClienteWhereInput {
    if (!isAdministrator(currentUser.roles)) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return this.customerCompanyFilter(currentUser.idEmpresa);
    }

    if (!scope || scope === 'consolidado') {
      return {};
    }

    const idEmpresa = Number(scope);

    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) {
      throw new BadRequestException('Vista de empresa invalida');
    }

    return this.customerCompanyFilter(idEmpresa);
  }

  private customerCompanyFilter(idEmpresa: number): Prisma.ClienteWhereInput {
    return {
      OR: [
        { idEmpresa },
        { contratos: { some: { idEmpresa } } },
      ],
    };
  }

  private customerSearchFilter(term: string): Prisma.ClienteWhereInput {
    const normalizedRut = term.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
    const normalizedPhone = term.replace(/[^\d+]/g, '');
    const contractId = /^\d+$/.test(term) ? Number(term) : null;
    const alternatives: Prisma.ClienteWhereInput[] = [
      { rut: { contains: normalizedRut, mode: 'insensitive' } },
      { nombreCompleto: { contains: term, mode: 'insensitive' } },
    ];

    if (normalizedPhone.length >= 4) {
      alternatives.push({ telefono: { contains: normalizedPhone } });
    }

    if (contractId && Number.isSafeInteger(contractId) && contractId <= 2147483647) {
      alternatives.push({ contratos: { some: { idContrato: contractId } } });
    }

    return { OR: alternatives };
  }

  private canAccessCustomer(
    customer: { idEmpresa: number | null; contratos: Array<{ idEmpresa: number | null }> },
    currentUser: AuthUser,
  ) {
    return isAdministrator(currentUser.roles) ||
      customer.idEmpresa === currentUser.idEmpresa ||
      customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa);
  }
}
