import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { generateWorkOrderCode } from '../common/work-order-code';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateTicketWorkOrderDto } from './dto/create-ticket-work-order.dto';
import { RegisterDiagnosisDto } from './dto/register-diagnosis.dto';
import { TechnicalNoteDto } from './dto/technical-note.dto';
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
    const ticketIds = tickets.map((ticket) => ticket.idTicket);
    const [customers, categories, workOrders] = await Promise.all([
      customerIds.length ? this.prisma.cliente.findMany({ where: { idCliente: { in: customerIds } } }) : [],
      categoryIds.length ? this.prisma.categoriaFalla.findMany({ where: { idCategoria: { in: categoryIds } } }) : [],
      ticketIds.length
        ? this.prisma.ordenTrabajo.findMany({
            where: { idTicket: { in: ticketIds } },
            orderBy: { fechaCreacion: 'desc' },
            select: {
              idOt: true,
              idTicket: true,
              idCliente: true,
              idServicio: true,
              codigoSeguimiento: true,
              tipoOt: true,
              prioridad: true,
              estado: true,
              fechaProgramada: true,
              fechaCompletada: true,
              observaciones: true,
            },
          })
        : [],
    ]);
    const customerById = new Map(customers.map((customer) => [customer.idCliente, customer]));
    const categoryById = new Map(categories.map((category) => [category.idCategoria, category]));
    const workOrdersByTicket = new Map<number, typeof workOrders>();

    for (const order of workOrders) {
      if (!order.idTicket) {
        continue;
      }

      const current = workOrdersByTicket.get(order.idTicket) ?? [];
      current.push(order);
      workOrdersByTicket.set(order.idTicket, current);
    }

    return tickets.map((ticket) => {
      const ticketWorkOrders = workOrdersByTicket.get(ticket.idTicket) ?? [];

      return {
        ...ticket,
        cliente: ticket.idCliente ? customerById.get(ticket.idCliente) ?? null : null,
        categoria: categoryById.get(ticket.idCategoria) ?? null,
        workOrders: ticketWorkOrders,
        hasOpenWorkOrder: ticketWorkOrders.some((order) => order.estado !== 'Completada'),
        observacionesTecnicas: this.extractTechnicalNotes(ticket.descripcion),
      };
    });
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

    if (!isAdministrator(currentUser.roles) && cliente.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return this.createForCustomer(cliente.idCliente, dto, {
      idUsuario: currentUser.idUsuario,
      idUsuarioAsignado: currentUser.idUsuario,
      accion: 'CREAR_TICKET',
      origen: dto.origen ?? 'CRM',
    });
  }

  async createForPortal(
    idCliente: number,
    dto: Pick<CreateTicketDto, 'idCategoria' | 'idServicio' | 'prioridad' | 'descripcion'>,
  ) {
    return this.createForCustomer(idCliente, dto, {
      idUsuario: null,
      idUsuarioAsignado: null,
      accion: 'CREAR_TICKET_PORTAL',
      origen: 'Portal',
    });
  }

  async createWorkOrder(idTicket: number, dto: CreateTicketWorkOrderDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);

    if (!ticket.idCliente) {
      throw new BadRequestException('El ticket no tiene cliente asociado para generar una orden de trabajo');
    }

    if (['Resuelto', 'Cerrado'].includes(ticket.estado)) {
      throw new BadRequestException('No se puede generar una orden de trabajo para un ticket ya cerrado o resuelto');
    }

    const existingOrder = await this.prisma.ordenTrabajo.findFirst({ where: { idTicket } });

    if (existingOrder) {
      throw new BadRequestException('Este ticket ya tiene una orden de trabajo asociada');
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { idCliente: ticket.idCliente } });

    if (!cliente) {
      throw new BadRequestException('El cliente asociado al ticket no existe');
    }

    const idEmpresa = ticket.idEmpresa ?? cliente.idEmpresa;

    if (!idEmpresa) {
      throw new BadRequestException('El ticket no tiene empresa asociada');
    }

    const servicio = ticket.idServicio
      ? await this.prisma.servicioContratado.findUnique({ where: { idServicio: ticket.idServicio } })
      : null;

    if (ticket.idServicio && !servicio) {
      throw new BadRequestException('El servicio asociado al ticket no existe');
    }

    if (servicio && (servicio.idCliente !== ticket.idCliente || servicio.idEmpresa !== idEmpresa)) {
      throw new BadRequestException('El servicio asociado al ticket no corresponde al cliente o empresa');
    }

    const technician = dto.idTecnico
      ? await this.prisma.usuario.findUnique({ where: { idUsuario: dto.idTecnico } })
      : null;

    if (dto.idTecnico && !technician) {
      throw new BadRequestException('El tecnico seleccionado no existe');
    }

    if (technician && technician.idEmpresa !== idEmpresa) {
      throw new BadRequestException('El tecnico seleccionado no pertenece a la empresa del ticket');
    }

    const direccion = servicio?.idDireccion
      ? await this.prisma.direccionServicio.findUnique({ where: { idDireccion: servicio.idDireccion } })
      : await this.prisma.direccionServicio.findFirst({
          where: { idCliente: ticket.idCliente, esPrincipal: true },
          orderBy: { idDireccion: 'asc' },
        });

    const scheduledDate = dto.fechaProgramada ? this.parseScheduleDate(dto.fechaProgramada) : null;
    const observations = this.buildTicketWorkOrderObservations(ticket, dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.ordenTrabajo.create({
        data: {
          idEmpresa,
          idCliente: ticket.idCliente,
          idTecnico: dto.idTecnico,
          idDireccion: direccion?.idDireccion,
          idServicio: ticket.idServicio,
          idTicket,
          tipoOt: dto.tipoOt ?? 'Reparacion',
          prioridad: dto.prioridad ?? ticket.prioridad,
          estado: 'Pendiente',
          fechaCreacion: new Date(),
          fechaProgramada: scheduledDate,
          observaciones: observations,
          resueltoRemotamente: false,
        },
      });
      const order = await tx.ordenTrabajo.update({
        where: { idOt: createdOrder.idOt },
        data: { codigoSeguimiento: generateWorkOrderCode(createdOrder.tipoOt, createdOrder.idOt) },
      });

      const updatedTicket = await tx.ticket.update({
        where: { idTicket },
        data: {
          estado: 'Escalado',
          descripcion: `${ticket.descripcion ?? ''}\n\nDerivado a terreno mediante ${order.codigoSeguimiento ?? `OT #${order.idOt}`}`.trim(),
        },
      });

      await tx.historialOt.create({
        data: {
          idOt: order.idOt,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: null,
          estadoNuevo: 'Pendiente',
          observaciones: `OT generada desde ticket ${ticket.codigoSeguimiento ?? idTicket}`,
          fechaHora: new Date(),
        },
      });

      return { order, ticket: updatedTicket };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_OT_DESDE_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorAnterior: { estado: ticket.estado },
      valorNuevo: {
        estado: result.ticket.estado,
        idOt: result.order.idOt,
        codigoSeguimiento: result.order.codigoSeguimiento,
        tipoOt: result.order.tipoOt,
        idCliente: ticket.idCliente,
        idServicio: ticket.idServicio,
        idTecnico: dto.idTecnico,
        fechaProgramada: dto.fechaProgramada,
        horaVisita: dto.horaVisita,
      },
    });

    return result;
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

    if (['Resuelto', 'Cerrado'].includes(dto.estado)) {
      await this.assertNoPendingWorkOrderForClosure(idTicket);
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
    await this.assertNoPendingWorkOrderForClosure(idTicket);

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

  async technicalNotes(idTicket: number, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    return this.extractTechnicalNotes(ticket.descripcion);
  }

  async addTechnicalNote(idTicket: number, dto: TechnicalNoteDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    const block = this.technicalNoteBlock(dto.observacion, currentUser.nombreCompleto);
    const updated = await this.prisma.ticket.update({
      where: { idTicket },
      data: {
        descripcion: `${ticket.descripcion ?? ''}\n\n${block}`.trim(),
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_OBSERVACION_TECNICA_TICKET',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorNuevo: {
        estado: ticket.estado,
        observacion: dto.observacion,
      },
    });

    return {
      ...updated,
      observacionesTecnicas: this.extractTechnicalNotes(updated.descripcion),
    };
  }

  private async createForCustomer(
    idCliente: number,
    dto: Pick<CreateTicketDto, 'idCategoria' | 'idServicio' | 'prioridad' | 'descripcion'>,
    options: { idUsuario: number | null; idUsuarioAsignado: number | null; accion: string; origen: string },
  ) {
    const cliente = await this.prisma.cliente.findUnique({ where: { idCliente } });

    if (!cliente) {
      throw new BadRequestException('El cliente indicado no existe');
    }

    const categoria = await this.prisma.categoriaFalla.findUnique({ where: { idCategoria: dto.idCategoria } });

    if (!categoria) {
      throw new BadRequestException('Categoria seleccionada invalida');
    }

    const servicio = dto.idServicio
      ? await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } })
      : null;

    if (dto.idServicio && !servicio) {
      throw new BadRequestException('El servicio contratado indicado no existe');
    }

    if (servicio && servicio.idCliente !== cliente.idCliente) {
      throw new BadRequestException('El servicio contratado no corresponde al cliente seleccionado');
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        idCliente: cliente.idCliente,
        idEmpresa: servicio?.idEmpresa ?? cliente.idEmpresa,
        idServicio: servicio?.idServicio,
        idUsuarioAsignado: options.idUsuarioAsignado,
        idCategoria: dto.idCategoria,
        codigoSeguimiento: this.trackingCode(),
        prioridad: dto.prioridad,
        estado: 'Abierto',
        descripcion: dto.descripcion,
        fechaCreacion: new Date(),
        origen: options.origen,
      },
    });

    await this.auditService.record({
      idUsuario: options.idUsuario,
      accion: options.accion,
      entidadAfectada: 'ticket',
      idEntidadAfectada: ticket.idTicket,
      valorNuevo: {
        idCliente: cliente.idCliente,
        rut: cliente.rut,
        categoria: categoria.nombre,
        prioridad: dto.prioridad,
        idServicio: servicio?.idServicio,
        origen: options.origen,
      },
    });

    return ticket;
  }

  private async getTicketOrThrow(idTicket: number, currentUser: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket } });

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    if (!isAdministrator(currentUser.roles) && ticket.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El ticket no pertenece a tu empresa');
    }

    return ticket;
  }

  private async assertNoPendingWorkOrderForClosure(idTicket: number) {
    const pendingOrder = await this.prisma.ordenTrabajo.findFirst({
      where: {
        idTicket,
        estado: { not: 'Completada' },
      },
    });

    if (pendingOrder) {
      throw new BadRequestException(
        'El cierre debe realizarse desde la orden de trabajo asociada',
      );
    }
  }

  private parseScheduleDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Fecha de visita invalida');
    }

    const minimum = new Date('2020-01-01T00:00:00.000Z');

    if (date < minimum) {
      throw new BadRequestException('La fecha de visita debe ser posterior al 01-01-2020');
    }

    return date;
  }

  private buildTicketWorkOrderObservations(ticket: { codigoSeguimiento: string | null; descripcion: string | null }, dto: CreateTicketWorkOrderDto) {
    return [
      `Ticket=${ticket.codigoSeguimiento ?? 'Sin codigo'}`,
      dto.horaVisita ? `HoraVisita=${dto.horaVisita}` : '',
      ticket.descripcion ? `Reporte inicial: ${ticket.descripcion}` : '',
      dto.observaciones?.trim() ? `Observaciones de agenda: ${dto.observaciones.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
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

  private trackingCode() {
    return `TK-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  }

  private technicalNoteBlock(observation: string, author: string) {
    return `[Observacion tecnica - ${new Date().toISOString()} - ${author}]\n${observation.trim()}`;
  }

  private extractTechnicalNotes(description: string | null) {
    if (!description) {
      return [];
    }

    const regex = /\[Observacion tecnica - ([^\]]+)\]\n([\s\S]*?)(?=\n\n\[Observacion tecnica - |\n\nDiagnostico tecnico:|$)/g;
    const notes: Array<{ metadata: string; texto: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(description)) !== null) {
      notes.push({ metadata: match[1], texto: match[2].trim() });
    }

    return notes;
  }
}
