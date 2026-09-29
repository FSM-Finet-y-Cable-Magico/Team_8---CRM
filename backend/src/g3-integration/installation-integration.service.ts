import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { G3ClosureProcessor } from './g3-closure.processor';
import { RequestG3InstallationDto } from './g3-integration.dto';
import {
  G3InstallationPayload,
  G3IntegrationClient,
  G3IntegrationError,
  G3WorkOrderResponse,
  G3_INTEGRATION_CLIENT,
} from './g3-integration.types';
import { externalWorkOrderCode, externalWorkOrderId, normalizeG3State, sha256Payload } from './g3-integration.utils';

const ACTIVE_REQUEST_STATES = [
  'PENDIENTE_ENVIO',
  'ENVIADA',
  'EN_SEGUIMIENTO',
  'COMPLETADA',
  'FALLIDA_REINTENTABLE',
];

@Injectable()
export class InstallationIntegrationService {
  private readonly logger = new Logger(InstallationIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly closureProcessor: G3ClosureProcessor,
    @Inject(G3_INTEGRATION_CLIENT) private readonly client: G3IntegrationClient,
  ) {}

  async requestInstallation(dto: RequestG3InstallationDto, currentUser: AuthUser) {
    const context = await this.resolveContext(dto, currentUser);
    const existing = await this.prisma.integracionInstalacionG3.findFirst({
      where: {
        idContrato: context.contract.idContrato,
        ...(context.service ? { idServicio: context.service.idServicio } : {}),
        estadoIntegracion: { in: ACTIVE_REQUEST_STATES },
      },
      orderBy: { fechaSolicitud: 'desc' },
    });
    if (existing) return this.toView(existing);

    const requestId = randomUUID();
    const traceId = randomUUID();
    const payload = this.buildPayload(context, requestId, traceId);
    const payloadHash = sha256Payload(payload);
    const tracking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.integracionInstalacionG3.create({
        data: {
          idEmpresa: context.idEmpresa,
          idProspecto: context.prospect?.idProspecto,
          idCliente: context.customer?.idCliente,
          idContrato: context.contract.idContrato,
          idPlan: context.plan.idPlan,
          idServicio: context.service?.idServicio,
          requestId,
          traceId,
          payloadHash,
          payloadSnapshot: payload,
        },
      });
      if (context.prospect) {
        await tx.prospecto.update({
          where: { idProspecto: context.prospect.idProspecto },
          data: { estadoPipeline: 'Instalacion solicitada G3' },
        });
      }
      return created;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'SOLICITAR_INSTALACION_G3',
      entidadAfectada: 'integracion_instalacion_g3',
      idEntidadAfectada: tracking.idIntegracion,
      valorNuevo: this.auditContext(tracking),
    });
    return this.send(tracking, currentUser, false);
  }

  async retry(idIntegracion: number, currentUser: AuthUser) {
    const tracking = await this.getTrackingOrThrow(idIntegracion, currentUser);
    if (tracking.fechaCierreProcesado || tracking.estadoIntegracion === 'COMPLETADA') {
      throw new BadRequestException('La instalacion ya fue completada y no admite reintento');
    }
    if (tracking.estadoIntegracion === 'FALLIDA_DEFINITIVA') {
      throw new BadRequestException('El error requiere corregir el origen antes de crear una nueva solicitud');
    }
    const payload = tracking.payloadSnapshot as G3InstallationPayload;
    if (sha256Payload(payload) !== tracking.payloadHash || payload.request_id !== tracking.requestId) {
      throw new BadRequestException('El payload persistido no coincide con la solicitud original');
    }
    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REINTENTAR_INSTALACION_G3',
      entidadAfectada: 'integracion_instalacion_g3',
      idEntidadAfectada: tracking.idIntegracion,
      valorNuevo: this.auditContext(tracking),
    });
    return this.send(tracking, currentUser, true);
  }

  async detail(idIntegracion: number, currentUser: AuthUser) {
    const tracking = await this.getTrackingOrThrow(idIntegracion, currentUser);
    const externalId = tracking.idOtG3 ?? tracking.codigoOtG3;
    if (!externalId) return this.toView(tracking);
    try {
      const response = await this.client.getWorkOrder(externalId);
      this.validateResponseCompany(response.data, tracking.idEmpresa);
      const state = normalizeG3State(response.data.estado);
      const updated = await this.prisma.integracionInstalacionG3.update({
        where: { idIntegracion },
        data: {
          estadoIntegracion: state.known && state.state !== 'COMPLETADA' ? 'ENVIADA' : 'EN_SEGUIMIENTO',
          estadoOtG3: state.state,
          estadoOriginalG3: state.known ? null : state.original,
          fechaUltimaSincronizacion: new Date(),
          ultimoErrorSanitizado: state.known ? null : 'Estado G3 no reconocido; requiere seguimiento.',
        },
      });
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'CONSULTAR_OT_G3',
        entidadAfectada: 'integracion_instalacion_g3',
        idEntidadAfectada: idIntegracion,
        valorNuevo: { ...this.auditContext(updated), statusHttp: response.status, duracionMs: response.durationMs },
      });
      return this.toView(updated, response.data);
    } catch (error) {
      const failure = this.normalizeError(error);
      const updated = await this.prisma.integracionInstalacionG3.update({
        where: { idIntegracion },
        data: { ultimoErrorSanitizado: failure.message, fechaUltimaSincronizacion: new Date() },
      });
      return this.toView(updated);
    }
  }

  async reconcile(idIntegracion: number, currentUser: AuthUser) {
    const tracking = await this.getTrackingOrThrow(idIntegracion, currentUser);
    const externalId = tracking.idOtG3 ?? tracking.codigoOtG3;
    if (!externalId) throw new BadRequestException('La solicitud aun no tiene una referencia de OT G3');
    try {
      const response = await this.client.getWorkOrderClosure(externalId);
      this.validateResponseCompany(response.data, tracking.idEmpresa);
      if (!response.data.estado) {
        const updated = await this.prisma.integracionInstalacionG3.update({
          where: { idIntegracion },
          data: { fechaUltimaSincronizacion: new Date(), ultimoErrorSanitizado: null },
        });
        return { available: false, tracking: this.toView(updated) };
      }
      const result = await this.closureProcessor.process(
        response.data as G3WorkOrderResponse & { estado: string },
        'RECONCILIACION',
        tracking.idIntegracion,
      );
      return { available: true, result };
    } catch (error) {
      const failure = this.normalizeError(error);
      if (failure.status === 404) {
        const updated = await this.prisma.integracionInstalacionG3.update({
          where: { idIntegracion },
          data: { fechaUltimaSincronizacion: new Date(), ultimoErrorSanitizado: 'El cierre G3 aun no esta disponible.' },
        });
        return { available: false, tracking: this.toView(updated) };
      }
      await this.prisma.integracionInstalacionG3.update({
        where: { idIntegracion },
        data: { ultimoErrorSanitizado: failure.message, fechaUltimaSincronizacion: new Date() },
      });
      throw error;
    }
  }

  async latestForProspect(idProspecto: number, currentUser: AuthUser) {
    const prospect = await this.prisma.prospecto.findUnique({ where: { idProspecto } });
    if (!prospect) throw new NotFoundException('Prospecto no encontrado');
    this.assertCompanyAccess(prospect.idEmpresa, currentUser);
    const tracking = await this.prisma.integracionInstalacionG3.findFirst({
      where: { idProspecto },
      orderBy: { fechaSolicitud: 'desc' },
    });
    return tracking ? this.toView(tracking) : null;
  }

  async latestForContract(idContrato: number, currentUser: AuthUser) {
    const contract = await this.prisma.contrato.findUnique({ where: { idContrato } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    this.assertCompanyAccess(contract.idEmpresa, currentUser);
    const tracking = await this.prisma.integracionInstalacionG3.findFirst({
      where: { idContrato },
      orderBy: { fechaSolicitud: 'desc' },
    });
    return tracking ? this.toView(tracking) : null;
  }

  private async send(
    tracking: Awaited<ReturnType<InstallationIntegrationService['getTrackingOrThrow']>>,
    currentUser: AuthUser,
    retry: boolean,
  ) {
    const payload = tracking.payloadSnapshot as G3InstallationPayload;
    const attemptAt = new Date();
    await this.prisma.integracionInstalacionG3.update({
      where: { idIntegracion: tracking.idIntegracion },
      data: { ultimoIntento: attemptAt, intentos: { increment: 1 }, ultimoErrorSanitizado: null },
    });
    try {
      const response = await this.client.createInstallation(payload);
      this.validateResponseCompany(response.data, tracking.idEmpresa);
      if (response.data.request_id && response.data.request_id !== tracking.requestId) {
        throw new G3IntegrationError('G3_CORRELACION_INVALIDA', 409, false, 'G3 respondio con un request_id diferente.');
      }
      const idOtG3 = externalWorkOrderId(response.data as Record<string, unknown>);
      const codigoOtG3 = externalWorkOrderCode(response.data as Record<string, unknown>);
      if (!idOtG3 && !codigoOtG3) {
        throw new G3IntegrationError('G3_RESPUESTA_INVALIDA', 502, true, 'G3 no entrego una referencia de orden.');
      }
      const state = normalizeG3State(response.data.estado ?? 'PENDIENTE');
      const updated = await this.prisma.integracionInstalacionG3.update({
        where: { idIntegracion: tracking.idIntegracion },
        data: {
          idOtG3,
          codigoOtG3,
          estadoIntegracion: state.known && state.state !== 'COMPLETADA' ? 'ENVIADA' : 'EN_SEGUIMIENTO',
          estadoOtG3: state.state,
          estadoOriginalG3: state.known ? null : state.original,
          fechaUltimaSincronizacion: new Date(),
          ultimoErrorSanitizado: state.known ? null : 'Estado G3 no reconocido; requiere seguimiento.',
        },
      });
      if (tracking.idProspecto) {
        await this.prisma.prospecto.update({
          where: { idProspecto: tracking.idProspecto },
          data: { estadoPipeline: this.pipelineState(state.state) },
        });
      }
      this.logger.log(JSON.stringify({
        result: 'accepted', requestId: tracking.requestId, traceId: tracking.traceId,
        idEmpresa: tracking.idEmpresa, idProspecto: tracking.idProspecto,
        idContrato: tracking.idContrato, idOtG3, statusHttp: response.status, durationMs: response.durationMs,
      }));
      await this.auditService.record({
        idUsuario: currentUser.idUsuario,
        accion: 'INSTALACION_G3_ACEPTADA',
        entidadAfectada: 'integracion_instalacion_g3',
        idEntidadAfectada: updated.idIntegracion,
        valorNuevo: {
          ...this.auditContext(updated), statusHttp: response.status,
          duplicado: response.status === 200 || response.data.duplicado === true,
          retry,
        },
      });
      return this.toView(updated, response.data);
    } catch (error) {
      const failure = this.normalizeError(error);
      const updated = await this.prisma.integracionInstalacionG3.update({
        where: { idIntegracion: tracking.idIntegracion },
        data: {
          estadoIntegracion: failure.retryable ? 'FALLIDA_REINTENTABLE' : 'FALLIDA_DEFINITIVA',
          ultimoErrorSanitizado: failure.message,
        },
      });
      this.logger.warn(JSON.stringify({
        result: failure.code, requestId: tracking.requestId, traceId: tracking.traceId,
        idEmpresa: tracking.idEmpresa, idProspecto: tracking.idProspecto,
        idContrato: tracking.idContrato, statusHttp: failure.status,
      }));
      return this.toView(updated);
    }
  }

  private async resolveContext(dto: RequestG3InstallationDto, currentUser: AuthUser) {
    if (!dto.idProspecto && !dto.idContrato && !dto.idServicio) {
      throw new BadRequestException('Indica prospecto, contrato o servicio para solicitar la instalacion');
    }
    const service = dto.idServicio
      ? await this.prisma.servicioContratado.findUnique({
        where: { idServicio: dto.idServicio },
        include: { cliente: { include: { direcciones: true } }, direccion: true },
      })
      : null;
    if (dto.idServicio && !service) throw new NotFoundException('Servicio contratado no encontrado');

    const contractId = dto.idContrato ?? service?.idContrato;
    const contract = contractId
      ? await this.prisma.contrato.findUnique({
        where: { idContrato: contractId },
        include: { plan: true, prospecto: true, cliente: { include: { direcciones: true } } },
      })
      : dto.idProspecto
        ? await this.prisma.contrato.findFirst({
          where: { idProspecto: dto.idProspecto, estado: { in: ['Firmado', 'Activo'] } },
          include: { plan: true, prospecto: true, cliente: { include: { direcciones: true } } },
          orderBy: { idContrato: 'desc' },
        })
        : null;
    if (!contract) throw new BadRequestException('No existe un contrato firmado para solicitar la instalacion');
    if (!['Firmado', 'Activo'].includes(contract.estado)) {
      throw new BadRequestException('El contrato debe estar firmado antes de solicitar la instalacion');
    }
    if (dto.idProspecto && contract.idProspecto !== dto.idProspecto) {
      throw new BadRequestException('El contrato no corresponde al prospecto indicado');
    }
    if (service && service.idContrato !== contract.idContrato) {
      throw new BadRequestException('El servicio no corresponde al contrato indicado');
    }
    if (!contract.plan || !contract.idPlan) throw new BadRequestException('El contrato no tiene un plan valido');
    const idEmpresa = contract.idEmpresa;
    if (!idEmpresa) throw new BadRequestException('El contrato no tiene empresa asociada');
    this.assertCompanyAccess(idEmpresa, currentUser);
    if (contract.plan.idEmpresa !== idEmpresa
      || (contract.prospecto && contract.prospecto.idEmpresa !== idEmpresa)
      || (service && service.idEmpresa !== idEmpresa)
      || (contract.cliente && contract.cliente.idEmpresa !== idEmpresa)) {
      throw new BadRequestException('La instalacion contiene referencias cruzadas entre empresas');
    }
    if (contract.prospecto) {
      const feasible = await this.prisma.cotizacion.findFirst({
        where: {
          idProspecto: contract.prospecto.idProspecto,
          idPlan: contract.idPlan,
          factibilidadVerificada: true,
        },
      });
      if (!feasible) throw new BadRequestException('La instalacion requiere factibilidad verificada para el plan contratado');
    }

    const prospect = contract.prospecto;
    const customer = contract.cliente ?? service?.cliente ?? null;
    const rutResult = validateRut(prospect?.rut ?? customer?.rut ?? '');
    if (!rutResult.valid || !rutResult.normalized) throw new BadRequestException(rutResult.reason ?? 'RUT invalido');
    const name = prospect?.nombreCompleto?.trim() || customer?.nombreCompleto?.trim();
    if (!name) throw new BadRequestException('La instalacion requiere nombre completo');
    const phone = this.normalizePhone(prospect?.telefono ?? customer?.telefono);
    const address = contract.direccionInstalacion?.trim()
      || prospect?.direccion?.trim()
      || service?.direccion?.direccionCompleta?.trim()
      || customer?.direcciones.find((item) => item.esPrincipal)?.direccionCompleta?.trim()
      || customer?.direcciones[0]?.direccionCompleta?.trim();
    const comuna = contract.comunaInstalacion?.trim()
      || prospect?.comuna?.trim()
      || service?.direccion?.comuna?.trim()
      || customer?.direcciones.find((item) => item.direccionCompleta === address)?.comuna?.trim();
    if (!address) throw new BadRequestException('La instalacion requiere direccion completa');
    if (!comuna) throw new BadRequestException('La instalacion requiere comuna');
    return { idEmpresa, contract, plan: contract.plan, prospect, customer, service, rut: rutResult.normalized, name, phone, address, comuna };
  }

  private buildPayload(
    context: Awaited<ReturnType<InstallationIntegrationService['resolveContext']>>,
    requestId: string,
    traceId: string,
  ): G3InstallationPayload {
    return {
      request_id: requestId,
      trace_id: traceId,
      id_empresa: context.idEmpresa,
      ...(context.prospect ? { id_prospecto: context.prospect.idProspecto } : {}),
      id_contrato: context.contract.idContrato,
      id_plan: context.plan.idPlan,
      rut: context.rut,
      persona: { nombre_completo: context.name, telefono: context.phone },
      direccion: { direccion_completa: context.address, comuna: context.comuna },
    };
  }

  private normalizePhone(value: string | null | undefined) {
    const compact = (value ?? '').replace(/[\s().-]/g, '');
    const normalized = compact.startsWith('+') ? compact : compact.startsWith('56') ? `+${compact}` : compact.length === 9 ? `+56${compact}` : compact;
    if (!/^\+569\d{8}$/.test(normalized)) {
      throw new BadRequestException('El telefono debe ser un movil chileno valido en formato E.164 (+569XXXXXXXX)');
    }
    return normalized;
  }

  private async getTrackingOrThrow(idIntegracion: number, currentUser: AuthUser) {
    const tracking = await this.prisma.integracionInstalacionG3.findUnique({ where: { idIntegracion } });
    if (!tracking) throw new NotFoundException('Tracking de instalacion no encontrado');
    this.assertCompanyAccess(tracking.idEmpresa, currentUser);
    return tracking;
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles) && (!currentUser.idEmpresa || currentUser.idEmpresa !== idEmpresa)) {
      throw new ForbiddenException('El registro no pertenece a tu empresa');
    }
  }

  private validateResponseCompany(response: G3WorkOrderResponse, idEmpresa: number) {
    if (response.id_empresa !== undefined && response.id_empresa !== idEmpresa) {
      throw new G3IntegrationError('G3_SCOPE_EMPRESA_INVALIDO', 403, false, 'G3 respondio con una empresa diferente.');
    }
  }

  private normalizeError(error: unknown) {
    if (error instanceof G3IntegrationError) return error;
    if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
    return new G3IntegrationError('G3_ERROR_INESPERADO', null, true, 'No fue posible completar la comunicacion con G3.');
  }

  private pipelineState(state: string) {
    if (state === 'CANCELADA') return 'Seguimiento comercial';
    if (state === 'PENDIENTE_CLIENTE_AUSENTE') return 'Cliente ausente';
    if (state === 'EN_SEGUIMIENTO') return 'Instalacion en seguimiento';
    return 'Instalacion en G3';
  }

  private auditContext(tracking: { requestId: string; traceId: string; idEmpresa: number; idProspecto: number | null; idContrato: number; idOtG3: string | null }) {
    return {
      requestId: tracking.requestId,
      traceId: tracking.traceId,
      idEmpresa: tracking.idEmpresa,
      idProspecto: tracking.idProspecto,
      idContrato: tracking.idContrato,
      idOtG3: tracking.idOtG3,
    };
  }

  private toView(tracking: Record<string, unknown>, detail?: G3WorkOrderResponse) {
    const { payloadSnapshot: _payloadSnapshot, payloadHash: _payloadHash, ...safeTracking } = tracking;
    return {
      ...safeTracking,
      fuente: 'G3',
      estadoPresentacion: normalizeG3State(detail?.estado ?? tracking.estadoOtG3).state,
      detalle: detail ? {
        idOtG3: externalWorkOrderId(detail as Record<string, unknown>),
        codigoOtG3: externalWorkOrderCode(detail as Record<string, unknown>),
        tipo: detail.tipo ?? null,
        estado: normalizeG3State(detail.estado).state,
        estadoOriginalG3: normalizeG3State(detail.estado).known ? null : normalizeG3State(detail.estado).original,
        fecha: detail.fecha ?? null,
        tecnico: detail.tecnico ?? null,
        direccion: detail.direccion ?? null,
        persona: detail.persona ?? null,
        telefono: detail.telefono ?? null,
        resultado: detail.resultado_tecnico ?? detail.resultado ?? null,
      } : null,
    };
  }
}
