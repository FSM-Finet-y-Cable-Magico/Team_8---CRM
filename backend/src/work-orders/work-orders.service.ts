import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(currentUser: AuthUser, scope = 'consolidado') {
    return this.prisma.ordenTrabajo.findMany({
      where: this.companyScope(currentUser, scope),
      orderBy: { fechaCreacion: 'desc' },
      take: 150,
    });
  }

  async completeInstallation(idOt: number, dto: CompleteInstallOrderDto, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt !== 'Instalacion') {
      throw new BadRequestException('La orden no corresponde a instalacion');
    }

    if (!order.idCliente) {
      throw new BadRequestException('La orden no tiene cliente asociado');
    }

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

      const prospect = await tx.prospecto.findFirst({
        where: { idCliente: cliente.idCliente, idEmpresa: order.idEmpresa },
      });
      let updatedProspect = null;

      if (prospect && prospect.estadoPipeline !== 'Servicio Activo') {
        const now = new Date();
        const conversionDays = prospect.fechaCreacion
          ? Math.max(0, Math.ceil((now.getTime() - prospect.fechaCreacion.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        updatedProspect = await tx.prospecto.update({
          where: { idProspecto: prospect.idProspecto },
          data: {
            estadoPipeline: 'Servicio Activo',
            motivoPerdida: null,
            fechaConversion: now,
            tiempoConversionDias: conversionDays,
          },
        });
      }

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
      },
    });

    return result;
  }

  private async getOrderOrThrow(idOt: number, currentUser: AuthUser) {
    const order = await this.prisma.ordenTrabajo.findUnique({ where: { idOt } });

    if (!order) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    if (!currentUser.roles.includes('Administrador') && order.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('La orden no pertenece a tu empresa');
    }

    return order;
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
