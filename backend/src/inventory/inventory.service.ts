import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { InstallRouterDto } from './dto/install-router.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { UpdateEquipmentStatusDto } from './dto/update-equipment-status.dto';

const MOVEMENT_STATE: Record<RecordMovementDto['tipoMovimiento'], string> = {
  Compra: 'Disponible',
  Devolucion: 'En Revision',
  Asignacion: 'Instalado',
  Descarte: 'Baja Definitiva',
  Transferencia: 'Disponible',
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(currentUser: AuthUser, scope = 'consolidado') {
    const where = this.companyScope(currentUser, scope);
    const units = await this.prisma.unidadEquipo.findMany({
      where,
      orderBy: { idUnidad: 'desc' },
      take: 150,
    });
    const typeIds = [...new Set(units.map((unit) => unit.idTipoEquipo).filter((id): id is number => Boolean(id)))];
    const types = typeIds.length
      ? await this.prisma.tipoEquipo.findMany({ where: { idTipoEquipo: { in: typeIds } } })
      : [];
    const companyIds = [...new Set(units.map((unit) => unit.idEmpresa).filter((id): id is number => Boolean(id)))];
    const customerIds = [
      ...new Set(units.map((unit) => unit.idClienteInstalado).filter((id): id is number => Boolean(id))),
    ];
    const [companies, customers] = await Promise.all([
      companyIds.length ? this.prisma.empresa.findMany({ where: { idEmpresa: { in: companyIds } } }) : [],
      customerIds.length ? this.prisma.cliente.findMany({ where: { idCliente: { in: customerIds } } }) : [],
    ]);
    const typeById = new Map(types.map((type) => [type.idTipoEquipo, type]));
    const companyById = new Map(companies.map((company) => [company.idEmpresa, company]));
    const customerById = new Map(customers.map((customer) => [customer.idCliente, customer]));

    return units.map((unit) => ({
      ...unit,
      tipoEquipo: unit.idTipoEquipo ? typeById.get(unit.idTipoEquipo) ?? null : null,
      empresa: unit.idEmpresa ? companyById.get(unit.idEmpresa) ?? null : null,
      clienteInstalado: unit.idClienteInstalado ? customerById.get(unit.idClienteInstalado) ?? null : null,
      macAddress: this.technicalValue(unit.diagnosticoTecnico, 'MAC'),
      puertoOlt: this.technicalValue(unit.diagnosticoTecnico, 'Puerto OLT'),
    }));
  }

  async createEquipment(dto: CreateEquipmentDto, currentUser: AuthUser) {
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const idTipoEquipo = await this.resolveType(dto, idEmpresa);

    const unit = await this.prisma.unidadEquipo.create({
      data: {
        idEmpresa,
        idTipoEquipo,
        numeroSerie: dto.numeroSerie.trim(),
        modelo: dto.modelo?.trim(),
        estado: 'Disponible',
        idBodegaActual: dto.idBodegaActual,
        fechaAdquisicion: dto.fechaAdquisicion ? new Date(dto.fechaAdquisicion) : undefined,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_EQUIPO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: unit.idUnidad,
      valorNuevo: { numeroSerie: unit.numeroSerie, idEmpresa, idTipoEquipo },
    });

    return unit;
  }

  async recordMovement(dto: RecordMovementDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(dto.idUnidad, currentUser);
    const nextState = MOVEMENT_STATE[dto.tipoMovimiento];

    if (dto.tipoMovimiento === 'Asignacion' && !dto.idCliente) {
      throw new BadRequestException('La asignacion requiere cliente');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.movimientoInventario.create({
        data: {
          idUnidad: unit.idUnidad,
          idTipoEquipo: unit.idTipoEquipo,
          idEmpresaOrigen: unit.idEmpresa,
          idEmpresaDestino: dto.idEmpresaDestino ?? unit.idEmpresa,
          idBodegaOrigen: dto.idBodegaOrigen ?? unit.idBodegaActual,
          idBodegaDestino: dto.idBodegaDestino,
          idUsuario: currentUser.idUsuario,
          tipoMovimiento: dto.tipoMovimiento,
          cantidad: dto.cantidad ?? 1,
          fecha: new Date(),
          referenciaId: dto.idCliente,
        },
      });

      const nextUnit = await tx.unidadEquipo.update({
        where: { idUnidad: unit.idUnidad },
        data: {
          estado: nextState,
          idClienteInstalado: dto.tipoMovimiento === 'Asignacion' ? dto.idCliente : unit.idClienteInstalado,
          idBodegaActual: dto.idBodegaDestino ?? unit.idBodegaActual,
          idEmpresa: dto.idEmpresaDestino ?? unit.idEmpresa,
        },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad: unit.idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: nextState,
          motivo: dto.tipoMovimiento,
          fechaHora: new Date(),
        },
      });

      return { movement, unit: nextUnit };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_MOVIMIENTO_INVENTARIO',
      entidadAfectada: 'movimiento_inventario',
      idEntidadAfectada: Number(updated.movement.idMovimiento),
      valorAnterior: { estado: unit.estado },
      valorNuevo: {
        idUnidad: unit.idUnidad,
        tipoMovimiento: dto.tipoMovimiento,
        estado: updated.unit.estado,
      },
    });

    return {
      ...updated,
      movement: { ...updated.movement, idMovimiento: updated.movement.idMovimiento.toString() },
    };
  }

  async updateStatus(idUnidad: number, dto: UpdateEquipmentStatusDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextUnit = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: { estado: dto.estado },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: dto.estado,
          motivo: dto.motivo,
          fechaHora: new Date(),
        },
      });

      return nextUnit;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ACTUALIZAR_ESTADO_EQUIPO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: idUnidad,
      valorAnterior: { estado: unit.estado },
      valorNuevo: { estado: dto.estado, motivo: dto.motivo },
    });

    return updated;
  }

  async installRouter(idUnidad: number, dto: InstallRouterDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);

    if (unit.estado !== 'Disponible') {
      throw new BadRequestException('El equipo no figura como Disponible');
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: { idCliente: dto.idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!cliente) {
      throw new BadRequestException('Cliente inexistente');
    }

    const belongsToEquipmentCompany =
      cliente.idEmpresa === unit.idEmpresa || cliente.contratos.some((contract) => contract.idEmpresa === unit.idEmpresa);

    if (!belongsToEquipmentCompany) {
      throw new BadRequestException('El cliente no tiene una cuenta asociada a la empresa del equipo');
    }

    const installOrder = dto.idOt
      ? await this.prisma.ordenTrabajo.findUnique({ where: { idOt: dto.idOt } })
      : null;

    if (
      installOrder &&
      (installOrder.idCliente !== dto.idCliente || installOrder.idEmpresa !== unit.idEmpresa || installOrder.tipoOt !== 'Instalacion')
    ) {
      throw new BadRequestException('La orden de instalacion no corresponde al cliente y empresa seleccionados');
    }

    if (installOrder?.idServicio && dto.idServicio && installOrder.idServicio !== dto.idServicio) {
      throw new BadRequestException('El servicio indicado no corresponde a la orden de instalacion');
    }

    const idServicio = dto.idServicio ?? installOrder?.idServicio ?? null;
    const servicio = idServicio
      ? await this.prisma.servicioContratado.findUnique({ where: { idServicio } })
      : null;

    if (idServicio && !servicio) {
      throw new BadRequestException('El servicio contratado indicado no existe');
    }

    if (
      servicio &&
      (servicio.idCliente !== dto.idCliente || servicio.idEmpresa !== unit.idEmpresa)
    ) {
      throw new BadRequestException('El servicio contratado no corresponde al cliente y empresa del equipo');
    }

    const technicalNotes = [
      unit.diagnosticoTecnico,
      `Instalacion router/ONU - MAC: ${dto.macAddress}; Puerto OLT: ${dto.puertoOlt}`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedUnit = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: {
          modelo: dto.modelo ?? unit.modelo,
          estado: 'Instalado',
          idClienteInstalado: dto.idCliente,
          idServicio,
          diagnosticoTecnico: technicalNotes,
        },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: 'Instalado',
          motivo: 'Instalacion router/ONU',
          fechaHora: new Date(),
        },
      });

      if (dto.idOt) {
        await tx.ordenTrabajo.update({
          where: { idOt: dto.idOt },
          data: {
            idServicio: idServicio ?? installOrder?.idServicio,
            observaciones: technicalNotes,
          },
        });
      }

      return updatedUnit;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'VINCULAR_EQUIPO_CLIENTE',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: idUnidad,
      valorAnterior: { estado: unit.estado, idClienteInstalado: unit.idClienteInstalado },
      valorNuevo: {
        estado: 'Instalado',
        idCliente: dto.idCliente,
        idServicio,
        macAddress: dto.macAddress,
        puertoOlt: dto.puertoOlt,
      },
    });

    return result;
  }

  private async resolveType(dto: CreateEquipmentDto, idEmpresa: number) {
    if (dto.idTipoEquipo) {
      return dto.idTipoEquipo;
    }

    if (!dto.tipoNombre) {
      throw new BadRequestException('Debe indicar tipo de equipo o nombre de tipo');
    }

    const type = await this.prisma.tipoEquipo.create({
      data: {
        idEmpresa,
        nombre: dto.tipoNombre.trim(),
        categoria: 'Router/ONU',
        requiereSerieIndividual: true,
        activo: true,
      },
    });

    return type.idTipoEquipo;
  }

  private async getUnitOrThrow(idUnidad: number, currentUser: AuthUser) {
    const unit = await this.prisma.unidadEquipo.findUnique({ where: { idUnidad } });

    if (!unit) {
      throw new NotFoundException('Equipo no encontrado');
    }

    if (!isAdministrator(currentUser.roles) && unit.idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El equipo no pertenece a tu empresa');
    }

    return unit;
  }

  private resolveCompanyId(requestedCompanyId: number | undefined, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      const idEmpresa = requestedCompanyId ?? currentUser.idEmpresa;

      if (!idEmpresa) {
        throw new BadRequestException('Debe indicar empresa');
      }

      return idEmpresa;
    }

    if (!currentUser.idEmpresa) {
      throw new BadRequestException('El usuario no tiene empresa asociada');
    }

    return currentUser.idEmpresa;
  }

  private technicalValue(notes: string | null, label: 'MAC' | 'Puerto OLT') {
    if (!notes) {
      return null;
    }

    const pattern = label === 'MAC' ? /MAC:\s*([^;\n]+)/i : /Puerto OLT:\s*([^;\n]+)/i;
    return pattern.exec(notes)?.[1]?.trim() ?? null;
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
