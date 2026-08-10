import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import {
  parseInstallOrderObservations,
  preserveInstallOrderMetadata,
} from '../common/install-order-metadata';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteInstallOrderDto } from './dto/complete-install-order.dto';
import { CompleteRepairOrderDto } from './dto/complete-repair-order.dto';

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
    const technicianIds = [...new Set(orders.map((order) => order.idTecnico).filter((id): id is number => id !== null))];
    const ticketIds = [...new Set(orders.map((order) => order.idTicket).filter((id): id is number => id !== null))];
    const [prospects, customers, technicians, tickets] = await Promise.all([
      customerIds.length
        ? this.prisma.prospecto.findMany({
          where: { idCliente: { in: customerIds } },
          orderBy: { fechaCreacion: 'desc' },
          select: {
            idProspecto: true,
            idCliente: true,
            idEmpresa: true,
            rut: true,
            nombreCompleto: true,
            fechaCreacion: true,
            fechaConversion: true,
            tiempoConversionDias: true,
            estadoPipeline: true,
          },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.cliente.findMany({
            where: { idCliente: { in: customerIds } },
            select: {
              idCliente: true,
              rut: true,
              nombreCompleto: true,
            },
          })
        : Promise.resolve([]),
      technicianIds.length
        ? this.prisma.usuario.findMany({
            where: { idUsuario: { in: technicianIds } },
            select: {
              idUsuario: true,
              nombreCompleto: true,
              email: true,
            },
          })
        : Promise.resolve([]),
      ticketIds.length
        ? this.prisma.ticket.findMany({
            where: { idTicket: { in: ticketIds } },
            select: {
              idTicket: true,
              idCliente: true,
              idServicio: true,
              idCategoria: true,
              codigoSeguimiento: true,
              prioridad: true,
              estado: true,
              descripcion: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const prospectByCustomerCompany = new Map<string, (typeof prospects)[number]>();
    const customerById = new Map(customers.map((customer) => [customer.idCliente, customer]));
    const technicianById = new Map(technicians.map((technician) => [technician.idUsuario, technician]));
    const ticketById = new Map(tickets.map((ticket) => [ticket.idTicket, ticket]));

    for (const prospect of prospects) {
      const key = `${prospect.idCliente}:${prospect.idEmpresa}`;

      if (!prospectByCustomerCompany.has(key)) {
        prospectByCustomerCompany.set(key, prospect);
      }
    }

    return orders.map((order) => {
      const metadata = parseInstallOrderObservations(order.observaciones);
      const horaVisita = metadata.horaVisita ?? this.extractVisitTime(order.observaciones);

      return {
        ...order,
        tipoConexion: metadata.tipoConexion,
        horaVisita,
        observacionesAgenda: metadata.observacionesAgenda,
        observacionesCierre: metadata.observacionesCierre,
        tecnico: order.idTecnico ? technicianById.get(order.idTecnico) ?? null : null,
        cliente: order.idCliente ? customerById.get(order.idCliente) ?? null : null,
        prospecto: prospectByCustomerCompany.get(`${order.idCliente}:${order.idEmpresa}`) ?? null,
        ticket: order.idTicket ? ticketById.get(order.idTicket) ?? null : null,
      };
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
    const completionObservations = preserveInstallOrderMetadata(order.observaciones, dto.observaciones);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: {
          estado: 'Completada',
          fechaCompletada: new Date(),
          potenciaOpticaDbm: dto.potenciaOpticaDbm,
          observaciones: completionObservations,
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

      const serviceWhere = order.idServicio
        ? { idServicio: order.idServicio }
        : {
            idCliente: cliente.idCliente,
            idEmpresa: order.idEmpresa,
            estadoOperativo: { not: 'Baja' },
          };

      await tx.servicioContratado.updateMany({
        where: serviceWhere,
        data: { estadoOperativo: 'Activo' },
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
          observaciones: completionObservations,
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
        idServicio: order.idServicio,
      },
    });

    return result;
  }

  async completeRepair(idOt: number, dto: CompleteRepairOrderDto, currentUser: AuthUser) {
    const order = await this.getOrderOrThrow(idOt, currentUser);

    if (order.tipoOt === 'Instalacion') {
      throw new BadRequestException('La orden de instalacion debe cerrarse desde el flujo de instalacion');
    }

    if (!order.idTicket) {
      throw new BadRequestException('La orden no tiene ticket asociado');
    }

    if (order.estado === 'Completada') {
      throw new BadRequestException('La orden de trabajo ya se encuentra completada');
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket: order.idTicket } });

    if (!ticket) {
      throw new BadRequestException('El ticket asociado a la orden no existe');
    }

    const completionNotes = dto.observaciones.trim();
    const completionObservations = `${order.observaciones ?? ''}\n\nCierre tecnico:\n${completionNotes}`.trim();
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.ordenTrabajo.update({
        where: { idOt },
        data: {
          estado: 'Completada',
          fechaCompletada: new Date(),
          potenciaOpticaDbm: dto.potenciaOpticaDbm,
          observaciones: completionObservations,
        },
      });

      const updatedTicket = await tx.ticket.update({
        where: { idTicket: order.idTicket ?? 0 },
        data: {
          estado: 'Resuelto',
          fechaCierre: new Date(),
          descripcion: `${ticket.descripcion ?? ''}\n\nCierre desde OT #${idOt}:\n${completionNotes}`.trim(),
        },
      });

      if (order.idCliente && dto.estadoFinalServicio) {
        await tx.cliente.update({
          where: { idCliente: order.idCliente },
          data: { estado: dto.estadoFinalServicio },
        });
      }

      await tx.historialOt.create({
        data: {
          idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: order.estado,
          estadoNuevo: 'Completada',
          observaciones: completionObservations,
          fechaHora: new Date(),
        },
      });

      return { order: updatedOrder, ticket: updatedTicket };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CERRAR_OT_TICKET',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: idOt,
      valorAnterior: {
        estadoOrden: order.estado,
        estadoTicket: ticket.estado,
      },
      valorNuevo: {
        estadoOrden: result.order.estado,
        estadoTicket: result.ticket.estado,
        idTicket: order.idTicket,
        idCliente: order.idCliente,
        estadoFinalServicio: dto.estadoFinalServicio,
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

  private extractVisitTime(observaciones?: string | null) {
    return observaciones?.match(/^HoraVisita=(\d{2}:\d{2})$/m)?.[1] ?? null;
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
