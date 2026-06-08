import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado', query = '') {
    const where = {
      ...this.companyScope(currentUser, scope),
      ...(query
        ? {
            OR: [
              { rut: { contains: query, mode: 'insensitive' as const } },
              { nombreCompleto: { contains: query, mode: 'insensitive' as const } },
              { email: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return this.prisma.cliente.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        contratos: {
          include: { plan: true },
          orderBy: { fechaInicio: 'desc' },
        },
      },
    });
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

    const [contratos, tickets, ordenes, equipos, auditoria] = await Promise.all([
      this.prisma.contrato.findMany({
        where: { idCliente },
        orderBy: { fechaInicio: 'desc' },
        include: {
          plan: true,
          facturas: {
            include: { pagos: true },
            orderBy: [{ periodoAnio: 'desc' }, { periodoMes: 'desc' }],
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: { idCliente },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.ordenTrabajo.findMany({
        where: { idCliente },
        orderBy: { fechaCreacion: 'desc' },
      }),
      this.prisma.unidadEquipo.findMany({
        where: { idClienteInstalado: idCliente },
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

    const contractId = Number(normalizedTerm);
    const customerByContract = Number.isInteger(contractId)
      ? await this.prisma.contrato.findUnique({
          where: { idContrato: contractId },
        })
      : null;

    const cliente = customerByContract?.idCliente
      ? await this.prisma.cliente.findUnique({ where: { idCliente: customerByContract.idCliente } })
      : await this.prisma.cliente.findFirst({
          where: {
            OR: [
              { rut: { equals: normalizedTerm } },
              { nombreCompleto: { contains: normalizedTerm, mode: 'insensitive' } },
            ],
          },
        });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!currentUser.roles.includes('Administrador') && cliente.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return cliente;
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: { empresa: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!currentUser.roles.includes('Administrador') && cliente.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return cliente;
  }

  private companyScope(currentUser: AuthUser, scope: string) {
    if (!currentUser.roles.includes('Administrador')) {
      if (!currentUser.idEmpresa) {
        throw new BadRequestException('El usuario no tiene empresa asociada');
      }

      return { idEmpresa: currentUser.idEmpresa };
    }

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
