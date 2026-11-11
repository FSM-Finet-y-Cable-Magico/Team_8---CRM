import { ContractsService } from '../contracts/contracts.service';
import { effectiveSignatureDates } from '../contracts/signature.repository';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Prospecto } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { activeProspectWhere, LOST_PROSPECT_PIPELINE_STATUS, pendingActivationWhere } from '../common/customer-lifecycle';
import { addYearsToDateOnly, parseDateOnly, todayDateOnly } from '../common/date-rules';
import {
  buildInstallOrderObservations,
  parseInstallOrderObservations,
} from '../common/install-order-metadata';
import { isAdministrator } from '../common/roles';
import { generateWorkOrderCode } from '../common/work-order-code';
import { MailDeliveryResult, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertNoContractDebt, auditContractDebtRejection } from '../contracts/contract-debt.guard';
import { rutLookupVariants, validateRut } from '../rut/rut.util';
import { ContractPlanDto } from './dto/contract-plan.dto';
import { CreateInstallOrderDto } from './dto/create-install-order.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { GenerateQuoteDto } from './dto/generate-quote.dto';
import { InstallAvailabilityDto } from './dto/install-availability.dto';
import { InstallDayAvailabilityDto } from './dto/install-day-availability.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { VerifyFeasibilityDto } from './dto/verify-feasibility.dto';
import { UpdateProspectLocationDto } from './dto/update-prospect-location.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { ReviewG2ProspectDto } from './dto/review-g2-prospect.dto';
import { G2_REVIEW_RELATION_COUNTS, g2OriginEvidence, isG2ProspectReviewCandidate, readG2OriginAudits } from './g2-prospect-review';
import { CoverageDomainService } from '../coverage/coverage-domain.service';
import { CoverageResult } from '../coverage/coverage.types';
import { CoverageLocationDto } from '../coverage/coverage.dto';
import { signatureRepository, signatureStorageAvailable } from '../contracts/signature.repository';

const INITIAL_PIPELINE_STATUS = 'Prospecto Nuevo';
const FEASIBLE_PIPELINE_STATUS = 'Factible';
const NOT_FEASIBLE_PIPELINE_STATUS = 'No Factible';
const QUOTE_SENT_PIPELINE_STATUS = 'Cotizacion Enviada';
const EXTERNAL_CONTRACT_PIPELINE_STATUS = 'Contrato externo registrado';
const PENDING_SIGNATURE_STATUS = 'Pendiente firma contrato';
const PENDING_SIGNATURE_PIPELINE_STATUS = 'Pendiente firma';
const LOST_PIPELINE_STATUS = LOST_PROSPECT_PIPELINE_STATUS;
const PENDING_SIGNATURE_DUE_DAY = 1;
const CLOSED_INSTALL_ORDER_STATES = ['Completada', 'Cancelada'];
const ALTERNATIVE_VISIT_TIMES = ['09:00', '11:00', '14:00', '16:00', '18:00'];
const QUOTE_DATE_FORMAT = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'medium',
});
const PIPELINE_STATUSES = [
  INITIAL_PIPELINE_STATUS,
  'Contactado',
  'En Factibilidad',
  FEASIBLE_PIPELINE_STATUS,
  NOT_FEASIBLE_PIPELINE_STATUS,
  QUOTE_SENT_PIPELINE_STATUS,
  EXTERNAL_CONTRACT_PIPELINE_STATUS,
  PENDING_SIGNATURE_PIPELINE_STATUS,
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
    private readonly coverageService: CoverageDomainService,
    private readonly contractsService: ContractsService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const companyScope = this.companyScope(currentUser, scope);

    const prospects = await this.prisma.prospecto.findMany({
      where: activeProspectWhere(companyScope),
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        _count: G2_REVIEW_RELATION_COUNTS,
        empresa: true,
        cotizaciones: {
          where: { fechaEnvio: { not: null } },
          select: { idCotizacion: true, codigo: true, idPlan: true, fechaEnvio: true, factibilidadVerificada: true, plan: { select: { idEmpresa: true, activo: true } } },
          orderBy: { idCotizacion: 'desc' },
        },
        usuarioComercial: {
          select: {
            nombreCompleto: true,
            email: true,
          },
        },
        contratos: {
          where: companyScope,
          select: {
            idContrato: true,
            fechaInicio: true,
            estado: true,
            fechaFirmaManual: true,
            idPlan: true,
          },
          orderBy: { idContrato: 'desc' },
        },
      },
    });
    const evidenceRows = await readG2OriginAudits(this.prisma, prospects.filter(isG2ProspectReviewCandidate).map(p => p.idProspecto));
    const pendingContractIds = prospects.flatMap(prospect => prospect.contratos
      .filter(contract => contract.estado === PENDING_SIGNATURE_STATUS).map(contract => contract.idContrato));
    const confirmations = pendingContractIds.length ? await this.prisma.logAuditoria.findMany({
      where: {
        accion: 'GENERAR_CONTRATO_PROSPECTO', entidadAfectada: 'contrato',
        idEntidadAfectada: { in: pendingContractIds }, fechaHora: { not: null },
      },
      select: { idEntidadAfectada: true, fechaHora: true },
      orderBy: [{ fechaHora: 'desc' }, { idLog: 'desc' }],
      distinct: ['idEntidadAfectada'],
    }) : [];
    const confirmationByContract = new Map(confirmations.map(event => [event.idEntidadAfectada, event.fechaHora]));
    return prospects.map(({ _count, ...prospect }) => ({
      ...prospect,
      contratos: prospect.contratos.map(contract => ({
        ...contract, fechaConfirmacion: confirmationByContract.get(contract.idContrato) ?? null,
      })),
      revisionOrigenG2Disponible: isG2ProspectReviewCandidate({ ...prospect, _count }) && g2OriginEvidence(prospect, evidenceRows) !== null,
      cotizaciones: (prospect.cotizaciones ?? [])
        .filter(quote => quote.plan?.idEmpresa === prospect.idEmpresa)
        .map(({ idCotizacion, codigo, idPlan, fechaEnvio, factibilidadVerificada, plan }) => ({
          idCotizacion, codigo, idPlan, fechaEnvio, vigente: factibilidadVerificada === true && plan?.activo !== false,
        })),
      requiereRevisionComercial: prospect.clasificacionComercial !== 'PROSPECTO'
        || (!([...PIPELINE_STATUSES.slice(0, 6), null].includes(prospect.estadoPipeline))
          && !(prospect.contratos.some((contract) => contract.estado === PENDING_SIGNATURE_STATUS)
            && [PENDING_SIGNATURE_PIPELINE_STATUS, PENDING_SIGNATURE_STATUS, EXTERNAL_CONTRACT_PIPELINE_STATUS].includes(prospect.estadoPipeline ?? ''))),
    }));
  }

  async listPendingActivation(currentUser: AuthUser, scope = 'consolidado') {
    const companyScope = this.companyScope(currentUser, scope);
    const companies = companyScope.idEmpresa === undefined
      ? await this.prisma.empresa.findMany({ select: { idEmpresa: true } })
      : [{ idEmpresa: companyScope.idEmpresa }];

    const prospects = await this.prisma.prospecto.findMany({
      where: { OR: companies.map(({ idEmpresa }) => pendingActivationWhere({ idEmpresa })) },
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
      include: {
        empresa: true,
        contratos: {
          where: {
            ...companyScope,
            estado: { in: ['Firmado', 'Activo', 'Suspendido', 'Moroso'] },
            servicios: { none: { estadoOperativo: { notIn: ['Pendiente Instalacion', 'Instalacion Programada'] } } },
          },
          include: { plan: true },
          orderBy: { idContrato: 'desc' },
        },
      },
    });
    const effectiveDates = await effectiveSignatureDates(this.prisma, prospects.flatMap(p => p.contratos.map(c => c.idContrato)));
    return prospects.map((prospect) => {
      const contracts = prospect.contratos
        .filter((contract) => contract.idEmpresa === prospect.idEmpresa)
        .map(contract => ({ ...contract, fechaFirmaEfectiva: effectiveDates.get(contract.idContrato) ?? contract.fechaFirmaManual,
          origenFirma: effectiveDates.has(contract.idContrato) ? 'ELECTRONICA' : contract.fechaFirmaManual ? 'MANUAL' : 'SIN_FECHA' }))
        .sort((a,b) => (b.fechaFirmaEfectiva?.getTime() ?? -1) - (a.fechaFirmaEfectiva?.getTime() ?? -1) || b.idContrato-a.idContrato)
        .slice(0, 1)
        .map((contract) => ({
          ...contract,
          plan: contract.plan?.idEmpresa === prospect.idEmpresa ? contract.plan : null,
        }));
      const contract = contracts[0];
      const clean = (value?: string | null) => value?.trim() || null;
      const address = clean(contract?.direccionInstalacion);
      const sameAddress = !address || address.replace(/\s+/g, ' ') === clean(prospect.direccion)?.replace(/\s+/g, ' ');
      const contractComuna = clean(contract?.comunaInstalacion);
      const prospectComuna = contract && sameAddress ? clean(prospect.comuna) : null;
      // Read-only projection: never pretend a prospect supplement was signed.
      return { ...prospect, contratos: contracts, ubicacionInstalacion: {
        direccion: address || clean(prospect.direccion),
        comuna: contractComuna || prospectComuna,
        ciudad: clean(contract?.ciudadInstalacion),
        fuenteComuna: contractComuna ? 'CONTRATO' : prospectComuna ? 'PROSPECTO' : null,
      } };
    });
  }
  async create(dto: CreateProspectDto, currentUser: AuthUser) {
    const rutResult = validateRut(dto.rut);

    if (!rutResult.valid || !rutResult.normalized) {
      throw new BadRequestException(rutResult.reason ?? 'RUT invalido');
    }

    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    if (dto.idPlanInteres) {
      const planInteres = await this.prisma.plan.findUnique({ where: { idPlan: dto.idPlanInteres } });
      if (!planInteres || planInteres.activo === false || planInteres.idEmpresa !== idEmpresa) {
        throw new BadRequestException('El plan de interes debe estar activo y pertenecer a la empresa del prospecto');
      }
    }
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

    const cobertura = dto.ubicacion
      ? await this.coverageService.check(idEmpresa, dto.ubicacion, currentUser)
      : null;
    const prospect = await this.prisma.prospecto.create({
      data: {
        idEmpresa,
        idUsuarioComercial: currentUser.idUsuario,
        rut: rutResult.normalized,
        nombreCompleto: dto.nombreCompleto.trim(),
        email: dto.email?.trim().toLowerCase(),
        telefono: dto.telefono.trim(),
        direccion: dto.direccion.trim(),
        comuna: dto.comuna?.trim() || null,
        region: dto.region?.trim() || null,
        latitud: dto.ubicacion?.latitud ?? null,
        longitud: dto.ubicacion?.longitud ?? null,
        idZonaPago: cobertura?.microzona?.idZonaPago ?? cobertura?.zona?.idZonaPago ?? null,
        idPlanInteres: dto.idPlanInteres ?? null,
        origenContacto: dto.origenContacto?.trim() || 'Contacto directo',
        estadoPipeline: cobertura?.coberturaComercial
          ? FEASIBLE_PIPELINE_STATUS
          : cobertura
            ? NOT_FEASIBLE_PIPELINE_STATUS
            : INITIAL_PIPELINE_STATUS,
        ...(cobertura?.coberturaComercial ? { cotizaciones: { create: { factibilidadVerificada: true } } } : {}),
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
        ...(cobertura ? { direccion: dto.direccion.trim(), cobertura } : {}),
      },
    });

    return { ...prospect, cobertura };
  }

  async reviewG2Prospect(idProspecto: number, dto: ReviewG2ProspectDto, currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles) && !currentUser.roles.includes('Comercial')) {
      throw new ForbiddenException('La revisión requiere permisos comerciales');
    }
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    if (dto.confirmarOrigenG2 !== true) {
      throw new BadRequestException('Confirma la revisión comercial de la solicitud G2 y su empresa');
    }
    try {
      return await this.prisma.$transaction(async tx => {
        // Serialize against confirmations and FK-dependent insertions on this prospect.
        await tx.$executeRaw`SELECT id_prospecto FROM public.prospecto WHERE id_prospecto = ${idProspecto} FOR UPDATE`;
        const current = await tx.prospecto.findUniqueOrThrow({ where: { idProspecto }, include: { _count: G2_REVIEW_RELATION_COUNTS } });
        if (current.idEmpresa !== prospect.idEmpresa
          || (!isAdministrator(currentUser.roles) && current.idEmpresa !== currentUser.idEmpresa)) {
          throw new ConflictException('El ámbito empresarial del prospecto cambió; vuelve a consultarlo');
        }
        if (!isG2ProspectReviewCandidate(current)) {
          throw new ConflictException('El prospecto no acredita una solicitud G2 nueva y sin relaciones. Requiere revisión comercial especializada');
        }
        const evidence = g2OriginEvidence(current, await readG2OriginAudits(tx, [idProspecto]));
        if (!evidence) throw new ConflictException('Falta evidencia original de creación y privacidad de G2; no se recuperó el prospecto');
        const variants = current.rut ? rutLookupVariants(current.rut) : [];
        if (variants.length && await tx.cliente.findFirst({ where: {
          rut: { in: variants, mode: 'insensitive' },
          OR: [{ idEmpresa: current.idEmpresa }, { contratos: { some: { idEmpresa: current.idEmpresa } } },
            { servicios: { some: { idEmpresa: current.idEmpresa } } }],
        }, select: { idCliente: true } })) {
          throw new ConflictException('Existe una identidad comercial relacionada; no se fusionaron ni reasignaron registros');
        }
        const updated = await tx.prospecto.update({ where: {
          idProspecto, idEmpresa: current.idEmpresa, estadoPipeline: 'NUEVO', clasificacionComercial: 'PROSPECTO',
          origenContacto: current.origenContacto, idCliente: null, fechaConversion: null, fechaPerdida: null,
          motivoPerdida: null, tiempoConversionDias: null,
          contratos: { none: {} }, cotizaciones: { none: {} }, ordenesTrabajo: { none: {} },
          integracionesInstalacionG3: { none: {} },
        }, data: { estadoPipeline: INITIAL_PIPELINE_STATUS }, include: { empresa: true } });
        await this.auditService.record({
          idUsuario: currentUser.idUsuario, accion: 'REVISAR_SOLICITUD_G2', entidadAfectada: 'prospecto', idEntidadAfectada: idProspecto,
          valorAnterior: { estadoPipeline: current.estadoPipeline, clasificacionComercial: current.clasificacionComercial },
          valorNuevo: { estadoPipeline: INITIAL_PIPELINE_STATUS, idEmpresa: current.idEmpresa,
            evidenciasOrigenG2: evidence, origenConfirmadoPorComercial: true },
        }, tx);
        return { ...updated, requiereRevisionComercial: false, revisionOrigenG2Disponible: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError
        && (['P2025', 'P2034'].includes(error.code)
          || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) {
        throw new ConflictException('El prospecto cambió durante la revisión; vuelve a consultar antes de aprobar');
      }
      throw error;
    }
  }

  async updatePipeline(idProspecto: number, dto: UpdatePipelineDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const nextStatus = dto.estadoPipeline.trim();
    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;

    this.validatePipelineTransition(currentStatus, nextStatus);
    await this.assertManualCommercialChange(prospect);

    const isReactivation = currentStatus === LOST_PIPELINE_STATUS;
    const updated = await this.prisma.prospecto.update({
      where: this.manualChangeWhere(idProspecto, prospect.estadoPipeline, prospect.idEmpresa),
      data: {
        estadoPipeline: nextStatus,
        motivoPerdida: isReactivation ? null : prospect.motivoPerdida,
      },
      include: { empresa: true },
    }).catch((error: unknown) => this.rethrowConcurrentChange(error));

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: isReactivation ? 'REACTIVAR_PROSPECTO' : 'ACTUALIZAR_PIPELINE_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: currentStatus, motivoPerdida: prospect.motivoPerdida },
      valorNuevo: { estadoPipeline: nextStatus, motivoPerdida: isReactivation ? null : prospect.motivoPerdida },
    });

    return updated;
  }

  async verifyFeasibility(idProspecto: number, dto: VerifyFeasibilityDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    this.assertFeasibilityStage(prospect.estadoPipeline);
    if (prospect.latitud === null || prospect.latitud === undefined
      || prospect.longitud === null || prospect.longitud === undefined) {
      throw new BadRequestException('El prospecto debe tener una ubicacion valida para determinar cobertura comercial');
    }
    const cobertura = await this.coverageService.check(
      prospect.idEmpresa ?? 0,
      { latitud: prospect.latitud, longitud: prospect.longitud },
      currentUser,
    );
    const updated = await this.saveFeasibility(
      idProspecto,
      {
        resultado: cobertura.coberturaComercial ? 'Factible' : 'No Factible',
        observaciones: dto.observaciones,
      },
      currentUser,
      prospect,
      cobertura,
    );
    return { ...updated, cobertura };
  }

  async verifyTomodat(idProspecto: number, location: CoverageLocationDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    this.assertFeasibilityStage(prospect.estadoPipeline);
    if (!isAdministrator(currentUser.roles) && !currentUser.roles.includes('Comercial')
      && (location.latitud !== prospect.latitud || location.longitud !== prospect.longitud)) {
      throw new ForbiddenException('La edición de ubicación requiere permisos comerciales');
    }
    const cobertura = await this.coverageService.check(prospect.idEmpresa ?? 0, location, currentUser);
    const updated = await this.saveFeasibility(
      idProspecto,
      { resultado: cobertura.coberturaComercial ? 'Factible' : 'No Factible' },
      currentUser,
      prospect,
      cobertura,
      location,
    );
    return { ...updated, cobertura };
  }

  async updateLocation(idProspecto: number, dto: UpdateProspectLocationDto, currentUser: AuthUser) {
    return this.update(idProspecto, dto, currentUser);
  }

  async update(idProspecto: number, dto: UpdateProspectDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const wasQuoted = prospect.estadoPipeline === QUOTE_SENT_PIPELINE_STATUS;
    if (prospect.estadoPipeline === 'NUEVO') {
      throw new BadRequestException('Revisa y aprueba la solicitud G2 antes de actualizar su ubicación');
    }
    if (!wasQuoted) this.assertFeasibilityStage(prospect.estadoPipeline);
    if (wasQuoted && !dto.ubicacion) {
      throw new BadRequestException('Vuelve a comprobar la ubicación y cobertura antes de emitir otra cotización');
    }
    const addressChanged = (dto.direccion !== undefined && dto.direccion.trim() !== prospect.direccion)
      || (dto.comuna !== undefined && (dto.comuna.trim() || null) !== prospect.comuna)
      || (dto.region !== undefined && (dto.region.trim() || null) !== prospect.region);
    const quoteRelevantDataChanged = (dto.nombreCompleto !== undefined && dto.nombreCompleto.trim() !== prospect.nombreCompleto)
      || (dto.telefono !== undefined && dto.telefono.trim() !== prospect.telefono)
      || (dto.email !== undefined && (dto.email?.trim().toLowerCase() || null) !== prospect.email)
      || (dto.origenContacto !== undefined && (dto.origenContacto.trim() || null) !== prospect.origenContacto)
      || addressChanged
      || (dto.ubicacion !== undefined && (dto.ubicacion.latitud !== prospect.latitud || dto.ubicacion.longitud !== prospect.longitud));
    const restartQuoteFlow = wasQuoted && quoteRelevantDataChanged;
    if (addressChanged && !dto.ubicacion) throw new BadRequestException('Selecciona la ubicación de la dirección antes de guardar');
    const cobertura = dto.ubicacion
      ? await this.coverageService.check(prospect.idEmpresa ?? 0, dto.ubicacion, currentUser)
      : null;
    const refreshFeasibility = Boolean(cobertura && (restartQuoteFlow || addressChanged
      || dto.ubicacion?.latitud !== prospect.latitud || dto.ubicacion?.longitud !== prospect.longitud));
    return this.prisma.$transaction(async tx => {
      // Same row lock as contractPlan: do not race the creation of a contract.
      await tx.$executeRaw`SELECT id_prospecto FROM prospecto WHERE id_prospecto = ${idProspecto} FOR UPDATE`;
      if (await tx.contrato.findFirst({ where: { idProspecto } })) {
        throw new BadRequestException('La ubicacion contratada requiere revision contractual. Para una comuna ausente utiliza Completar datos de instalacion.');
      }
      const previous = await tx.prospecto.findUniqueOrThrow({ where: { idProspecto } });
      if (previous.idEmpresa !== prospect.idEmpresa || previous.idCliente !== prospect.idCliente
        || previous.estadoPipeline !== prospect.estadoPipeline || previous.direccion !== prospect.direccion
        || previous.comuna !== prospect.comuna || previous.region !== prospect.region
        || previous.latitud !== prospect.latitud || previous.longitud !== prospect.longitud
        || previous.nombreCompleto !== prospect.nombreCompleto || previous.telefono !== prospect.telefono
        || previous.email !== prospect.email || previous.origenContacto !== prospect.origenContacto) {
        throw new ConflictException('El prospecto cambió durante la edición de ubicación; vuelve a consultarlo');
      }
      if (previous.idCliente != null) throw new BadRequestException('La ubicación de clientes convertidos requiere su flujo autorizado');
      if (restartQuoteFlow && dto.ubicacion) {
        // Keep the old quote as history, but prevent it from being used to confirm
        // a contract after any prospect data has changed.
        await tx.cotizacion.updateMany({ where: { idProspecto }, data: { factibilidadVerificada: false } });
      }
      const updated = await tx.prospecto.update({
        where: { idProspecto },
        data: {
          ...(dto.ubicacion && cobertura ? {
            latitud: dto.ubicacion.latitud, longitud: dto.ubicacion.longitud,
            idZonaPago: cobertura.microzona?.idZonaPago ?? cobertura.zona?.idZonaPago ?? null,
          } : {}),
          ...(dto.nombreCompleto !== undefined ? { nombreCompleto: dto.nombreCompleto.trim() } : {}),
          ...(dto.telefono !== undefined ? { telefono: dto.telefono.trim() } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
          ...(dto.origenContacto !== undefined ? { origenContacto: dto.origenContacto.trim() || null } : {}),
          ...(dto.direccion !== undefined ? { direccion: dto.direccion.trim() } : {}),
          ...(dto.comuna !== undefined ? { comuna: dto.comuna.trim() || null } : {}),
          ...(dto.region !== undefined ? { region: dto.region.trim() || null } : {}),
          ...(refreshFeasibility ? { estadoPipeline: cobertura?.coberturaComercial ? FEASIBLE_PIPELINE_STATUS : NOT_FEASIBLE_PIPELINE_STATUS } : {}),
        },
        include: { empresa: true, zonaPago: true },
      });
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: dto.ubicacion ? 'ACTUALIZAR_UBICACION_PROSPECTO' : 'ACTUALIZAR_DATOS_PROSPECTO',
        entidadAfectada: 'prospecto',
        idEntidadAfectada: idProspecto,
        valorAnterior: { latitud: previous.latitud, longitud: previous.longitud, idZonaPago: previous.idZonaPago,
          comuna: previous.comuna ?? null, region: previous.region ?? null, direccion: previous.direccion,
          nombreCompleto: previous.nombreCompleto, telefono: previous.telefono, email: previous.email, origenContacto: previous.origenContacto },
        valorNuevo: {
          latitud: updated.latitud,
          longitud: updated.longitud,
          idZonaPago: updated.idZonaPago,
          estadoCobertura: cobertura?.estado,
          comuna: updated.comuna ?? null, region: updated.region ?? null,
          direccion: updated.direccion, nombreCompleto: updated.nombreCompleto,
          telefono: updated.telefono, email: updated.email, origenContacto: updated.origenContacto,
          ...(restartQuoteFlow ? { cotizacionesAnterioresInvalidas: true, estadoPipeline: updated.estadoPipeline } : {}),
        },
      }, tx);
      return { ...updated, cobertura };
    });
  }

  private assertFeasibilityStage(status: string | null) {
    if (!['Prospecto Nuevo', 'Contactado', 'En Factibilidad', 'Factible', 'No Factible'].includes(status ?? INITIAL_PIPELINE_STATUS)) {
      throw new BadRequestException('La factibilidad solo puede cambiarse antes de cotizar o contratar');
    }
  }

  private async saveFeasibility(idProspecto: number, dto: VerifyFeasibilityDto, currentUser: AuthUser, prospect: Prospecto, cobertura?: CoverageResult, location?: CoverageLocationDto) {
    this.assertFeasibilityStage(prospect.estadoPipeline);

    if (!prospect.direccion?.trim()) {
      throw new BadRequestException('La direccion del prospecto debe estar completa');
    }

    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;
    const nextStatus = dto.resultado === 'Factible' ? FEASIBLE_PIPELINE_STATUS : NOT_FEASIBLE_PIPELINE_STATUS;
    const lossReason = prospect.motivoPerdida;

    const updated = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id_prospecto FROM public.prospecto WHERE id_prospecto = ${idProspecto} FOR UPDATE`;
      const current = await tx.prospecto.findUniqueOrThrow({ where: { idProspecto } });
      if (current.idEmpresa !== prospect.idEmpresa || current.idCliente !== prospect.idCliente
        || current.estadoPipeline !== prospect.estadoPipeline || current.direccion !== prospect.direccion
        || current.comuna !== prospect.comuna || current.region !== prospect.region
        || current.latitud !== prospect.latitud || current.longitud !== prospect.longitud) {
        throw new ConflictException('El prospecto cambió durante la consulta de cobertura; vuelve a consultar');
      }
      if (current.idCliente != null || await tx.contrato.findFirst({ where: { idProspecto } })) {
        throw new BadRequestException('La factibilidad contratada requiere su flujo autorizado; no se modificó la ubicación');
      }
      // A negative recheck invalidates previous positive checks used by installation scheduling.
      await tx.cotizacion.updateMany({ where: { idProspecto }, data: { factibilidadVerificada: false } });
      const result = await tx.prospecto.update({
        where: { idProspecto, estadoPipeline: prospect.estadoPipeline },
        data: {
          estadoPipeline: nextStatus,
          motivoPerdida: lossReason,
          ...(location ? { latitud: location.latitud, longitud: location.longitud,
            idZonaPago: cobertura?.microzona?.idZonaPago ?? cobertura?.zona?.idZonaPago ?? null } : {}),
          ...(dto.resultado === 'Factible' ? { cotizaciones: { create: { factibilidadVerificada: true } } } : {}),
        },
        include: { empresa: true },
      });
      if (location && (current.latitud !== location.latitud || current.longitud !== location.longitud || current.idZonaPago !== result.idZonaPago)) {
        await this.auditService.record({ idUsuario: currentUser.idUsuario, accion: 'ACTUALIZAR_UBICACION_PROSPECTO',
          entidadAfectada: 'prospecto', idEntidadAfectada: idProspecto,
          valorAnterior: { latitud: current.latitud, longitud: current.longitud, idZonaPago: current.idZonaPago },
          valorNuevo: { latitud: location.latitud, longitud: location.longitud, idZonaPago: result.idZonaPago },
        }, tx);
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
        origen: cobertura ? 'COBERTURA_COMERCIAL' : 'Manual',
        ...(cobertura ? { direccion: prospect.direccion, cobertura } : {}),
      },
      }, tx);
      return result;
    });
    return updated;
  }

  async generateQuote(idProspecto: number, dto: GenerateQuoteDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    if (prospect.estadoPipeline === 'NUEVO') throw new BadRequestException('La solicitud G2 requiere revisión comercial antes de cotizar');

    if (prospect.latitud === null || prospect.latitud === undefined || prospect.longitud === null || prospect.longitud === undefined) {
      throw new BadRequestException('El prospecto debe tener una ubicacion valida antes de cotizar');
    }

    const commercial = await this.coverageService.plansForLocation(
      prospect.idEmpresa ?? 0,
      { latitud: prospect.latitud, longitud: prospect.longitud },
      currentUser,
    );
    if (!commercial.coberturaComercial || !commercial.planes.some(plan => plan.idPlan === dto.planId)) {
      throw new BadRequestException('El plan no esta disponible para la ubicacion del prospecto');
    }

    if (!prospect.email?.trim()) {
      throw new BadRequestException('El prospecto debe tener correo electronico');
    }

    if (prospect.estadoPipeline === LOST_PIPELINE_STATUS) {
      throw new BadRequestException('Un prospecto perdido no puede avanzar a cotizacion');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { idPlan: dto.planId },
    });

    if (!plan || plan.activo === false || plan.idEmpresa !== prospect.idEmpresa) {
      throw new BadRequestException('Plan inexistente o inactivo');
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
      emailDelivery = prospect.idEmpresa == null ? { status: 'not_configured' } : await this.mailService.sendQuote({
        idEmpresa: prospect.idEmpresa,
        to: prospect.email,
        prospectName: prospect.nombreCompleto ?? 'Cliente',
        companyName: updatedQuote.prospecto?.empresa?.nombre ?? 'FiNet',
        pdf,
        filename: `${updatedQuote.codigo ?? 'cotizacion-' + quote.idCotizacion}.pdf`,
      });
    } catch {
      emailDelivery = { status: 'failed' };
    }

    const currentStatus = prospect.estadoPipeline ?? INITIAL_PIPELINE_STATUS;

    if (this.statusIndex(currentStatus) < this.statusIndex(QUOTE_SENT_PIPELINE_STATUS) || !prospect.idPlanInteres) {
      await this.prisma.prospecto.update({
        where: { idProspecto },
        data: {
          ...(this.statusIndex(currentStatus) < this.statusIndex(QUOTE_SENT_PIPELINE_STATUS)
            ? { estadoPipeline: QUOTE_SENT_PIPELINE_STATUS }
            : {}),
          ...(!prospect.idPlanInteres ? { idPlanInteres: dto.planId } : {}),
        },
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
    const data = {
      estadoPipeline: LOST_PIPELINE_STATUS,
      motivoPerdida: dto.motivo,
      observacionPerdida: dto.detalleMotivoPerdida?.trim() || dto.observaciones.trim(),
      fechaPerdida: new Date(),
      idUsuarioPerdida: currentUser.idUsuario,
    };
    const audit = {
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_PERDIDA_PROSPECTO',
      entidadAfectada: 'prospecto',
      idEntidadAfectada: idProspecto,
      valorAnterior: { estadoPipeline: prospect.estadoPipeline, motivoPerdida: prospect.motivoPerdida },
      valorNuevo: {
        estadoPipeline: LOST_PIPELINE_STATUS,
        motivo: dto.motivo,
        observaciones: dto.observaciones,
        detalleMotivoPerdida: dto.detalleMotivoPerdida,
      },
    };
    if ([PENDING_SIGNATURE_PIPELINE_STATUS, PENDING_SIGNATURE_STATUS, EXTERNAL_CONTRACT_PIPELINE_STATUS].includes(prospect.estadoPipeline ?? '')) {
      if (dto.motivo === 'Sin cobertura') {
        throw new BadRequestException('Selecciona un motivo de pérdida comercial para el contrato pendiente de firma.');
      }
      return this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id_prospecto FROM prospecto WHERE id_prospecto = ${idProspecto} FOR UPDATE`;
        const current = await tx.prospecto.findUniqueOrThrow({ where: { idProspecto } });
        if (current.estadoPipeline !== prospect.estadoPipeline || current.idEmpresa !== prospect.idEmpresa) {
          throw new ConflictException('El prospecto cambió durante la operación. Vuelve a consultar su estado.');
        }
        const related = await tx.contrato.findMany({
          where: { idProspecto, estado: { notIn: ['Baja', 'Anulado'] } },
          select: { idContrato: true },
        });
        if (current.idCliente != null || related.length !== 1 || await tx.ordenTrabajo.findFirst({ where: { idProspecto }, select: { idOt: true } })) {
          throw new BadRequestException('La baja requiere un único contrato sin firma y sin instalación asociada.');
        }
        const { idContrato } = related[0];
        // La firma toma primero el contrato y luego el prospecto. NOWAIT evita invertir esa espera.
        try {
          await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE NOWAIT`;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && error.meta?.code === '55P03') {
            throw new ConflictException('El contrato se está actualizando. Vuelve a consultar su estado.');
          }
          throw error;
        }
        const contract = await tx.contrato.findFirst({
          where: { idContrato, idProspecto, idEmpresa: current.idEmpresa, idCliente: null,
            estado: PENDING_SIGNATURE_STATUS, fechaFirmaManual: null,
            facturas: { none: {} }, servicios: { none: {} }, integracionesInstalacionG3: { none: {} },
            contratosDigitales: { none: { OR: [{ fechaFirma: { not: null } }, { estadoFirma: { in: ['Firmado', 'Firmado manualmente'] } }] } },
          },
          select: { idContrato: true },
        });
        const signatures = await signatureStorageAvailable(tx) ? signatureRepository(tx) : null;
        if (!contract || await signatures?.findFirst({ where: { idContrato, estado: 'FIRMADA' } })) {
          throw new BadRequestException('El contrato debe seguir pendiente de firma y sin servicios ni facturas para registrar la pérdida.');
        }
        await tx.contrato.update({ where: { idContrato }, data: { estado: 'Anulado' } });
        await tx.contratoDigital.updateMany({ where: { idContrato }, data: { estadoFirma: 'Anulado' } });
        if (signatures) {
          for (const estado of ['BORRADOR', 'PENDIENTE']) {
            await signatures.updateMany({ where: { idContrato, estado }, data: { estado: 'ANULADA', motivoAnulacion: 'PERDIDA_PROSPECTO', otpHash: null } });
          }
        }
        const updated = await tx.prospecto.update({ where: { idProspecto }, data, include: { empresa: true } });
        await this.auditService.record({
          ...audit, valorNuevo: { ...audit.valorNuevo, idContrato, estadoContrato: 'Anulado' },
        }, tx);
        return updated;
      });
    }
    await this.assertManualCommercialChange(prospect);
    if (![...PIPELINE_STATUSES.slice(0, 6), LOST_PIPELINE_STATUS, null].includes(prospect.estadoPipeline)) {
      throw new BadRequestException('La perdida comercial no puede cancelar contratos o instalaciones; requiere revision');
    }
    const updated = await this.prisma.prospecto.update({
      where: this.manualChangeWhere(idProspecto, prospect.estadoPipeline, prospect.idEmpresa),
      data,
      include: { empresa: true },
    }).catch((error: unknown) => this.rethrowConcurrentChange(error));
    await this.auditService.record(audit);
    return updated;
  }

  async contractPlan(idProspecto: number, dto: ContractPlanDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    if (prospect.estadoPipeline === 'NUEVO') throw new BadRequestException('La solicitud G2 requiere revisión comercial antes de contratar');
    const plan = await this.prisma.plan.findUnique({ where: { idPlan: dto.planId } });

    if (!plan || plan.activo === false || plan.idEmpresa !== prospect.idEmpresa) {
      throw new BadRequestException('Plan inexistente o inactivo');
    }

    if (!prospect.rut || !prospect.nombreCompleto || !prospect.telefono) {
      throw new BadRequestException('El prospecto no tiene datos suficientes para registrar el contrato');
    }

    if (prospect.idCliente) {
      throw new BadRequestException('El prospecto ya pertenece al flujo historico de clientes');
    }

    if (prospect.estadoPipeline === NOT_FEASIBLE_PIPELINE_STATUS) {
      throw new BadRequestException('No se puede confirmar la contratacion de un prospecto no factible');
    }

    if (prospect.estadoPipeline === LOST_PIPELINE_STATUS) {
      throw new BadRequestException('No se puede confirmar la contratacion de un prospecto perdido');
    }

    const quote = await this.prisma.cotizacion.findFirst({
      where: {
        idProspecto,
        idPlan: dto.planId,
        factibilidadVerificada: true,
        fechaEnvio: { not: null },
      },
      orderBy: { idCotizacion: 'desc' },
    });

    if (!quote) {
      throw new BadRequestException('Debe generar una cotizacion factible para el plan antes de confirmar la contratacion');
    }

    if (prospect.latitud == null || prospect.longitud == null) {
      throw new BadRequestException('El prospecto debe tener una ubicacion valida antes de contratar');
    }
    const commercial = await this.coverageService.plansForLocation(prospect.idEmpresa ?? 0,
      { latitud: prospect.latitud, longitud: prospect.longitud }, currentUser);
    const availablePlan = commercial.planes.find(plan => plan.idPlan === dto.planId);
    if (!commercial.coberturaComercial || !availablePlan) {
      throw new BadRequestException('El plan no esta disponible para la ubicacion del prospecto');
    }

    // Select the zone that provides this plan's actual applicable price.
    // A parent-zone price must not be replaced by a microzone without a plan rule.
    // Explicit authorized consumers retain their existing zone contract.
    const contractZoneId = dto.idZonaPago ?? (availablePlan.origenPrecio === 'ZONA_PADRE'
      ? commercial.zona?.idZonaPago
      : commercial.microzona?.idZonaPago ?? commercial.zona?.idZonaPago);
    if (contractZoneId) {
      const zone = await this.prisma.zonaPago.findUnique({ where: { idZonaPago: contractZoneId } });

      if (!zone || zone.activo === false) {
        throw new BadRequestException('Zona de pago inexistente o inactiva');
      }

      if (zone.idEmpresa && prospect.idEmpresa && zone.idEmpresa !== prospect.idEmpresa) {
        throw new BadRequestException('La zona de pago no pertenece a la empresa del prospecto');
      }
    }

    const fechaInicio = this.parseOptionalDate(dto.fechaInicio, 'fechaInicio') ?? new Date(todayDateOnly());
    const fechaGeneracionContrato = this.parseOptionalDate(dto.fechaGeneracionContrato, 'fechaGeneracionContrato');
    const fechaEnvioCliente = this.parseOptionalDate(dto.fechaEnvioCliente, 'fechaEnvioCliente');
    const direccionInstalacion = prospect.direccion?.trim() || undefined;

    const result = await this.contractsService.registerWithDigitalContract(currentUser, async (tx) => {
      // Serialize confirmations of the same prospect; a pending contract is reused.
      await tx.$queryRaw`SELECT id_prospecto FROM prospecto WHERE id_prospecto = ${idProspecto} FOR UPDATE`;
      const current = await tx.prospecto.findUniqueOrThrow({ where: { idProspecto } });
      // Coverage was checked outside this transaction. Never use it for a moved
      // prospect or overwrite a loss/activation committed while acquiring the lock.
      if (current.idEmpresa !== prospect.idEmpresa || current.idCliente != null
        || [NOT_FEASIBLE_PIPELINE_STATUS, LOST_PIPELINE_STATUS].includes(current.estadoPipeline ?? '')
        || current.latitud !== prospect.latitud || current.longitud !== prospect.longitud
        || current.idZonaPago !== prospect.idZonaPago
        || current.direccion !== prospect.direccion || current.rut !== prospect.rut
        || current.nombreCompleto !== prospect.nombreCompleto || current.telefono !== prospect.telefono
        || current.comuna !== prospect.comuna) {
        throw new ConflictException('El prospecto cambio durante la confirmacion; vuelve a consultar ubicacion y estado');
      }
      const currentPlan = await tx.plan.findUnique({ where: { idPlan: dto.planId } });
      const currentQuote = await tx.cotizacion.findFirst({
        where: { idProspecto, idPlan: dto.planId, factibilidadVerificada: true, fechaEnvio: { not: null } },
      });
      if (!currentPlan || currentPlan.activo === false || currentPlan.idEmpresa !== current.idEmpresa || !currentQuote) {
        throw new ConflictException('El plan o la cotizacion cambio durante la confirmacion; vuelve a consultar');
      }
      await assertNoContractDebt(tx, { idEmpresa: current.idEmpresa, rut: current.rut, idProspecto, idUsuario: currentUser.idUsuario });
      const contractData = {
        idCliente: null,
        idProspecto,
        idPlan: dto.planId,
        idEmpresa: prospect.idEmpresa,
        idZonaPago: contractZoneId,
        fechaInicio,
        diaVencimiento: dto.diaVencimiento ?? PENDING_SIGNATURE_DUE_DAY,
        estado: PENDING_SIGNATURE_STATUS,
        proveedorContrato: dto.proveedorContrato?.trim() || undefined,
        numeroContratoExterno: dto.numeroContratoExterno?.trim() || undefined,
        folioContratoExterno: dto.folioContratoExterno?.trim() || undefined,
        urlContratoPdf: dto.urlContratoPdf?.trim() || undefined,
        fechaGeneracionContrato,
        fechaEnvioCliente,
        observacionContrato: dto.observacionContrato?.trim() || undefined,
        direccionInstalacion,
        comunaInstalacion: dto.comuna?.trim() || current.comuna?.trim() || undefined,
        ciudadInstalacion: dto.ciudad?.trim() || undefined,
      };

      let existingContract = await tx.contrato.findFirst({
        where: {
          idProspecto,
          idEmpresa: prospect.idEmpresa,
        },
        orderBy: { idContrato: 'desc' },
      });

      if (existingContract) {
        // Signing locks the contract before updating its prospect. Waiting here
        // would invert that order and deadlock. Abort safely and let signing finish.
        try {
          await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${existingContract.idContrato} FOR UPDATE NOWAIT`;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && error.meta?.code === '55P03') {
            throw new ConflictException('El contrato esta siendo actualizado; vuelve a consultar antes de confirmar');
          }
          throw error;
        }
        existingContract = await tx.contrato.findFirst({ where: { idContrato: existingContract.idContrato } });
        if (!existingContract || existingContract.idEmpresa !== current.idEmpresa || existingContract.idProspecto !== idProspecto) {
          throw new ConflictException('Las relaciones del contrato cambiaron durante la confirmacion');
        }
      }
      if (existingContract && ![PENDING_SIGNATURE_STATUS, 'Pendiente'].includes(existingContract.estado ?? '')) {
        throw new ConflictException('El prospecto ya tiene un contrato confirmado; no se puede duplicar');
      }

      const contrato = existingContract
        ? await tx.contrato.update({
            where: { idContrato: existingContract.idContrato, idEmpresa: current.idEmpresa, idProspecto,
              estado: { in: [PENDING_SIGNATURE_STATUS, 'Pendiente'] } },
            data: contractData,
          }).catch((error: unknown) => this.rethrowConcurrentChange(error))
        : await tx.contrato.create({ data: contractData });

      const updatedProspect = await tx.prospecto.update({
        where: { idProspecto },
        data: {
          estadoPipeline: PENDING_SIGNATURE_PIPELINE_STATUS,
          ...(!current.idPlanInteres ? { idPlanInteres: dto.planId } : {}),
        },
        include: { empresa: true },
      });

      const reuseDocument = existingContract?.estado === PENDING_SIGNATURE_STATUS
        && existingContract.idPlan === contrato.idPlan
        && existingContract.idZonaPago === contrato.idZonaPago
        && existingContract.diaVencimiento === contrato.diaVencimiento
        && existingContract.direccionInstalacion === contrato.direccionInstalacion;
      return { result: { contrato, prospecto: updatedProspect, direccionInstalacion }, reuseDocument };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'GENERAR_CONTRATO_PROSPECTO',
      entidadAfectada: 'contrato',
      idEntidadAfectada: result.contrato.idContrato,
      valorNuevo: {
        idProspecto,
        idPlan: dto.planId,
        idZonaPago: contractZoneId ?? null,
        estadoContrato: PENDING_SIGNATURE_STATUS,
        estadoProspecto: PENDING_SIGNATURE_PIPELINE_STATUS,
        fechaConfirmacion: fechaInicio,
        direccionInstalacion,
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

  async installDayAvailability(idProspecto: number, dto: InstallDayAvailabilityDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    await this.validateInstallOrderPreconditions(prospect);
    this.validateInstallDate(dto.fechaProgramada);

    const availability = await this.buildInstallAvailability(
      prospect.idEmpresa,
      dto.fechaProgramada,
      ALTERNATIVE_VISIT_TIMES[0],
    );

    return { fechaProgramada: dto.fechaProgramada, horarios: availability.horarios };
  }

  async createInstallOrder(idProspecto: number, dto: CreateInstallOrderDto, currentUser: AuthUser) {
    const prospect = await this.getProspectOrThrow(idProspecto, currentUser);
    const scheduledDate = this.validateInstallSchedule(dto.fechaProgramada, dto.horaVisita);

    const contract = await this.validateInstallOrderPreconditions(prospect);

    const idCliente = prospect.idCliente;
    const idEmpresa = prospect.idEmpresa;

    if (!idEmpresa) {
      throw new BadRequestException('La orden requiere una empresa asociada');
    }

    const installationAddress = contract.direccionInstalacion?.trim() || prospect.direccion?.trim();

    if (!installationAddress) {
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
      let direccion = null;
      let servicio = null;

      if (idCliente) {
        direccion = await tx.direccionServicio.findFirst({
          where: { idCliente, esPrincipal: true },
        });

        if (!direccion) {
          direccion = await tx.direccionServicio.create({
            data: {
              idCliente,
              direccionCompleta: installationAddress,
              comuna: contract.comunaInstalacion?.trim() || 'Por confirmar',
              ciudad: contract.ciudadInstalacion?.trim() || 'Por confirmar',
              esPrincipal: true,
            },
          });
        }

        servicio = await tx.servicioContratado.findFirst({
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
      }

      const createdOrder = await tx.ordenTrabajo.create({
        data: {
          idEmpresa,
          idCliente,
          idProspecto,
          idTecnico: dto.idTecnico,
          idDireccion: direccion?.idDireccion,
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
      const orden = await tx.ordenTrabajo.update({
        where: { idOt: createdOrder.idOt },
        data: { codigoSeguimiento: generateWorkOrderCode(createdOrder.tipoOt, createdOrder.idOt) },
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
        codigoSeguimiento: result.orden.codigoSeguimiento,
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

    const isLegacyReady = Boolean(prospect.idCliente) && prospect.estadoPipeline === 'Aceptado';
    const isPendingActivation = !prospect.idCliente
      && ['Pendiente activacion', 'Instalacion Programada'].includes(prospect.estadoPipeline ?? '');

    if (!isLegacyReady && !isPendingActivation) {
      throw new BadRequestException(
        'La orden requiere un prospecto con contrato firmado pendiente de instalacion',
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
          OR: [
            { idProspecto: prospect.idProspecto },
            ...(prospect.idCliente ? [{ idCliente: prospect.idCliente }] : []),
          ],
          idEmpresa: prospect.idEmpresa,
          estado: { in: ['Firmado', 'Activo', 'Pendiente'] },
        },
        orderBy: { idContrato: 'desc' },
      }),
      this.prisma.ordenTrabajo.findFirst({
        where: {
          idEmpresa: prospect.idEmpresa,
          tipoOt: 'Instalacion',
          estado: { notIn: CLOSED_INSTALL_ORDER_STATES },
          OR: [
            { idProspecto: prospect.idProspecto },
            ...(prospect.idCliente ? [{ idCliente: prospect.idCliente }] : []),
          ],
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
      throw new BadRequestException('El prospecto ya tiene una orden de instalacion pendiente');
    }

    return contract;
  }

  private validateInstallDate(dateValue: string) {
    const scheduledDate = parseDateOnly(dateValue);
    const today = todayDateOnly();
    const latestScheduledDate = addYearsToDateOnly(today, 1);

    if (!scheduledDate) {
      throw new BadRequestException('La fecha programada no es una fecha calendario valida');
    }

    if (dateValue < today) {
      throw new BadRequestException('La fecha programada no puede ser anterior a hoy');
    }

    if (dateValue > latestScheduledDate) {
      throw new BadRequestException('La fecha programada no puede superar un ano desde hoy');
    }

    return scheduledDate;
  }

  private validateInstallSchedule(dateValue: string, timeValue: string) {
    const scheduledDate = this.validateInstallDate(dateValue);

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
      throw new BadRequestException('La hora de visita no tiene un formato valido');
    }

    if (dateValue === todayDateOnly() && timeValue <= this.currentChileTime()) {
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
        horarios: ALTERNATIVE_VISIT_TIMES.map((horaVisita) => ({
          horaVisita,
          disponible: false,
          motivo: 'No hay técnicos activos para esta empresa',
          tecnicosDisponibles: [],
        })),
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
    const horarios = ALTERNATIVE_VISIT_TIMES.map((horaVisita) => {
      const pasado = requestedDate === todayDateOnly() && horaVisita <= this.currentChileTime();
      const tecnicosDisponibles = pasado ? [] : availableAt(requestedDate, horaVisita);

      return {
        horaVisita,
        disponible: tecnicosDisponibles.length > 0,
        motivo: pasado
          ? 'Horario ya pasado'
          : tecnicosDisponibles.length
            ? `${tecnicosDisponibles.length} técnico(s) disponible(s)`
            : 'Horario ocupado',
        tecnicosDisponibles,
      };
    });
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
      horarios,
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
    codigo: string | null;
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

      doc.fontSize(18).text('Cotización de servicio', { align: 'center' });
      if (quote.codigo) doc.fontSize(11).text(quote.codigo, { align: 'center' });
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
      if (quote.fechaEnvio) doc.text(`Fecha y hora de emisión: ${QUOTE_DATE_FORMAT.format(quote.fechaEnvio)} (Chile)`);
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
    this.companyScope(currentUser, 'consolidado');
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
    const manualStatuses = PIPELINE_STATUSES.slice(0, 3);
    if (!manualStatuses.includes(nextStatus)) {
      throw new BadRequestException('Esta etapa requiere su operacion autorizada; no se permite mediante el pipeline manual');
    }

    if (currentStatus === LOST_PIPELINE_STATUS) {
      if (nextStatus !== INITIAL_PIPELINE_STATUS) {
        throw new BadRequestException('Un prospecto perdido solo puede reactivarse como Prospecto Nuevo');
      }
      return;
    }
    if (!manualStatuses.includes(currentStatus)) {
      throw new BadRequestException('El estado actual requiere una operacion especializada o revision historica');
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

  private manualChangeWhere(idProspecto: number, estadoPipeline: string | null, idEmpresa: number | null): Prisma.ProspectoWhereUniqueInput {
    return {
      idProspecto,
      idEmpresa,
      estadoPipeline,
      idCliente: null,
      contratos: {
        none: { estado: { notIn: ['Baja', 'Anulado'] } },
      },
    };
  }

  private async assertManualCommercialChange(prospect: { idProspecto: number; idCliente: number | null }) {
    if (prospect.idCliente != null || await this.prisma.contrato.findFirst({
      where: {
        idProspecto: prospect.idProspecto,
        estado: { notIn: ['Baja', 'Anulado'] },
      },
      select: { idContrato: true },
    })) {
      throw new BadRequestException('El prospecto tiene relaciones comerciales; utilice la operacion contractual correspondiente');
    }
  }

  private rethrowConcurrentChange(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new ConflictException('El prospecto cambio durante la operacion; vuelva a consultar su estado');
    }
    throw error;
  }

  private parseOptionalDate(value: string | undefined, fieldName: string) {
    if (!value?.trim()) {
      return undefined;
    }

    const parsed = parseDateOnly(value);

    if (!parsed) {
      throw new BadRequestException(`${fieldName} no es una fecha calendario valida`);
    }

    return parsed;
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
