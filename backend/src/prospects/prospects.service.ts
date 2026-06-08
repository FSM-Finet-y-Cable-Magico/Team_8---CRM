import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { ContractPlanDto } from './dto/contract-plan.dto';
import { CreateInstallOrderDto } from './dto/create-install-order.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { GenerateQuoteDto } from './dto/generate-quote.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { VerifyFeasibilityDto } from './dto/verify-feasibility.dto';

const INITIAL_PIPELINE_STATUS = 'Prospecto Nuevo';
const LOST_PIPELINE_STATUS = 'Perdido';
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
      where: { rut: rutResult.normalized },
    });
    const duplicateClient = await this.prisma.cliente.findUnique({
      where: { rut: rutResult.normalized },
    });

    if (duplicateProspect || duplicateClient) {
      throw new BadRequestException('Ya existe un cliente o prospecto con ese RUT');
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
      },
    });

    return prospect;
  }

  async updatePipeline(idProspecto: number, dto: UpdatePipelineDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const nextStatus = dto.estadoPipeline.trim();
    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;

    this.validatePipelineTransition(currentStatus, nextStatus);

    const conversionData = this.conversionData(nextStatus, prospect.fechaCreacion);
    const updated = await this.prisma.prospecto.update({
      where: { idProspecto },
      data: {
        estadoPipeline: nextStatus,
        ...conversionData,
      },
      include: { empresa: true },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_PIPELINE_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: currentStatus },
      valorNuevo: { estadoPipeline: nextStatus, ...conversionData },
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
      include: { plan: true, prospecto: true },
    });
    const pdfUrl = `/prospects/${idProspecto}/quotes/${quote.idCotizacion}/pdf`;

    const updatedQuote = await this.prisma.cotizacion.update({
      where: { idCotizacion: quote.idCotizacion },
      data: { pdfUrl },
      include: { plan: true, prospecto: true },
    });

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
      },
    });

    return {
      ...updatedQuote,
      envioEmail: 'simulado',
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
            importadoMasivo: false,
          },
        });
      }

      const contrato = await tx.contrato.create({
        data: {
          idCliente: cliente.idCliente,
          idPlan: dto.planId,
          idEmpresa: prospect.idEmpresa,
          fechaInicio,
          diaVencimiento: dto.diaVencimiento,
          estado: 'Pendiente',
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

      return { cliente, contrato, prospecto: updatedProspect };
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
        diaVencimiento: dto.diaVencimiento,
      },
    });

    return result;
  }

  async createInstallOrder(idProspecto: number, dto: CreateInstallOrderDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);

    if (!prospect.idCliente) {
      throw new BadRequestException('Primero debe registrar el plan contratado del prospecto');
    }

    if (!prospect.direccion?.trim()) {
      throw new BadRequestException('El prospecto no tiene direccion para instalar');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let direccion = await tx.direccionServicio.findFirst({
        where: {
          idCliente: prospect.idCliente,
          esPrincipal: true,
        },
      });

      if (!direccion) {
        direccion = await tx.direccionServicio.create({
          data: {
            idCliente: prospect.idCliente,
            direccionCompleta: prospect.direccion ?? '',
            comuna: 'Por confirmar',
            ciudad: 'Por confirmar',
            esPrincipal: true,
          },
        });
      }

      const orden = await tx.ordenTrabajo.create({
        data: {
          idEmpresa: prospect.idEmpresa,
          idCliente: prospect.idCliente,
          idDireccion: direccion.idDireccion,
          tipoOt: 'Instalacion',
          prioridad: dto.prioridad ?? 'Media',
          estado: 'Pendiente',
          fechaCreacion: new Date(),
          fechaProgramada: new Date(dto.fechaProgramada),
          observaciones: dto.observaciones,
          resueltoRemotamente: false,
        },
      });

      const updatedProspect = await tx.prospecto.update({
        where: { idProspecto },
        data: { estadoPipeline: 'Instalacion Programada' },
        include: { empresa: true },
      });

      return { direccion, orden, prospecto: updatedProspect };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_ORDEN_INSTALACION',
      entidadAfectada: 'orden_trabajo',
      idEntidadAfectada: result.orden.idOt,
      valorNuevo: {
        idProspecto,
        idCliente: prospect.idCliente,
        fechaProgramada: dto.fechaProgramada,
        prioridad: dto.prioridad ?? 'Media',
      },
    });

    return result;
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
      doc.text('Envio de correo: simulado para ambiente academico.');
      doc.end();
    });
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (currentUser.roles.includes('Administrador')) {
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

    if (!currentUser.roles.includes('Administrador') && prospect.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El prospecto no pertenece a tu empresa');
    }

    return prospect;
  }

  private validatePipelineTransition(currentStatus: string, nextStatus: string) {
    if (!PIPELINE_STATUSES.includes(nextStatus)) {
      throw new BadRequestException('Estado fuera de la secuencia permitida');
    }

    if (currentStatus === LOST_PIPELINE_STATUS) {
      throw new BadRequestException('Un prospecto perdido no puede avanzar en pipeline');
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
