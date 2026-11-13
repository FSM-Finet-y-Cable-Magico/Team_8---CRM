import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ConflictException } from '@nestjs/common';
import { Prisma, Ticket } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { companyResponse } from '../common/company-response';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { rutLookupVariants, validateRut } from '../rut/rut.util';
import { ticketStateCompatibility } from './ticket-ownership';
import { compareTicketsByUrgency } from './ticket-priority';
import { isGeneralTicketCategory, readTicketCategoryCatalog } from './ticket-attention-categories';
import { COMPLETED_TICKET_WORK_ORDER_STATES, isCompletedTicketWorkOrder } from './ticket-work-order-state';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateTicketWorkOrderDto } from './dto/create-ticket-work-order.dto';
import { RegisterDiagnosisDto } from './dto/register-diagnosis.dto';
import { TechnicalNoteDto } from './dto/technical-note.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

const TICKET_STATUSES = ['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'];
/** Official attention category (Documento 0, table 11.9). The ID is resolved in each connection's catalogue. */
export const WITHDRAWAL_TICKET_CATEGORY = 'Baja de servicio';
type AuditEntry = Parameters<AuditService['record']>[0];

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async categories() {
    // Catálogo completo para históricos; la proyección solo limita las altas CRM.
    return readTicketCategoryCatalog(this.prisma);
  }

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const fetched = await this.prisma.ticket.findMany({
      where: this.companyScope(currentUser, scope),
      orderBy: [{ prioridad: 'asc' }, { fechaCreacion: 'desc' }],
      take: 150,
    });
    // El texto de la prioridad no ordena por urgencia (Baja < Media) ni entre vocabularios.
    const tickets = [...fetched].sort(compareTicketsByUrgency);

    const customerIds = [...new Set(tickets.map((ticket) => ticket.idCliente).filter((id): id is number => Boolean(id)))];
    const categoryIds = [...new Set(tickets.map((ticket) => ticket.idCategoria))];
    const ticketIds = tickets.map((ticket) => ticket.idTicket);
    const [customers, categories, workOrders] = await Promise.all([
      customerIds.length ? this.prisma.cliente.findMany({ where: { idCliente: { in: customerIds } } }) : [],
      categoryIds.length ? this.prisma.categoriaFalla.findMany({ where: { idCategoria: { in: categoryIds } } }) : [],
      ticketIds.length
        ? this.prisma.ordenTrabajo.findMany({
            where: { idTicket: { in: ticketIds }, ...this.companyScope(currentUser, scope) },
            orderBy: { fechaCreacion: 'desc' },
            select: {
              idOt: true,
              idEmpresa: true,
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

    return companyResponse(tickets.map((ticket) => {
      const ticketWorkOrders = workOrdersByTicket.get(ticket.idTicket) ?? [];

      return {
        ...ticket,
        ...ticketStateCompatibility(ticket.estado),
        cliente: ticket.idCliente ? customerById.get(ticket.idCliente) ?? null : null,
        categoria: categoryById.get(ticket.idCategoria) ?? null,
        workOrders: ticketWorkOrders,
        hasOpenWorkOrder: ticketWorkOrders.some((order) => !isCompletedTicketWorkOrder(order.estado)),
        observacionesTecnicas: this.extractTechnicalNotes(ticket.descripcion),
      };
    }), currentUser);
  }

  async create(dto: CreateTicketDto, currentUser: AuthUser) {
    const rut = validateRut(dto.rut);

    if (!rut.valid || !rut.normalized) {
      throw new BadRequestException(rut.reason ?? 'RUT invalido');
    }

    const candidates = await this.prisma.cliente.findMany({
      where: {
        rut: { in: rutLookupVariants(dto.rut), mode: 'insensitive' },
        ...(!isAdministrator(currentUser.roles) ? { OR: [
          { idEmpresa: this.companyScope(currentUser, 'consolidado').idEmpresa },
          { contratos: { some: { idEmpresa: currentUser.idEmpresa! } } },
          { servicios: { some: { idEmpresa: currentUser.idEmpresa! } } },
        ] } : {}),
      },
      include: { contratos: { select: { idEmpresa: true } }, servicios: { select: { idEmpresa: true } } },
      take: 2,
    });

    if (candidates.length > 1) {
      throw new ConflictException('La identidad requiere revision comercial; no se asociaron ni fusionaron clientes');
    }
    const cliente = candidates[0];

    if (!cliente) {
      throw new BadRequestException('El RUT no corresponde a un cliente existente');
    }

    if (!isAdministrator(currentUser.roles) && (!currentUser.idEmpresa ||
      (cliente.idEmpresa !== currentUser.idEmpresa &&
        !cliente.contratos.some(c => c.idEmpresa === currentUser.idEmpresa) &&
        !cliente.servicios.some(s => s.idEmpresa === currentUser.idEmpresa)))) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return this.createForCustomer(cliente.idCliente, dto, {
      idUsuario: currentUser.idUsuario,
      idUsuarioAsignado: currentUser.idUsuario,
      idEmpresa: isAdministrator(currentUser.roles) ? undefined : currentUser.idEmpresa!,
      accion: 'CREAR_TICKET',
      origen: dto.origen ?? 'CRM',
    });
  }

  /**
   * CRM ticket "Baja de servicio" of a withdrawal request (ported from PR #81). Created INSIDE the caller's
   * transaction: request, link and audit commit or roll back together. The caller already validated, under the
   * service lock, that company, customer, contract, service and notice match. The category is resolved by its
   * official name in THIS connection's catalogue: never a fixed ID, never a technical/internal category and never
   * an arbitrary choice among duplicates. It does not derive to G3, create an OT or change the service state.
   */
  async createWithdrawalTicket(tx: Prisma.TransactionClient, input: {
    idEmpresa: number; idCliente: number; idServicio: number; idContrato: number;
    idSolicitudRetiro: number; idAviso: number; descripcion: string; idUsuario: number;
  }) {
    const official = (await readTicketCategoryCatalog(tx)).filter(category => category.nombreAtencion === WITHDRAWAL_TICKET_CATEGORY);
    if (official.length !== 1) {
      throw new ConflictException({
        code: 'WITHDRAWAL_TICKET_CATEGORY_UNAVAILABLE',
        message: 'La categoría oficial «Baja de servicio» no está disponible de forma inequívoca en el catálogo de atención; no se creó el ticket.',
      });
    }
    const category = official[0];
    const ticket = await tx.ticket.create({
      data: {
        idCliente: input.idCliente, idEmpresa: input.idEmpresa, idServicio: input.idServicio, idUsuarioAsignado: input.idUsuario,
        idCategoria: category.idCategoria, codigoSeguimiento: this.trackingCode(), prioridad: 'Media', estado: 'Abierto',
        descripcion: input.descripcion, fechaCreacion: new Date(), origen: 'CRM',
      },
    });
    await this.auditService.record({
      idUsuario: input.idUsuario, accion: 'CREAR_TICKET_BAJA_SERVICIO', entidadAfectada: 'ticket', idEntidadAfectada: ticket.idTicket,
      valorNuevo: {
        idEmpresa: input.idEmpresa, idCliente: input.idCliente, idServicio: input.idServicio, idContrato: input.idContrato,
        idSolicitudRetiro: input.idSolicitudRetiro, idAviso: input.idAviso, categoria: category.nombre, idCategoria: category.idCategoria, origen: 'CRM',
      },
    }, tx);
    return ticket;
  }

  /**
   * Closes the «Baja de servicio» ticket of a withdrawal ONLY from inside the caller's successful finalization
   * transaction (FINET criterion 13-11-2026): if anything later in that transaction fails, the ticket stays as it was.
   * Same rules as a manual close: forward-only transition to the official 'Cerrado', never a technical/unknown state,
   * never with a pending local OT, optimistic write on the state read. Idempotent: an already closed ticket is left
   * untouched. Any inconsistency (company, customer, service, category) aborts, so the whole finalization rolls back.
   */
  async closeWithdrawalTicket(tx: Prisma.TransactionClient, input: {
    idTicket: number; idEmpresa: number; idCliente: number; idServicio: number; idSolicitudRetiro: number; idOtG3: number | null; idUsuario: number | null;
  }): Promise<{ action: 'CERRADO' | 'YA_CERRADO'; estadoAnterior: string }> {
    await tx.$queryRaw`SELECT id_ticket FROM ticket WHERE id_ticket = ${input.idTicket} FOR UPDATE`;
    const ticket = await tx.ticket.findUnique({ where: { idTicket: input.idTicket } });
    const inconsistent = (message: string) => new ConflictException({ code: 'WITHDRAWAL_TICKET_INCONSISTENT', message });
    if (!ticket) throw inconsistent('El ticket «Baja de servicio» vinculado no existe; no se aplicó la baja.');
    if (ticket.idEmpresa !== input.idEmpresa || ticket.idCliente !== input.idCliente || (ticket.idServicio !== null && ticket.idServicio !== input.idServicio)) {
      throw inconsistent('El ticket vinculado no corresponde a la empresa, cliente o servicio de la solicitud; no se aplicó la baja.');
    }
    const official = (await readTicketCategoryCatalog(tx)).filter(category => category.nombreAtencion === WITHDRAWAL_TICKET_CATEGORY);
    if (official.length !== 1 || ticket.idCategoria !== official[0].idCategoria) {
      throw inconsistent('El ticket vinculado no tiene la categoría oficial «Baja de servicio»; no se aplicó la baja.');
    }
    if (ticket.estado === 'Cerrado') return { action: 'YA_CERRADO', estadoAnterior: ticket.estado };
    this.assertCrmWrite(ticket.estado);
    if (TICKET_STATUSES.indexOf(ticket.estado) < 0) throw inconsistent('El ticket vinculado tiene un estado no reconocido; no se aplicó la baja.');
    const pendingOrder = await tx.ordenTrabajo.findFirst({ where: { idTicket: ticket.idTicket, estado: { notIn: [...COMPLETED_TICKET_WORK_ORDER_STATES] } } });
    if (pendingOrder) throw inconsistent('El ticket vinculado tiene una OT local sin completar; no se aplicó la baja.');
    const note = `Cerrado automáticamente al aplicar la baja por morosidad (solicitud ${input.idSolicitudRetiro}${input.idOtG3 ? `, OT de retiro ${input.idOtG3}` : ''}).`;
    await this.updateCrmTicket(ticket, { estado: 'Cerrado', fechaCierre: new Date(), descripcion: `${ticket.descripcion ?? ''}\n${note}`.trim() }, tx);
    await this.auditService.record({
      idUsuario: input.idUsuario, accion: 'CERRAR_TICKET_BAJA_SERVICIO', entidadAfectada: 'ticket', idEntidadAfectada: ticket.idTicket,
      valorAnterior: { estado: ticket.estado },
      valorNuevo: { estado: 'Cerrado', automatico: true, idSolicitudRetiro: input.idSolicitudRetiro, idOtG3: input.idOtG3 },
    }, tx);
    return { action: 'CERRADO', estadoAnterior: ticket.estado };
  }

  async createWorkOrder(idTicket: number, dto: CreateTicketWorkOrderDto, currentUser: AuthUser): Promise<never> {
    await this.getTicketOrThrow(idTicket, currentUser);
    void dto;
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'INTENTO_WRITE_DOMINIO_G3_DEPRECADO',
      entidadAfectada: 'ticket',
      idEntidadAfectada: idTicket,
      valorNuevo: { endpoint: 'POST /api/tickets/:id/work-order', owner: 'G3' },
    });
    throw new GoneException({
      code: 'G3_INTEGRATION_REQUIRED',
      message: 'G3 administra las ordenes tecnicas. La derivacion de reparaciones y soporte esta pendiente de un contrato de integracion ratificado; no se creo ninguna OT.',
    });
  }

  async updateCategory(idTicket: number, dto: UpdateTicketCategoryDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    this.assertCrmWrite(ticket.estado);
    const category = (await this.categories()).find(row => row.idCategoria === dto.idCategoria);

    if (!category) {
      throw new BadRequestException('Categoria seleccionada invalida');
    }

    if (!isGeneralTicketCategory(category)) {
      throw new BadRequestException('La categoría no está disponible para clasificación manual de tickets');
    }

    return this.writeAudited(
      tx => this.updateCrmTicket(ticket, { idCategoria: dto.idCategoria }, tx),
      () => ({
        idUsuario: currentUser.idUsuario,
        accion: 'CLASIFICAR_TICKET',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorAnterior: { idCategoria: ticket.idCategoria },
        valorNuevo: { idCategoria: dto.idCategoria, categoria: category.nombre },
      }),
    );
  }

  async updatePriority(idTicket: number, dto: UpdateTicketPriorityDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    this.assertCrmWrite(ticket.estado);
    return this.writeAudited(
      tx => this.updateCrmTicket(ticket, { prioridad: dto.prioridad }, tx),
      () => ({
        idUsuario: currentUser.idUsuario,
        accion: 'ASIGNAR_PRIORIDAD_TICKET',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorAnterior: { prioridad: ticket.prioridad },
        valorNuevo: { prioridad: dto.prioridad },
      }),
    );
  }

  async updateStatus(idTicket: number, dto: UpdateTicketStatusDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    this.assertCrmWrite(ticket.estado);
    const currentIndex = TICKET_STATUSES.indexOf(ticket.estado);
    const nextIndex = TICKET_STATUSES.indexOf(dto.estado);

    if (nextIndex < 0 || nextIndex < currentIndex) {
      throw new BadRequestException('Transicion de estado invalida');
    }

    if (['Resuelto', 'Cerrado'].includes(dto.estado)) {
      await this.assertNoPendingWorkOrderForClosure(idTicket);
    }

    return this.writeAudited(
      tx => this.updateCrmTicket(ticket, {
        estado: dto.estado,
        fechaCierre: dto.estado === 'Cerrado' ? new Date() : ticket.fechaCierre,
        descripcion: dto.comentario ? `${ticket.descripcion ?? ''}\nComentario: ${dto.comentario}` : ticket.descripcion,
      }, tx),
      () => ({
        idUsuario: currentUser.idUsuario,
        accion: 'ACTUALIZAR_ESTADO_TICKET',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorAnterior: { estado: ticket.estado },
        valorNuevo: { estado: dto.estado, comentario: dto.comentario },
      }),
    );
  }

  async registerDiagnosis(idTicket: number, dto: RegisterDiagnosisDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    this.assertCrmWrite(ticket.estado);
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
      const updatedTicket = await this.updateCrmTicket(ticket, {
        estado: 'Resuelto',
        descripcion: `${ticket.descripcion ?? ''}\n\nDiagnostico tecnico:\n${diagnosis}`,
        fechaCierre: new Date(),
      }, tx);

      // The diagnosis is ticket evidence, never authority over financial state or an OT.
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'REGISTRAR_DIAGNOSTICO_VISITA',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorAnterior: { estado: ticket.estado },
        valorNuevo: {
          estado: updatedTicket.estado,
          causaRaiz: dto.causaRaiz,
          estadoFinalServicio: dto.estadoFinalServicio,
          idCliente: ticket.idCliente,
        },
      }, tx);

      return updatedTicket;
    });

    return result;
  }

  async technicalNotes(idTicket: number, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    return this.extractTechnicalNotes(ticket.descripcion);
  }

  async addTechnicalNote(idTicket: number, dto: TechnicalNoteDto, currentUser: AuthUser) {
    const ticket = await this.getTicketOrThrow(idTicket, currentUser);
    this.assertCrmWrite(ticket.estado);
    const block = this.technicalNoteBlock(dto.observacion, currentUser.nombreCompleto);
    const updated = await this.writeAudited(
      tx => this.updateCrmTicket(ticket, {
        descripcion: `${ticket.descripcion ?? ''}\n\n${block}`.trim(),
      }, tx),
      () => ({
        idUsuario: currentUser.idUsuario,
        accion: 'REGISTRAR_OBSERVACION_TECNICA_TICKET',
        entidadAfectada: 'ticket',
        idEntidadAfectada: idTicket,
        valorNuevo: {
          estado: ticket.estado,
          observacion: dto.observacion,
        },
      }),
    );

    return {
      ...updated,
      observacionesTecnicas: this.extractTechnicalNotes(updated.descripcion),
    };
  }

  private async createForCustomer(
    idCliente: number,
    dto: Pick<CreateTicketDto, 'idCategoria' | 'idServicio' | 'prioridad' | 'descripcion'>,
    options: { idEmpresa?: number; idUsuario: number | null; idUsuarioAsignado: number | null; accion: string; origen: string },
  ) {
    const cliente = await this.prisma.cliente.findUnique({ where: { idCliente } });

    if (!cliente) {
      throw new BadRequestException('El cliente indicado no existe');
    }

    const categoria = (await this.categories()).find(category => category.idCategoria === dto.idCategoria);

    if (!categoria) {
      throw new BadRequestException('Categoria seleccionada invalida');
    }

    if (!categoria.nombreAtencion) {
      throw new BadRequestException('Selecciona una categoría oficial de atención disponible; las categorías técnicas o ambiguas no admiten nuevas altas comerciales');
    }

    const servicio = dto.idServicio
      ? await this.prisma.servicioContratado.findUnique({
          where: { idServicio: dto.idServicio },
          include: { contrato: true },
        })
      : null;

    if (dto.idServicio && !servicio) {
      throw new BadRequestException('El servicio contratado indicado no existe');
    }

    if (servicio && servicio.idCliente !== cliente.idCliente) {
      throw new BadRequestException('El servicio contratado no corresponde al cliente seleccionado');
    }

    if (options.idEmpresa !== undefined && servicio && servicio.idEmpresa !== options.idEmpresa) {
      throw new BadRequestException('El servicio contratado no pertenece a tu empresa');
    }

    const idEmpresa = options.idEmpresa ?? servicio?.idEmpresa ?? cliente.idEmpresa;
    if (!idEmpresa) {
      throw new BadRequestException('El ticket requiere una empresa asociada');
    }

    // Validate attribution, not financial eligibility: a suspended or delinquent
    // customer must still be able to request support for their own contract.
    const contrato = servicio
      ? servicio.contrato
      : await this.prisma.contrato.findFirst({ where: { idCliente, idEmpresa } });
    if (!contrato || contrato.idCliente !== idCliente || contrato.idEmpresa !== idEmpresa ||
      (servicio && contrato.idContrato !== servicio.idContrato)) {
      throw new BadRequestException('El ticket requiere un contrato vinculado al cliente y empresa seleccionados');
    }

    return this.writeAudited(
      tx => tx.ticket.create({
        data: {
          idCliente: cliente.idCliente,
          idEmpresa,
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
      }),
      ticket => ({
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
      }),
    );
  }

  // La escritura y su auditoría se confirman juntas: si la auditoría no puede
  // persistirse se revierte el cambio, en vez de dejar un ticket sin registro
  // y con respuesta de éxito (la auditoría fuera de transacción falla en silencio).
  private writeAudited<T>(write: (tx: Prisma.TransactionClient) => Promise<T>, audit: (result: T) => AuditEntry) {
    return this.prisma.$transaction(async (tx) => {
      const result = await write(tx);
      await this.auditService.record(audit(result), tx);
      return result;
    });
  }

  private async getTicketOrThrow(idTicket: number, currentUser: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { idTicket } });

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    if (!isAdministrator(currentUser.roles) && (!currentUser.idEmpresa || ticket.idEmpresa !== currentUser.idEmpresa)) {
      throw new BadRequestException('El ticket no pertenece a tu empresa');
    }

    return ticket;
  }

  private async assertNoPendingWorkOrderForClosure(idTicket: number) {
    const pendingOrder = await this.prisma.ordenTrabajo.findFirst({
      where: {
        idTicket,
        estado: { notIn: [...COMPLETED_TICKET_WORK_ORDER_STATES] },
      },
    });

    if (pendingOrder) {
      throw new BadRequestException(
        'La OT asociada no consta completada. G3 administra su cierre tecnico; la recepcion de cierres de reparacion esta pendiente de ratificacion. Puedes registrar observaciones sin cerrar el ticket',
      );
    }
  }

  private assertCrmWrite(estado: string) {
    if (ticketStateCompatibility(estado).soloLecturaTecnica) {
      throw new ConflictException({
        code: 'G3_TICKET_READ_ONLY',
        message: 'Ticket tecnico o de estado no reconocido: solo consulta en G8. La sincronizacion de cambios requiere un contrato ratificado con G3.',
      });
    }
  }

  private async updateCrmTicket(ticket: Ticket, data: Prisma.TicketUpdateInput, tx: Prisma.TransactionClient = this.prisma) {
    try {
      // Do not overwrite a state/company changed by FSM after authorization.
      return await tx.ticket.update({
        where: { idTicket: ticket.idTicket, idEmpresa: ticket.idEmpresa, estado: ticket.estado }, data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('El ticket cambio durante la operacion; vuelve a consultarlo antes de modificarlo');
      }
      throw error;
    }
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
