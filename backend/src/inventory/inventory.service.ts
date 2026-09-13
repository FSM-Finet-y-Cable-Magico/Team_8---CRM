import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { parseDateOnly, todayDateOnly } from '../common/date-rules';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { AttachEvidenceDto } from './dto/attach-evidence.dto';
import { BlockEquipmentDto } from './dto/block-equipment.dto';
import { CreateConsumableStockDto } from './dto/create-consumable-stock.dto';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { CreateNapBoxDto } from './dto/create-nap-box.dto';
import { DiagnoseEquipmentDto } from './dto/diagnose-equipment.dto';
import { InstallRouterDto } from './dto/install-router.dto';
import { RecordConsumableMovementDto } from './dto/record-consumable-movement.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { RegisterMaintenanceDto } from './dto/register-maintenance.dto';
import { TransferEquipmentDto } from './dto/transfer-equipment.dto';
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
        numeroPoste: dto.numeroPoste?.trim(),
        idCajaNap: dto.idCajaNap,
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

  async advanced(currentUser: AuthUser, scope = 'consolidado') {
    const companyFilter = this.companyScope(currentUser, scope);
    const bodegas = await this.prisma.bodega.findMany({
      where: companyFilter,
      orderBy: { nombre: 'asc' },
    });
    const bodegaIds = bodegas.map((bodega) => bodega.idBodega);
    const stockWhere = 'idEmpresa' in companyFilter
      ? { idBodega: { in: bodegaIds.length ? bodegaIds : [-1] } }
      : {};
    const [stocks, napBoxes, transfers, orders, units, maintenanceRows] = await Promise.all([
      this.prisma.stockConsumible.findMany({
        where: stockWhere,
        orderBy: { idStock: 'desc' },
        take: 150,
      }),
      this.prisma.cajaNap.findMany({
        where: companyFilter,
        orderBy: { idCajaNap: 'desc' },
        take: 100,
      }),
      this.prisma.transferenciaEquipo.findMany({
        where: this.transferScope(companyFilter),
        orderBy: { fechaTransferencia: 'desc' },
        take: 50,
      }),
      this.prisma.ordenTrabajo.findMany({
        where: companyFilter,
        select: { idOt: true, idEmpresa: true, tipoOt: true, fechaProgramada: true, fechaCompletada: true },
        take: 500,
      }),
      this.prisma.unidadEquipo.findMany({
        where: companyFilter,
        select: { idUnidad: true, numeroSerie: true, idEmpresa: true },
        take: 500,
      }),
      this.prisma.historialEstadoEquipo.findMany({
        where: { motivo: { contains: 'Mantencion', mode: 'insensitive' } },
        orderBy: { fechaHora: 'desc' },
        take: 50,
      }),
    ]);
    const typeIds = [
      ...new Set(stocks.map((stock) => stock.idTipoEquipo).filter((id): id is number => Boolean(id))),
    ];
    const [types, usage, evidences] = await Promise.all([
      typeIds.length ? this.prisma.tipoEquipo.findMany({ where: { idTipoEquipo: { in: typeIds } } }) : [],
      orders.length
        ? this.prisma.usoMaterialOt.findMany({
            where: { idOt: { in: orders.map((order) => order.idOt) } },
            orderBy: { idUso: 'desc' },
            take: 150,
          })
        : [],
      orders.length
        ? this.prisma.evidenciaFoto.findMany({
            where: { idOt: { in: orders.map((order) => order.idOt) } },
            orderBy: { fechaSubida: 'desc' },
            take: 50,
          })
        : [],
    ]);
    const typeById = new Map(types.map((type) => [type.idTipoEquipo, type]));
    const bodegaById = new Map(bodegas.map((bodega) => [bodega.idBodega, bodega]));
    const orderById = new Map(orders.map((order) => [order.idOt, order]));
    const unitById = new Map(units.map((unit) => [unit.idUnidad, unit]));
    const consumibles = stocks.map((stock) => ({
      ...stock,
      cantidadDisponible: Number(stock.cantidadDisponible),
      umbralMinimo: stock.umbralMinimo === null ? null : Number(stock.umbralMinimo),
      tipoEquipo: stock.idTipoEquipo ? typeById.get(stock.idTipoEquipo) ?? null : null,
      bodega: stock.idBodega ? bodegaById.get(stock.idBodega) ?? null : null,
    }));
    const scopedMaintenanceRows = maintenanceRows.filter(
      (row) => !('idEmpresa' in companyFilter) || (row.idUnidad !== null && unitById.has(row.idUnidad)),
    );

    return {
      consumibles,
      alertasStock: consumibles.filter(
        (stock) => stock.umbralMinimo !== null && stock.cantidadDisponible <= stock.umbralMinimo,
      ),
      cajasNap: napBoxes,
      transferencias: transfers,
      usoMateriales: usage.map((row) => ({
        ...row,
        cantidad: Number(row.cantidad),
        orden: row.idOt ? orderById.get(row.idOt) ?? null : null,
        tipoEquipo: row.idTipoEquipo ? typeById.get(row.idTipoEquipo) ?? null : null,
      })),
      evidencias: evidences,
      mantenciones: scopedMaintenanceRows.map((row) => ({
        ...row,
        idHistorial: row.idHistorial.toString(),
        unidad: row.idUnidad ? unitById.get(row.idUnidad) ?? null : null,
      })),
    };
  }

  async createNapBox(dto: CreateNapBoxDto, currentUser: AuthUser) {
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const identifier = dto.identificadorUnico.trim();
    const duplicate = await this.prisma.cajaNap.findFirst({ where: { identificadorUnico: identifier } });

    if (duplicate) {
      throw new BadRequestException('Ya existe una caja NAP con ese identificador');
    }

    const box = await this.prisma.cajaNap.create({
      data: {
        idEmpresa,
        identificadorUnico: identifier,
        numeroPoste: dto.numeroPoste?.trim(),
        zona: dto.zona.trim(),
        capacidadPuertos: dto.capacidadPuertos,
        latitud: dto.latitud,
        longitud: dto.longitud,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_CAJA_NAP',
      entidadAfectada: 'caja_nap',
      idEntidadAfectada: box.idCajaNap,
      valorNuevo: { idEmpresa, identificadorUnico: box.identificadorUnico, zona: box.zona },
    });

    return box;
  }

  async createConsumableStock(dto: CreateConsumableStockDto, currentUser: AuthUser) {
    const idEmpresa = this.resolveCompanyId(dto.idEmpresa, currentUser);
    const idTipoEquipo = await this.resolveConsumableType(dto, idEmpresa);
    const idBodega = await this.resolveWarehouse(dto, idEmpresa);
    const stock = await this.prisma.stockConsumible.create({
      data: {
        idTipoEquipo,
        idBodega,
        cantidadDisponible: dto.cantidadDisponible,
        umbralMinimo: dto.umbralMinimo,
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'CREAR_STOCK_CONSUMIBLE',
      entidadAfectada: 'stock_consumible',
      idEntidadAfectada: stock.idStock,
      valorNuevo: { idEmpresa, idTipoEquipo, idBodega, cantidadDisponible: dto.cantidadDisponible },
    });

    return stock;
  }

  async recordConsumableMovement(idStock: number, dto: RecordConsumableMovementDto, currentUser: AuthUser) {
    const stock = await this.prisma.stockConsumible.findUnique({ where: { idStock } });

    if (!stock) {
      throw new NotFoundException('Stock consumible no encontrado');
    }

    const bodega = stock.idBodega ? await this.prisma.bodega.findUnique({ where: { idBodega: stock.idBodega } }) : null;
    this.assertCompanyAccess(bodega?.idEmpresa ?? null, currentUser);

    const currentQuantity = Number(stock.cantidadDisponible);
    const nextQuantity =
      dto.tipoMovimiento === 'Entrada'
        ? currentQuantity + dto.cantidad
        : dto.tipoMovimiento === 'Salida'
          ? currentQuantity - dto.cantidad
          : dto.cantidad;

    if (nextQuantity < 0) {
      throw new BadRequestException('La salida supera el stock disponible');
    }

    const order = dto.idOt ? await this.prisma.ordenTrabajo.findUnique({ where: { idOt: dto.idOt } }) : null;

    if (dto.idOt && !order) {
      throw new BadRequestException('La orden de trabajo indicada no existe');
    }

    if (order) {
      this.assertCompanyAccess(order.idEmpresa, currentUser);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedStock = await tx.stockConsumible.update({
        where: { idStock },
        data: { cantidadDisponible: nextQuantity },
      });
      const movement = await tx.movimientoInventario.create({
        data: {
          idTipoEquipo: stock.idTipoEquipo,
          idEmpresaOrigen: dto.tipoMovimiento === 'Salida' ? bodega?.idEmpresa : null,
          idEmpresaDestino: dto.tipoMovimiento === 'Entrada' ? bodega?.idEmpresa : null,
          idBodegaOrigen: dto.tipoMovimiento === 'Salida' ? stock.idBodega : null,
          idBodegaDestino: dto.tipoMovimiento === 'Entrada' ? stock.idBodega : null,
          idUsuario: currentUser.idUsuario,
          tipoMovimiento: `Consumible ${dto.tipoMovimiento}`,
          cantidad: dto.cantidad,
          fecha: new Date(),
          referenciaId: dto.idOt,
        },
      });

      if (dto.tipoMovimiento === 'Salida' && dto.idOt) {
        await tx.usoMaterialOt.create({
          data: {
            idOt: dto.idOt,
            idTipoEquipo: stock.idTipoEquipo,
            cantidad: dto.cantidad,
          },
        });
      }

      return { updatedStock, movement };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_MOVIMIENTO_CONSUMIBLE',
      entidadAfectada: 'stock_consumible',
      idEntidadAfectada: idStock,
      valorAnterior: { cantidadDisponible: currentQuantity },
      valorNuevo: {
        tipoMovimiento: dto.tipoMovimiento,
        cantidad: dto.cantidad,
        cantidadDisponible: nextQuantity,
        idOt: dto.idOt,
      },
    });

    return {
      ...result,
      movement: { ...result.movement, idMovimiento: result.movement.idMovimiento.toString() },
    };
  }

  async blockEquipment(idUnidad: number, dto: BlockEquipmentDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);

    const result = await this.prisma.$transaction(async (tx) => {
      const blocked = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: {
          estado: 'Bloqueado',
          diagnosticoTecnico: this.appendNote(unit.diagnosticoTecnico, `Bloqueo por uso malicioso: ${dto.motivo}`),
        },
      });

      await tx.bajaEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          motivoBaja: dto.motivo,
          tipoBaja: dto.tipoBaja?.trim() || 'Bloqueo',
          fechaBaja: this.today(),
        },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: 'Bloqueado',
          motivo: dto.motivo,
          fechaHora: new Date(),
        },
      });

      return blocked;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'BLOQUEAR_EQUIPO_USO_MALICIOSO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: idUnidad,
      valorAnterior: { estado: unit.estado },
      valorNuevo: { estado: 'Bloqueado', motivo: dto.motivo },
    });

    return result;
  }

  async diagnoseEquipment(idUnidad: number, dto: DiagnoseEquipmentDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);
    const nextState = dto.resultado === 'Funciona'
      ? 'Disponible'
      : dto.resultado === 'Danado'
        ? 'En Revision'
        : 'Bloqueado';

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextUnit = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: {
          estado: nextState,
          idClienteInstalado: nextState === 'Disponible' ? null : unit.idClienteInstalado,
          idServicio: nextState === 'Disponible' ? null : unit.idServicio,
          diagnosticoTecnico: this.appendNote(
            unit.diagnosticoTecnico,
            `Diagnostico equipo devuelto: ${dto.resultado}${dto.observaciones ? ` - ${dto.observaciones}` : ''}`,
          ),
        },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: nextState,
          motivo: `Diagnostico: ${dto.resultado}`,
          fechaHora: new Date(),
        },
      });

      return nextUnit;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'DIAGNOSTICAR_EQUIPO_DEVUELTO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: idUnidad,
      valorAnterior: { estado: unit.estado },
      valorNuevo: { resultado: dto.resultado, estado: updated.estado },
    });

    return updated;
  }

  async transferEquipment(idUnidad: number, dto: TransferEquipmentDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);

    if (unit.estado === 'Bloqueado') {
      throw new BadRequestException('Un equipo bloqueado no puede transferirse');
    }

    const destination = await this.prisma.empresa.findUnique({ where: { idEmpresa: dto.idEmpresaDestino } });

    if (!destination) {
      throw new BadRequestException('La empresa destino no existe');
    }

    if (unit.idEmpresa === dto.idEmpresaDestino) {
      throw new BadRequestException('La empresa destino debe ser distinta a la empresa actual');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transferenciaEquipo.create({
        data: {
          idEmpresaOrigen: unit.idEmpresa,
          idEmpresaDestino: dto.idEmpresaDestino,
          idUsuarioRegistro: currentUser.idUsuario,
          fechaTransferencia: this.today(),
          observaciones: dto.observaciones,
        },
      });

      const updated = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: {
          idEmpresa: dto.idEmpresaDestino,
          idBodegaActual: null,
          estado: unit.estado === 'Instalado' ? 'En Revision' : unit.estado,
        },
      });

      await tx.movimientoInventario.create({
        data: {
          idUnidad,
          idTipoEquipo: unit.idTipoEquipo,
          idEmpresaOrigen: unit.idEmpresa,
          idEmpresaDestino: dto.idEmpresaDestino,
          idUsuario: currentUser.idUsuario,
          tipoMovimiento: 'Transferencia',
          cantidad: 1,
          fecha: new Date(),
          referenciaId: transfer.idTransferencia,
        },
      });

      return { transfer, updated };
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'TRANSFERIR_EQUIPO_EMPRESA',
      entidadAfectada: 'transferencia_equipo',
      idEntidadAfectada: result.transfer.idTransferencia,
      valorAnterior: { idEmpresa: unit.idEmpresa },
      valorNuevo: { idUnidad, idEmpresaDestino: dto.idEmpresaDestino, observaciones: dto.observaciones },
    });

    return result;
  }

  async attachEvidence(idOt: number, dto: AttachEvidenceDto, currentUser: AuthUser) {
    const order = await this.prisma.ordenTrabajo.findUnique({ where: { idOt } });

    if (!order) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    this.assertCompanyAccess(order.idEmpresa, currentUser);

    if (!this.isAllowedEvidenceUrl(dto.url)) {
      throw new BadRequestException('La evidencia debe ser una URL http(s) o una ruta local de desarrollo');
    }

    const evidence = await this.prisma.evidenciaFoto.create({
      data: {
        idOt,
        urlCloudinary: dto.url.trim(),
        formato: dto.formato?.trim().toLowerCase(),
        tamanoKb: dto.tamanoKb,
        fechaSubida: new Date(),
      },
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'ADJUNTAR_EVIDENCIA_INSTALACION',
      entidadAfectada: 'evidencia_foto',
      idEntidadAfectada: evidence.idFoto,
      valorNuevo: { idOt, url: evidence.urlCloudinary, formato: evidence.formato },
    });

    return evidence;
  }

  async registerMaintenance(idUnidad: number, dto: RegisterMaintenanceDto, currentUser: AuthUser) {
    const unit = await this.getUnitOrThrow(idUnidad, currentUser);
    const maintenanceDate = dto.fecha ? parseDateOnly(dto.fecha) : this.today();

    if (!maintenanceDate) {
      throw new BadRequestException('La fecha de mantencion no es valida');
    }

    const note = `Mantencion ${dto.tipo}: ${dto.descripcion}${dto.tecnicoResponsable ? ` - Tecnico: ${dto.tecnicoResponsable}` : ''}`;
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextUnit = await tx.unidadEquipo.update({
        where: { idUnidad },
        data: { diagnosticoTecnico: this.appendNote(unit.diagnosticoTecnico, note) },
      });

      await tx.historialEstadoEquipo.create({
        data: {
          idUnidad,
          idUsuario: currentUser.idUsuario,
          estadoAnterior: unit.estado,
          estadoNuevo: unit.estado,
          motivo: note,
          fechaHora: maintenanceDate,
        },
      });

      return nextUnit;
    });

    await this.auditService.record({
      idUsuario: currentUser.idUsuario,
      accion: 'REGISTRAR_MANTENCION_EQUIPO',
      entidadAfectada: 'unidad_equipo',
      idEntidadAfectada: idUnidad,
      valorNuevo: { tipo: dto.tipo, descripcion: dto.descripcion, tecnicoResponsable: dto.tecnicoResponsable },
    });

    return updated;
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

  private async resolveConsumableType(dto: CreateConsumableStockDto, idEmpresa: number) {
    if (dto.idTipoEquipo) {
      const type = await this.prisma.tipoEquipo.findUnique({ where: { idTipoEquipo: dto.idTipoEquipo } });

      if (!type || (type.idEmpresa !== idEmpresa && type.idEmpresa !== null)) {
        throw new BadRequestException('El tipo de consumible no pertenece a la empresa seleccionada');
      }

      return dto.idTipoEquipo;
    }

    if (!dto.tipoNombre?.trim()) {
      throw new BadRequestException('Debe indicar tipo de consumible o seleccionar uno existente');
    }

    const existing = await this.prisma.tipoEquipo.findFirst({
      where: { idEmpresa, nombre: dto.tipoNombre.trim() },
    });

    if (existing) {
      return existing.idTipoEquipo;
    }

    const type = await this.prisma.tipoEquipo.create({
      data: {
        idEmpresa,
        nombre: dto.tipoNombre.trim(),
        categoria: 'Consumible',
        requiereSerieIndividual: false,
        activo: true,
      },
    });

    return type.idTipoEquipo;
  }

  private async resolveWarehouse(dto: CreateConsumableStockDto, idEmpresa: number) {
    if (dto.idBodega) {
      const bodega = await this.prisma.bodega.findUnique({ where: { idBodega: dto.idBodega } });

      if (!bodega || bodega.idEmpresa !== idEmpresa) {
        throw new BadRequestException('La bodega no pertenece a la empresa seleccionada');
      }

      return dto.idBodega;
    }

    if (!dto.bodegaNombre?.trim()) {
      throw new BadRequestException('Debe indicar bodega para controlar el stock consumible');
    }

    const existing = await this.prisma.bodega.findFirst({
      where: { idEmpresa, nombre: dto.bodegaNombre.trim() },
    });

    if (existing) {
      return existing.idBodega;
    }

    const bodega = await this.prisma.bodega.create({
      data: {
        idEmpresa,
        nombre: dto.bodegaNombre.trim(),
        activa: true,
      },
    });

    return bodega.idBodega;
  }

  private transferScope(companyFilter: { idEmpresa?: number }) {
    if (!companyFilter.idEmpresa) {
      return {};
    }

    return {
      OR: [
        { idEmpresaOrigen: companyFilter.idEmpresa },
        { idEmpresaDestino: companyFilter.idEmpresa },
      ],
    };
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El registro no pertenece a tu empresa');
    }
  }

  private appendNote(current: string | null, note: string) {
    return [current, note].filter(Boolean).join('\n');
  }

  private today() {
    const parsed = parseDateOnly(todayDateOnly());

    if (!parsed) {
      throw new BadRequestException('No se pudo resolver la fecha actual');
    }

    return parsed;
  }

  private isAllowedEvidenceUrl(url: string) {
    const value = url.trim();
    return /^https?:\/\//i.test(value) || value.startsWith('/uploads/') || value.startsWith('uploads/');
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
