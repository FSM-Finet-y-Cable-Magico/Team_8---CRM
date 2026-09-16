import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PLAN_CUSTOMER_TYPES, PLAN_TYPES } from '../plan-catalog';

export class CreatePlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial es obligatorio' })
  @Matches(/\S/, { message: 'El nombre comercial es obligatorio' })
  @MaxLength(100)
  nombreComercial!: string;

  @IsString()
  @IsIn(PLAN_TYPES, { message: 'El tipo de plan no pertenece al catálogo permitido' })
  @MaxLength(40)
  tipoPlan!: string;

  @IsString()
  @IsIn(PLAN_CUSTOMER_TYPES, { message: 'El tipo de cliente no pertenece al catálogo permitido' })
  @MaxLength(20)
  tipoCliente!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  velocidadMbps?: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'El precio mensual debe ser mayor que cero' })
  precioMensual!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
