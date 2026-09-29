import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import {
  G1_INVENTORY_CLIENT,
  G1IntegrationError,
  G1InventoryClient,
  isOfficialG1PhysicalState,
} from './g1-integration.types';

@Injectable()
export class G1InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(G1_INVENTORY_CLIENT) private readonly client: G1InventoryClient,
  ) {}

  async equipmentTypes(
    currentUser: AuthUser,
    query: { idEmpresa?: number; categoria?: string; buscar?: string; activo?: boolean },
  ) {
    const idEmpresa = this.companyId(currentUser, query.idEmpresa);
    try {
      const result = await this.client.getEquipmentTypes({
        idEmpresa,
        categoria: query.categoria?.trim() || undefined,
        buscar: query.buscar?.trim() || undefined,
        activo: query.activo,
      });
      await this.audit.record({
        idUsuario: currentUser.idUsuario,
        accion: 'CONSULTAR_TIPO_EQUIPO_G1',
        entidadAfectada: 'integracion_g1',
        valorNuevo: { idEmpresa, statusHttp: result.status, duracionMs: result.durationMs, cantidad: result.data.length },
      });
      return { fuente: 'G1', estadoContrato: 'PENDIENTE_DESPLIEGUE_G1', data: result.data };
    } catch (error) {
      throw this.httpError(error);
    }
  }

  async unitBySerial(serialInput: string, currentUser: AuthUser, requestedCompanyId?: number) {
    const idEmpresa = this.companyId(currentUser, requestedCompanyId);
    const serial = serialInput.trim();
    if (!serial) throw new BadRequestException('El número de serie es obligatorio.');
    try {
      const result = await this.client.getUnitBySerial(serial, idEmpresa);
      if (result.data.id_empresa !== idEmpresa) {
        throw new G1IntegrationError('G1_COMPANY_MISMATCH', 403, false, 'La unidad no pertenece a la empresa solicitada.');
      }
      await this.audit.record({
        idUsuario: currentUser.idUsuario,
        accion: 'CONSULTAR_UNIDAD_G1',
        entidadAfectada: 'integracion_g1',
        valorNuevo: { idEmpresa, numeroSerie: serial, statusHttp: result.status, duracionMs: result.durationMs },
      });
      return {
        fuente: 'G1',
        data: { ...result.data, estadoFisicoOficial: isOfficialG1PhysicalState(result.data.estado) },
      };
    } catch (error) {
      throw this.httpError(error);
    }
  }

  async equipmentByService(idServicio: number, currentUser: AuthUser) {
    const service = await this.prisma.servicioContratado.findUnique({ where: { idServicio } });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    const idEmpresa = this.companyId(currentUser, service.idEmpresa ?? undefined);
    if (service.idEmpresa !== idEmpresa) throw new NotFoundException('Servicio no encontrado.');
    try {
      const result = await this.client.getEquipmentByService(idServicio, idEmpresa);
      if (result.data.some((unit) => unit.id_empresa !== idEmpresa)) {
        throw new G1IntegrationError('G1_COMPANY_MISMATCH', 403, false, 'G1 devolvió equipos fuera del alcance de empresa.');
      }
      await this.audit.record({
        idUsuario: currentUser.idUsuario,
        accion: 'CONSULTAR_EQUIPOS_SERVICIO_G1',
        entidadAfectada: 'servicio_contratado',
        idEntidadAfectada: idServicio,
        valorNuevo: { idEmpresa, statusHttp: result.status, duracionMs: result.durationMs, cantidad: result.data.length },
      });
      return {
        fuente: 'G1',
        estadoContrato: 'PENDIENTE_DESPLIEGUE_G1',
        data: result.data.map((unit) => ({ ...unit, estadoFisicoOficial: isOfficialG1PhysicalState(unit.estado) })),
      };
    } catch (error) {
      throw this.httpError(error, 'PENDIENTE_INTEGRACION_G1');
    }
  }

  private companyId(currentUser: AuthUser, requested?: number) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requested ?? currentUser.idEmpresa;
      if (!idEmpresa) throw new BadRequestException('Debe indicar idEmpresa.');
      return idEmpresa;
    }
    if (!currentUser.idEmpresa) throw new ForbiddenException('El usuario no tiene empresa asociada.');
    if (requested && requested !== currentUser.idEmpresa) throw new NotFoundException('Recurso no encontrado.');
    return currentUser.idEmpresa;
  }

  private httpError(error: unknown, pendingCode?: string) {
    if (!(error instanceof G1IntegrationError)) return error;
    const status = error.status === 404 ? 404
      : error.status === 403 ? 403
        : error.status === 401 ? 502
          : error.status === 409 ? 409
            : error.status === 429 ? 503
              : 503;
    return new HttpException({
      statusCode: status,
      code: pendingCode ?? error.code,
      upstreamCode: error.code,
      message: error.message,
    }, status);
  }
}
