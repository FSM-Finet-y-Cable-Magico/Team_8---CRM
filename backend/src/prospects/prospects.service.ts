import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { addYearsToDateOnly, parseDateOnly, todayDateOnly } from '../common/date-rules';
import {
  buildInstallOrderObservations,
  parseInstallOrderObservations,
} from '../common/install-order-metadata';
import { isAdministrator } from '../common/roles';
import { MailDeliveryResult, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { ContractPlanDto } from './dto/contract-plan.dto';
import { CreateInstallOrderDto } from './dto/create-install-order.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { GenerateQuoteDto } from './dto/generate-quote.dto';
import { InstallAvailabilityDto } from './dto/install-availability.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { VerifyFeasibilityDto } from './dto/verify-feasibility.dto';

const INITIAL_PIPELINE_STATUS = 'Prospecto Nuevo';
const LOST_PIPELINE_STATUS = 'Perdido';
const CLOSED_INSTALL_ORDER_STATES = ['Completada', 'Cancelada'];
const ALTERNATIVE_VISIT_TIMES = ['09:00', '11:00', '14:00', '16:00', '18:00'];
const PIPELINE_STATUSES = [
  INITIAL_PIPELINE_STATUS,
  'Contactado',
  'En Factibilidad',
  'Cotizacion Enviada',
  'Aceptado',
  'Instalacion Programada',
  'Servicio Activo',
];

@Injectable()
export class ProspectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const where = this.companyScope(currentUser, scope);

    return this.prisma.prospecto.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        usuarioComercial: {
          select: {
            nombreCompleto: true,
            email: true,
          },
        },
      },
    });
  }

  async create(dto: CreateProspectDto, currentUser: AuthUser) {
    const rutResult = validateRut(dto.rut);

    if (!rutResult.valid || !rutResult.normalized) {
      throw new BadRequestException(rutResult.reason ?? 'RUT invalido');
    }

    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const duplicateProspect = await this.prisma.prospecto.findFirst({
      where: { rut: rutResult.normalized, idEmpresa },
    });
    const duplicateClient = await this.prisma.cliente.findUnique({
      where: { rut: rutResult.normalized },
      include: {
        contratos: {
          select: { idEmpresa: true },
        },
      },
    });
    const clientAlreadyInCompany =
      duplicateClient?.idEmpresa === idEmpresa ||
      duplicateClient?.contratos.some((contract) => contract.idEmpresa === idEmpresa);

    if (duplicateProspect || clientAlreadyInCompany) {
      throw new BadRequestException('Ya existe un cliente o prospecto con ese RUT en la empresa seleccionada');
    }

    const prospect = await this.prisma.prospecto.create({
      data: {
        idEmpresa,
        idUsuarioComercial: currentUser.idUsuario,
        rut: rutResult.normalized,
        nombreCompleto: dto.nombreCompleto.trim(),
        email: dto.email?.trim().toLowerCase(),
        telefono: dto.telefono.trim(),
        direccion: dto.direccion.trim(),
        origenContacto: dto.origenContacto?.trim() || 'Contacto directo',
        estadoPipeline: INITIAL_PIPELINE_STATUS,
        fechaCreacion: new Date(),
      },
      include: {
        empresa: true,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: prospect.idProspecto,
      valorNuevo: {
        rut: prospect.rut,
        estadoPipeline: prospect.estadoPipeline,
        idEmpresa: prospect.idEmpresa,
        origenContacto: prospect.origenContacto,
      },
    });

    return prospect;
  }

  async updatePipeline(idProspecto: number, dto: UpdatePipelineDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const nextStatus = dto.estadoPipeline.trim();
    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;

    this.validatePipelineTransition(currentStatus, nextStatus);

    const isReactivation = currentStatus === LOST_PIPELINE_STATUS;
    const conversionData = this.conversionData(nextStatus, prospect.fechaCreacion);
    const updated = await this.prisma.prospecto.update({
      where: { idProspecto },
      data: {
        estadoPipeline: nextStatus,
        motivoPerdida: isReactivation ? null : prospect.motivoPerdida,
        ...conversionData,
      },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: isReactivation ? 'REACTIVAR_PROSPECTO' : 'ACTUALIZAR_PIPELINE_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: currentStatus, motivoPerdida: prospect.motivoPerdida },
      valorNuevo: { estadoPipeline: nextStatus, motivoPerdida: isReactivation ? null : prospect.motivoPerdida, ...conversionData },
    });

    return updated;
  }

  async verifyFeasibility(idProspecto: number, dto: VerifyFeasibilityDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);

    if (!prospect.direccion?.trim()) {
      throw new BadRequestException('La direccion del prospecto debe estar completa');
    }

    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;
    const nextStatus =
      dto.resultado === 'Factible' && this.statusIndex(currentStatus) < this.statusIndex('En Factibilidad')
        ? 'En Factibilidad'
        : dto.resultado === 'No Factible'
          ? LOST_PIPELINE_STATUS
          : currentStatus;
    const lossReason = dto.resultado === 'No Factible' ? 'Sin cobertura' : prospect.motivoPerdida;

    const updated = await this.prisma.prospecto.update({
      where: { idProspecto },
      data: {
        estadoPipeline: nextStatus,
        motivoPerdida: lossReason,
      },
      include: { empresa: true },
    });

    if (dto.resultado === 'Factible') {
      await this.prisma.cotizacion.create({
        data: {
          idProspecto,
          factibilidadVerificada: true,
        },
      });
    }

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'VERIFICAR_FACTIBILIDAD',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: currentStatus },
      valorNuevo: {
        resultado: dto.resultado,
        observaciones: dto.observaciones,
        estadoPipeline: nextStatus,
      },
    });

    return updated;
  }

  async generateQuote(idProspecto: number, dto: GenerateQuoteDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);

    if (!prospect.email?.trim()) {
      throw new BadRequestException('El prospecto debe tener correo electronico');
    }

    const hasFeasibility = await this.prisma.cotizacion.findFirst({
      where: {
        idProspecto,
        factibilidadVerificada: true,
      },
    });

    if (!hasFeasibility && this.statusIndex(prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS) < this.statusIndex('En Factibilidad')) {
      throw new BadRequestException('La factibilidad debe estar marcada como Factible');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { idPlan: dto.planId },
    });

    if (!plan || plan.activo === false) {
      throw new BadRequestException('Plan inexistente o inactivo');
    }

    if (plan.idEmpresa && prospect.idEmpresa && plan.idEmpresa !== prospect.idEmpresa) {
      throw new BadRequestException('El plan no pertenece a la empresa del prospecto');
    }

    const quote = await this.prisma.cotizacion.create({
      data: {
        idProspecto,
        idPlan: dto.planId,
        fechaEnvio: new Date(),
        factibilidadVerificada: true,
      },
      include: { plan: true, prospecto: { include: { empresa: true } } },
    });
    const pdfUrl = `/prospects/${idProspecto}/quotes/${quote.idCotizacion}/pdf`;

    const updatedQuote = await this.prisma.cotizacion.update({
      where: { idCotizacion: quote.idCotizacion },
      data: { pdfUrl },
      include: { plan: true, prospecto: { include: { empresa: true } } },
    });

    const pdf = await this.renderQuotePdfBuffer(updatedQuote);
    let emailDelivery: MailDeliveryResult | { status: 'failed' };

    try {
      emailDelivery = await this.mailService.sendQuote({
        to: prospect.email,
        prospectName: prospect.nombreCompleto ?? 'Cliente',
        companyName: updatedQuote.prospecto?.empresa?.nombre ?? 'FiNet',
        pdf,
        filename: `cotizacion-${quote.idCotizacion}.pdf`,
      });
    } catch {
      emailDelivery = { status: 'failed' };
    }

    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;

    if (this.statusIndex(currentStatus) < this.statusIndex('Cotizacion Enviada')) {
      await this.prisma.prospecto.update({
        where: { idProspecto },
        data: { estadoPipeline: 'Cotizacion Enviada' },
      });
    }

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_COTIZACION',
      entidadAfectada: 'cotizacion',
      idEntidadAfectada: quote.idCotizacion,
      valorNuevo: {
        idProspecto,
        idPlan: dto.planId,
        pdfUrl,
        emailDestino: prospect.email,
        envioEmail: emailDelivery.status,
      },
    });

    return {
      ...updatedQuote,
      envioEmail: emailDelivery.status,
    };
  }

  async recordLoss(idProspecto: number, dto: RecordLossDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);

    const updated = await this.prisma.prospecto.update({
      where: { idProspecto },
      data: {
        estadoPipeline: LOST_PIPELINE_STATUS,
        motivoPerdida: dto.motivo,
      },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_PERDIDA_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: prospect.estadoPipeline, motivoPerdida: prospect.motivoPerdida },
      valorNuevo: { estadoPipeline: LOST_PIPELINE_STATUS, motivo: dto.motivo, observaciones: dto.observaciones },
    });

    return updated;
  }

  async contractPlan(idProspecto: number, dto: ContractPlanDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const plan = await this.prisma.plan.findUnique({ where: { idPlan: dto.planId } });

    if (!plan || plan.activo === false) {
      throw new BadRequestException('Plan inexistente o inactivo');
    }

    if (!prospect.rut || !prospect.nombreCompleto || !prospect.telefono) {
      throw new BadRequestException('El prospecto no tiene datos suficientes para crear cliente');
    }

    if (plan.idEmpresa && prospect.idEmpresa && plan.idEmpresa !== prospect.idEmpresa) {
      throw new BadRequestException('El plan no pertenece a la empresa del prospecto');
    }

    const fechaInicio = dto.fechaInicio ? new Date(dto.fechaInicio) : new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      let cliente = prospect.idCliente
        ? await tx.cliente.findUnique({ where: { idCliente: prospect.idCliente } })
        : await tx.cliente.findUnique({ where: { rut: prospect.rut ?? undefined } });

      if (!cliente) {
        cliente = await tx.cliente.create({
          data: {
            idEmpresa: prospect.idEmpresa,
            rut: prospect.rut,
            nombreCompleto: prospect.nombreCompleto ?? '',
            email: prospect.email,
            telefono: prospect.telefono,
            estado: 'Pendiente',
            origenContacto: prospect.origenContacto,
            importadoMasivo: false,
          },
        });
      }

      let direccion = await tx.direccionServicio.findFirst({
        where: {
          idCliente: cliente.idCliente,
          direccionCompleta: prospect.direccion ?? '',
        },
      });

      if (!direccion && prospect.direccion?.trim()) {
        direccion = await tx.direccionServicio.create({
          data: {
            idCliente: cliente.idCliente,
            direccionCompleta: prospect.direccion,
            comuna: 'Por confirmar',
            ciudad: 'Por confirmar',
            esPrincipal: true,
          },
        });
      }

      const existingContract = await tx.contrato.findFirst({
        where: {
          idCliente: cliente.idCliente,
          idPlan: dto.planId,
          idEmpresa: prospect.idEmpresa,
          estado: { in: ['Pendiente', 'Activo'] },
        },
        orderBy: { idContrato: 'desc' },
      });

      const contrato = existingContract ?? await tx.contrato.create({
        data: {
          idCliente: cliente.idCliente,
          idPlan: dto.planId,
          idEmpresa: prospect.idEmpresa,
          fechaInicio,
          diaVencimiento: dto.diaVencimiento,
          estado: 'Pendiente',
        },
      });

      const existingService = await tx.servicioContratado.findFirst({
        where: {
          idCliente: cliente.idCliente,
          idContrato: contrato.idContrato,
          idEmpresa: prospect.idEmpresa,
        },
      });

      const servicio = existingService ?? await tx.servicioContratado.create({
        data: {
          idCliente: cliente.idCliente,
          idEmpresa: prospect.idEmpresa,
          idContrato: contrato.idContrato,
          idDireccion: direccion?.idDireccion,
          tipoServicio: this.serviceTypeFromPlan(plan.tipoPlan),
          estadoOperativo: 'Pendiente Instalacion',
          observaciones: `Servicio creado desde prospecto ${idProspecto}`,
          datosTecnicos: {
            plan: plan.nombreComercial,
            velocidadMbps: plan.velocidadMbps,
          },
        },
      });

      const updatedProspect = await tx.prospecto.update({
        where: { idProspecto },
        data: {
          idCliente: cliente.idCliente,
          estadoPipeline: 'Aceptado',
        },
        include: { empresa: true },
      });

      return { cliente, contrato, prospecto: updatedProspect, servicio };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_PLAN_CONTRATADO',
      entidadAfectada: 'contrato',
      idEntidadAfectada: result.contrato.idContrato,
      valorNuevo: {
        idProspecto,
        idCliente: result.cliente.idCliente,
        idPlan: dto.planId,
        idServicio: result.servicio.idServicio,
        diaVencimiento: dto.diaVencimiento,
      },
    });

    return result;
  }

  async installAvailability(idProspecto: number, dto: InstallAvailabilityDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    await this.validateInstallOrderPreconditions(prospect);
    this.validateInstallSchedule(dto.fechaProgramada, dto.horaVisita);

    return this.buildInstallAvailability(
      prospect.idEmpresa,
      dto.fechaProgramada,
      dto.horaVisita,
    );
  }

  async createInstallOrder(idProspecto: number, dto: CreateInstallOrderDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const scheduledDate = this.validateInstallSchedule(dto.fechaProgramada, dto.horaVisita);

    await this.validateInstallOrderPreconditions(prospect);

    const idCliente = prospect.idCliente;
    const idEmpresa = prospect.idEmpresa;

    if (!idCliente || !idEmpresa) {
      throw new BadRequestException('La orden requiere cliente y empresa asociados');
    }

    if (!prospect.direccion?.trim()) {
      throw new BadRequestException('El prospecto no tiene direccion para instalar');
    }

    const availability = await this.buildInstallAvailability(
      prospect.idEmpresa,
      dto.fechaProgramada,
      dto.horaVisita,
    );
    const technician = availability.tecnicosDisponibles.find(
      (item) => item.idTecnico === dto.idTecnico,
    );

    if (!technician) {
      throw new BadRequestException(
        'El tecnico seleccionado ya no esta disponible. Consulta nuevamente los horarios disponibles',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let direccion = await tx.direccionServicio.findFirst({
        where: {
          idCliente,
          esPrincipal: true,
        },
      });

      if (!direccion) {
        direccion = await tx.direccionServicio.create({
          data: {
            idCliente,
            direccionCompleta: prospect.direccion ?? '',
            comuna: 'Por confirmar',
            ciudad: 'Por confirmar',
            esPrincipal: true,
          },
        });
      }

      const servicio = await tx.servicioContratado.findFirst({
        where: {
          idCliente,
          idEmpresa,
          estadoOperativo: { not: 'Baja' },
        },
        orderBy: { fechaCreacion: 'desc' },
      });

      if (servicio && !servicio.idDireccion) {
        await tx.servicioContratado.update({
          where: { idServicio: servicio.idServicio },
          data: { idDireccion: direccion.idDireccion },
        });
      }

      const orden = await tx.ordenTrabajo.create({
        data: {
          idEmpresa,
          idCliente,
          idTecnico: dto.idTecnico,
          idDireccion: direccion.idDireccion,
          idServicio: servicio?.idServicio,
          tipoOt: 'Instalacion',
          prioridad: dto.prioridad ?? 'Media',
          estado: 'Pendiente',
          fechaCreacion: new Date(),
          fechaProgramada: scheduledDate,
          observaciones: buildInstallOrderObservations({
            tipoConexion: dto.tipoConexion,
            horaVisita: dto.horaVisita,
            observacionesAgenda: dto.observaciones,
          }),
          resueltoRemotamente: false,
        },
      });

      const updatedProspect = await tx.prospecto.update({
        where: { idProspecto },
        data: { estadoPipeline: 'Instalacion Programada' },
        include: { empresa: true },
      });

      return {
        direccion,
        orden: {
          ...orden,
          tipoConexion: dto.tipoConexion,
          horaVisita: dto.horaVisita,
          observacionesAgenda: dto.observaciones?.trim() || null,
          tecnico: technician,
        },
        prospecto: updatedProspect,
        servicio,
      };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_ORDEN_INSTALACION',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: result.orden.idOt,
      valorNuevo: {
        idProspecto,
        idCliente,
        fechaProgramada: dto.fechaProgramada,
        horaVisita: dto.horaVisita,
        tipoConexion: dto.tipoConexion,
        idTecnico: dto.idTecnico,
        tecnico: technician.nombreCompleto,
        prioridad: dto.prioridad ?? 'Media',
        idServicio: result.servicio?.idServicio,
      },
    });

    return result;
  }

  private async validateInstallOrderPreconditions(prospect: {
    idProspecto: number;
    idEmpresa: number | null;
    idCliente: number | null;
    estadoPipeline: string | null;
  }) {
    if (!prospect.idEmpresa) {
      throw new BadRequestException('El prospecto no tiene empresa asociada');
    }

    if (!prospect.idCliente || prospect.estadoPipeline !== 'Aceptado') {
      throw new BadRequestException(
        'La orden requiere un prospecto con cotizacion aceptada y plan contratado',
      );
    }

    const [feasibility, contract, existingOrder] = await Promise.all([
      this.prisma.cotizacion.findFirst({
        where: {
          idProspecto: prospect.idProspecto,
          factibilidadVerificada: true,
        },
      }),
      this.prisma.contrato.findFirst({
        where: {
          idCliente: prospect.idCliente,
          idEmpresa: prospect.idEmpresa,
          estado: { in: ['Pendiente', 'Activo'] },
        },
      }),
      this.prisma.ordenTrabajo.findFirst({
        where: {
          idCliente: prospect.idCliente,
          idEmpresa: prospect.idEmpresa,
          tipoOt: 'Instalacion',
          estado: { notIn: CLOSED_INSTALL_ORDER_STATES },
        },
      }),
    ]);

    if (!feasibility) {
      throw new BadRequestException('La factibilidad tecnica debe estar confirmada como Factible');
    }

    if (!contract) {
      throw new BadRequestException('No existe un plan contratado vigente para generar la instalacion');
    }

    if (existingOrder) {
      throw new BadRequestException('El cliente ya tiene una orden de instalacion pendiente');
    }
  }

  private validateInstallSchedule(dateValue: string, timeValue: string) {
    const scheduledDate = parseDateOnly(dateValue);
    const today = todayDateOnly();
    const latestScheduledDate = addYearsToDateOnly(today, 1);

    if (!scheduledDate) {
      throw new BadRequestException('La fecha programada no es una fecha calendario valida');
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
      throw new BadRequestException('La hora de visita no tiene un formato valido');
    }

    if (dateValue < today) {
      throw new BadRequestException('La fecha programada no puede ser anterior a hoy');
    }

    if (dateValue > latestScheduledDate) {
      throw new BadRequestException('La fecha programada no puede superar un ano desde hoy');
    }

    if (dateValue === today && timeValue <= this.currentChileTime()) {
      throw new BadRequestException('La fecha y hora de visita deben ser posteriores a la hora actual');
    }

    return scheduledDate;
  }

  private async buildInstallAvailability(
    idEmpresa: number | null,
    requestedDate: string,
    requestedTime: string,
  ) {
    if (!idEmpresa) {
      throw new BadRequestException('El prospecto no tiene empresa asociada');
    }

    const technicians = await this.prisma.usuario.findMany({
      where: {
        idEmpresa,
        activo: true,
        usuarioRoles: {
          some: {
            rol: {
              nombreRol: { in: ['Terreno', 'TECNICO_TERRENO'] },
            },
          },
        },
      },
      orderBy: { nombreCompleto: 'asc' },
      select: {
        idUsuario: true,
        nombreCompleto: true,
        email: true,
      },
    });
    const technicianIds = technicians.map((technician) => technician.idUsuario);

    if (!technicianIds.length) {
      return {
        fechaProgramada: requestedDate,
        horaVisita: requestedTime,
        tecnicosDisponibles: [],
        alternativas: [],
        mensaje: 'No existen tecnicos en terreno activos para la empresa seleccionada',
      };
    }

    const latestScheduledDate = addYearsToDateOnly(todayDateOnly(), 1);
    const proposedAlternativeDate = this.addDaysToDateOnly(requestedDate, 14);
    const lastAlternativeDate = proposedAlternativeDate > latestScheduledDate
      ? latestScheduledDate
      : proposedAlternativeDate;
    const orders = await this.prisma.ordenTrabajo.findMany({
      where: {
        idEmpresa,
        idTecnico: { in: technicianIds },
        tipoOt: 'Instalacion',
        estado: { notIn: CLOSED_INSTALL_ORDER_STATES },
        fechaProgramada: {
          gte: parseDateOnly(requestedDate) ?? undefined,
          lte: parseDateOnly(lastAlternativeDate) ?? undefined,
        },
      },
      select: {
        idTecnico: true,
        fechaProgramada: true,
        observaciones: true,
      },
    });
    const busySlots = new Set<string>();

    for (const order of orders) {
      if (!order.idTecnico || !order.fechaProgramada) {
        continue;
      }

      const date = order.fechaProgramada.toISOString().slice(0, 10);
      const time = parseInstallOrderObservations(order.observaciones).horaVisita;
      busySlots.add(`${order.idTecnico}|${date}|${time ?? '*'}`);
    }

    const availableAt = (date: string, time: string) => technicians
      .filter(
        (technician) =>
          !busySlots.has(`${technician.idUsuario}|${date}|${time}`) &&
          !busySlots.has(`${technician.idUsuario}|${date}|*`),
      )
      .map((technician) => ({
        idTecnico: technician.idUsuario,
        nombreCompleto: technician.nombreCompleto,
        email: technician.email,
      }));
    const availableTechnicians = availableAt(requestedDate, requestedTime);
    const alternatives: Array<{
      fechaProgramada: string;
      horaVisita: string;
      tecnicosDisponibles: ReturnType<typeof availableAt>;
    }> = [];

    if (!availableTechnicians.length) {
      const visitTimes = [...new Set([requestedTime, ...ALTERNATIVE_VISIT_TIMES])];

      for (let dayOffset = 0; dayOffset <= 14 && alternatives.length < 5; dayOffset += 1) {
        const date = this.addDaysToDateOnly(requestedDate, dayOffset);

        if (date > latestScheduledDate) {
          break;
        }

        for (const time of visitTimes) {
          if (date === requestedDate && time === requestedTime) {
            continue;
          }

          if (date === todayDateOnly() && time <= this.currentChileTime()) {
            continue;
          }

          const available = availableAt(date, time);

          if (available.length) {
            alternatives.push({
              fechaProgramada: date,
              horaVisita: time,
              tecnicosDisponibles: available,
            });
          }

          if (alternatives.length >= 5) {
            break;
          }
        }
      }
    }

    return {
      fechaProgramada: requestedDate,
      horaVisita: requestedTime,
      tecnicosDisponibles: availableTechnicians,
      alternativas: alternatives,
      mensaje: availableTechnicians.length
        ? `${availableTechnicians.length} tecnico(s) disponible(s) para la visita`
        : 'No existen tecnicos disponibles en el horario solicitado. Selecciona una alternativa',
    };
  }

  private addDaysToDateOnly(value: string, days: number) {
    const date = parseDateOnly(value);

    if (!date) {
      throw new BadRequestException('La fecha programada no es valida');
    }

    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private currentChileTime(reference = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(reference);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.hour}:${values.minute}`;
  }

  async buildQuotePdfBuffer(idProspecto: number, idCotizacion: number, currentUser: AuthUser) {
    await this.getProspectOrThrow(idProspecto, currentUser);
    const quote = await this.prisma.cotizacion.findFirst({
      where: {
        idCotizacion,
        idProspecto,
      },
      include: {
        prospecto: { include: { empresa: true } },
        plan: true,
      },
    });

    if (!quote || !quote.prospecto || !quote.plan) {
      throw new NotFoundException('Cotizacion no encontrada');
    }

    return this.renderQuotePdfBuffer(quote);
  }

  private renderQuotePdfBuffer(quote: {
    fechaEnvio: Date | null;
    prospecto: {
      nombreCompleto: string | null;
      rut: string | null;
      email: string | null;
      direccion: string | null;
      empresa?: { nombre: string } | null;
    } | null;
    plan: {
      nombreComercial: string;
      tipoPlan: string;
      tipoCliente: string;
      velocidadMbps: number | null;
      precioMensual: { toString(): string };
    } | null;
  }) {
    if (!quote.prospecto || !quote.plan) {
      throw new NotFoundException('Cotizacion no encontrada');
    }

    const quoteProspect = quote.prospecto;
    const quotePlan = quote.plan;

    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).text('Cotizacion de servicio', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Empresa: ${quoteProspect.empresa?.nombre ?? 'FiNet'}`);
      doc.text(`Prospecto: ${quoteProspect.nombreCompleto ?? '-'}`);
      doc.text(`RUT: ${quoteProspect.rut ?? '-'}`);
      doc.text(`Email: ${quoteProspect.email ?? '-'}`);
      doc.text(`Direccion: ${quoteProspect.direccion ?? '-'}`);
      doc.moveDown();
      doc.fontSize(14).text('Plan ofrecido');
      doc.fontSize(12).text(`Nombre: ${quotePlan.nombreComercial}`);
      doc.text(`Tipo: ${quotePlan.tipoPlan}`);
      doc.text(`Cliente: ${quotePlan.tipoCliente}`);
      doc.text(`Velocidad: ${quotePlan.velocidadMbps ?? '-'} Mbps`);
      doc.text(`Precio mensual: $${quotePlan.precioMensual.toString()}`);
      doc.moveDown();
      doc.text(`Fecha de envio: ${(quote.fechaEnvio ?? new Date()).toLocaleDateString('es-CL')}`);
      doc.text('Documento generado por CRM FiNet.');
      doc.end();
    });
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      const adminCompany = requestedCompanyId ?? currentUser.idEmpresa;

      if (!adminCompany) {
        throw new BadRequestException('Debe indicar empresa');
      }

      return adminCompany;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return currentUser.idEmpresa;
  }

  private async getProspectOrThrow(idProspecto: number, currentUser: AuthUser) {
    const prospect = await this.prisma.prospecto.findUnique({
      where: { idProspecto },
    });

    if (!prospect) {
      throw new NotFoundException('Prospecto no encontrado');
    }

    if (!isAdministrator(currentUser.roles) && prospect.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El prospecto no pertenece a tu empresa');
    }

    return prospect;
  }

  private validatePipelineTransition(currentStatus: string, nextStatus: string) {
    if (!PIPELINE_STATUSES.includes(nextStatus)) {
      throw new BadRequestException('Estado fuera de la secuencia permitida');
    }

    if (currentStatus === LOST_PIPELINE_STATUS) {
      return;
    }

    const currentIndex = this.statusIndex(currentStatus);
    const nextIndex = this.statusIndex(nextStatus);

    if (nextIndex < currentIndex) {
      throw new BadRequestException('La transicion no respeta el orden del pipeline');
    }
  }

  private statusIndex(status: string) {
    const index = PIPELINE_STATUSES.indexOf(status);
    return index === -1 ? 0 : index;
  }

  private serviceTypeFromPlan(planType: string) {
    const normalized = planType.trim().toLowerCase();

    if (normalized.includes('tv') || normalized.includes('television')) {
      return normalized.includes('internet') ? 'Internet + Television' : 'Television';
    }

    return 'Internet';
  }

  private conversionData(nextStatus: string, fechaCreacion: Date | null) {
    if (nextStatus !== 'Servicio Activo' || !fechaCreacion) {
      return {};
    }

    const now = new Date();
    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    return {
      fechaConversion: now,
      tiempoConversionDias: Math.max(0, Math.ceil((now.getTime() - fechaCreacion.getTime()) / millisecondsPerDay)),
    };
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
