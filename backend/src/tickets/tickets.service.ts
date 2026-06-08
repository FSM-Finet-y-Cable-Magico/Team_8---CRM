import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { RegisterDiagnosisDto } from './dto/register-diagnosis.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

const TICKET_STATUSES = ['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'];

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  categories() {
    return this.prisma.categoriaFalla.findMany({ orderBy: { idCategoria: 'asc' } });
  }

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const tickets = await this.prisma.ticket.findMany({
      where: this.companyScope(currentUser, scope),
      orderBy: [{ prioridad: 'asc' }, { fechaCreacion: 'desc' }],
      take: 150,
    });

    const customerIds = [...new Set(tickets.map((ticket) => ticket.idCliente).filter((id): id is number => Boolean(id)))];
    const categoryIds = [...new Set(tickets.map((ticket) => ticket.idCategoria))];
    const [customers, categories] = await Promise.all([
      customerIds.length ? this.prisma.cliente.findMany({ where: { idCliente: { in: customerIds } } }) : [],
      categoryIds.length ? this.prisma.categoriaFalla.findMany({ where: { idCategoria: { in: categoryIds } } }) : [],
    ]);
    const customerById = new Map(customers.map((customer) => [customer.idCliente, customer]));
    const categoryById = new Map(categories.map((category) => [category.idCategoria, category]));

    return tickets.map((ticket) => ({
      ...ticket,
      cliente: ticket.idCliente ? customerById.get(ticket.idCliente) ?? null : null,
      categoria: categoryById.get(ticket.idCategoria) ?? null,
    }));
  }

  async create(dto: CreateTicketDto, currentUser: AuthUser) {
    const rut = validateRut(dto.rut);

    if (!rut.valid || !rut.normalized) {
      throw new BadRequestException(rut.reason ?? 'RUT invalido');
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { rut: rut.normalized } });

    if (!cliente) {
      throw new BadRequestException('El RUT no corresponde a un cliente existente');
    }

    if (!currentUser.roles.includes('Administrador') && cliente.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    const categoria = await this.prisma.categoriaFalla.findUnique({ where: { idCategoria: dto.idCategoria } });

    if (!categoria) {
      throw new BadRequestException('Categoria seleccionada invalida');
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        idCliente: cliente.idCliente,
        idEmpresa: cliente.idEmpresa,
        idUsuarioAsignado: currentUser.idUsuario,
        idCategoria: dto.idCategoria,
        codigoSeguimiento: this.trackingCode(),
        prioridad: dto.prioridad,
        estado: 'Abierto',
        descripcion: dto.descripcion,
        fechaCreacion: new Date(),
        origen: dto.origen ?? 'CRM',
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: ticket.idTicket,
      valorNuevo: {
        idCliente: cliente.idCliente,
        rut: cliente.rut,
        categoria: categoria.nombre,
        prioridad: dto.prioridad,
      },
    });

    return ticket;
  }

  async updateCategory(idTicket: number, dto: UpdateTicketCategoryDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    const category = await this.prisma.categoriaFalla.findUnique({ where: { idCategoria: dto.idCategoria } });

    if (!category) {
      throw new BadRequestException('Categoria seleccionada invalida');
    }

    const updated = await this.prisma.ticket.update({
      where: { idTicket },
      data: { idCategoria: dto.idCategoria },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CLASIFICAR_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorAnterior: { idCategoria: ticket.idCategoria },
      valorNuevo: { idCategoria: dto.idCategoria, categoria: category.nombre },
    });

    return updated;
  }

  async updatePriority(idTicket: number, dto: UpdateTicketPriorityDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    const updated = await this.prisma.ticket.update({
      where: { idTicket },
      data: { prioridad: dto.prioridad },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ASIGNAR_PRIORIDAD_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorAnterior: { prioridad: ticket.prioridad },
      valorNuevo: { prioridad: dto.prioridad },
    });

    return updated;
  }

  async updateStatus(idTicket: number, dto: UpdateTicketStatusDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    const currentIndex = TICKET_STATUSES.indexOf(ticket.estado);
    const nextIndex = TICKET_STATUSES.indexOf(dto.estado);

    if (nextIndex < currentIndex) {
      throw new BadRequestException('Transicion de estado invalida');
    }

    const updated = await this.prisma.ticket.update({
      where: { idTicket },
      data: {
        estado: dto.estado,
        fechaCierre: dto.estado === 'Cerrado' ? new Date() : ticket.fechaCierre,
        descripcion: dto.comentario ? `${ticket.descripcion ?? ''}\nComentario: ${dto.comentario}` : ticket.descripcion,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorAnterior: { estado: ticket.estado },
      valorNuevo: { estado: dto.estado, comentario: dto.comentario },
    });

    return updated;
  }

  async registerDiagnosis(idTicket: number, dto: RegisterDiagnosisDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);

    if (!dto.causaRaiz.trim()) {
      throw new BadRequestException('La causa raiz es obligatoria');
    }

    const diagnosis = [
      `Causa raiz: ${dto.causaRaiz}`,
      `Problema: ${dto.descripcionProblema}`,
      `Acciones: ${dto.accionesRealizadas}`,
      `Estado final: ${dto.estadoFinalServicio}`,
      dto.observaciones ? `Observaciones: ${dto.observaciones}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { idTicket },
        data: {
          estado: 'Resuelto',
          descripcion: `${ticket.descripcion ?? ''}\n\nDiagnostico tecnico:\n${diagnosis}`,
          fechaCierre: new Date(),
        },
      });

      if (ticket.idCliente) {
        await tx.cliente.update({
          where: { idCliente: ticket.idCliente },
          data: { estado: dto.estadoFinalServicio },
        });
      }

      const order = await tx.ordenTrabajo.findFirst({ where: { idTicket } });

      if (order) {
        await tx.ordenTrabajo.update({
          where: { idOt: order.idOt },
          data: {
            estado: 'Completada',
            fechaCompletada: new Date(),
            observaciones: diagnosis,
          },
        });
        await tx.historialOt.create({
          data: {
            idOt: order.idOt,
            idUsuario: currentUser.idUsuario,
            estadoAnterior: order.estado,
            estadoNuevo: 'Completada',
            observaciones: diagnosis,
            fechaHora: new Date(),
          },
        });
      }

      return updatedTicket;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_DIAGNOSTICO_VISITA',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorNuevo: {
        causaRaiz: dto.causaRaiz,
        estadoFinalServicio: dto.estadoFinalServicio,
        idCliente: ticket.idCliente,
      },
    });

    return result;
  }

  private async getTicketOrThrow(idTicket: number, currentUser: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket } });

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    if (!currentUser.roles.includes('Administrador') && ticket.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El ticket no pertenece a tu empresa');
    }

    return ticket;
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

  private trackingCode() {
    return `TK-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  }
}
