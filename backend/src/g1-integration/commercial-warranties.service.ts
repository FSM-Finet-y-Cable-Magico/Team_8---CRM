import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialWarrantyQueryDto, SaveCommercialWarrantyDto } from './g1-integration.dto';
import { G1_INVENTORY_CLIENT, G1IntegrationError, G1InventoryClient } from './g1-integration.types';

@Injectable()
export class CommercialWarrantiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(G1_INVENTORY_CLIENT) private readonly g1: G1InventoryClient,
  ) {}

  async list(query: CommercialWarrantyQueryDto, currentUser: AuthUser) {
    const idEmpresa = this.companyId(currentUser);
    return this.prisma.garantiaComercial.findMany({
      where: {
        idEmpresa,
        ...(query.idCliente ? { idCliente: query.idCliente } : {}),
        ...(query.idServicio ? { idServicio: query.idServicio } : {}),
        ...(query.estado ? { estado: query.estado.trim().toUpperCase() } : {}),
      },
      include: { responsable: { select: { idUsuario: true, nombreCompleto: true } } },
      orderBy: [{ estado: 'asc' }, { fechaTermino: 'desc' }],
    });
  }

  async create(dto: SaveCommercialWarrantyDto, currentUser: AuthUser) {
    const values = await this.validatedValues(dto, currentUser);
    const warranty = await this.prisma.garantiaComercial.create({
      data: { ...values, idUsuarioResponsable: currentUser.idUsuario, estado: 'ACTIVA' },
    });
    await this.audit.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_GARANTIA_COMERCIAL',
      entidadAfectada: 'garantia_comercial',
      idEntidadAfectada: warranty.idGarantia,
      valorNuevo: this.auditValue(warranty),
    });
    return warranty;
  }

  async update(idGarantia: number, dto: SaveCommercialWarrantyDto, currentUser: AuthUser) {
    const before = await this.scopedWarranty(idGarantia, currentUser);
    if (before.estado !== 'ACTIVA') throw new BadRequestException('Solo se puede editar una garantía activa.');
    const values = await this.validatedValues(dto, currentUser, idGarantia);
    const warranty = await this.prisma.garantiaComercial.update({
      where: { idGarantia },
      data: { ...values, idUsuarioResponsable: currentUser.idUsuario },
    });
    await this.audit.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_GARANTIA_COMERCIAL',
      entidadAfectada: 'garantia_comercial',
      idEntidadAfectada: idGarantia,
      valorAnterior: this.auditValue(before),
      valorNuevo: this.auditValue(warranty),
    });
    return warranty;
  }

  async deactivate(idGarantia: number, currentUser: AuthUser) {
    const before = await this.scopedWarranty(idGarantia, currentUser);
    const warranty = before.estado === 'INACTIVA'
      ? before
      : await this.prisma.garantiaComercial.update({ where: { idGarantia }, data: { estado: 'INACTIVA' } });
    await this.audit.record({
      idUsuario: currentUser.idUsuario,
      accion: 'DESACTIVAR_GARANTIA_COMERCIAL',
      entidadAfectada: 'garantia_comercial',
      idEntidadAfectada: idGarantia,
      valorAnterior: { estado: before.estado },
      valorNuevo: { estado: warranty.estado },
    });
    return warranty;
  }

  private async validatedValues(dto: SaveCommercialWarrantyDto, currentUser: AuthUser, excludeId?: number) {
    const idEmpresa = this.companyId(currentUser, dto.idEmpresa);
    const fechaInicio = parseDateOnly(dto.fechaInicio);
    const fechaTermino = parseDateOnly(dto.fechaTermino);
    if (!fechaInicio || !fechaTermino) throw new BadRequestException('Las fechas de garantía no son válidas.');
    if (fechaTermino < fechaInicio) throw new BadRequestException('La fecha de término no puede ser anterior al inicio.');
    if (!dto.tipo.trim() || !dto.cobertura.trim()) throw new BadRequestException('Tipo y cobertura son obligatorios.');
    if (dto.monto !== undefined && dto.monto <= 0) throw new BadRequestException('El monto debe ser mayor que cero.');

    const [customer, service, contract] = await Promise.all([
      this.prisma.cliente.findUnique({ where: { idCliente: dto.idCliente } }),
      this.prisma.servicioContratado.findUnique({ where: { idServicio: dto.idServicio } }),
      this.prisma.contrato.findUnique({ where: { idContrato: dto.idContrato } }),
    ]);
    if (!customer || customer.idEmpresa !== idEmpresa) throw new NotFoundException('Cliente no encontrado.');
    if (!service || service.idEmpresa !== idEmpresa || service.idCliente !== customer.idCliente) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (service.estadoOperativo !== 'Activo') throw new BadRequestException('El servicio debe estar activo.');
    if (!contract || contract.idEmpresa !== idEmpresa || contract.idCliente !== customer.idCliente) {
      throw new NotFoundException('Contrato no encontrado.');
    }
    if (service.idContrato !== contract.idContrato || contract.estado !== 'Activo') {
      throw new BadRequestException('El contrato activo no corresponde al servicio.');
    }

    const numeroSerieEquipo = dto.numeroSerieEquipo?.trim() || null;
    if (numeroSerieEquipo) await this.validateExternalSerial(numeroSerieEquipo, idEmpresa);
    const duplicate = await this.prisma.garantiaComercial.findFirst({
      where: {
        idServicio: dto.idServicio,
        tipo: dto.tipo.trim(),
        fechaInicio,
        fechaTermino,
        estado: 'ACTIVA',
        ...(excludeId ? { idGarantia: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new ConflictException('Ya existe una garantía activa del mismo tipo y período para el servicio.');

    return {
      idEmpresa,
      idCliente: dto.idCliente,
      idServicio: dto.idServicio,
      idContrato: dto.idContrato,
      numeroSerieEquipo,
      tipo: dto.tipo.trim(),
      fechaInicio,
      fechaTermino,
      cobertura: dto.cobertura.trim(),
      monto: dto.monto,
      observaciones: dto.observaciones?.trim() || null,
    };
  }

  private async validateExternalSerial(serial: string, idEmpresa: number) {
    try {
      const result = await this.g1.getUnitBySerial(serial, idEmpresa);
      if (result.data.id_empresa !== idEmpresa || result.data.numero_serie !== serial) {
        throw new BadRequestException('La serie no corresponde a la empresa seleccionada.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof G1IntegrationError && error.status === 404) throw new BadRequestException('La serie no existe en G1.');
      throw new ServiceUnavailableException({
        code: 'INTEGRACION_G1_NO_CONFIGURADA',
        message: 'No se puede asociar una serie mientras G1 no esté disponible. Crea la garantía sin referencia física.',
      });
    }
  }

  private async scopedWarranty(idGarantia: number, currentUser: AuthUser) {
    const warranty = await this.prisma.garantiaComercial.findUnique({ where: { idGarantia } });
    if (!warranty) throw new NotFoundException('Garantía comercial no encontrada.');
    if (!isAdministrator(currentUser.roles) && warranty.idEmpresa !== currentUser.idEmpresa) {
      throw new ForbiddenException('No tienes acceso a esta garantía.');
    }
    return warranty;
  }

  private companyId(currentUser: AuthUser, requested?: number) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requested ?? currentUser.idEmpresa;
      if (!idEmpresa) throw new BadRequestException('Debe indicar idEmpresa.');
      return idEmpresa;
    }
    if (!currentUser.idEmpresa) throw new ForbiddenException('El usuario no tiene empresa asociada.');
    if (requested && requested !== currentUser.idEmpresa) throw new ForbiddenException('La empresa no corresponde al usuario.');
    return currentUser.idEmpresa;
  }

  private auditValue(value: {
    idEmpresa: number; idCliente: number; idServicio: number; idContrato: number; numeroSerieEquipo: string | null;
    tipo: string; fechaInicio: Date; fechaTermino: Date; monto: unknown; estado: string;
  }) {
    return {
      idEmpresa: value.idEmpresa,
      idCliente: value.idCliente,
      idServicio: value.idServicio,
      idContrato: value.idContrato,
      numeroSerieEquipo: value.numeroSerieEquipo,
      tipo: value.tipo,
      fechaInicio: value.fechaInicio.toISOString().slice(0, 10),
      fechaTermino: value.fechaTermino.toISOString().slice(0, 10),
      monto: value.monto === null || value.monto === undefined ? null : Number(value.monto),
      estado: value.estado,
    };
  }
}

