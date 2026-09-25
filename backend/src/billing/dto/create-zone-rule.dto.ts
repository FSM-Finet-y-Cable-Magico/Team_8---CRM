import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateZoneRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPlan!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPago!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioMensual!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorInstalacion?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaInicio?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  fechaFin?: string;
}
