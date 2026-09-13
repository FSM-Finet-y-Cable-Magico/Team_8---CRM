import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsString()
  @MaxLength(100)
  nombreComercial!: string;

  @IsString()
  @MaxLength(20)
  tipoPlan!: string;

  @IsString()
  @MaxLength(20)
  tipoCliente!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  velocidadMbps?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioMensual!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
