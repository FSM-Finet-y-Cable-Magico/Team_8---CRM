import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeoJsonPolygon, pointInPolygon, validatePolygon } from './coverage-geometry';
import { CommercialCoverageResult, CommercialZoneSummary, LocationPlan } from './coverage.types';

type ZoneRecord = {
  idZonaPago: number;
  idEmpresa: number | null;
  nombreZona: string;
  tipoZona: string | null;
  idZonaPadre: number | null;
  poligonoGeojson: Prisma.JsonValue | null;
  activo: boolean | null;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  prioridad: number;
};

@Injectable()
export class CommercialCoverageProvider {
  constructor(private readonly prisma: PrismaService) {}

  async resolveZoneForPoint(idEmpresa: number, latitud: number, longitud: number, at = new Date()) {
    const records = await this.prisma.zonaPago.findMany({
      where: { idEmpresa, activo: { not: false } },
      orderBy: [{ prioridad: 'desc' }, { idZonaPago: 'asc' }],
    }) as ZoneRecord[];
    const zones = records
      .filter(zone => this.isApplicable(zone, at))
      .map(zone => this.withValidPolygon(zone))
      .filter((zone): zone is ZoneRecord & { polygon: GeoJsonPolygon } => Boolean(zone));
    const point: [number, number] = [longitud, latitud];
    const coverage = zones.find(zone => zone.tipoZona === 'COBERTURA_GENERAL' && pointInPolygon(point, zone.polygon));
    if (!coverage) return { zona: null, microzona: null };
    const microzone = zones.find(zone => zone.tipoZona === 'MICROZONA_COMERCIAL'
      && zone.idZonaPadre === coverage.idZonaPago && pointInPolygon(point, zone.polygon));
    return { zona: this.summary(coverage), microzona: microzone ? this.summary(microzone) : null };
  }

  async resolveCommercialMicrozone(idEmpresa: number, latitud: number, longitud: number, at = new Date()) {
    return (await this.resolveZoneForPoint(idEmpresa, latitud, longitud, at)).microzona;
  }

  async resolvePlanAvailabilityForLocation(idEmpresa: number, latitud: number, longitud: number, at = new Date()): Promise<CommercialCoverageResult> {
    const resolved = await this.resolveZoneForPoint(idEmpresa, latitud, longitud, at);
    if (!resolved.zona) return { coberturaComercial: false, zona: null, microzona: null, planes: [] };
    const zoneIds = [resolved.microzona?.idZonaPago, resolved.zona.idZonaPago].filter((id): id is number => Boolean(id));
    const plans = await this.prisma.plan.findMany({
      where: { idEmpresa, activo: { not: false } },
      include: {
        preciosZona: {
          where: { idZonaPago: { in: zoneIds }, activo: { not: false } },
          orderBy: { idPlanZonaPrecio: 'desc' },
        },
      },
      orderBy: { idPlan: 'asc' },
    });
    const available: LocationPlan[] = plans.map(plan => {
      const activeRules = plan.preciosZona.filter(rule => this.isApplicable(rule, at));
      const microRule = resolved.microzona
        ? activeRules.find(rule => rule.idZonaPago === resolved.microzona?.idZonaPago)
        : undefined;
      const parentRule = activeRules.find(rule => rule.idZonaPago === resolved.zona?.idZonaPago);
      const applicable = microRule ?? parentRule;
      return {
        idPlan: plan.idPlan,
        nombre: plan.nombreComercial,
        tipo: plan.tipoPlan,
        velocidad: plan.velocidadMbps,
        precioBase: Number(plan.precioMensual),
        precioAplicable: Number(applicable?.precioMensual ?? plan.precioMensual),
        origenPrecio: microRule ? 'MICROZONA' : parentRule ? 'ZONA_PADRE' : 'PLAN_BASE',
      };
    });
    return { coberturaComercial: true, ...resolved, planes: available };
  }

  private isApplicable(value: { activo?: boolean | null; fechaInicio?: Date | null; fechaFin?: Date | null }, at: Date) {
    if (value.activo === false) return false;
    const day = at.toISOString().slice(0, 10);
    return (!value.fechaInicio || value.fechaInicio.toISOString().slice(0, 10) <= day)
      && (!value.fechaFin || value.fechaFin.toISOString().slice(0, 10) >= day);
  }

  private withValidPolygon(zone: ZoneRecord) {
    if (!zone.poligonoGeojson) return null;
    try {
      return { ...zone, polygon: validatePolygon(zone.poligonoGeojson) };
    } catch {
      return null;
    }
  }

  private summary(zone: ZoneRecord & { polygon: GeoJsonPolygon }): CommercialZoneSummary {
    return {
      idZonaPago: zone.idZonaPago,
      idEmpresa: zone.idEmpresa,
      nombreZona: zone.nombreZona,
      tipoZona: zone.tipoZona,
      idZonaPadre: zone.idZonaPadre,
      poligonoGeojson: zone.polygon,
      activo: zone.activo,
      fechaInicio: zone.fechaInicio,
      fechaFin: zone.fechaFin,
    };
  }
}
