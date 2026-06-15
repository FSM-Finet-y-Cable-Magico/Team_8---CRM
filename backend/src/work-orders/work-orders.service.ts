import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const orders = await this.prisma.ordenTrabajo.findMany({
      where: this.companyScope(currentUser, scope),
      orderBy: { fechaCreacion: 'desc' },
      take: 150,
    });
    const customerIds = [...new Set(orders.map((order) => order.idCliente).filter((id): id is number => id !== null))];
    const prospects = customerIds.length
      ? await this.prisma.prospecto.findMany({
          where: { idCliente: { in: customerIds } },
          orderBy: { fechaCreacion: 'desc' },
          select: {
            idProspecto: true,
            idCliente: true,
            idEmpresa: true,
            fechaCreacion: true,
            fechaConversion: true,
            tiempoConversionDias: true,
            estadoPipeline: true,
          },
        })
      : [];
    const prospectByCustomerCompany = new Map<string, (typeof prospects)[number]>();

    for (const prospect of prospects) {
      const key = `${prospect.idCliente}:${prospect.idEmpresa}`;

      if (!prospectByCustomerCompany.has(key)) {
        prospectByCustomerCompany.set(key, prospect);
      }
    }

    return orders.map((order) => ({
      ...order,
      prospecto: prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`) ?? null,
    }));
  }

  async completeInstallation(idOt: number, dto: CompleteInstallOrderDto, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt !== 'Instalacion') {
      throw new BadRequestException('La orden no corresponde a instalacion');
    }

    if (!order.idCliente) {
      throw new BadRequestException('La orden no tiene cliente asociado');
    }

    if (order.estado === 'Completada') {
      throw new BadRequestException('La orden de instalacion ya se encuentra completada');
    }

    const prospect = await this.prisma.prospecto.findFirst({
      where: { idCliente: order.idCliente, idEmpresa: order.idEmpresa },
      orderBy: { fechaCreacion: 'desc' },
    });

    if (!prospect) {
      throw new BadRequestException('No existe un prospecto asociado para calcular el tiempo de conversion');
    }

    if (!prospect.fechaCreacion) {
      throw new BadRequestException('No se puede completar la instalacion: falta la fecha de creacion del prospecto');
    }

    const conversionDate = new Date();

    if (prospect.fechaCreacion.getTime() > conversionDate.getTime()) {
      throw new BadRequestException('No se puede completar la instalacion: la fecha de creacion del prospecto es futura');
    }

    const conversionDays = Math.max(
      0,
      Math.ceil((conversionDate.getTime() - prospect.fechaCreacion.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: {
          estado: 'Completada',
          fechaCompletada: new Date(),
          potenciaOpticaDbm: dto.potenciaOpticaDbm,
          observaciones: dto.observaciones,
        },
      });

      const cliente = await tx.cliente.update({
        where: { idCliente: order.idCliente ?? 0 },
        data: { estado: 'Activo' },
      });

      await tx.contrato.updateMany({
        where: {
          idCliente: cliente.idCliente,
          idEmpresa: order.idEmpresa,
          estado: { not: 'Activo' },
        },
        data: { estado: 'Activo' },
      });

      const updatedProspect = await tx.prospecto.update({
        where: { idProspecto: prospect.idProspecto },
        data: {
          estadoPipeline: 'Servicio Activo',
          motivoPerdida: null,
          fechaConversion: conversionDate,
          tiempoConversionDias: conversionDays,
        },
      });

      await tx.historialOt.create({
        data: {
          idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: order.estado,
          estadoNuevo: 'Completada',
          observaciones: dto.observaciones,
          fechaHora: new Date(),
        },
      });

      return { order: updatedOrder, cliente, prospect: updatedProspect };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTIVAR_CLIENTE_INSTALACION',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: idOt,
      valorAnterior: { estado: order.estado },
      valorNuevo: {
        estadoOrden: 'Completada',
        idCliente: order.idCliente,
        estadoCliente: 'Activo',
        potenciaOpticaDbm: dto.potenciaOpticaDbm,
        fechaCreacionProspecto: prospect.fechaCreacion.toISOString(),
        fechaConversion: conversionDate.toISOString(),
        tiempoConversionDias: conversionDays,
      },
    });

    return result;
  }

  private async getOrderOrThrow(idOt: number, currentUser: AuthUser) {
    const order = await this.prisma.ordenTrabajo.findUnique({ where: { idOt } });

    if (!order) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    if (!isAdministrator(currentUser.roles) && order.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('La orden no pertenece a tu empresa');
    }

    return order;
  }

  private companyScope(currentUser: AuthUser, scope: string) {
    if (!isAdministrator(currentUser.roles)) {
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
