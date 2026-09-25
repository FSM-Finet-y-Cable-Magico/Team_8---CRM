import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { hasRole, isAdministrator } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CoverageLocationDto, CreateCoverageZoneDto, UpdateCoverageZoneDto } from './coverage.dto';
import {
  GeoJsonPolygon,
  isChildPolygonInsideParent,
  polygonCenter,
  polygonsOverlap,
  validatePolygon,
} from './coverage-geometry';
import { CommercialCoverageProvider } from './commercial-coverage.provider';
import { G3CoverageProvider } from './g3-coverage.provider';
import { GeocodingService } from './geocoding.service';
import { LegacyTomodatCoverageProvider } from './legacy-tomodat-coverage.provider';
import { CoverageResult, TechnicalCoverageResult } from './coverage.types';

@Injectable()
export class CoverageDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly commercial: CommercialCoverageProvider,
    private readonly g3: G3CoverageProvider,
    private readonly legacyTomodat: LegacyTomodatCoverageProvider,
    private readonly geocoding: GeocodingService,
  ) {}

  status(idEmpresa: number, user: AuthUser) {
    this.assertAccess(idEmpresa, user);
    const selected = this.technicalProvider();
    const configured = selected === 'LEGACY_TOMODAT'
      ? this.legacyTomodat.configuredFor(idEmpresa)
      : this.g3.configured();
    return {
      comercialConfigurado: true,
      proveedorTecnico: selected === 'LEGACY_TOMODAT' ? 'LEGACY_TOMODAT' : 'G3',
      configurado: configured,
      mensaje: configured
        ? 'La cobertura comercial funciona localmente y la validacion tecnica esta configurada.'
        : 'La cobertura comercial funciona localmente. La validacion tecnica quedara pendiente.',
    };
  }

  async listZones(idEmpresa: number, user: AuthUser) {
    this.assertAccess(idEmpresa, user);
    return this.prisma.zonaPago.findMany({
      where: { idEmpresa },
      include: {
        zonaPadre: { select: { idZonaPago: true, nombreZona: true, tipoZona: true } },
        precios: { include: { plan: true }, orderBy: { idPlanZonaPrecio: 'asc' } },
      },
      orderBy: [{ tipoZona: 'asc' }, { nombreZona: 'asc' }],
    });
  }

  async getZone(idZonaPago: number, user: AuthUser) {
    const zone = await this.prisma.zonaPago.findUnique({
      where: { idZonaPago },
      include: {
        zonaPadre: true,
        zonasHijas: { orderBy: { nombreZona: 'asc' } },
        precios: { include: { plan: true }, orderBy: { idPlanZonaPrecio: 'asc' } },
      },
    });
    if (!zone) throw new NotFoundException('Zona comercial no encontrada');
    this.assertAccess(zone.idEmpresa ?? 0, user);
    return zone;
  }

  async createZone(dto: CreateCoverageZoneDto, user: AuthUser) {
    this.assertManage(dto.idEmpresa, user);
    const polygon = this.parsePolygon(dto.poligonoGeojson);
    const dates = this.parseDates(dto.fechaInicio, dto.fechaFin);
    await this.validateHierarchy(dto.idEmpresa, dto.tipoZona, dto.idZonaPadre, polygon);
    if (dto.tipoZona === 'MICROZONA_COMERCIAL' && dto.activo !== false) {
      await this.assertNoActiveOverlap(dto.idEmpresa, dto.idZonaPadre!, polygon, dates);
    }
    const center = polygonCenter(polygon);
    const zone = await this.prisma.zonaPago.create({
      data: {
        idEmpresa: dto.idEmpresa,
        nombreZona: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        activo: dto.activo ?? true,
        tipoZona: dto.tipoZona,
        idZonaPadre: dto.tipoZona === 'MICROZONA_COMERCIAL' ? dto.idZonaPadre : null,
        poligonoGeojson: polygon as Prisma.InputJsonValue,
        centroLat: center.latitud,
        centroLng: center.longitud,
        prioridad: dto.prioridad ?? 0,
        fuenteCobertura: 'MANUAL',
        ...dates,
      },
    });
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: dto.tipoZona === 'MICROZONA_COMERCIAL' ? 'CREAR_MICROZONA' : 'CREAR_ZONA_GEOGRAFICA',
      entidadAfectada: 'zona_pago',
      idEntidadAfectada: zone.idZonaPago,
      valorNuevo: this.auditSnapshot(zone),
    });
    return zone;
  }

  async updateZone(idZonaPago: number, dto: UpdateCoverageZoneDto, user: AuthUser) {
    const current = await this.prisma.zonaPago.findUnique({
      where: { idZonaPago },
      include: { zonasHijas: { select: { idZonaPago: true } } },
    });
    if (!current) throw new NotFoundException('Zona comercial no encontrada');
    const idEmpresa = current.idEmpresa ?? 0;
    this.assertManage(idEmpresa, user);
    const type = dto.tipoZona ?? current.tipoZona ?? 'COBERTURA_GENERAL';
    if (type === 'MICROZONA_COMERCIAL' && current.zonasHijas.length) {
      throw new BadRequestException('Una cobertura con microzonas no puede convertirse en microzona');
    }
    const parentId = type === 'MICROZONA_COMERCIAL' ? dto.idZonaPadre ?? current.idZonaPadre ?? undefined : undefined;
    if (parentId === idZonaPago) throw new BadRequestException('Una zona no puede ser su propio padre');
    const polygon = dto.poligonoGeojson
      ? this.parsePolygon(dto.poligonoGeojson)
      : this.parsePolygon(current.poligonoGeojson);
    const currentStart = current.fechaInicio?.toISOString().slice(0, 10);
    const currentEnd = current.fechaFin?.toISOString().slice(0, 10);
    const dates = this.parseDates(
      dto.fechaInicio === undefined ? currentStart : dto.fechaInicio,
      dto.fechaFin === undefined ? currentEnd : dto.fechaFin,
    );
    await this.validateHierarchy(idEmpresa, type, parentId, polygon);
    const active = dto.activo ?? current.activo ?? true;
    if (type === 'MICROZONA_COMERCIAL' && active) {
      await this.assertNoActiveOverlap(idEmpresa, parentId!, polygon, dates, idZonaPago);
    }
    const center = polygonCenter(polygon);
    const updated = await this.prisma.zonaPago.update({
      where: { idZonaPago },
      data: {
        ...(dto.nombre !== undefined ? { nombreZona: dto.nombre.trim() } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion.trim() || null } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        ...(dto.prioridad !== undefined ? { prioridad: dto.prioridad } : {}),
        tipoZona: type,
        idZonaPadre: parentId ?? null,
        poligonoGeojson: polygon as Prisma.InputJsonValue,
        centroLat: center.latitud,
        centroLng: center.longitud,
        ...dates,
      },
    });
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: type === 'MICROZONA_COMERCIAL' ? 'ACTUALIZAR_MICROZONA' : 'ACTUALIZAR_ZONA_GEOGRAFICA',
      entidadAfectada: 'zona_pago',
      idEntidadAfectada: idZonaPago,
      valorAnterior: this.auditSnapshot(current),
      valorNuevo: this.auditSnapshot(updated),
    });
    return updated;
  }

  async deactivateZone(idZonaPago: number, user: AuthUser) {
    const current = await this.prisma.zonaPago.findUnique({ where: { idZonaPago } });
    if (!current) throw new NotFoundException('Zona comercial no encontrada');
    this.assertManage(current.idEmpresa ?? 0, user);
    const updated = await this.prisma.zonaPago.update({ where: { idZonaPago }, data: { activo: false } });
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'DESACTIVAR_ZONA_GEOGRAFICA',
      entidadAfectada: 'zona_pago',
      idEntidadAfectada: idZonaPago,
      valorAnterior: { activo: current.activo },
      valorNuevo: { activo: false },
    });
    return updated;
  }

  async check(idEmpresa: number, location: CoverageLocationDto, user: AuthUser): Promise<CoverageResult> {
    this.assertAccess(idEmpresa, user);
    this.assertCoordinates(location.latitud, location.longitud);
    const commercial = await this.commercial.resolvePlanAvailabilityForLocation(idEmpresa, location.latitud, location.longitud);
    const traceId = randomUUID();
    let technical: TechnicalCoverageResult;
    if (!commercial.coberturaComercial) {
      technical = { estado: 'PENDIENTE', proveedor: 'NINGUNO', motivo: 'No corresponde consultar factibilidad tecnica fuera de cobertura comercial.', traceId };
    } else if (this.technicalProvider() === 'LEGACY_TOMODAT') {
      technical = await this.legacyTomodat.check(idEmpresa, location.latitud, location.longitud, traceId);
    } else {
      technical = await this.g3.check(idEmpresa, location.latitud, location.longitud, traceId);
    }
    const estado = !commercial.coberturaComercial
      ? 'NO_FACTIBLE'
      : technical.estado === 'FACTIBLE'
        ? 'FACTIBLE'
        : technical.estado === 'NO_FACTIBLE'
          ? 'NO_FACTIBLE'
          : 'PENDIENTE_VALIDACION_TECNICA';
    const result: CoverageResult = {
      ...commercial,
      estado,
      motivo: !commercial.coberturaComercial
        ? 'La ubicacion esta fuera de la cobertura comercial configurada.'
        : technical.motivo,
      consultadoEn: new Date().toISOString(),
      ubicacion: { latitud: location.latitud, longitud: location.longitud },
      tecnica: technical,
      cajas: technical.cajas ?? [],
    };
    await this.audit.record({
      idUsuario: user.idUsuario,
      accion: 'CONSULTAR_FACTIBILIDAD',
      entidadAfectada: 'coverage',
      valorNuevo: {
        idEmpresa,
        estado: result.estado,
        idZonaPago: result.microzona?.idZonaPago ?? result.zona?.idZonaPago ?? null,
        proveedorTecnico: result.tecnica.proveedor,
        traceId,
      },
    });
    return result;
  }

  async plansForLocation(idEmpresa: number, location: CoverageLocationDto, user: AuthUser) {
    this.assertAccess(idEmpresa, user);
    this.assertCoordinates(location.latitud, location.longitud);
    return this.commercial.resolvePlanAvailabilityForLocation(idEmpresa, location.latitud, location.longitud);
  }

  async geocode(address: string) {
    const candidates = await this.geocoding.geocode(address);
    return {
      candidatos: candidates,
      mensaje: candidates.length ? null : 'No fue posible ubicar automaticamente la direccion. Selecciona el punto manualmente.',
    };
  }

  private technicalProvider() {
    return this.config.get<string>('COVERAGE_TECHNICAL_PROVIDER')?.trim().toUpperCase() === 'LEGACY_TOMODAT'
      ? 'LEGACY_TOMODAT'
      : 'G3';
  }

  private async validateHierarchy(idEmpresa: number, type: string, parentId: number | undefined, polygon: GeoJsonPolygon) {
    if (type === 'COBERTURA_GENERAL') {
      if (parentId) throw new BadRequestException('Una cobertura general no puede tener zona padre');
      return;
    }
    if (!parentId) throw new BadRequestException('La microzona requiere una cobertura general padre');
    const parent = await this.prisma.zonaPago.findUnique({ where: { idZonaPago: parentId } });
    if (!parent || parent.idEmpresa !== idEmpresa) throw new BadRequestException('La zona padre debe pertenecer a la misma empresa');
    if (parent.tipoZona !== 'COBERTURA_GENERAL') throw new BadRequestException('La zona padre debe ser una cobertura general');
    if (parent.activo === false) throw new BadRequestException('La cobertura padre esta inactiva');
    const parentPolygon = this.parsePolygon(parent.poligonoGeojson, 'La cobertura padre no tiene una geometria valida');
    if (!isChildPolygonInsideParent(polygon, parentPolygon)) {
      throw new BadRequestException('La microzona debe quedar completamente dentro de la cobertura padre');
    }
  }

  private async assertNoActiveOverlap(
    idEmpresa: number,
    parentId: number,
    polygon: GeoJsonPolygon,
    dates: { fechaInicio: Date | null; fechaFin: Date | null },
    excludeId?: number,
  ) {
    const others = await this.prisma.zonaPago.findMany({
      where: {
        idEmpresa,
        idZonaPadre: parentId,
        tipoZona: 'MICROZONA_COMERCIAL',
        activo: { not: false },
        ...(excludeId ? { idZonaPago: { not: excludeId } } : {}),
      },
    });
    for (const other of others) {
      if (!this.dateRangesOverlap(dates, { fechaInicio: other.fechaInicio, fechaFin: other.fechaFin })) continue;
      try {
        if (polygonsOverlap(polygon, validatePolygon(other.poligonoGeojson))) {
          throw new BadRequestException(`El poligono se superpone con la microzona ${other.nombreZona}.`);
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
      }
    }
  }

  private dateRangesOverlap(
    first: { fechaInicio: Date | null; fechaFin: Date | null },
    second: { fechaInicio: Date | null; fechaFin: Date | null },
  ) {
    const firstStart = first.fechaInicio?.getTime() ?? Number.NEGATIVE_INFINITY;
    const firstEnd = first.fechaFin?.getTime() ?? Number.POSITIVE_INFINITY;
    const secondStart = second.fechaInicio?.getTime() ?? Number.NEGATIVE_INFINITY;
    const secondEnd = second.fechaFin?.getTime() ?? Number.POSITIVE_INFINITY;
    return firstStart <= secondEnd && secondStart <= firstEnd;
  }

  private parseDates(start?: string | null, end?: string | null) {
    const fechaInicio = start ? new Date(`${start}T00:00:00.000Z`) : null;
    const fechaFin = end ? new Date(`${end}T00:00:00.000Z`) : null;
    if ((fechaInicio && Number.isNaN(fechaInicio.getTime())) || (fechaFin && Number.isNaN(fechaFin.getTime()))) {
      throw new BadRequestException('La vigencia contiene una fecha invalida');
    }
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha de fin');
    }
    return { fechaInicio, fechaFin };
  }

  private parsePolygon(value: unknown, message?: string) {
    try {
      return validatePolygon(value);
    } catch (error) {
      throw new BadRequestException(message ?? (error instanceof Error ? error.message : 'Poligono invalido'));
    }
  }

  private auditSnapshot(zone: {
    idEmpresa: number | null;
    nombreZona: string;
    tipoZona: string | null;
    idZonaPadre: number | null;
    activo: boolean | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
  }): Prisma.InputJsonValue {
    return {
      idEmpresa: zone.idEmpresa,
      nombreZona: zone.nombreZona,
      tipoZona: zone.tipoZona,
      idZonaPadre: zone.idZonaPadre,
      activo: zone.activo,
      fechaInicio: zone.fechaInicio?.toISOString().slice(0, 10) ?? null,
      fechaFin: zone.fechaFin?.toISOString().slice(0, 10) ?? null,
    };
  }

  private assertCoordinates(latitud: number, longitud: number) {
    if (!Number.isFinite(latitud) || Math.abs(latitud) > 90
      || !Number.isFinite(longitud) || Math.abs(longitud) > 180) {
      throw new BadRequestException('Coordenadas invalidas');
    }
  }

  private assertManage(idEmpresa: number, user: AuthUser) {
    this.assertAccess(idEmpresa, user);
    if (!hasRole(user.roles, 'Administrador') && !hasRole(user.roles, 'Comercial')) {
      throw new ForbiddenException('No tienes permiso para administrar zonas comerciales');
    }
  }

  private assertAccess(idEmpresa: number, user: AuthUser) {
    if (!Number.isInteger(idEmpresa) || idEmpresa < 1) throw new BadRequestException('Empresa invalida');
    if (!isAdministrator(user.roles) && user.idEmpresa !== idEmpresa) {
      throw new ForbiddenException('No tienes acceso a la cobertura de esta empresa');
    }
  }
}
