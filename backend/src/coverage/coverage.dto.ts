import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const COVERAGE_ZONE_TYPES = ['COBERTURA_GENERAL', 'MICROZONA_COMERCIAL'] as const;
export type CoverageZoneType = (typeof COVERAGE_ZONE_TYPES)[number];

export class CoverageLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;
}

export class CheckCoverageDto extends CoverageLocationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idProspecto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;
}

export class CoverageCompanyQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa!: number;
}

export class PlansForLocationDto extends CheckCoverageDto {}

export class CreateCoverageZoneDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa!: number;

  @IsString()
  @MaxLength(80)
  nombre!: string;

  @IsIn(COVERAGE_ZONE_TYPES)
  tipoZona!: CoverageZoneType;

  @ValidateIf(value => value.tipoZona === 'MICROZONA_COMERCIAL' || value.idZonaPadre !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPadre?: number;

  @IsObject()
  poligonoGeojson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaInicio?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaFin?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  prioridad?: number;
}

export class UpdateCoverageZoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsIn(COVERAGE_ZONE_TYPES)
  tipoZona?: CoverageZoneType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPadre?: number;

  @IsOptional()
  @IsObject()
  poligonoGeojson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaInicio?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaFin?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  prioridad?: number;
}

export class GeocodeAddressDto {
  @IsString()
  @MaxLength(240)
  direccion!: string;
}
