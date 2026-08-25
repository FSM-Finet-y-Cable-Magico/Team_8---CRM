import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { DemoMeasurementDto } from './dto/demo-measurement.dto';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async customerStatus(idCliente: number, currentUser: AuthUser) {
    const customer = await this.getCustomerOrThrow(idCliente, currentUser);
    const services = await this.prisma.servicioContratado.findMany({
      where: { idCliente },
      include: {
        contrato: { include: { plan: true } },
        direccion: true,
        equipos: { orderBy: { idUnidad: 'desc' } },
      },
      orderBy: { fechaCreacion: 'desc' },
    });
    const equipmentIds = [...new Set(services.flatMap((service) => service.equipos.map((unit) => unit.idUnidad)))];
    const latest = await this.latestMeasurement(idCliente, equipmentIds);

    return this.statusPayload({
      subject: { tipo: 'cliente', idCliente, nombre: customer.nombreCompleto },
      latest,
      equipmentIds,
      services,
    });
  }

  async serviceStatus(idServicio: number, currentUser: AuthUser) {
    const service = await this.prisma.servicioContratado.findUnique({
      where: { idServicio },
      include: {
        cliente: true,
        contrato: { include: { plan: true } },
        direccion: true,
        equipos: { orderBy: { idUnidad: 'desc' } },
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    this.assertCompanyAccess(service.idEmpresa, currentUser);
    const equipmentIds = service.equipos.map((unit) => unit.idUnidad);
    const latest = await this.latestMeasurement(service.idCliente, equipmentIds);

    return this.statusPayload({
      subject: { tipo: 'servicio', idServicio, idCliente: service.idCliente },
      latest,
      equipmentIds,
      services: [service],
    });
  }

  async equipmentStatus(idUnidad: number, currentUser: AuthUser) {
    const unit = await this.prisma.unidadEquipo.findUnique({ where: { idUnidad } });

    if (!unit) {
      throw new NotFoundException('Equipo no encontrado');
    }

    this.assertCompanyAccess(unit.idEmpresa, currentUser);
    const latest = await this.latestMeasurement(unit.idClienteInstalado ?? undefined, [unit.idUnidad]);

    return this.statusPayload({
      subject: { tipo: 'equipo', idUnidad, numeroSerie: unit.numeroSerie },
      latest,
      equipmentIds: [unit.idUnidad],
      services: [],
    });
  }

  async customerHistory(idCliente: number, currentUser: AuthUser) {
    await this.getCustomerOrThrow(idCliente, currentUser);
    const units = await this.prisma.unidadEquipo.findMany({ where: { idClienteInstalado: idCliente } });
    const equipmentIds = units.map((unit) => unit.idUnidad);

    if (!equipmentIds.length) {
      return [];
    }

    const history = await this.prisma.historialConexionOnt.findMany({
      where: { idUnidad: { in: equipmentIds } },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    return history.map((event) => ({
      ...event,
      idHistorialOnt: event.idHistorialOnt.toString(),
    }));
  }

  async createDemoMeasurement(dto: DemoMeasurementDto, currentUser: AuthUser) {
    if (!isAdministrator(currentUser.roles)) {
      throw new BadRequestException('Solo administrador puede registrar mediciones demo');
    }

    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new BadRequestException('Las mediciones demo no estan disponibles en produccion');
    }

    const unit = await this.prisma.unidadEquipo.findUnique({ where: { idUnidad: dto.idUnidad } });

    if (!unit) {
      throw new NotFoundException('Equipo no encontrado');
    }

    const measurement = await this.prisma.monitoreoOnt.create({
      data: {
        idUnidad: unit.idUnidad,
        idCliente: dto.idCliente ?? unit.idClienteInstalado,
        idCajaNap: dto.idCajaNap ?? unit.idCajaNap,
        potenciaActualDbm: new Prisma.Decimal(dto.potenciaActualDbm),
        estadoConexion: dto.estadoConexion,
        timestampMedicion: new Date(),
      },
    });

    if (dto.evento) {
      await this.prisma.historialConexionOnt.create({
        data: {
          idUnidad: unit.idUnidad,
          evento: dto.evento,
          timestamp: new Date(),
        },
      });
    }

    return {
      ...measurement,
      idMonitoreo: measurement.idMonitoreo.toString(),
      potenciaActualDbm: measurement.potenciaActualDbm ? Number(measurement.potenciaActualDbm) : null,
    };
  }

  private async getCustomerOrThrow(idCliente: number, currentUser: AuthUser) {
    const customer = await this.prisma.cliente.findUnique({
      where: { idCliente },
      include: { contratos: { select: { idEmpresa: true } } },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const canAccess = isAdministrator(currentUser.roles) ||
      customer.idEmpresa === currentUser.idEmpresa ||
      customer.contratos.some((contract) => contract.idEmpresa === currentUser.idEmpresa);

    if (!canAccess) {
      throw new BadRequestException('El cliente no pertenece a tu empresa');
    }

    return customer;
  }

  private async latestMeasurement(idCliente: number | undefined, equipmentIds: number[]) {
    const filters: Prisma.MonitoreoOntWhereInput[] = [];

    if (idCliente) {
      filters.push({ idCliente });
    }

    if (equipmentIds.length) {
      filters.push({ idUnidad: { in: equipmentIds } });
    }

    if (!filters.length) {
      return null;
    }

    return this.prisma.monitoreoOnt.findFirst({
      where: { OR: filters },
      orderBy: { timestampMedicion: 'desc' },
    });
  }

  private async statusPayload(input: {
    subject: Record<string, unknown>;
    latest: Awaited<ReturnType<MonitoringService['latestMeasurement']>>;
    equipmentIds: number[];
    services: unknown[];
  }) {
    const latest = input.latest;
    const recentHours = Number(this.configService.get<string>('MONITORING_RECENT_HOURS') ?? 24);
    const recentLimit = new Date(Date.now() - recentHours * 60 * 60 * 1000);
    const isRecent = Boolean(latest?.timestampMedicion && latest.timestampMedicion >= recentLimit);
    const unit = latest?.idUnidad
      ? await this.prisma.unidadEquipo.findUnique({ where: { idUnidad: latest.idUnidad } })
      : null;
    const cajaNap = latest?.idCajaNap
      ? await this.prisma.cajaNap.findUnique({ where: { idCajaNap: latest.idCajaNap } })
      : null;
    const history = input.equipmentIds.length
      ? await this.prisma.historialConexionOnt.findMany({
          where: { idUnidad: { in: input.equipmentIds } },
          orderBy: { timestamp: 'desc' },
          take: 10,
        })
      : [];

    return {
      subject: input.subject,
      estadoConexion: isRecent ? latest?.estadoConexion ?? 'Con dato reciente' : 'Sin dato reciente',
      mensaje: isRecent
        ? 'Estado obtenido desde la ultima medicion registrada.'
        : 'No existe una medicion reciente para este cliente o servicio.',
      latenciaMs: null,
      latenciaEstado: 'No disponible',
      fuente: 'monitoreo_ont',
      ventanaDatoRecienteHoras: recentHours,
      ultimaMedicion: latest ? {
        idMonitoreo: latest.idMonitoreo.toString(),
        idUnidad: latest.idUnidad,
        idCliente: latest.idCliente,
        idCajaNap: latest.idCajaNap,
        potenciaActualDbm: latest.potenciaActualDbm ? Number(latest.potenciaActualDbm) : null,
        timestampMedicion: latest.timestampMedicion,
        estadoConexion: latest.estadoConexion,
      } : null,
      equipo: unit ? {
        idUnidad: unit.idUnidad,
        numeroSerie: unit.numeroSerie,
        modelo: unit.modelo,
        estado: unit.estado,
      } : null,
      cajaNap: cajaNap ? {
        idCajaNap: cajaNap.idCajaNap,
        identificadorUnico: cajaNap.identificadorUnico,
        zona: cajaNap.zona,
        numeroPoste: cajaNap.numeroPoste,
      } : null,
      servicios: input.services,
      historial: history.map((event) => ({
        ...event,
        idHistorialOnt: event.idHistorialOnt.toString(),
      })),
    };
  }

  private assertCompanyAccess(idEmpresa: number | null, currentUser: AuthUser) {
    if (isAdministrator(currentUser.roles)) {
      return;
    }

    if (!currentUser.idEmpresa || idEmpresa !== currentUser.idEmpresa) {
      throw new BadRequestException('El recurso no pertenece a tu empresa');
    }
  }
}
