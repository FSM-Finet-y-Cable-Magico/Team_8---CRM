import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateRequestFeasibilityDto } from './dto/update-request-feasibility.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';

const REQUEST_INCLUDE = {
  cliente: true,
  servicio: { include: { contrato: { include: { plan: true } }, direccion: true } },
  empresa: true,
  usuarioRegistro: { select: { idUsuario: true, nombreCompleto: true, email: true } },
} satisfies Prisma.SolicitudClienteInclude;

const CLOSED_REQUEST_STATES = ['Cerrada', 'No Factible', 'Cancelada'];

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(currentUser: AuthUser, scope = 'consolidado') {
    return this.prisma.solicitudCliente.findMany({
      where: this.companyScope(currentUser, scope),
      include: REQUEST_INCLUDE,
      orderBy: { fechaCreacion: 'desc' },
      take: 150,
    });
  }

  async listByCustomer(idCliente: number, currentUser: AuthUser) {
    await this.getCustomerOrThrow(idCliente, currentUser);

    return this.prisma.solicitudCliente.findMany({
      where: { idCliente, ...this.companyScope(currentUser, 'consolidado') },
      include: REQUEST_INCLUDE,
      orderBy: { fechaCreacion: 'desc' },
      take: 100,
    });
  }

  async create(dto: CreateCustomerRequestDto, currentUser: AuthUser) {
    const resolved = await this.resolveContext(dto, currentUser);
    const created = await this.prisma.solicitudCliente.create({
      data: {
        idCliente: resolved.idCliente,
        idProspecto: dto.idProspecto,
        idServicio: resolved.idServicio,
        idEmpresa: resolved.idEmpresa,
        tipoSolicitud: dto.tipoSolicitud.trim(),
        canalOrigen: dto.canalOrigen?.trim() || 'CRM',
        estado: dto.estado ?? (dto.factible === false ? 'No Factible' : 'Abierta'),
        factible: dto.factible,
        motivoNoFactible: dto.motivoNoFactible?.trim() || null,
        descripcion: dto.descripcion?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        idUsuarioRegistro: currentUser.idUsuario,
        fechaCreacion: new Date(),
        fechaCierre: dto.estado && CLOSED_REQUEST_STATES.includes(dto.estado) ? new Date() : null,
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_SOLICITUD_CLIENTE',
      entidadAfectada: 'solicitud_cliente',
      idEntidadAfectada: created.idSolicitud,
      valorNuevo: {
        idSolicitud: created.idSolicitud,
        idCliente: created.idCliente,
        idServicio: created.idServicio,
        idEmpresa: created.idEmpresa,
        tipoSolicitud: created.tipoSolicitud,
        estado: created.estado,
      },
    });

    return created;
  }

  async updateStatus(idSolicitud: number, dto: UpdateRequestStatusDto, currentUser: AuthUser) {
    const request = await this.getRequestOrThrow(idSolicitud, currentUser);
    const updated = await this.prisma.solicitudCliente.update({
      where: { idSolicitud },
      data: {
        estado: dto.estado,
        observaciones: dto.observaciones === undefined ? request.observaciones : dto.observaciones.trim() || null,
        fechaCierre: CLOSED_REQUEST_STATES.includes(dto.estado) ? new Date() : null,
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_SOLICITUD_CLIENTE',
      entidadAfectada: 'solicitud_cliente',
      idEntidadAfectada: idSolicitud,
      valorAnterior: { estado: request.estado, observaciones: request.observaciones },
      valorNuevo: { estado: updated.estado, observaciones: updated.observaciones },
    });

    return updated;
  }

  async updateFeasibility(idSolicitud: number, dto: UpdateRequestFeasibilityDto, currentUser: AuthUser) {
    const request = await this.getRequestOrThrow(idSolicitud, currentUser);
    const nextState = dto.factible ? request.estado : 'No Factible';
    const updated = await this.prisma.solicitudCliente.update({
      where: { idSolicitud },
      data: {
        factible: dto.factible,
        motivoNoFactible: dto.factible ? null : dto.motivoNoFactible?.trim() || 'No especificado',
        observaciones: dto.observaciones === undefined ? request.observaciones : dto.observaciones.trim() || null,
        estado: nextState,
        fechaCierre: dto.factible ? request.fechaCierre : new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_FACTIBILIDAD_SOLICITUD_CLIENTE',
      entidadAfectada: 'solicitud_cliente',
      idEntidadAfectada: idSolicitud,
      valorAnterior: {
        factible: request.factible,
        motivoNoFactible: request.motivoNoFactible,
        estado: request.estado,
      },
      valorNuevo: {
        factible: updated.factible,
        motivoNoFactible: updated.motivoNoFactible,
        estado: updated.estado,
      },
    });

    return updated;
  }

  private async resolveContext(dto: CreateCustomerRequestDto, currentUser: AuthUser) {
    let idEmpresa = isAdministrator(currentUser.roles) ? dto.idEmpresa : currentUser.idEmpresa ?? undefined;
    let idCliente = dto.idCliente;
    let idServicio = dto.idServicio;

    if (dto.idServicio) {
      const service = await this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } });

      if (!service) {
        throw new BadRequestException('El servicio asociado no existe');
      }

      this.assertCompanyAccess(service.idEmpresa, currentUser);
      idEmpresa = idEmpresa ?? service.idEmpresa ?? undefined;
      idCliente = idCliente ?? service.idCliente;
      idServicio = service.idServicio;
    }

    if (dto.idCliente) {
      const customer = await this.getCustomerOrThrow(dto.idCliente, currentUser);
      idEmpresa = idEmpresa ?? customer.idEmpresa ?? undefined;
    }

    if (dto.idProspecto) {
      const prospect = await this.prisma.prospecto.findUnique({ where: { idProspecto: dto.idProspecto } });

      if (!prospect) {
        throw new BadRequestException('El prospecto asociado no existe');
      }

      this.assertCompanyAccess(prospect.idEmpresa, currentUser);
      idEmpresa = idEmpresa ?? prospect.idEmpresa ?? undefined;
      idCliente = idCliente ?? prospect.idCliente ?? undefined;
    }

    if (!idEmpresa) {
      throw new BadRequestException('Debe existir una empresa asociada a la solicitud');
    }

    this.assertCompanyAccess(idEmpresa, currentUser);

    return { idEmpresa, idCliente, idServicio };
  }

  private async getRequestOrThrow(idSolicitud: number, currentUser: AuthUser) {
    const request = await this.prisma.solicitudCliente.findUnique({
      where: { idSolicitud },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    this.assertCompanyAccess(request.idEmpresa, currentUser);

    return request;
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (
      !isAdministrator(currentUser.roles) &&
      customer.idEmpresa !== currentUser.idEmpresa &&
      !customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa)
    ) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return customer;
  }

  private companyScope(currentUser: AuthUser, scope: string): Prisma.SolicitudClienteWhereInput {
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

  private assertCompanyAccess(idEmpresa: number | null | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }
}
