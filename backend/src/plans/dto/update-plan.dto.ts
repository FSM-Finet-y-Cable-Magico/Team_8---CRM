import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tipoPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tipoCliente?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  velocidadMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioMensual?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
